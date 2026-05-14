import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const minimalConfig = {
  sourceGlobs: ["a"],
  defaultLocale: "en",
  locales: ["fr"],
  catalogDir: "locales",
};

describe("loadConfig", () => {
  it("rejects unknown resourceFormat", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-cfg-rf-"));
    try {
      await writeFile(
        path.join(dir, "ai-i18n.config.json"),
        JSON.stringify({ ...minimalConfig, resourceFormat: "nested-keys" }),
        "utf8",
      );
      await expect(loadConfig(dir)).rejects.toThrow(/resourceFormat/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects namespace when resourceFormat is flat', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-cfg-nsflat-"));
    try {
      await writeFile(
        path.join(dir, "ai-i18n.config.json"),
        JSON.stringify({ ...minimalConfig, resourceFormat: "flat", namespace: "common" }),
        "utf8",
      );
      await expect(loadConfig(dir)).rejects.toThrow(/namespace.*i18next-namespace/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("defaults namespace to translation for i18next-namespace when omitted", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-cfg-nsdef-"));
    try {
      await writeFile(
        path.join(dir, "ai-i18n.config.json"),
        JSON.stringify({ ...minimalConfig, resourceFormat: "i18next-namespace" }),
        "utf8",
      );
      const { config } = await loadConfig(dir);
      expect(config.resourceFormat).toBe("i18next-namespace");
      expect(config.namespace).toBe("translation");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects namespace when resourceFormat is omitted (flat default)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-cfg-nsomit-"));
    try {
      await writeFile(
        path.join(dir, "ai-i18n.config.json"),
        JSON.stringify({ ...minimalConfig, namespace: "common" }),
        "utf8",
      );
      await expect(loadConfig(dir)).rejects.toThrow(/namespace.*i18next-namespace/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

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
