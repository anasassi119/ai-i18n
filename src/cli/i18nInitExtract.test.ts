import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractI18nInitFromFile } from "./i18nInitExtract.js";

async function writeTempTs(name: string, body: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), name));
  const p = path.join(dir, "i18n.ts");
  await writeFile(p, body, "utf8");
  return p;
}

describe("extractI18nInitFromFile", () => {
  it("derives locales from supportedLngs and defaultLocale from lng", async () => {
    const p = await writeTempTs(
      "ai-i18n-ex1-",
      `
const i18n = { init(o: Record<string, unknown>) {} };
i18n.init({
  lng: "en",
  supportedLngs: ["en", "fr", "de"],
  resources: {},
});
`,
    );
    try {
      const r = await extractI18nInitFromFile(p);
      expect(r.defaultLocale).toBe("en");
      expect(r.locales).toEqual(["en", "fr", "de"]);
      expect(r.resourceFormat).toBe("flat");
    } finally {
      await rm(path.dirname(p), { recursive: true, force: true });
    }
  });

  it("derives locales from resources keys", async () => {
    const p = await writeTempTs(
      "ai-i18n-ex2-",
      `
void ({ init(x: unknown) {} }).init({
  lng: "ja",
  resources: { ja: {}, en: {} },
});
`,
    );
    try {
      const r = await extractI18nInitFromFile(p);
      expect(r.defaultLocale).toBe("ja");
      expect(r.locales).toEqual(["ja", "en"]);
    } finally {
      await rm(path.dirname(p), { recursive: true, force: true });
    }
  });

  it("detects i18next-namespace from nested resources", async () => {
    const p = await writeTempTs(
      "ai-i18n-ex3-",
      `
i18next.init({
  lng: "en",
  supportedLngs: ["en", "fr"],
  defaultNS: "translation",
  resources: {
    en: { translation: { welcome: "Hi" } },
    fr: { translation: { welcome: "Salut" } },
  },
});
`,
    );
    try {
      const r = await extractI18nInitFromFile(p);
      expect(r.resourceFormat).toBe("i18next-namespace");
      expect(r.namespace).toBe("translation");
    } finally {
      await rm(path.dirname(p), { recursive: true, force: true });
    }
  });

  it("detects flat resources shape", async () => {
    const p = await writeTempTs(
      "ai-i18n-ex4-",
      `
i18next.init({
  lng: "en",
  supportedLngs: ["en", "fr"],
  resources: {
    en: { welcome: "Hi" },
    fr: { welcome: "Salut" },
  },
});
`,
    );
    try {
      const r = await extractI18nInitFromFile(p);
      expect(r.resourceFormat).toBe("flat");
    } finally {
      await rm(path.dirname(p), { recursive: true, force: true });
    }
  });

  it("throws when nothing derivable", async () => {
    const p = await writeTempTs(
      "ai-i18n-ex5-",
      `
const langs = ["en", "fr"];
i18next.init({
  lng: "en",
  supportedLngs: langs,
});
`,
    );
    try {
      await expect(extractI18nInitFromFile(p)).rejects.toThrow(/could not derive locales/);
    } finally {
      await rm(path.dirname(p), { recursive: true, force: true });
    }
  });
});
