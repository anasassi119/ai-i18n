# i18next integration

**ai-i18n** fills **JSON locale files** on disk. **i18next** (and usually **react-i18next**) loads them at runtime. **`npm install ai-i18n` does not install i18next** — run `npm install i18next react-i18next` (and **`openai`** or **`@anthropic-ai/sdk`** per your `provider`) in your application.

**Contract:** flat `catalogDir/{locale}.json` and plural/hint rules are documented in [resource-contract.md](./resource-contract.md). **CI / `missingKey`:** [workflows.md](./workflows.md).

## 1. Generate catalogs

```bash
npx ai-i18n init
npx ai-i18n generate
```

You get flat key → string maps per file, e.g. `locales/en.json`, `locales/fr.json`, compatible with a single default namespace in i18next.

## 2. Load into i18next

### Option A — `import` / Vite glob

```ts
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

void i18next.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: true },
});
```

### Option B — helper from this package

If you already have locale objects in memory (e.g. from `import.meta.glob`):

```ts
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { catalogsToI18nextResources } from "ai-i18n/i18next";

const en = (await import("./locales/en.json")).default;
const fr = (await import("./locales/fr.json")).default;

void i18next.use(initReactI18next).init({
  resources: catalogsToI18nextResources({ en, fr }, "translation"),
  lng: "en",
  fallbackLng: "en",
});
```

## 3. React

```tsx
import { useTranslation } from "react-i18next";

export function Welcome() {
  const { t } = useTranslation();
  return <p>{t("welcome", { name: "Ada" })}</p>;
}
```

Use **`hint` only for the CLI** (string literal in source). It is not an i18next option; do not pass `hint` to `t()` at runtime unless you strip it yourself.

## Versions

Tested in this repo’s devDependencies with **i18next `^24`**; use **i18next `>=23`** in your app unless you know otherwise. **react-i18next** follows your app’s existing pairing with i18next.

## Next steps

- Pluralization and structured messages: see [resource-contract.md](./resource-contract.md) (today the CLI outputs **flat strings**; advanced shapes are i18next-side until [Phase 2](../ROADMAP.md#phase-2--cli-alignment-with-i18next-layouts)).
- [workflows.md](./workflows.md) — CI with `diff`, `missingKey` dev handler pattern.
