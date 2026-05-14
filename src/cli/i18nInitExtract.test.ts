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

  it("throws when nothing derivable (supportedLngs not a static array binding)", async () => {
    const p = await writeTempTs(
      "ai-i18n-ex5-",
      `
const langs = JSON.parse('["en","fr"]') as string[];
i18next.init({
  lng: "en",
  supportedLngs: langs,
  resources: {},
});
`,
    );
    try {
      await expect(extractI18nInitFromFile(p)).rejects.toThrow(/could not derive locales/);
    } finally {
      await rm(path.dirname(p), { recursive: true, force: true });
    }
  });

  it("resolves init options from a const object variable", async () => {
    const p = await writeTempTs(
      "ai-i18n-ex-opts-var-",
      `
const initOptions = {
  lng: "de",
  supportedLngs: ["de", "at"],
  resources: {},
};
i18next.init(initOptions);
`,
    );
    try {
      const r = await extractI18nInitFromFile(p);
      expect(r.defaultLocale).toBe("de");
      expect(r.locales).toEqual(["de", "at"]);
    } finally {
      await rm(path.dirname(p), { recursive: true, force: true });
    }
  });

  it("resolves resources from a separate const and infers namespace layout", async () => {
    const p = await writeTempTs(
      "ai-i18n-ex-res-var-",
      `
const catalog = {
  en: { translation: { a: "1" } },
  fr: { translation: { a: "2" } },
};
i18next.init({
  lng: "en",
  fallbackLng: "en" as const,
  resources: catalog,
});
`,
    );
    try {
      const r = await extractI18nInitFromFile(p);
      expect(r.defaultLocale).toBe("en");
      expect(new Set(r.locales)).toEqual(new Set(["en", "fr"]));
      expect(r.resourceFormat).toBe("i18next-namespace");
    } finally {
      await rm(path.dirname(p), { recursive: true, force: true });
    }
  });

  it("resolves supportedLngs from a const array and lng from a template literal", async () => {
    const p = await writeTempTs(
      "ai-i18n-ex-langs-tpl-",
      `
const SUPPORTED = ["en", "es", "pt"] as const;
i18next.init({
  lng: \`en\`,
  supportedLngs: SUPPORTED,
  resources: {},
});
`,
    );
    try {
      const r = await extractI18nInitFromFile(p);
      expect(r.defaultLocale).toBe("en");
      expect(r.locales).toEqual(["en", "es", "pt"]);
    } finally {
      await rm(path.dirname(p), { recursive: true, force: true });
    }
  });

  it("accepts optional chaining i18next?.init", async () => {
    const p = await writeTempTs(
      "ai-i18n-ex-opt-init-",
      `
i18next?.init({
  resources: { en: {}, ar: {} },
  fallbackLng: "en",
});
`,
    );
    try {
      const r = await extractI18nInitFromFile(p);
      expect(r.defaultLocale).toBe("en");
      expect(new Set(r.locales)).toEqual(new Set(["en", "ar"]));
    } finally {
      await rm(path.dirname(p), { recursive: true, force: true });
    }
  });

  it("accepts createInstance().init with inline options", async () => {
    const p = await writeTempTs(
      "ai-i18n-ex-create-inst-",
      `
i18next.createInstance().init({
  lng: "it",
  supportedLngs: ["it", "sm"],
  resources: {},
});
`,
    );
    try {
      const r = await extractI18nInitFromFile(p);
      expect(r.defaultLocale).toBe("it");
      expect(r.locales).toEqual(["it", "sm"]);
    } finally {
      await rm(path.dirname(p), { recursive: true, force: true });
    }
  });

  it("accepts chained .use().init({ ... } as object) and derives locales from resources + fallbackLng", async () => {
    const p = await writeTempTs(
      "ai-i18n-ex-chain-as-",
      `
import en from './en.json'
import ar from './ar.json'
import he from './he.json'
import i18next from 'i18next'
void i18next
  .use(x)
  .use(y)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
      he: { translation: he },
    },
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  } as object)
`,
    );
    try {
      const r = await extractI18nInitFromFile(p);
      expect(r.defaultLocale).toBe("en");
      expect(new Set(r.locales)).toEqual(new Set(["en", "ar", "he"]));
      expect(r.resourceFormat).toBe("i18next-namespace");
    } finally {
      await rm(path.dirname(p), { recursive: true, force: true });
    }
  });
});
