import fs from "node:fs/promises";
import path from "node:path";
import type { AitConfig } from "./config.js";
import { loadConfig } from "./config.js";
import type { LocaleCatalogBundle } from "./catalogBundle.js";
import { loadLocaleCatalogBundle, writeLocaleCatalogBundle } from "./catalogBundle.js";
import { localeJsonFilesForLocale } from "./catalogLayout.js";
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
    const listed = config.locales.length ? config.locales.join(", ") : "(none)";
    const i18nHint = config.i18n
      ? `otherwise from your i18next init file "${config.i18n}" (string literals in supportedLngs, resources, fallbackLng, etc.).`
      : 'your ai-i18n.config.json must list every locale in "locales" (no "i18n" file is configured).';
    throw new Error(
      `[ai-i18n] generate: --locale uses unknown code(s): ${unknown.join(", ")}.\n` +
        `Configured locale codes are: ${listed} (default: "${config.defaultLocale}").\n` +
        `They are taken from ai-i18n.config.json "locales" when set; ${i18nHint}\n` +
        `Add the missing language(s) there, or add an explicit "locales" array in ai-i18n.config.json, then run generate again.`,
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

async function throwHelpfulMissingDefaultCatalog(
  cwd: string,
  config: AitConfig,
  err: unknown,
): Promise<never> {
  const localesBase = path.resolve(cwd, config.localesDir);
  const flatDefaultPath = path.join(localesBase, `${config.defaultLocale}.json`);
  const paths = localeJsonFilesForLocale(cwd, config, config.defaultLocale);
  const primary = paths[0]!.path;

  if (primary !== flatDefaultPath) {
    const flatCat = await readJson<Catalog>(flatDefaultPath);
    if (flatCat && typeof flatCat === "object") {
      throw new Error(
        `Missing or invalid catalog: ${primary}\n\n` +
          `Found a flat default catalog instead: ${flatDefaultPath}\n` +
          `The CLI inferred i18next-namespace paths from your "i18n" file (or config). If your locale files are one JSON per language (${config.defaultLocale}.json), add to ai-i18n.config.json:\n` +
          `  "resourceFormat": "flat"\n`,
      );
    }
  } else {
    const ns = config.namespace && config.namespace.length > 0 ? config.namespace : "translation";
    const nsDefaultPath = path.join(localesBase, config.defaultLocale, `${ns}.json`);
    const nsCat = await readJson<Catalog>(nsDefaultPath);
    if (nsCat && typeof nsCat === "object") {
      throw new Error(
        `Missing or invalid catalog: ${primary}\n\n` +
          `Found a namespace-layout catalog instead: ${nsDefaultPath}\n` +
          `Add to ai-i18n.config.json:\n` +
          `  "resourceFormat": "i18next-namespace"\n`,
      );
    }
  }
  throw err instanceof Error ? err : new Error(String(err));
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

  const configuredTargets = config.locales.filter((l) => l !== config.defaultLocale);
  if ((!onlyLocales || onlyLocales.length === 0) && configuredTargets.length === 0) {
    console.log(
      `[ai-i18n] generate: nothing to do — "locales" only includes the default language "${config.defaultLocale}".`,
    );
    console.log(
      `[ai-i18n] generate translates other locales from the default catalog. Add language codes to "locales" in ai-i18n.config.json (from i18next supportedLngs / resources), or run: npx ai-i18n generate --locale <code>`,
    );
    return;
  }

  const translator = resolveTranslator(config);
  await ensureTranslatorNotesFile(cwd, config.localesDir);
  const translatorNotes = await loadTranslatorNotes(cwd, config.localesDir);

  const defaultBundle = await (async (): Promise<LocaleCatalogBundle> => {
    try {
      return await loadLocaleCatalogBundle(cwd, config, config.defaultLocale);
    } catch (err) {
      return await throwHelpfulMissingDefaultCatalog(cwd, config, err);
    }
  })();
  const defaultCatalog = defaultBundle.mergedFlat;
  const defaultKeys = [...defaultBundle.orderedLogicalKeys];
  const defaultKeySet = new Set(defaultKeys);
  for (const k of Object.keys(defaultCatalog)) {
    if (!defaultKeySet.has(k)) {
      defaultKeys.push(k);
      defaultKeySet.add(k);
    }
  }

  const cacheDir = path.resolve(cwd, config.cacheDir);
  const cache = await readCache(cacheDir);

  const only = onlyLocales;
  const shouldProcessLocale = (locale: string): boolean => {
    if (locale === config.defaultLocale) return false;
    if (!only || only.length === 0) return true;
    return only.includes(locale);
  };

  for (const locale of config.locales) {
    if (!shouldProcessLocale(locale)) continue;

    let existingBundle;
    try {
      existingBundle = await loadLocaleCatalogBundle(cwd, config, locale, { allowMissing: true });
    } catch {
      existingBundle = {
        localeShape: defaultBundle.localeShape,
        mergedFlat: {} as Record<string, string>,
        perNsParsed: {},
        orderedLogicalKeys: [],
        orderedInnerKeysPerNs: {},
        multiNamespace: defaultBundle.multiNamespace,
        namespaces: defaultBundle.namespaces,
      };
    }
    const existing = existingBundle.mergedFlat;
    const localeCache = { ...(cache[locale] ?? {}) };

    for (const k of Object.keys(localeCache)) {
      if (!defaultKeySet.has(k)) delete localeCache[k];
    }

    const orphans = Object.keys(existing).filter((k) => !defaultKeySet.has(k));

    const work: { key: string; source: string; translatorNote?: string }[] = [];
    for (const key of defaultKeys) {
      const source = defaultCatalog[key];
      if (source === undefined) continue;
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
      const rel = localeJsonFilesForLocale(cwd, config, locale)
        .map((x) => path.relative(cwd, x.path))
        .join(", ");
      console.log(`[ai-i18n] ${locale}: pruning ${orphans.length} stale key(s) in ${rel} (no API call)…`);
    }

    const byKey = new Map(translated.map((x) => [x.key, x.text]));
    const workSet = new Set(work.map((w) => w.key));

    const merged: Catalog = {};
    for (const key of defaultKeys) {
      const source = defaultCatalog[key];
      if (source === undefined) continue;
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
          const rel = localeJsonFilesForLocale(cwd, config, locale)
            .map((x) => path.relative(cwd, x.path))
            .join(", ");
          throw new Error(
            `[ai-i18n] Missing translation for "${key}" in ${rel} — run generate without skipping this key (check default catalog).`,
          );
        }
        merged[key] = prev;
        localeCache[key] = hashSource(source);
      }
    }

    await writeLocaleCatalogBundle(cwd, config, locale, merged, defaultBundle);
    cache[locale] = localeCache;
    await writeCache(cacheDir, cache);
    const rel = localeJsonFilesForLocale(cwd, config, locale)
      .map((x) => path.relative(cwd, x.path))
      .join(", ");
    console.log(`[ai-i18n] ${locale}: wrote ${rel}`);
  }
}
