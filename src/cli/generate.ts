import fs from "node:fs/promises";
import path from "node:path";
import type { AitConfig } from "./config.js";
import { loadConfig } from "./config.js";
import { hashSource } from "./hash.js";
import { scanSources, writeHintsFile } from "./scan.js";
import { resolveTranslator } from "./translate/factory.js";

type Catalog = Record<string, string>;

type CacheFile = Record<string, Record<string, string>>;

async function readJson<T>(file: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function readCatalog(file: string): Promise<Catalog> {
  const j = await readJson<Catalog>(file);
  if (!j || typeof j !== "object") {
    throw new Error(`Missing or invalid catalog: ${file}`);
  }
  return j;
}

async function writeCatalog(file: string, catalog: Catalog): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(catalog, null, 2) + "\n", "utf8");
}

async function readCache(cacheDir: string): Promise<CacheFile> {
  const p = path.join(cacheDir, ".ai-i18n-cache.json");
  const j = await readJson<CacheFile>(p);
  return j ?? {};
}

async function writeCache(cacheDir: string, cache: CacheFile): Promise<void> {
  await fs.mkdir(cacheDir, { recursive: true });
  const p = path.join(cacheDir, ".ai-i18n-cache.json");
  await fs.writeFile(p, JSON.stringify(cache, null, 2) + "\n", "utf8");
}

/** Keys in default catalog that hold translatable strings. */
function defaultStringKeys(defaultCatalog: Catalog): string[] {
  return Object.keys(defaultCatalog).filter((k) => typeof defaultCatalog[k] === "string");
}

export async function runGenerate(cwd: string, force: boolean): Promise<void> {
  const { config } = await loadConfig(cwd);
  await runGenerateWithConfig(cwd, config, force);
}

export async function runGenerateWithConfig(
  cwd: string,
  config: AitConfig,
  force: boolean,
): Promise<void> {
  const translator = resolveTranslator(config);
  const scan = await scanSources(cwd, config.sourceGlobs);
  await writeHintsFile(path.resolve(cwd, config.cacheDir), scan.hints);

  const catalogDir = path.resolve(cwd, config.catalogDir);
  const defaultPath = path.join(catalogDir, `${config.defaultLocale}.json`);
  const defaultCatalog = await readCatalog(defaultPath);

  const cacheDir = path.resolve(cwd, config.cacheDir);
  const cache = await readCache(cacheDir);

  const defaultKeys = defaultStringKeys(defaultCatalog);
  const defaultKeySet = new Set(defaultKeys);

  for (const locale of config.locales) {
    if (locale === config.defaultLocale) continue;

    const targetPath = path.join(catalogDir, `${locale}.json`);
    const existing = (await readJson<Catalog>(targetPath)) ?? {};
    const localeCache = { ...(cache[locale] ?? {}) };

    for (const k of Object.keys(localeCache)) {
      if (!defaultKeySet.has(k)) delete localeCache[k];
    }

    const orphans = Object.keys(existing).filter((k) => !defaultKeySet.has(k));

    const work: { key: string; source: string; hint?: string }[] = [];
    for (const key of defaultKeys) {
      const source = defaultCatalog[key] as string;
      const h = hashSource(source);
      const needs =
        force ||
        existing[key] === undefined ||
        existing[key] === "" ||
        localeCache[key] !== h;
      if (needs) {
        work.push({
          key,
          source,
          hint: scan.hints[key],
        });
      }
    }

    if (work.length === 0 && orphans.length === 0) {
      cache[locale] = localeCache;
      await writeCache(cacheDir, cache);
      console.log(`[ai-i18n] ${locale}: up to date`);
      continue;
    }

    let translated: { key: string; text: string }[] = [];
    if (work.length > 0) {
      console.log(`[ai-i18n] ${locale}: translating ${work.length} key(s)…`);
      translated = await translator(
        {
          targetLocale: locale,
          sourceLocale: config.defaultLocale,
          entries: work,
        },
        { model: config.model },
      );
    } else {
      console.log(`[ai-i18n] ${locale}: pruning ${orphans.length} stale key(s) (no API call)…`);
    }

    const byKey = new Map(translated.map((x) => [x.key, x.text]));
    const workSet = new Set(work.map((w) => w.key));

    const merged: Catalog = {};
    for (const key of [...defaultKeys].sort((a, b) => a.localeCompare(b))) {
      const source = defaultCatalog[key] as string;
      if (workSet.has(key)) {
        const text = byKey.get(key);
        if (text === undefined || text === "") {
          throw new Error(`[ai-i18n] Translator did not return a text for key "${key}"`);
        }
        merged[key] = text;
        localeCache[key] = hashSource(source);
      } else {
        const prev = existing[key];
        if (prev === undefined || prev === "") {
          throw new Error(
            `[ai-i18n] Missing translation for "${key}" in ${locale}.json — run generate without skipping this key (check default catalog).`,
          );
        }
        merged[key] = prev;
        localeCache[key] = hashSource(source);
      }
    }

    await writeCatalog(targetPath, merged);
    cache[locale] = localeCache;
    await writeCache(cacheDir, cache);
    console.log(`[ai-i18n] ${locale}: wrote ${targetPath}`);
  }
}
