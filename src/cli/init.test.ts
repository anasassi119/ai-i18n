import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runInit } from "./init.js";

describe("runInit", () => {
  it("writes default config then skips", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-init-"));
    try {
      const r1 = await runInit(dir, { silent: true });
      expect(r1).toBe("created");
      const body = await readFile(path.join(dir, "ai-i18n.config.json"), "utf8");
      expect(body).toContain('"provider": "openai"');

      const r2 = await runInit(dir, { silent: true });
      expect(r2).toBe("skipped");

      await writeFile(path.join(dir, "ai-i18n.config.json"), "{}", "utf8");
      const r3 = await runInit(dir, { force: true, silent: true });
      expect(r3).toBe("overwritten");
      const body3 = await readFile(path.join(dir, "ai-i18n.config.json"), "utf8");
      expect(body3).toContain("sourceGlobs");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
