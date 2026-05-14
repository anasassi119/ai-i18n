import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it('rejects legacy "stub" provider', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-cfg-"));
    try {
      const p = path.join(dir, "ai-i18n.config.json");
      await writeFile(
        p,
        JSON.stringify({
          sourceGlobs: ["a"],
          defaultLocale: "en",
          locales: ["fr"],
          catalogDir: "locales",
          provider: "stub",
        }),
        "utf8",
      );
      await expect(loadConfig(dir)).rejects.toThrow(/stub/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
