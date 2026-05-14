import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AitConfig } from "./config.js";
import { loadConfig } from "./config.js";
import { loadLocaleCatalogBundle } from "./catalogBundle.js";
import { localeJsonFilesForLocale } from "./catalogLayout.js";
import { mergeMissingKeysIntoParsed, splitNamespacedLogicalKey } from "./catalogTree.js";
import { scanContextFromConfig, scanSources } from "./scan.js";

export type DiffResult = { ok: boolean };

export type RunDiffOptions = {
  /** Append keys seen in code but missing from the default catalog (empty string values), then re-run checks. */
  addMissingToDefault?: boolean;
};

async function readJson<T>(file: string): Promise<T | null> {
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

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

async function appendMissingKeysToDefaultCatalog(
  cwd: string,
  config: AitConfig,
  missingKeys: string[],
): Promise<void> {
  const shape = config.localeShape ?? "flat";
  const defaultBundle = await loadLocaleCatalogBundle(cwd, config, config.defaultLocale);

  if (!defaultBundle.multiNamespace) {
    const filePath = localeJsonFilesForLocale(cwd, config, config.defaultLocale)[0]!.path;
    const raw = (await readJson<unknown>(filePath)) ?? {};
    const merged = mergeMissingKeysIntoParsed(raw, shape, missingKeys);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(merged, null, 2) + "\n", "utf8");
    return;
  }

  const byNs: Record<string, string[]> = {};
  for (const ns of defaultBundle.namespaces) {
    byNs[ns] = [];
  }
  for (const mk of missingKeys) {
    const sp = splitNamespacedLogicalKey(mk);
    if (sp && byNs[sp.namespace] !== undefined) {
      byNs[sp.namespace]!.push(sp.innerPath);
    } else if (!mk.includes(":")) {
      const first = defaultBundle.namespaces[0];
      if (first !== undefined) byNs[first]!.push(mk);
    }
  }

  for (const ns of defaultBundle.namespaces) {
    const innerMissing = byNs[ns] ?? [];
    if (innerMissing.length === 0) continue;
    const filePath = localeJsonFilesForLocale(cwd, config, config.defaultLocale).find((x) => x.namespace === ns)!.path;
    const raw = (await readJson<unknown>(filePath)) ?? {};
    const merged = mergeMissingKeysIntoParsed(raw, shape, innerMissing);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(merged, null, 2) + "\n", "utf8");
  }
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

  const keysInDefault = new Set(Object.keys(defaultBundle.mergedFlat));
  let { inCodeNotDefault, inDefaultNotCode } = computeCodeVsDefaultLists(scan.keysInCode, keysInDefault);

  if (options.addMissingToDefault && inCodeNotDefault.length > 0) {
    await appendMissingKeysToDefaultCatalog(cwd, config, inCodeNotDefault);
    console.log(
      `[ai-i18n] Wrote ${inCodeNotDefault.length} missing key(s) to default catalog (${path.relative(cwd, defaultPath)} and/or sibling namespace files) with empty strings — fill source text, then run generate.`,
    );
    const reloaded = await loadLocaleCatalogBundle(cwd, config, config.defaultLocale);
    keysInDefault.clear();
    for (const k of Object.keys(reloaded.mergedFlat)) keysInDefault.add(k);
    ({ inCodeNotDefault, inDefaultNotCode } = computeCodeVsDefaultLists(scan.keysInCode, keysInDefault));
  }

  if (inCodeNotDefault.length) {
    console.log("[ai-i18n] Keys in code but missing in default catalog:");
    for (const k of inCodeNotDefault.sort()) console.log(`  - ${k}`);
    if (!options.addMissingToDefault) {
      console.log(
        "[ai-i18n] Run with: npx ai-i18n diff --add-missing-default — to add the missing keys to the default locale catalog (empty values); then edit strings and run generate.",
      );
    }
  } else {
    console.log("[ai-i18n] No keys in code missing from default catalog.");
  }

  if (inDefaultNotCode.length) {
    console.log("[ai-i18n] Keys in default catalog but not seen as t('…') string literal in scanned files:");
    for (const k of inDefaultNotCode.sort()) console.log(`  - ${k}`);
  }

  let hasDrift = inCodeNotDefault.length > 0 || inDefaultNotCode.length > 0;

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
