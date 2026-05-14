import path from "node:path";
import type { AitConfig, ResourceFormat } from "./config.js";

/**
 * Absolute path to the locale catalog JSON for the given layout.
 * - `flat`: `{catalogDir}/{locale}.json`
 * - `i18next-namespace`: `{catalogDir}/{locale}/{namespace}.json`
 */
export function localeCatalogPathFromParts(
  cwd: string,
  catalogDir: string,
  locale: string,
  resourceFormat: ResourceFormat | undefined,
  namespace: string | undefined,
): string {
  const base = path.resolve(cwd, catalogDir);
  const fmt = resourceFormat ?? "flat";
  if (fmt === "flat") {
    return path.join(base, `${locale}.json`);
  }
  const ns = namespace && namespace.length > 0 ? namespace : "translation";
  return path.join(base, locale, `${ns}.json`);
}

export function localeCatalogPath(cwd: string, config: AitConfig, locale: string): string {
  return localeCatalogPathFromParts(
    cwd,
    config.catalogDir,
    locale,
    config.resourceFormat,
    config.namespace,
  );
}
