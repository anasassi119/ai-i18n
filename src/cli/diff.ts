import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "./config.js";
import { localeCatalogPath } from "./catalogLayout.js";
import { scanSources } from "./scan.js";

type Catalog = Record<string, string>;

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

function computeDefaultStringKeys(defaultCatalog: Catalog): Set<string> {
  return new Set(Object.keys(defaultCatalog).filter((k) => typeof defaultCatalog[k] === "string"));
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

/**
 * Preserves existing key order from the JSON file, then appends new keys (lexicographic) with empty values.
 */
async function appendMissingKeysToDefaultCatalog(defaultPath: string, missingKeys: string[]): Promise<void> {
  const raw = (await readJson<Record<string, unknown>>(defaultPath)) ?? {};
  const out: Catalog = {};
  for (const k of Object.keys(raw)) {
    const v = raw[k];
    if (typeof v === "string") {
      out[k] = v;
    }
  }
  const sortedNew = [...missingKeys].sort((a, b) => a.localeCompare(b));
  for (const k of sortedNew) {
    if (out[k] === undefined) {
      out[k] = "";
    }
  }
  await mkdir(path.dirname(defaultPath), { recursive: true });
  await writeFile(defaultPath, JSON.stringify(out, null, 2) + "\n", "utf8");
}

/**
 * Compares scanned `t('…')` keys to default + target locale catalogs.
 * @returns `{ ok: true }` when there is nothing to fix; `{ ok: false }` when any drift is reported (use for CI exit codes).
 */
export async function runDiff(cwd: string, options: RunDiffOptions = {}): Promise<DiffResult> {
  const { config } = await loadConfig(cwd);
  const scan = await scanSources(cwd, config.sourceGlobs);
  const defaultPath = localeCatalogPath(cwd, config, config.defaultLocale);
  let defaultCatalog = ((await readJson<Catalog>(defaultPath)) ?? {}) as Catalog;

  let keysInDefault = computeDefaultStringKeys(defaultCatalog);
  let { inCodeNotDefault, inDefaultNotCode } = computeCodeVsDefaultLists(scan.keysInCode, keysInDefault);

  if (options.addMissingToDefault && inCodeNotDefault.length > 0) {
    await appendMissingKeysToDefaultCatalog(defaultPath, inCodeNotDefault);
    console.log(
      `[ai-i18n] Wrote ${inCodeNotDefault.length} missing key(s) to default catalog (${path.relative(cwd, defaultPath)}) with empty strings — fill source text, then run generate.`,
    );
    defaultCatalog = ((await readJson<Catalog>(defaultPath)) ?? {}) as Catalog;
    keysInDefault = computeDefaultStringKeys(defaultCatalog);
    ({ inCodeNotDefault, inDefaultNotCode } = computeCodeVsDefaultLists(scan.keysInCode, keysInDefault));
  }

  if (inCodeNotDefault.length) {
    console.log("[ai-i18n] Keys in code but missing in default catalog:");
    for (const k of inCodeNotDefault.sort()) console.log(`  - ${k}`);
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
    const targetPath = localeCatalogPath(cwd, config, locale);
    const targetRel = path.relative(cwd, targetPath);
    const target = (await readJson<Catalog>(targetPath)) ?? {};
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
