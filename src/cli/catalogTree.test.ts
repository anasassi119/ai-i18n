import { describe, expect, it } from "vitest";
import {
  buildCatalogJsonValue,
  flattenCatalogValues,
  mergeMissingKeysIntoParsed,
  namespacedLogicalKey,
  splitNamespacedLogicalKey,
} from "./catalogTree.js";

describe("flattenCatalogValues", () => {
  it("flat shape reads only top-level strings", () => {
    expect(flattenCatalogValues({ a: "1", b: { c: "x" } }, "flat")).toEqual({ a: "1" });
  });

  it("nested shape collects dotted leaf paths", () => {
    expect(flattenCatalogValues({ nav: { home: "H" }, top: "T" }, "nested")).toEqual({
      "nav.home": "H",
      top: "T",
    });
  });

  it("nested shape skips arrays but keeps translation.* and object string leaves", () => {
    const doc = {
      translation: {
        nav: { home: "Home" },
        experience: {
          title: "Exp",
          items: [{ company: "Co", description: ["line"] }],
        },
      },
    };
    const flat = flattenCatalogValues(doc, "nested");
    expect(flat["translation.nav.home"]).toBe("Home");
    expect(flat["translation.experience.title"]).toBe("Exp");
    expect(flat["translation.experience.items"]).toBeUndefined();
  });
});

describe("buildCatalogJsonValue", () => {
  it("nested round-trips using template structure", () => {
    const template = { nav: { home: "H" }, top: "T" };
    const flat = { "nav.home": "HH", top: "TT" };
    const out = buildCatalogJsonValue("nested", flat, template, ["nav.home", "top"]) as Record<string, unknown>;
    expect(out).toEqual({ nav: { home: "HH" }, top: "TT" });
  });
});

describe("namespacedLogicalKey", () => {
  it("splits merged keys", () => {
    expect(namespacedLogicalKey("nav", "home")).toBe("nav:home");
    expect(splitNamespacedLogicalKey("nav:home")).toEqual({ namespace: "nav", innerPath: "home" });
    expect(splitNamespacedLogicalKey("plain")).toBe(null);
  });
});

describe("mergeMissingKeysIntoParsed", () => {
  it("adds flat keys", () => {
    const o = mergeMissingKeysIntoParsed({ a: "1" }, "flat", ["b"]) as Record<string, unknown>;
    expect(o).toEqual({ a: "1", b: "" });
  });

  it("adds nested paths", () => {
    const o = mergeMissingKeysIntoParsed({ nav: { home: "H" } }, "nested", ["nav.new"]) as Record<string, unknown>;
    expect((o.nav as Record<string, unknown>).new).toBe("");
  });
});
