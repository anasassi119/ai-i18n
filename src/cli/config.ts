import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { extractI18nInitFromFile } from "./i18nInitExtract.js";

export type Provider = "openai" | "anthropic";

/** How locale files are laid out under `localesDir`. Default: `flat`. */
export type ResourceFormat = "flat" | "i18next-namespace";

export interface AitConfig {
  sourceGlobs: string[];
  /** Directory containing locale JSON and `translator-notes.json` (formerly `catalogDir`). */
  localesDir: string;
  /** Project-relative path to the module that calls `*.init({...})` for i18next (static analysis). */
  i18n: string;
  defaultLocale: string;
  locales: string[];
  /** Where `.ai-i18n-cache.json` is stored (default: ".ai-i18n"). */
  cacheDir: string;
  provider: Provider;
  model?: string;
  /** Default `flat`. `i18next-namespace` uses `{localesDir}/{locale}/{namespace}.json`. */
  resourceFormat?: ResourceFormat;
  /** Used when `resourceFormat` is `i18next-namespace`; default `translation`. */
  namespace?: string;
}

export async function loadConfig(cwd: string): Promise<{ path: string; config: AitConfig }> {
  const path = resolve(cwd, "ai-i18n.config.json");
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("ai-i18n.config.json must be a JSON object");
  }
  const o = parsed as Record<string, unknown>;

  if ("catalogDir" in o && !("localesDir" in o)) {
    throw new Error(
      'ai-i18n.config.json: "catalogDir" was renamed to "localesDir" in v4. Update your config.',
    );
  }

  const sourceGlobs = o.sourceGlobs;
  if (!Array.isArray(sourceGlobs) || !sourceGlobs.every((x) => typeof x === "string")) {
    throw new Error("ai-i18n.config.json: sourceGlobs must be an array of strings");
  }

  const localesDirRaw = o.localesDir;
  if (typeof localesDirRaw !== "string") {
    throw new Error('ai-i18n.config.json: "localesDir" must be a string');
  }
  const localesDir = localesDirRaw;

  const i18nRaw = o.i18n;
  if (typeof i18nRaw !== "string" || i18nRaw.trim() === "") {
    throw new Error('ai-i18n.config.json: "i18n" must be a non-empty string (path to your i18next init module)');
  }
  const i18n = i18nRaw.trim();

  const providerRaw = o.provider;
  let provider: Provider = "openai";
  if (providerRaw !== undefined && providerRaw !== null) {
    if (providerRaw === "stub") {
      throw new Error(
        'ai-i18n.config.json: "stub" provider was removed. Use "openai" or "anthropic".',
      );
    }
    if (providerRaw === "openai" || providerRaw === "anthropic") {
      provider = providerRaw;
    } else {
      throw new Error('ai-i18n.config.json: provider must be "openai" or "anthropic"');
    }
  }

  const model = o.model;
  if (model !== undefined && typeof model !== "string") {
    throw new Error("ai-i18n.config.json: model must be a string when set");
  }

  const cacheDirRaw = o.cacheDir;
  const cacheDir = typeof cacheDirRaw === "string" ? cacheDirRaw : ".ai-i18n";

  const i18nAbs = resolve(cwd, i18n);
  const extracted = await extractI18nInitFromFile(i18nAbs);

  let defaultLocale = extracted.defaultLocale;
  if (typeof o.defaultLocale === "string" && o.defaultLocale.trim() !== "") {
    defaultLocale = o.defaultLocale.trim();
  }

  let locales = extracted.locales;
  if (Array.isArray(o.locales) && o.locales.length > 0 && o.locales.every((x) => typeof x === "string")) {
    locales = o.locales as string[];
  }

  if (!locales.includes(defaultLocale)) {
    locales = [defaultLocale, ...locales.filter((x) => x !== defaultLocale)];
  }

  const resourceFormatRaw = o.resourceFormat;
  let resourceFormat: ResourceFormat = extracted.resourceFormat;
  if (resourceFormatRaw !== undefined && resourceFormatRaw !== null) {
    if (resourceFormatRaw === "flat" || resourceFormatRaw === "i18next-namespace") {
      resourceFormat = resourceFormatRaw;
    } else {
      throw new Error(
        'ai-i18n.config.json: resourceFormat must be "flat" or "i18next-namespace"',
      );
    }
  }

  const namespaceRaw = o.namespace;
  let namespace: string | undefined;
  if (resourceFormat === "i18next-namespace") {
    if (namespaceRaw !== undefined && namespaceRaw !== null) {
      if (typeof namespaceRaw !== "string" || namespaceRaw.trim() === "") {
        throw new Error("ai-i18n.config.json: namespace must be a non-empty string when set");
      }
      namespace = namespaceRaw.trim();
    } else {
      namespace = extracted.namespace;
    }
  } else if (namespaceRaw !== undefined && namespaceRaw !== null) {
    if (typeof namespaceRaw !== "string") {
      throw new Error("ai-i18n.config.json: namespace must be a string when set");
    }
    throw new Error(
      'ai-i18n.config.json: "namespace" is only used when resourceFormat is "i18next-namespace"',
    );
  }

  const config: AitConfig = {
    sourceGlobs,
    localesDir,
    i18n,
    defaultLocale,
    locales,
    cacheDir,
    provider,
    ...(typeof model === "string" ? { model } : {}),
    ...(resourceFormat !== "flat" ? { resourceFormat } : {}),
    ...(namespace !== undefined ? { namespace } : {}),
  };
  return { path, config };
}
