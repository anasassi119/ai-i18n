import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultCacheDir, defaultCacheFilePath } from "./cachePath.js";

describe("cachePath", () => {
  it("resolves under node_modules/.cache/ai-i18n", () => {
    const cwd = "/project";
    expect(defaultCacheDir(cwd)).toBe(path.join(cwd, "node_modules", ".cache", "ai-i18n"));
    expect(defaultCacheFilePath(cwd)).toBe(
      path.join(cwd, "node_modules", ".cache", "ai-i18n", ".ai-i18n-cache.json"),
    );
  });
});
