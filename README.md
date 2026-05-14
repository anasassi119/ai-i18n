<p align="center">
  <img src="https://raw.githubusercontent.com/anasassi119/ai-i18n/master/docs/banner.svg" alt="ai-i18n — AI-assisted translation for i18next" width="640" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/ai-i18n"><img src="https://img.shields.io/npm/v/ai-i18n.svg" alt="npm version" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License MIT" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/node/v/ai-i18n.svg" alt="Node version" /></a>
</p>

# ai-i18n

**CLI** that scans **`t('key', { hint: '…' })`** in your source, keeps **locale JSON** in sync with **[i18next](https://www.i18next.com/)**, and fills missing translations with **OpenAI** or **Anthropic**. Runtime is **always i18next** (plus **react-i18next** in React apps).

---

## Overview

| You use | For |
|---------|-----|
| **i18next** + **react-i18next** | `useTranslation()`, `t()`, plurals, namespaces, loading, `Trans` |
| **ai-i18n** | `init` / `generate` / `diff`, scanning keys + **hints**, AI providers, `.env` for API keys |
| **`ai-i18n/i18next`** (optional) | Turn flat `{ en: {…}, fr: {…} }` catalogs into `i18next.init({ resources })` |

---

## Install (what to run once)

`ai-i18n` **does not** install **i18next** or provider SDKs for you. In your app:

```bash
npm install ai-i18n --save-dev
npm install i18next react-i18next react
# Pick one provider SDK to match ai-i18n.config.json:
npm install openai
# or
npm install @anthropic-ai/sdk
```

After `npm install ai-i18n`, **postinstall** may create `ai-i18n.config.json` + empty `locales/en.json` and print a short setup reminder (unless `AI_I18N_SKIP_INIT=1`). Details: [docs/install-and-postinstall.md](./docs/install-and-postinstall.md).

---

## Minimal example (end-to-end)

### 1. Source code the CLI can scan

Callee must be named **`t`**, first argument a **string literal**. **`hint`** helps the translator; use a **string literal** so the CLI sees it.

```tsx
// src/App.tsx
declare function t(key: string, opts?: Record<string, unknown>): string;

export function Greeting() {
  return <p>{t("welcome", { name: "Ada", hint: "dashboard greeting above fold" })}</p>;
}
```

At runtime you use **`react-i18next`** `t` — the pattern above is what the **scanner** looks for.

### 2. Config at the project root

[`ai-i18n.config.json`](./docs/configuration.md) (often created by `npx ai-i18n init`):

```json
{
  "sourceGlobs": ["src/**/*.{tsx,ts,jsx,js}"],
  "defaultLocale": "en",
  "locales": ["fr"],
  "catalogDir": "locales",
  "cacheDir": ".ai-i18n",
  "provider": "openai",
  "model": "gpt-5-mini"
}
```

### 3. Default locale catalog (flat JSON)

`locales/en.json` — keys must cover every `t('…')` literal in scanned files:

```json
{
  "welcome": "Hello, {{name}}!"
}
```

### 4. API keys (OpenAI example)

Create **`.env`** next to `ai-i18n.config.json` (or export in the shell). The CLI loads `.env` before running; **environment variables override** `.env`.

```env
OPENAI_API_KEY=sk-proj-xxxxxxxx
```

Anthropic example: `ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxx`. More: [docs/environment.md](./docs/environment.md).

### 5. Generate target locales

```bash
npx ai-i18n generate
```

Writes / updates `locales/fr.json` (and any other `locales` in config) from `en.json` using your provider.

### 6. Load JSON into i18next (React)

```tsx
// main.tsx (excerpt)
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

```tsx
import { useTranslation } from "react-i18next";

export function Greeting() {
  const { t } = useTranslation();
  return <p>{t("welcome", { name: "Ada" })}</p>;
}
```

Do **not** pass **`hint`** to runtime `t()` unless you strip it — i18next ignores it; see [docs/resource-contract.md](./docs/resource-contract.md).

### 7. Optional helper: build `resources` from objects

```ts
import { catalogsToI18nextResources } from "ai-i18n/i18next";

const resources = catalogsToI18nextResources(
  {
    en: { welcome: "Hello, {{name}}!" },
    fr: { welcome: "Bonjour, {{name}} !" },
  },
  "translation",
);

void i18next.use(initReactI18next).init({ resources, lng: "en", fallbackLng: "en" });
```

---

## CLI commands

```bash
npx ai-i18n init              # create ai-i18n.config.json (+ empty default locale if missing)
npx ai-i18n init --force      # replace config from template
npx ai-i18n generate          # translate / fill target locale files
npx ai-i18n generate --force  # re-translate all keys from default catalog
npx ai-i18n diff              # report drift; exits 1 if anything is wrong (for CI)
```

**`diff` exit codes:** `0` = clean, `1` = keys missing in default, stale JSON, missing/empty targets, or stale keys in targets. Example CI: [docs/workflows.md](./docs/workflows.md).

---

## Features (summary)

- **Scan** — `t('literalKey', …)` + string-literal **`hint`**.
- **Generate / diff** — merge from default locale, prune removed keys, `.ai-i18n` cache.
- **Providers** — `openai` (default) or `anthropic`; default OpenAI model **`gpt-5-mini`**.
- **Postinstall** — optional scaffold + configure reminder.
- **`.env`** — loaded from project root before CLI runs.

---

## Documentation index

| Doc | Contents |
|-----|----------|
| [docs/i18next.md](./docs/i18next.md) | Wiring catalogs into i18next, `import.meta.glob` |
| [docs/resource-contract.md](./docs/resource-contract.md) | File layout, plurals / ICU stance, `hint` rules |
| [docs/configuration.md](./docs/configuration.md) | Every `ai-i18n.config.json` field |
| [docs/cli-reference.md](./docs/cli-reference.md) | Scanner rules, catalog sync |
| [docs/workflows.md](./docs/workflows.md) | CI with `diff`, `missingKey` dev recipe |
| [docs/environment.md](./docs/environment.md) | API keys, PowerShell |
| [docs/install-and-postinstall.md](./docs/install-and-postinstall.md) | Lifecycle, rebuild |
| [ROADMAP.md](./ROADMAP.md) | Phases, acceptance status, Phase 2 backlog |

---

## Limitations

- Scanner: **`t('stringLiteral', …)`** only — no dynamic or template-literal keys.
- **`hint`**: string literal in source for CLI; not an i18next option at runtime.
- **Output**: **flat** `key → string` JSON per locale file; plural/ICU/nested resource shapes are **i18next-side** until [Phase 2](./ROADMAP.md#phase-2--cli-alignment-with-i18next-layouts).

---

## Compatibility

| | |
|--|--|
| **Node** | **18+** |
| **i18next** | Install in your app (**≥23**; helper tested with **24.x** in dev) |
| **react-i18next** | Match your i18next major |

---

## License

[MIT](./LICENSE)

---

## Version

[![npm](https://img.shields.io/npm/v/ai-i18n.svg)](https://www.npmjs.com/package/ai-i18n) — repo `version` field: [package.json](./package.json).

---

## Roadmap

[ROADMAP.md](./ROADMAP.md) — Phase **1** and **3** acceptance **met**; Phase **2** (alternate `resourceFormat` / namespaces) is the next milestone.

## Publish checklist (maintainers)

1. `npm run build`
2. `npm run typecheck` && `npm test`
3. `npm pack --dry-run`
