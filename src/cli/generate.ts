import fs from "node:fs/promises";
import path from "node:path";
import type { AitConfig } from "./config.js";
import { loadConfig } from "./config.js";
import { localeCatalogPath } from "./catalogLayout.js";
import { hashSource } from "./hash.js";
import { ensureTranslatorNotesFile, loadTranslatorNotes } from "./translatorNotes.js";
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

export type RunGenerateOptions = {
  force?: boolean;
  /** If set, only these target locales are processed (must appear in config `locales`, not the default). */
  onlyLocales?: string[];
};

function validateAndNormalizeOnlyLocales(requested: string[], config: AitConfig): string[] {
  const deduped = [...new Set(requested.map((x) => x.trim()).filter((x) => x.length > 0))];
  if (deduped.length === 0) {
    throw new Error("[ai-i18n] generate: --locale requires a non-empty value (e.g. --locale de).");
  }
  const unknown = deduped.filter((l) => !config.locales.includes(l));
  if (unknown.length > 0) {
    throw new Error(
      `[ai-i18n] generate: --locale unknown or not in config locales: ${unknown.join(", ")}. Configured: ${config.locales.join(", ")}.`,
    );
  }
  const targets = deduped.filter((l) => l !== config.defaultLocale);
  if (targets.length === 0) {
    throw new Error(
      `[ai-i18n] generate: --locale must name at least one target locale (not the default "${config.defaultLocale}").`,
    );
  }
  return targets;
}

export async function runGenerate(cwd: string, options: RunGenerateOptions = {}): Promise<void> {
  const { config } = await loadConfig(cwd);
  await runGenerateWithConfig(cwd, config, options.force ?? false, { onlyLocales: options.onlyLocales });
}

export type RunGenerateWithConfigOptions = {
  onlyLocales?: string[];
};

export async function runGenerateWithConfig(
  cwd: string,
  config: AitConfig,
  force: boolean,
  options: RunGenerateWithConfigOptions = {},
): Promise<void> {
  const onlyLocales =
    options.onlyLocales && options.onlyLocales.length > 0
      ? validateAndNormalizeOnlyLocales(options.onlyLocales, config)
      : undefined;

  const translator = resolveTranslator(config);
  await ensureTranslatorNotesFile(cwd, config.localesDir);
  const translatorNotes = await loadTranslatorNotes(cwd, config.localesDir);

  const defaultPath = localeCatalogPath(cwd, config, config.defaultLocale);
  const localesBase = path.resolve(cwd, config.localesDir);
  const flatDefaultPath = path.join(localesBase, `${config.defaultLocale}.json`);

  let defaultCatalog: Catalog;
  try {
    defaultCatalog = await readCatalog(defaultPath);
  } catch (err) {
    if (defaultPath !== flatDefaultPath) {
      const flatCat = await readJson<Catalog>(flatDefaultPath);
      if (flatCat && typeof flatCat === "object") {
        throw new Error(
          `Missing or invalid catalog: ${defaultPath}\n\n` +
            `Found a flat default catalog instead: ${flatDefaultPath}\n` +
            `The CLI inferred i18next-namespace paths from your "i18n" file. If your locale files are one JSON per language (${config.defaultLocale}.json), add to ai-i18n.config.json:\n` +
            `  "resourceFormat": "flat"\n`,
        );
      }
    } else {
      const ns = config.namespace && config.namespace.length > 0 ? config.namespace : "translation";
      const nsDefaultPath = path.join(localesBase, config.defaultLocale, `${ns}.json`);
      const nsCat = await readJson<Catalog>(nsDefaultPath);
      if (nsCat && typeof nsCat === "object") {
        throw new Error(
          `Missing or invalid catalog: ${defaultPath}\n\n` +
            `Found a namespace-layout catalog instead: ${nsDefaultPath}\n` +
            `Add to ai-i18n.config.json:\n` +
            `  "resourceFormat": "i18next-namespace"\n`,
        );
      }
    }
    throw err;
  }

  const cacheDir = path.resolve(cwd, config.cacheDir);
  const cache = await readCache(cacheDir);

  const defaultKeys = defaultStringKeys(defaultCatalog);
  const defaultKeySet = new Set(defaultKeys);

  const only = onlyLocales;
  const shouldProcessLocale = (locale: string): boolean => {
    if (locale === config.defaultLocale) return false;
    if (!only || only.length === 0) return true;
    return only.includes(locale);
  };

  for (const locale of config.locales) {
    if (!shouldProcessLocale(locale)) continue;

    const targetPath = localeCatalogPath(cwd, config, locale);
    const existing = (await readJson<Catalog>(targetPath)) ?? {};
    const localeCache = { ...(cache[locale] ?? {}) };

    for (const k of Object.keys(localeCache)) {
      if (!defaultKeySet.has(k)) delete localeCache[k];
    }

    const orphans = Object.keys(existing).filter((k) => !defaultKeySet.has(k));

    const work: { key: string; source: string; translatorNote?: string }[] = [];
    for (const key of defaultKeys) {
      const source = defaultCatalog[key] as string;
      const h = hashSource(source);
      const needs =
        force ||
        existing[key] === undefined ||
        existing[key] === "" ||
        localeCache[key] !== h;
      if (needs) {
        const note = translatorNotes[key];
        work.push({
          key,
          source,
          ...(note !== undefined && note !== "" ? { translatorNote: note } : {}),
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
    for (const key of defaultKeys) {
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
            `[ai-i18n] Missing translation for "${key}" in ${path.relative(cwd, targetPath)} — run generate without skipping this key (check default catalog).`,
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
