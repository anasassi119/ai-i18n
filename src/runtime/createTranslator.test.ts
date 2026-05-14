import { describe, expect, it } from "vitest";
import { createTranslator } from "./createTranslator.js";

describe("createTranslator", () => {
  const resources = {
    en: { greet: "Hello {{name}}" },
    fr: { greet: "Bonjour {{name}}" },
  };

  it("strips hint and interpolates", () => {
    const t = createTranslator(resources, "fr", "en", false);
    expect(t("greet", { name: "Ada", hint: "greeting" })).toBe("Bonjour Ada");
  });

  it("falls back to default locale", () => {
    const t = createTranslator(resources, "de", "en", false);
    expect(t("greet", { name: "Bob" })).toBe("Hello Bob");
  });

  it("strict missing throws", () => {
    const t = createTranslator(resources, "fr", "en", true);
    expect(() => t("missing", {})).toThrow(/Missing translation key/);
  });
});
