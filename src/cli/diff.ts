import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "./config.js";
import { scanSources } from "./scan.js";

type Catalog = Record<string, string>;

export type DiffResult = { ok: boolean };

async function readJson<T>(file: string): Promise<T | null> {
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Compares scanned `t('…')` keys to default + target locale catalogs.
 * @returns `{ ok: true }` when there is nothing to fix; `{ ok: false }` when any drift is reported (use for CI exit codes).
 */
export async function runDiff(cwd: string): Promise<DiffResult> {
  const { config } = await loadConfig(cwd);
  const scan = await scanSources(cwd, config.sourceGlobs);
  const catalogDir = path.resolve(cwd, config.catalogDir);
  const defaultPath = path.join(catalogDir, `${config.defaultLocale}.json`);
  const defaultCatalog = (await readJson<Catalog>(defaultPath)) ?? {};

  const keysInDefault = new Set(
    Object.keys(defaultCatalog).filter((k) => typeof defaultCatalog[k] === "string"),
  );
  const inCodeNotDefault: string[] = [];
  for (const k of scan.keysInCode) {
    if (!keysInDefault.has(k)) inCodeNotDefault.push(k);
  }

  const inDefaultNotCode: string[] = [];
  for (const k of keysInDefault) {
    if (!scan.keysInCode.has(k)) inDefaultNotCode.push(k);
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
    const targetPath = path.join(catalogDir, `${locale}.json`);
    const target = (await readJson<Catalog>(targetPath)) ?? {};
    const missing: string[] = [];
    for (const k of keysInDefault) {
      if (target[k] === undefined || target[k] === "") missing.push(k);
    }
    if (missing.length) {
      console.log(`[ai-i18n] Keys missing or empty in ${locale}.json:`);
      for (const k of missing.sort()) console.log(`  - ${k}`);
    } else {
      console.log(`[ai-i18n] ${locale}.json: no missing keys for default set.`);
    }

    const staleInTarget: string[] = [];
    for (const k of Object.keys(target)) {
      if (!keysInDefault.has(k)) staleInTarget.push(k);
    }
    if (staleInTarget.length) {
      console.log(
        `[ai-i18n] Keys in ${locale}.json but not in default catalog (removed/renamed in default; run generate to prune):`,
      );
      for (const k of staleInTarget.sort()) console.log(`  - ${k}`);
    }

    if (missing.length > 0 || staleInTarget.length > 0) {
      hasDrift = true;
    }
  }

  return { ok: !hasDrift };
}
