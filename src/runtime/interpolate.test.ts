import { describe, expect, it } from "vitest";
import { interpolate } from "./interpolate.js";

describe("interpolate", () => {
  it("replaces placeholders", () => {
    expect(interpolate("Hi {{name}}", { name: "Ada" })).toBe("Hi Ada");
  });

  it("throws when placeholder missing", () => {
    expect(() => interpolate("Hi {{name}}", {})).toThrow(/Missing interpolation/);
  });
});
