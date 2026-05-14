import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { inferCatalogLayoutFromLocalesDir } from "./initDiscover.js";

describe("inferCatalogLayoutFromLocalesDir", () => {
  it("infers flat layout from root locale JSON files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ai-i18n-inf-flat-"));
    try {
      const locales = path.join(root, "locales");
      await mkdir(locales, { recursive: true });
      await writeFile(path.join(locales, "en.json"), JSON.stringify({ a: "1" }), "utf8");
      await writeFile(path.join(locales, "fr.json"), "{}", "utf8");
      const r = await inferCatalogLayoutFromLocalesDir(locales, root);
      expect(r.ambiguous).toBe(false);
      expect(r.resourceFormat).toBe("flat");
      expect(r.localesDirRel).toBe("locales");
      expect(new Set(r.locales)).toEqual(new Set(["en", "fr"]));
      expect(r.defaultLocale).toBe("en");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("infers i18next-namespace from per-locale subdirs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ai-i18n-inf-ns-"));
    try {
      const locales = path.join(root, "src", "locales");
      await mkdir(path.join(locales, "en"), { recursive: true });
      await mkdir(path.join(locales, "fr"), { recursive: true });
      await writeFile(path.join(locales, "en", "translation.json"), "{}\n", "utf8");
      await writeFile(path.join(locales, "fr", "translation.json"), "{}\n", "utf8");
      const r = await inferCatalogLayoutFromLocalesDir(locales, root);
      expect(r.ambiguous).toBe(false);
      expect(r.resourceFormat).toBe("i18next-namespace");
      expect(r.namespace).toBe("translation");
      expect(new Set(r.locales)).toEqual(new Set(["en", "fr"]));
      expect(r.localesDirRel).toBe(path.join("src", "locales").split(path.sep).join("/"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("resolves ambiguous layout with preferWhenAmbiguous", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ai-i18n-inf-amb-"));
    try {
      const locales = path.join(root, "locales");
      await mkdir(locales, { recursive: true });
      await writeFile(path.join(locales, "en.json"), "{}", "utf8");
      await mkdir(path.join(locales, "en"), { recursive: true });
      await writeFile(path.join(locales, "en", "translation.json"), "{}", "utf8");
      const amb = await inferCatalogLayoutFromLocalesDir(locales, root);
      expect(amb.ambiguous).toBe(true);
      const flat = await inferCatalogLayoutFromLocalesDir(locales, root, "flat");
      expect(flat.ambiguous).toBe(false);
      expect(flat.resourceFormat).toBe("flat");
      const ns = await inferCatalogLayoutFromLocalesDir(locales, root, "namespace");
      expect(ns.ambiguous).toBe(false);
      expect(ns.resourceFormat).toBe("i18next-namespace");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
