import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { absolutePathToConfigRel } from "./initInteractive.js";

describe("absolutePathToConfigRel", () => {
  it("returns POSIX relative path from cwd", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-abspath-"));
    try {
      const child = path.join(dir, "locales", "here");
      const rel = absolutePathToConfigRel(dir, child);
      expect(rel).toMatch(/^locales[/\\]here$/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
