import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { LocaleShape } from "./catalogTree.js";
import { extractI18nInitFromFile } from "./i18nInitExtract.js";

export type Provider = "openai" | "anthropic";

/** How locale files are laid out under `localesDir`. Default: `flat`. */
export type ResourceFormat = "flat" | "i18next-namespace";

const RESERVED_LOCALE_FILES = new Set(["translator-notes"]);

async function discoverLocalesFromDisk(
  cwd: string,
  localesDir: string,
  resourceFormat: ResourceFormat,
): Promise<string[]> {
  const base = resolve(cwd, localesDir);
  let dirents;
  try {
    dirents = await readdir(base, { withFileTypes: true });
  } catch {
    return [];
  }

  if (resourceFormat === "flat") {
    const codes: string[] = [];
    for (const d of dirents) {
      if (!d.isFile() || !d.name.endsWith(".json")) continue;
      const code = d.name.replace(/\.json$/i, "");
      if (!code || RESERVED_LOCALE_FILES.has(code)) continue;
      codes.push(code);
    }
    return [...new Set(codes)].sort((a, b) => a.localeCompare(b));
  }

  const codes: string[] = [];
  for (const d of dirents) {
    if (d.isDirectory() && !d.name.startsWith(".")) codes.push(d.name);
  }
  return [...new Set(codes)].sort((a, b) => a.localeCompare(b));
}

function mergeDiscoveredLocales(defaultLocale: string, discovered: string[]): string[] {
  const rest = discovered.filter((l) => l !== defaultLocale);
  const dedup = [defaultLocale, ...rest.filter((l, i) => rest.indexOf(l) === i)];
  return dedup;
}

const REMOVED_CONFIG_KEYS: Record<string, string> = {
  catalogDir: 'Use "localesDir" instead of "catalogDir".',
  catalogShape: 'Use "localeShape" instead of "catalogShape".',
  cacheDir: 'cacheDir was removed in v5; cache is always node_modules/.cache/ai-i18n.',
};

function assertNoRemovedConfigKeys(o: Record<string, unknown>): void {
  const found: string[] = [];
  for (const key of Object.keys(REMOVED_CONFIG_KEYS)) {
    if (key in o) found.push(key);
  }
  if (found.length === 0) return;
  const hints = found.map((k) => `  - "${k}": ${REMOVED_CONFIG_KEYS[k]}`).join("\n");
  throw new Error(
    `ai-i18n.config.json: removed option(s) in v5:\n${hints}\nSee docs/configuration.md for migration.`,
  );
}

export interface AitConfig {
  sourceGlobs: string[];
  /** Directory containing locale JSON and `translator-notes.json`. */
  localesDir: string;
  /**
   * Project-relative path to the module that calls `*.init({...})` for i18next (static analysis).
   * When omitted, `defaultLocale`, `locales`, and `resourceFormat` must be set explicitly in the JSON file.
   */
  i18n?: string;
  defaultLocale: string;
  locales: string[];
  provider: Provider;
  model?: string;
  /** Default `flat`. `i18next-namespace` uses `{localesDir}/{locale}/{namespace}.json`. */
  resourceFormat?: ResourceFormat;
  /** Used when `resourceFormat` is `i18next-namespace`; default `translation`. Ignored when `namespaces` is set. */
  namespace?: string;
  /** Default `flat` (top-level string keys only). `nested` allows nested objects with string leaves. */
  localeShape?: LocaleShape;
  /**
   * Multiple `{localesDir}/{locale}/{name}.json` files per language.
   * Requires `resourceFormat: "i18next-namespace"`.
   */
  namespaces?: string[];
  /** When true, `locales` is replaced by scanning `localesDir` (flat: `*.json`; namespace: subdirs). */
  localesAutoDiscover?: boolean;
}

export async function loadConfig(cwd: string): Promise<{ path: string; config: AitConfig }> {
  const path = resolve(cwd, "ai-i18n.config.json");
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("ai-i18n.config.json must be a JSON object");
  }
  const o = parsed as Record<string, unknown>;
  assertNoRemovedConfigKeys(o);

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
  const hasI18n =
    i18nRaw !== undefined &&
    i18nRaw !== null &&
    typeof i18nRaw === "string" &&
    i18nRaw.trim() !== "";
  const i18n = hasI18n ? (i18nRaw as string).trim() : undefined;

  const providerRaw = o.provider;
  let provider: Provider = "openai";
  if (providerRaw !== undefined && providerRaw !== null) {
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

  let extracted: Awaited<ReturnType<typeof extractI18nInitFromFile>> | null = null;
  if (hasI18n) {
    const i18nAbs = resolve(cwd, i18n!);
    extracted = await extractI18nInitFromFile(i18nAbs);
  }

  let defaultLocale: string;
  if (extracted) {
    defaultLocale = extracted.defaultLocale;
    if (typeof o.defaultLocale === "string" && o.defaultLocale.trim() !== "") {
      defaultLocale = o.defaultLocale.trim();
    }
  } else {
    const dlr = o.defaultLocale;
    if (typeof dlr !== "string" || dlr.trim() === "") {
      throw new Error(
        'ai-i18n.config.json: without "i18n", you must set "defaultLocale" (non-empty string) and "locales" (non-empty array).',
      );
    }
    defaultLocale = dlr.trim();
  }

  let locales: string[];
  if (extracted) {
    locales = extracted.locales;
    if (Array.isArray(o.locales) && o.locales.length > 0 && o.locales.every((x) => typeof x === "string")) {
      locales = o.locales as string[];
    }
  } else {
    const locRaw = o.locales;
    if (!Array.isArray(locRaw) || locRaw.length === 0 || !locRaw.every((x) => typeof x === "string")) {
      throw new Error(
        'ai-i18n.config.json: without "i18n", you must set "locales" to a non-empty array of locale codes.',
      );
    }
    locales = locRaw as string[];
  }

  if (!locales.includes(defaultLocale)) {
    locales = [defaultLocale, ...locales.filter((x) => x !== defaultLocale)];
  }

  const resourceFormatRaw = o.resourceFormat;
  let resourceFormat: ResourceFormat = extracted?.resourceFormat ?? "flat";
  if (resourceFormatRaw !== undefined && resourceFormatRaw !== null) {
    if (resourceFormatRaw === "flat" || resourceFormatRaw === "i18next-namespace") {
      resourceFormat = resourceFormatRaw;
    } else {
      throw new Error(
        'ai-i18n.config.json: resourceFormat must be "flat" or "i18next-namespace"',
      );
    }
  }

  const namespacesRaw = o.namespaces;
  let namespaces: string[] | undefined;
  if (namespacesRaw !== undefined && namespacesRaw !== null) {
    if (!Array.isArray(namespacesRaw) || !namespacesRaw.every((x) => typeof x === "string")) {
      throw new Error('ai-i18n.config.json: "namespaces" must be an array of strings when set');
    }
    namespaces = (namespacesRaw as string[])
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (namespaces.length === 0) namespaces = undefined;
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
      namespace = extracted?.namespace;
    }
  } else if (namespaceRaw !== undefined && namespaceRaw !== null) {
    if (typeof namespaceRaw !== "string") {
      throw new Error("ai-i18n.config.json: namespace must be a string when set");
    }
    throw new Error(
      'ai-i18n.config.json: "namespace" is only used when resourceFormat is "i18next-namespace"',
    );
  }

  if (namespaces !== undefined && resourceFormat !== "i18next-namespace") {
    throw new Error(
      'ai-i18n.config.json: "namespaces" requires resourceFormat "i18next-namespace"',
    );
  }

  if (resourceFormat === "i18next-namespace" && !hasI18n && namespace === undefined && namespaces === undefined) {
    throw new Error(
      'ai-i18n.config.json: without "i18n", set "namespace" or "namespaces" when resourceFormat is "i18next-namespace".',
    );
  }

  const localeShapeRaw = o.localeShape;
  let localeShape: LocaleShape | undefined;
  if (localeShapeRaw !== undefined && localeShapeRaw !== null) {
    if (localeShapeRaw === "flat" || localeShapeRaw === "nested") {
      localeShape = localeShapeRaw;
    } else {
      throw new Error('ai-i18n.config.json: localeShape must be "flat" or "nested"');
    }
  }

  const localesAutoDiscover = o.localesAutoDiscover === true;
  if (localesAutoDiscover) {
    const fromDisk = await discoverLocalesFromDisk(cwd, localesDir, resourceFormat);
    if (fromDisk.length > 0) {
      locales = mergeDiscoveredLocales(defaultLocale, fromDisk);
    }
  }

  const config: AitConfig = {
    sourceGlobs,
    localesDir,
    ...(i18n !== undefined ? { i18n } : {}),
    defaultLocale,
    locales,
    provider,
    ...(typeof model === "string" ? { model } : {}),
    ...(resourceFormat !== "flat" ? { resourceFormat } : {}),
    ...(namespace !== undefined && namespaces === undefined ? { namespace } : {}),
    ...(namespaces !== undefined ? { namespaces } : {}),
    ...(localeShape !== undefined ? { localeShape } : {}),
    ...(localesAutoDiscover ? { localesAutoDiscover: true } : {}),
  };
  return { path, config };
}
