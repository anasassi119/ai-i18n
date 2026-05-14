import { describe, expect, it } from "vitest";
import { resolveTranslator } from "./factory.js";
import type { AitConfig } from "../config.js";

describe("resolveTranslator", () => {
  it("returns stub", () => {
    const cfg = { provider: "stub" } as AitConfig;
    expect(resolveTranslator(cfg)).toBeDefined();
  });

  it("throws on unknown provider", () => {
    const cfg = { provider: "other" } as unknown as AitConfig;
    expect(() => resolveTranslator(cfg)).toThrow(/Unknown/);
  });
});
