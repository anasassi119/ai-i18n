import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TranslateBatchInput, TranslateBatchResult } from "./translate/types.js";

vi.mock("./translate/factory.js", () => ({
  resolveTranslator: () => async (input: TranslateBatchInput): Promise<TranslateBatchResult> =>
    Promise.resolve(
      input.entries.map((e) => ({
        key: e.key,
        text: `[${input.targetLocale}]${e.source}`,
      })),
    ),
}));

import type { AitConfig } from "./config.js";
import { runGenerateWithConfig } from "./generate.js";

function baseConfig(overrides: Partial<AitConfig> = {}): AitConfig {
  return {
    sourceGlobs: ["src/**/*.tsx"],
    localesDir: "locales",
    i18n: "src/i18n.ts",
    defaultLocale: "en",
    locales: ["fr"],
    provider: "openai",
    batchSize: 40,
    ...overrides,
  };
}

const flatI18nForGenerate = `
const i18next = { init(_o: Record<string, unknown>) {} };
i18next.init({ lng: "en", supportedLngs: ["en", "fr"], resources: {} });
`;

const nsI18nForGenerate = `
const i18next = { init(_o: Record<string, unknown>) {} };
i18next.init({
  lng: "en",
  supportedLngs: ["en", "fr"],
  resources: {
    en: { translation: {} },
    fr: { translation: {} },
  },
});
`;

describe("runGenerateWithConfig (default catalog key order)", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("writes target locale JSON keys in the same order as the default catalog", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-gen-order-"));
    await mkdir(path.join(dir, "src"), { recursive: true });
    await mkdir(path.join(dir, "locales"), { recursive: true });
    await writeFile(
      path.join(dir, "locales", "en.json"),
      JSON.stringify(
        { zebra: "Z", apple: "A", mango: "M" },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    await writeFile(
      path.join(dir, "src", "App.tsx"),
      `declare function t(key: string, opts?: Record<string, unknown>): string;\n` +
        `export function X() {\n` +
        `  return <span>{t("zebra")}{t("apple")}{t("mango")}</span>;\n` +
        `}\n`,
      "utf8",
    );
    await writeFile(path.join(dir, "src", "i18n.ts"), flatI18nForGenerate, "utf8");

    await runGenerateWithConfig(dir, baseConfig({ resourceFormat: "flat" }), false);

    const frRaw = await readFile(path.join(dir, "locales", "fr.json"), "utf8");
    expect(Object.keys(JSON.parse(frRaw) as Record<string, string>)).toEqual(["zebra", "apple", "mango"]);
  });
});

const flatI18nEnFrDe = `
const i18next = { init(_o: Record<string, unknown>) {} };
i18next.init({ lng: "en", supportedLngs: ["en", "fr", "de"], resources: {} });
`;

describe("runGenerateWithConfig (onlyLocales)", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("only processes listed locales and leaves others unchanged", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-gen-only-locale-"));
    await mkdir(path.join(dir, "src"), { recursive: true });
    await mkdir(path.join(dir, "locales"), { recursive: true });
    await writeFile(path.join(dir, "src", "i18n.ts"), flatI18nEnFrDe, "utf8");
    await writeFile(
      path.join(dir, "src", "App.tsx"),
      `declare function t(key: string, opts?: Record<string, unknown>): string;\nexport function X() { return <span>{t("k")}</span>; }\n`,
      "utf8",
    );
    await writeFile(
      path.join(dir, "locales", "en.json"),
      JSON.stringify({ k: "Hello" }, null, 2) + "\n",
      "utf8",
    );
    await writeFile(
      path.join(dir, "locales", "fr.json"),
      JSON.stringify({ k: "[fr]KEEP" }, null, 2) + "\n",
      "utf8",
    );
    await writeFile(
      path.join(dir, "locales", "de.json"),
      JSON.stringify({ k: "[de]old" }, null, 2) + "\n",
      "utf8",
    );

    await runGenerateWithConfig(
      dir,
      baseConfig({ locales: ["en", "fr", "de"], resourceFormat: "flat" }),
      true,
      { onlyLocales: ["de"] },
    );

    const frRaw = await readFile(path.join(dir, "locales", "fr.json"), "utf8");
    expect(JSON.parse(frRaw)).toEqual({ k: "[fr]KEEP" });
    const deRaw = await readFile(path.join(dir, "locales", "de.json"), "utf8");
    expect(JSON.parse(deRaw)).toEqual({ k: "[de]Hello" });
  });

  it("rejects --locale not present in config locales", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-gen-locale-bad-"));
    await mkdir(path.join(dir, "locales"), { recursive: true });
    await writeFile(
      path.join(dir, "locales", "en.json"),
      JSON.stringify({ k: "x" }, null, 2) + "\n",
      "utf8",
    );
    await expect(
      runGenerateWithConfig(dir, baseConfig({ locales: ["en", "fr"], resourceFormat: "flat" }), false, {
        onlyLocales: ["de"],
      }),
    ).rejects.toThrow(/unknown code\(s\): de[\s\S]*supportedLngs/);
  });
});

describe("runGenerateWithConfig (i18next-namespace layout)", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("writes target catalog under locale/namespace.json", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-gen-ns-"));
    await mkdir(path.join(dir, "src"), { recursive: true });
    await mkdir(path.join(dir, "locales", "en"), { recursive: true });
    await writeFile(
      path.join(dir, "src", "App.tsx"),
      `declare function t(key: string, opts?: Record<string, unknown>): string;\nexport function X() { return <span>{t("welcome")}</span>; }\n`,
      "utf8",
    );
    await writeFile(
      path.join(dir, "locales", "en", "translation.json"),
      JSON.stringify({ welcome: "Hello" }, null, 2) + "\n",
      "utf8",
    );

    await writeFile(
      path.join(dir, "src", "i18n.ts"),
      nsI18nForGenerate,
      "utf8",
    );

    await runGenerateWithConfig(
      dir,
      baseConfig({ resourceFormat: "i18next-namespace", namespace: "translation" }),
      false,
    );

    const frRaw = await readFile(path.join(dir, "locales", "fr", "translation.json"), "utf8");
    expect(JSON.parse(frRaw)).toEqual({ welcome: "[fr]Hello" });
  });

  it('suggests "resourceFormat": "flat" when namespace default path is missing but flat en.json exists', async () => {
    dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-gen-ns-flat-hint-"));
    await mkdir(path.join(dir, "src"), { recursive: true });
    await mkdir(path.join(dir, "locales"), { recursive: true });
    await writeFile(path.join(dir, "locales", "en.json"), "{}\n", "utf8");
    await writeFile(path.join(dir, "src", "i18n.ts"), nsI18nForGenerate, "utf8");

    await expect(
      runGenerateWithConfig(
        dir,
        baseConfig({ resourceFormat: "i18next-namespace", namespace: "translation" }),
        false,
      ),
    ).rejects.toThrow(/"resourceFormat": "flat"/);
  });
});

describe("runGenerateWithConfig (nested localeShape)", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("writes nested JSON preserving structure", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-gen-nested-"));
    await mkdir(path.join(dir, "src"), { recursive: true });
    await mkdir(path.join(dir, "locales"), { recursive: true });
    await writeFile(path.join(dir, "src", "i18n.ts"), flatI18nForGenerate, "utf8");
    await writeFile(
      path.join(dir, "locales", "en.json"),
      JSON.stringify({ nav: { home: "Home" }, page: { title: "T" } }, null, 2) + "\n",
      "utf8",
    );

    await runGenerateWithConfig(
      dir,
      baseConfig({ resourceFormat: "flat", localeShape: "nested", locales: ["en", "fr"] }),
      false,
    );

    const frRaw = await readFile(path.join(dir, "locales", "fr.json"), "utf8");
    expect(JSON.parse(frRaw)).toEqual({
      nav: { home: "[fr]Home" },
      page: { title: "[fr]T" },
    });
  });
});

describe("runGenerateWithConfig (multi-namespace)", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("writes one target file per namespace", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-gen-multins-"));
    await mkdir(path.join(dir, "src"), { recursive: true });
    await mkdir(path.join(dir, "locales", "en"), { recursive: true });
    await writeFile(path.join(dir, "src", "i18n.ts"), nsI18nForGenerate, "utf8");
    await writeFile(
      path.join(dir, "locales", "en", "nav.json"),
      JSON.stringify({ link: "Nav link" }, null, 2) + "\n",
      "utf8",
    );
    await writeFile(
      path.join(dir, "locales", "en", "common.json"),
      JSON.stringify({ ok: "OK" }, null, 2) + "\n",
      "utf8",
    );

    await runGenerateWithConfig(
      dir,
      baseConfig({
        resourceFormat: "i18next-namespace",
        namespaces: ["nav", "common"],
        locales: ["en", "fr"],
      }),
      false,
    );

    const navFr = JSON.parse(await readFile(path.join(dir, "locales", "fr", "nav.json"), "utf8"));
    const commonFr = JSON.parse(await readFile(path.join(dir, "locales", "fr", "common.json"), "utf8"));
    expect(navFr).toEqual({ link: "[fr]Nav link" });
    expect(commonFr).toEqual({ ok: "[fr]OK" });
  });

  it("logs when locales has only the default language (nothing to translate)", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-gen-solo-"));
    await runGenerateWithConfig(dir, baseConfig({ locales: ["en"] }), false);
    expect(log.mock.calls.map((c) => c.join(" ")).join("\n")).toContain("nothing to do");
    log.mockRestore();
  });

  it("rejects --locale not in config with a helpful message", async () => {
    await expect(
      runGenerateWithConfig(
        "/",
        baseConfig({ locales: ["en"], i18n: "src/i18n.ts" }),
        false,
        { onlyLocales: ["ar"] },
      ),
    ).rejects.toThrow(/unknown code\(s\): ar[\s\S]*src\/i18n\.ts[\s\S]*supportedLngs/);
  });
});
