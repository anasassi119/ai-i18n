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
    defaultLocale: "en",
    locales: ["fr"],
    catalogDir: "locales",
    cacheDir: ".ai-i18n",
    provider: "openai",
    ...overrides,
  };
}

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
      `declare function t(key: string, opts?: Record<string, unknown>): string;\nexport function X() { return <span>{t("welcome", { hint: "h" })}</span>; }\n`,
      "utf8",
    );
    await writeFile(
      path.join(dir, "locales", "en", "translation.json"),
      JSON.stringify({ welcome: "Hello" }, null, 2) + "\n",
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
});
