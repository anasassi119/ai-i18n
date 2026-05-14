import i18next from "i18next";
import { describe, expect, it } from "vitest";
import { catalogsToI18nextResources, namespaceCatalogFilesToResources } from "./i18next.js";

describe("catalogsToI18nextResources", () => {
  it("round-trips through i18next.t", async () => {
    const i18n = i18next.createInstance();
    await i18n.init({
      lng: "en",
      fallbackLng: "en",
      resources: catalogsToI18nextResources({
        en: { greet: "Hello, {{name}}!" },
        fr: { greet: "Bonjour, {{name}} !" },
      }),
    });
    expect(i18n.t("greet", { name: "Ada" })).toBe("Hello, Ada!");
    await i18n.changeLanguage("fr");
    expect(i18n.t("greet", { name: "Ada" })).toBe("Bonjour, Ada !");
  });
});

describe("namespaceCatalogFilesToResources", () => {
  it("round-trips like per-locale namespace JSON on disk", async () => {
    const i18n = i18next.createInstance();
    await i18n.init({
      lng: "en",
      fallbackLng: "en",
      resources: namespaceCatalogFilesToResources([
        { lng: "en", namespace: "translation", catalog: { greet: "Hello, {{name}}!" } },
        { lng: "fr", namespace: "translation", catalog: { greet: "Bonjour, {{name}} !" } },
      ]),
    });
    expect(i18n.t("greet", { name: "Ada" })).toBe("Hello, Ada!");
    await i18n.changeLanguage("fr");
    expect(i18n.t("greet", { name: "Ada" })).toBe("Bonjour, Ada !");
  });
});
