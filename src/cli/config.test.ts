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
  it('rejects invalid provider', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-cfg-"));
    try {
      await writeProjectWithI18n(dir, { i18nBody: flatI18nStub });
      const p = path.join(dir, "ai-i18n.config.json");
      const raw = JSON.parse(await readFile(p, "utf8")) as Record<string, unknown>;
      raw.provider = "stub";
      await writeFile(p, JSON.stringify(raw), "utf8");
      await expect(loadConfig(dir)).rejects.toThrow(/openai.*anthropic/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects removed catalogDir key", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-cfg-cd-"));
    try {
      await writeFile(
        path.join(dir, "ai-i18n.config.json"),
        JSON.stringify({
          sourceGlobs: ["a"],
          catalogDir: "locales",
          localesDir: "locales",
          defaultLocale: "en",
          locales: ["en"],
          provider: "openai",
        }),
        "utf8",
      );
      await expect(loadConfig(dir)).rejects.toThrow(/catalogDir/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects removed catalogShape key", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-cfg-cs-"));
    try {
      await writeProjectWithI18n(dir, {
        i18nBody: flatI18nStub,
        configExtra: { catalogShape: "flat" },
      });
      await expect(loadConfig(dir)).rejects.toThrow(/catalogShape/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects removed cacheDir key", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-cfg-cache-"));
    try {
      await writeProjectWithI18n(dir, {
        i18nBody: flatI18nStub,
        configExtra: { cacheDir: ".ai-i18n" },
      });
      await expect(loadConfig(dir)).rejects.toThrow(/cacheDir/);
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

  it("loads without i18n when defaultLocale, locales, and layout are explicit", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-cfg-noi18n-"));
    try {
      await mkdir(path.join(dir, "locales"), { recursive: true });
      await writeFile(path.join(dir, "locales", "en.json"), "{}\n", "utf8");
      await writeFile(
        path.join(dir, "ai-i18n.config.json"),
        JSON.stringify({
          sourceGlobs: ["src/**/*.ts"],
          localesDir: "locales",
          defaultLocale: "en",
          locales: ["en", "de"],
          provider: "openai",
        }),
        "utf8",
      );
      const { config } = await loadConfig(dir);
      expect(config.i18n).toBeUndefined();
      expect(config.defaultLocale).toBe("en");
      expect(config.locales).toEqual(["en", "de"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("throws without i18n if defaultLocale is missing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-cfg-noi18n-bad-"));
    try {
      await writeFile(
        path.join(dir, "ai-i18n.config.json"),
        JSON.stringify({
          sourceGlobs: ["a"],
          localesDir: "locales",
          locales: ["en"],
          provider: "openai",
        }),
        "utf8",
      );
      await expect(loadConfig(dir)).rejects.toThrow(/without "i18n"/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("localesAutoDiscover replaces locales from disk (flat layout)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-cfg-autodisc-"));
    try {
      await mkdir(path.join(dir, "locales"), { recursive: true });
      await writeFile(path.join(dir, "locales", "en.json"), "{}\n", "utf8");
      await writeFile(path.join(dir, "locales", "de.json"), "{}\n", "utf8");
      await writeFile(path.join(dir, "locales", "fr.json"), "{}\n", "utf8");
      await writeProjectWithI18n(dir, {
        i18nBody: flatI18nStub,
        configExtra: { locales: ["en", "xx"], localesAutoDiscover: true },
      });
      const { config } = await loadConfig(dir);
      expect(config.defaultLocale).toBe("en");
      expect(config.locales).toEqual(["en", "de", "fr"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
