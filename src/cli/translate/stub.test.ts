import { describe, expect, it } from "vitest";
import { stubTranslator } from "./stub.js";

describe("stubTranslator", () => {
  it("copies source strings", async () => {
    const r = await stubTranslator(
      {
        targetLocale: "fr",
        sourceLocale: "en",
        entries: [{ key: "a", source: "Hello" }],
      },
      {},
    );
    expect(r).toEqual([{ key: "a", text: "Hello" }]);
  });
});
