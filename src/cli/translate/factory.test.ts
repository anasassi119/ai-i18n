import { describe, expect, it } from "vitest";
import { resolveTranslator } from "./factory.js";
import type { AitConfig } from "../config.js";
import { anthropicTranslator } from "./anthropic.js";
import { openAiTranslator } from "./openai.js";

describe("resolveTranslator", () => {
  it("returns openai translator", () => {
    const cfg = { provider: "openai" } as AitConfig;
    expect(resolveTranslator(cfg)).toBe(openAiTranslator);
  });

  it("returns anthropic translator", () => {
    const cfg = { provider: "anthropic" } as AitConfig;
    expect(resolveTranslator(cfg)).toBe(anthropicTranslator);
  });

  it("defaults to openai when provider omitted", () => {
    const cfg = {} as unknown as AitConfig;
    expect(resolveTranslator(cfg)).toBe(openAiTranslator);
  });

  it("throws on unknown provider", () => {
    const cfg = { provider: "other" } as unknown as AitConfig;
    expect(() => resolveTranslator(cfg)).toThrow(/Unknown/);
  });
});
