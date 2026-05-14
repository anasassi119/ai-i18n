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
