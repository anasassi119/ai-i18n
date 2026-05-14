import path from "node:path";
import type { AitConfig, ResourceFormat } from "./config.js";

/**
 * Namespace JSON filenames for `i18next-namespace` layout (one or more per locale).
 * When `config.namespaces` is set and non-empty, it wins; else `[namespace || "translation"]`.
 */
export function effectiveNamespaceList(config: AitConfig): string[] | undefined {
  const fmt = config.resourceFormat ?? "flat";
  if (fmt === "flat") return undefined;
  if (config.namespaces && config.namespaces.length > 0) {
    return config.namespaces.map((s) => s.trim()).filter((s) => s.length > 0);
  }
  const n = config.namespace && config.namespace.length > 0 ? config.namespace : "translation";
  return [n];
}

/** One JSON file per entry: flat layout uses a single file with `namespace: ""`. */
export function localeJsonFilesForLocale(
  cwd: string,
  config: AitConfig,
  locale: string,
): { namespace: string; path: string }[] {
  const base = path.resolve(cwd, config.localesDir);
  const fmt = config.resourceFormat ?? "flat";
  if (fmt === "flat") {
    return [{ namespace: "", path: path.join(base, `${locale}.json`) }];
  }
  const nss = effectiveNamespaceList(config)!;
  return nss.map((ns) => ({ namespace: ns, path: path.join(base, locale, `${ns}.json`) }));
}

/**
 * Absolute path to the locale catalog JSON for the given layout.
 * - `flat`: `{localesDir}/{locale}.json`
 * - `i18next-namespace`: `{localesDir}/{locale}/{namespace}.json`
 */
export function localeCatalogPathFromParts(
  cwd: string,
  localesDir: string,
  locale: string,
  resourceFormat: ResourceFormat | undefined,
  namespace: string | undefined,
): string {
  const base = path.resolve(cwd, localesDir);
  const fmt = resourceFormat ?? "flat";
  if (fmt === "flat") {
    return path.join(base, `${locale}.json`);
  }
  const ns = namespace && namespace.length > 0 ? namespace : "translation";
  return path.join(base, locale, `${ns}.json`);
}

export function localeCatalogPath(cwd: string, config: AitConfig, locale: string): string {
  return localeJsonFilesForLocale(cwd, config, locale)[0]!.path;
}
