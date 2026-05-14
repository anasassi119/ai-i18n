import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runDiff } from "./diff.js";

const flatI18n = `
const i18next = { init(_o: Record<string, unknown>) {} };
i18next.init({ lng: "en", supportedLngs: ["en", "fr"], resources: {} });
`;

const nsI18n = `
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

async function writeLayout(
  dir: string,
  opts: {
    appKey: string;
    enKeys: Record<string, string>;
    frKeys?: Record<string, string>;
  },
) {
  await mkdir(path.join(dir, "src"), { recursive: true });
  await mkdir(path.join(dir, "locales"), { recursive: true });
  await writeFile(path.join(dir, "src", "i18n.ts"), flatI18n, "utf8");
  await writeFile(
    path.join(dir, "ai-i18n.config.json"),
    JSON.stringify({
      sourceGlobs: ["src/**/*.tsx"],
      localesDir: "locales",
      i18n: "src/i18n.ts",
      provider: "openai",
    }),
    "utf8",
  );
  await writeFile(
    path.join(dir, "src", "App.tsx"),
    `declare function t(key: string, opts?: Record<string, unknown>): string;\nexport function X() { return <span>{t("${opts.appKey}")}</span>; }\n`,
    "utf8",
  );
  await writeFile(path.join(dir, "locales", "en.json"), JSON.stringify(opts.enKeys, null, 2) + "\n", "utf8");
  if (opts.frKeys !== undefined) {
    await writeFile(path.join(dir, "locales", "fr.json"), JSON.stringify(opts.frKeys, null, 2) + "\n", "utf8");
  }
}

async function writeLayoutI18nextNamespace(
  dir: string,
  opts: {
    appKey: string;
    enKeys: Record<string, string>;
    frKeys?: Record<string, string>;
  },
) {
  await mkdir(path.join(dir, "src"), { recursive: true });
  await mkdir(path.join(dir, "locales", "en"), { recursive: true });
  await writeFile(path.join(dir, "src", "i18n.ts"), nsI18n, "utf8");
  await writeFile(
    path.join(dir, "ai-i18n.config.json"),
    JSON.stringify({
      sourceGlobs: ["src/**/*.tsx"],
      localesDir: "locales",
      i18n: "src/i18n.ts",
      provider: "openai",
    }),
    "utf8",
  );
  await writeFile(
    path.join(dir, "src", "App.tsx"),
    `declare function t(key: string, opts?: Record<string, unknown>): string;\nexport function X() { return <span>{t("${opts.appKey}")}</span>; }\n`,
    "utf8",
  );
  await writeFile(
    path.join(dir, "locales", "en", "translation.json"),
    JSON.stringify(opts.enKeys, null, 2) + "\n",
    "utf8",
  );
  if (opts.frKeys !== undefined) {
    await mkdir(path.join(dir, "locales", "fr"), { recursive: true });
    await writeFile(
      path.join(dir, "locales", "fr", "translation.json"),
      JSON.stringify(opts.frKeys, null, 2) + "\n",
      "utf8",
    );
  }
}

describe("runDiff", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("returns ok when code, default, and targets align", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-diff-"));
    await writeLayout(dir, {
      appKey: "welcome",
      enKeys: { welcome: "Hello" },
      frKeys: { welcome: "Bonjour" },
    });
    const { ok } = await runDiff(dir);
    expect(ok).toBe(true);
  });

  it("returns not ok when code references a key missing from default catalog", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-diff-"));
    await writeLayout(dir, {
      appKey: "missingInJson",
      enKeys: { welcome: "Hello" },
      frKeys: { welcome: "Bonjour" },
    });
    const { ok } = await runDiff(dir);
    expect(ok).toBe(false);
  });

  it("returns not ok when target locale is missing a key", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-diff-"));
    await writeLayout(dir, {
      appKey: "welcome",
      enKeys: { welcome: "Hello" },
      frKeys: {},
    });
    const { ok } = await runDiff(dir);
    expect(ok).toBe(false);
  });

  it("returns ok for i18next-namespace layout when aligned", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-diff-ns-"));
    await writeLayoutI18nextNamespace(dir, {
      appKey: "welcome",
      enKeys: { welcome: "Hello" },
      frKeys: { welcome: "Bonjour" },
    });
    const { ok } = await runDiff(dir);
    expect(ok).toBe(true);
  });

  it("--add-missing-default appends missing keys with empty values and preserves existing key order", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-diff-add-"));
    await mkdir(path.join(dir, "src"), { recursive: true });
    await mkdir(path.join(dir, "locales"), { recursive: true });
    await writeFile(path.join(dir, "src", "i18n.ts"), flatI18n, "utf8");
    await writeFile(
      path.join(dir, "ai-i18n.config.json"),
      JSON.stringify({
        sourceGlobs: ["src/**/*.tsx"],
        localesDir: "locales",
        i18n: "src/i18n.ts",
        provider: "openai",
      }),
      "utf8",
    );
    await writeFile(
      path.join(dir, "src", "App.tsx"),
      `declare function t(key: string, opts?: Record<string, unknown>): string;\nexport function X() { return <span>{t("z")}{t("a")}{t("b")}</span>; }\n`,
      "utf8",
    );
    await writeFile(
      path.join(dir, "locales", "en.json"),
      JSON.stringify({ z: "Z", a: "A" }, null, 2) + "\n",
      "utf8",
    );
    await writeFile(path.join(dir, "locales", "fr.json"), JSON.stringify({ z: "z", a: "a" }, null, 2) + "\n", "utf8");

    const { ok } = await runDiff(dir, { addMissingToDefault: true });
    expect(ok).toBe(false);

    const enRaw = await readFile(path.join(dir, "locales", "en.json"), "utf8");
    expect(Object.keys(JSON.parse(enRaw) as Record<string, string>)).toEqual(["z", "a", "b"]);
    expect((JSON.parse(enRaw) as Record<string, string>).b).toBe("");
  });

  it("without --add-missing-default does not write default catalog", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "ai-i18n-diff-noadd-"));
    await writeLayout(dir, {
      appKey: "onlyInCode",
      enKeys: { welcome: "Hello" },
      frKeys: { welcome: "Bonjour" },
    });
    const before = await readFile(path.join(dir, "locales", "en.json"), "utf8");
    await runDiff(dir);
    const after = await readFile(path.join(dir, "locales", "en.json"), "utf8");
    expect(after).toBe(before);
  });
});
