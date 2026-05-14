import type { Resource } from "i18next";

/**
 * Maps flat locale catalogs (one JSON object per locale, as produced by `ai-i18n generate`)
 * into the `resources` object expected by `i18next.init({ resources })`.
 *
 * @param catalogs — e.g. `{ en: { welcome: "Hi" }, fr: { welcome: "Salut" } }`
 * @param namespace — i18next default namespace (often `"translation"`)
 */
export function catalogsToI18nextResources(
  catalogs: Record<string, Record<string, string>>,
  namespace = "translation",
): Resource {
  const resources: Resource = {};
  for (const [lng, table] of Object.entries(catalogs)) {
    resources[lng] = { [namespace]: { ...table } };
  }
  return resources;
}

export type NamespaceCatalogFileEntry = {
  lng: string;
  namespace: string;
  catalog: Record<string, string>;
};

/**
 * Builds `i18next.init({ resources })` from per-file namespace catalogs
 * (e.g. JSON loaded from `{catalogDir}/{lng}/{ns}.json` when using `resourceFormat: "i18next-namespace"`).
 * Same-language, same-namespace entries are shallow-merged in array order.
 */
export function namespaceCatalogFilesToResources(entries: NamespaceCatalogFileEntry[]): Resource {
  const resources: Resource = {};
  for (const { lng, namespace, catalog } of entries) {
    if (!resources[lng]) resources[lng] = {};
    const prev = resources[lng][namespace] as Record<string, string> | undefined;
    resources[lng][namespace] = { ...prev, ...catalog };
  }
  return resources;
}
