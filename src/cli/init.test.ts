import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bootstrapDefaultCatalogIfNeeded, runInit } from "./init.js";

describe("runInit", () => {
  it("writes default config then skips", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-init-"));
    try {
      const r1 = await runInit(dir, { silent: true });
      expect(r1).toBe("created");
      const body = await readFile(path.join(dir, "ai-i18n.config.json"), "utf8");
      expect(body).toContain('"provider": "openai"');
      const enPath = path.join(dir, "locales", "en.json");
      const enRaw = await readFile(enPath, "utf8");
      expect(JSON.parse(enRaw)).toEqual({});

      const tnRaw = await readFile(path.join(dir, "locales", "translator-notes.json"), "utf8");
      expect(JSON.parse(tnRaw)).toEqual({});

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

describe("bootstrapDefaultCatalogIfNeeded", () => {
  it("creates catalog dir and default locale JSON from config fields", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-boot-"));
    try {
      await writeFile(
        path.join(dir, "ai-i18n.config.json"),
        JSON.stringify({
          catalogDir: "messages",
          defaultLocale: "de",
          sourceGlobs: ["x"],
          locales: ["fr"],
        }),
        "utf8",
      );
      const created = await bootstrapDefaultCatalogIfNeeded(
        dir,
        path.join(dir, "ai-i18n.config.json"),
        true,
      );
      expect(created).toBe(true);
      const raw = await readFile(path.join(dir, "messages", "de.json"), "utf8");
      expect(JSON.parse(raw)).toEqual({});
      const notesRaw = await readFile(path.join(dir, "messages", "translator-notes.json"), "utf8");
      expect(JSON.parse(notesRaw)).toEqual({});
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("bootstraps default catalog at locale/namespace.json for i18next-namespace", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-boot-ns-"));
    try {
      await writeFile(
        path.join(dir, "ai-i18n.config.json"),
        JSON.stringify({
          catalogDir: "locales",
          defaultLocale: "en",
          sourceGlobs: ["x"],
          locales: ["fr"],
          resourceFormat: "i18next-namespace",
        }),
        "utf8",
      );
      const created = await bootstrapDefaultCatalogIfNeeded(
        dir,
        path.join(dir, "ai-i18n.config.json"),
        true,
      );
      expect(created).toBe(true);
      const raw = await readFile(path.join(dir, "locales", "en", "translation.json"), "utf8");
      expect(JSON.parse(raw)).toEqual({});
      const notesRaw = await readFile(path.join(dir, "locales", "translator-notes.json"), "utf8");
      expect(JSON.parse(notesRaw)).toEqual({});
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
