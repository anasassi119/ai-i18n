# i18next integration

**ai-i18n** fills **JSON locale files** on disk. **i18next** (and usually **react-i18next**) loads them at runtime. **`npm install ai-i18n` does not install i18next** — run `npm install i18next react-i18next` (and **`openai`** or **`@anthropic-ai/sdk`** per your `provider`) in your application.

**Contract:** on-disk layout (`resourceFormat`, default flat), **`translator-notes.json`**, and plural rules: [resource-contract.md](./resource-contract.md). **CI / `missingKey`:** [workflows.md](./workflows.md).

## 1. Generate catalogs

```bash
npx ai-i18n init
npx ai-i18n generate
```

You get flat key → string maps per locale file, plus an optional **`translator-notes.json`** in the same folder for the CLI only (see [resource-contract.md](./resource-contract.md)).

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

### Option C — namespace files on disk (`i18next-namespace`)

If each locale uses **`{catalogDir}/{lng}/{namespace}.json`** (see config `resourceFormat`), load the JSON in Node or the bundler and merge into `resources`:

```ts
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { namespaceCatalogFilesToResources } from "ai-i18n/i18next";
import en from "./locales/en/translation.json";
import fr from "./locales/fr/translation.json";

void i18next.use(initReactI18next).init({
  resources: namespaceCatalogFilesToResources([
    { lng: "en", namespace: "translation", catalog: en },
    { lng: "fr", namespace: "translation", catalog: fr },
  ]),
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

Runtime **`t()`** uses only standard i18next options; translator context belongs in **`translator-notes.json`**, not in extra props on `t()`. See [resource-contract.md](./resource-contract.md).

## Versions

Tested in this repo’s devDependencies with **i18next `^24`**; use **i18next `>=23`** in your app unless you know otherwise. **react-i18next** follows your app’s existing pairing with i18next.

## Next steps

- Pluralization and structured messages: see [resource-contract.md](./resource-contract.md) (the CLI outputs **flat strings** per key; advanced shapes are i18next-side).
- [workflows.md](./workflows.md) — CI with `diff`, `missingKey` dev handler pattern.
