import path from "node:path";
import { loadConfig } from "./config.js";
import { loadLocaleCatalogBundle } from "./catalogBundle.js";
import { localeJsonFilesForLocale } from "./catalogLayout.js";
import { scanContextFromConfig, scanSources } from "./scan.js";
import {
  computeDefaultValueDrift,
  syncDefaultCatalogFromCode,
} from "./syncDefaultFromCode.js";

export type DiffResult = { ok: boolean };

export type RunDiffOptions = {
  /** Append keys in code but missing from default catalog; seed/fill from static defaultValue when present. */
  addMissingToDefault?: boolean;
};

function computeCodeVsDefaultLists(
  keysInCode: Set<string>,
  keysInDefault: Set<string>,
): { inCodeNotDefault: string[]; inDefaultNotCode: string[] } {
  const inCodeNotDefault: string[] = [];
  for (const k of keysInCode) {
    if (!keysInDefault.has(k)) inCodeNotDefault.push(k);
  }
  const inDefaultNotCode: string[] = [];
  for (const k of keysInDefault) {
    if (!keysInCode.has(k)) inDefaultNotCode.push(k);
  }
  return { inCodeNotDefault, inDefaultNotCode };
}

/**
 * Compares scanned `t('…')` keys to default + target locale catalogs.
 * @returns `{ ok: true }` when there is nothing to fix; `{ ok: false }` when any drift is reported (use for CI exit codes).
 */
export async function runDiff(cwd: string, options: RunDiffOptions = {}): Promise<DiffResult> {
  const { config } = await loadConfig(cwd);
  const scanCtx = scanContextFromConfig(config);
  const scan = await scanSources(cwd, config.sourceGlobs, scanCtx);
  const defaultBundle = await loadLocaleCatalogBundle(cwd, config, config.defaultLocale);
  const defaultPath = localeJsonFilesForLocale(cwd, config, config.defaultLocale)[0]!.path;
  const defaultFlat = defaultBundle.mergedFlat;

  const keysInDefault = new Set(Object.keys(defaultFlat));
  let { inCodeNotDefault, inDefaultNotCode } = computeCodeVsDefaultLists(scan.keysInCode, keysInDefault);

  if (options.addMissingToDefault) {
    const toAdd = inCodeNotDefault;
    const { added, filled } = await syncDefaultCatalogFromCode(cwd, config, scan.scannedKeys, {
      missingLogicalKeys: toAdd.length > 0 ? toAdd : undefined,
    });
    if (added > 0 || filled > 0) {
      const parts: string[] = [];
      if (added > 0) parts.push(`${added} missing key(s)`);
      if (filled > 0) parts.push(`${filled} empty value(s) from defaultValue`);
      console.log(
        `[ai-i18n] Updated default catalog (${path.relative(cwd, defaultPath)} and/or sibling namespace files): ${parts.join(", ")}.`,
      );
      const reloaded = await loadLocaleCatalogBundle(cwd, config, config.defaultLocale);
      keysInDefault.clear();
      for (const k of Object.keys(reloaded.mergedFlat)) keysInDefault.add(k);
      Object.assign(defaultFlat, reloaded.mergedFlat);
      ({ inCodeNotDefault, inDefaultNotCode } = computeCodeVsDefaultLists(scan.keysInCode, keysInDefault));
    }
  }

  if (inCodeNotDefault.length) {
    console.log("[ai-i18n] Keys in code but missing in default catalog:");
    for (const k of inCodeNotDefault.sort()) console.log(`  - ${k}`);
    if (!options.addMissingToDefault) {
      console.log(
        "[ai-i18n] Run with: npx ai-i18n diff --add-missing-default — to add missing keys (and defaultValue text when present in code).",
      );
    }
  } else {
    console.log("[ai-i18n] No keys in code missing from default catalog.");
  }

  if (inDefaultNotCode.length) {
    console.log("[ai-i18n] Keys in default catalog but not seen as t('…') string literal in scanned files:");
    for (const k of inDefaultNotCode.sort()) console.log(`  - ${k}`);
  }

  const { emptyWithDefaultText, mismatched } = computeDefaultValueDrift(scan.scannedKeys, defaultFlat);
  if (emptyWithDefaultText.length) {
    console.log("[ai-i18n] Default catalog has empty string(s) but code specifies defaultValue:");
    for (const k of emptyWithDefaultText.sort()) console.log(`  - ${k}`);
  }
  if (mismatched.length) {
    console.log("[ai-i18n] Default catalog value differs from code defaultValue:");
    for (const k of mismatched.sort()) console.log(`  - ${k}`);
  }

  let hasDrift =
    inCodeNotDefault.length > 0 ||
    inDefaultNotCode.length > 0 ||
    emptyWithDefaultText.length > 0 ||
    mismatched.length > 0;

  for (const locale of config.locales) {
    if (locale === config.defaultLocale) continue;
    const targetRel = localeJsonFilesForLocale(cwd, config, locale)
      .map((x) => path.relative(cwd, x.path))
      .join(", ");
    const targetBundle = await loadLocaleCatalogBundle(cwd, config, locale, { allowMissing: true });
    const target = targetBundle.mergedFlat;
    const missing: string[] = [];
    for (const k of keysInDefault) {
      if (target[k] === undefined || target[k] === "") missing.push(k);
    }
    if (missing.length) {
      console.log(`[ai-i18n] Keys missing or empty in ${targetRel}:`);
      for (const k of missing.sort()) console.log(`  - ${k}`);
    } else {
      console.log(`[ai-i18n] ${targetRel}: no missing keys for default set.`);
    }

    const staleInTarget: string[] = [];
    for (const k of Object.keys(target)) {
      if (!keysInDefault.has(k)) staleInTarget.push(k);
    }
    if (staleInTarget.length) {
      console.log(
        `[ai-i18n] Keys in ${targetRel} but not in default catalog (removed/renamed in default; run generate to prune):`,
      );
      for (const k of staleInTarget.sort()) console.log(`  - ${k}`);
    }

    if (missing.length > 0 || staleInTarget.length > 0) {
      hasDrift = true;
    }
  }

  return { ok: !hasDrift };
}
