import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanContextFromConfig } from "./scan.js";
import type { AitConfig } from "./config.js";

function cfg(over: Partial<AitConfig> = {}): AitConfig {
  return {
    sourceGlobs: ["src/**/*.tsx"],
    localesDir: "locales",
    i18n: "src/i18n.ts",
    defaultLocale: "en",
    locales: ["en", "fr"],
    cacheDir: ".ai-i18n",
    provider: "openai",
    ...over,
  };
}

describe("scanSources + scanContextFromConfig", () => {
  let dir: string;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("resolves useTranslation namespace for multi-namespace config", async () => {
    const { scanSources } = await import("./scan.js");
    dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-scan-"));
    await mkdir(path.join(dir, "src"), { recursive: true });
    await writeFile(
      path.join(dir, "src", "App.tsx"),
      `
      function X() {
        const { t } = useTranslation('nav');
        return <span>{t('home')}</span>;
      }
    `,
      "utf8",
    );
    const ctx = scanContextFromConfig(cfg({ resourceFormat: "i18next-namespace", namespaces: ["nav", "common"] }));
    const { keysInCode } = await scanSources(dir, ["src/**/*.tsx"], ctx);
    expect(keysInCode.has("nav:home")).toBe(true);
  });

  it("uses short keys when hook namespace matches single configured namespace", async () => {
    const { scanSources } = await import("./scan.js");
    dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-scan-short-"));
    await mkdir(path.join(dir, "src"), { recursive: true });
    await writeFile(
      path.join(dir, "src", "App.tsx"),
      `
      function X() {
        const { t } = useTranslation('translation');
        return <span>{t('welcome')}</span>;
      }
    `,
      "utf8",
    );
    const ctx = scanContextFromConfig(cfg({ resourceFormat: "i18next-namespace", namespace: "translation" }));
    const { keysInCode } = await scanSources(dir, ["src/**/*.tsx"], ctx);
    expect(keysInCode.has("welcome")).toBe(true);
  });

  it("preserves literal ns:key strings", async () => {
    const { scanSources } = await import("./scan.js");
    dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-scan-colon-"));
    await mkdir(path.join(dir, "src"), { recursive: true });
    await writeFile(
      path.join(dir, "src", "App.tsx"),
      `function X() { return <span>{t('nav:deep.key')}</span>; }`,
      "utf8",
    );
    const { keysInCode } = await scanSources(dir, ["src/**/*.tsx"], scanContextFromConfig(cfg()));
    expect(keysInCode.has("nav:deep.key")).toBe(true);
  });
});
