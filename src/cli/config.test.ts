import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const flatI18nStub = `
const i18next = { init(_o: Record<string, unknown>) {} };
i18next.init({
  lng: "en",
  supportedLngs: ["en", "fr"],
  resources: {},
});
`;

async function writeProjectWithI18n(
  dir: string,
  opts: {
    i18nBody: string;
    i18nRel?: string;
    configExtra?: Record<string, unknown>;
  },
) {
  const i18nRel = opts.i18nRel ?? "src/i18n.ts";
  const abs = path.join(dir, i18nRel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, opts.i18nBody, "utf8");
  await writeFile(
    path.join(dir, "ai-i18n.config.json"),
    JSON.stringify({
      sourceGlobs: ["a"],
      localesDir: "locales",
      i18n: i18nRel,
      provider: "openai",
      ...opts.configExtra,
    }),
    "utf8",
  );
}

describe("loadConfig", () => {
  it('rejects legacy "stub" provider', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-cfg-"));
    try {
      await writeProjectWithI18n(dir, { i18nBody: flatI18nStub });
      const p = path.join(dir, "ai-i18n.config.json");
      const raw = JSON.parse(await readFile(p, "utf8")) as Record<string, unknown>;
      raw.provider = "stub";
      await writeFile(p, JSON.stringify(raw), "utf8");
      await expect(loadConfig(dir)).rejects.toThrow(/stub/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects catalogDir without localesDir", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-cfg-cd-"));
    try {
      await writeFile(
        path.join(dir, "ai-i18n.config.json"),
        JSON.stringify({
          sourceGlobs: ["a"],
          catalogDir: "locales",
          i18n: "src/i18n.ts",
          provider: "openai",
        }),
        "utf8",
      );
      await expect(loadConfig(dir)).rejects.toThrow(/catalogDir.*localesDir/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("derives defaultLocale and locales from i18n module", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-cfg-derive-"));
    try {
      await writeProjectWithI18n(dir, { i18nBody: flatI18nStub });
      const { config } = await loadConfig(dir);
      expect(config.defaultLocale).toBe("en");
      expect(config.locales).toEqual(["en", "fr"]);
      expect(config.localesDir).toBe("locales");
      expect(config.i18n).toBe("src/i18n.ts");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("JSON overrides win for defaultLocale and locales", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-cfg-ov-"));
    try {
      await writeProjectWithI18n(dir, {
        i18nBody: flatI18nStub,
        configExtra: { defaultLocale: "de", locales: ["de", "it"] },
      });
      const { config } = await loadConfig(dir);
      expect(config.defaultLocale).toBe("de");
      expect(config.locales).toEqual(["de", "it"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
