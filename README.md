<p align="center">
  <img src="https://raw.githubusercontent.com/anasassi119/ai-i18n/master/docs/banner.svg" alt="ai-i18n — AI-assisted translation for i18next" width="640" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/ai-i18n"><img src="https://img.shields.io/npm/v/ai-i18n.svg" alt="npm version" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License MIT" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/node/v/ai-i18n.svg" alt="Node version" /></a>
</p>

# ai-i18n

**CLI** that scans **`t('key')`** calls in your source, keeps **locale JSON** in sync with **[i18next](https://www.i18next.com/)**, and fills missing translations with **OpenAI** or **Anthropic**. Optional **`locales/translator-notes.json`** gives translators extra context without changing runtime `t()`. Runtime is **always i18next** (plus **react-i18next** in React apps).

---

## Overview

| You use | For |
|---------|-----|
| **i18next** + **react-i18next** | `useTranslation()`, `t()`, plurals, namespaces, loading, `Trans` |
| **ai-i18n** | `init` / `generate` / `diff`, scanning keys, optional **`translator-notes.json`**, AI providers, `.env` for API keys |
| **`ai-i18n/i18next`** (optional) | `catalogsToI18nextResources` / `namespaceCatalogFilesToResources` → `i18next.init({ resources })` |

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

After `npm install ai-i18n`, **postinstall** may create `ai-i18n.config.json`, an **empty default locale catalog** under **`localesDir`** (default `locales/en.json` on first install), **`{localesDir}/translator-notes.json`** as `{}`, and print a short setup reminder (unless `AI_I18N_SKIP_INIT=1`). It does **not** create your **`i18n`** module — set `"i18n"` to the path of your existing i18next init file. Details: [docs/install-and-postinstall.md](./docs/install-and-postinstall.md).

---

## Minimal example (end-to-end)

### 1. Source code the CLI can scan

Callee must be named **`t`**, first argument a **string literal** key. Use normal i18next options in the second argument (e.g. `{{name}}` interpolation); the CLI does not read custom fields there.

```tsx
// src/App.tsx
declare function t(key: string, opts?: Record<string, unknown>): string;

export function Greeting() {
  return <p>{t("welcome", { name: "Ada" })}</p>;
}
```

At runtime you use **`react-i18next`** `t` — the **scanner** only needs the string literal key.

### 1b. Optional translator notes (not in `t()`)

Edit **`locales/translator-notes.json`** (or **`{localesDir}/translator-notes.json`**) — a flat map of message key → note for the model. **`init` / `generate`** create `{}` when the file is missing. See [docs/resource-contract.md](./docs/resource-contract.md).

```json
{
  "welcome": "Dashboard greeting, above the fold"
}
```

### 2. Config at the project root

[`ai-i18n.config.json`](./docs/configuration.md) (often created by `npx ai-i18n init`):

```json
{
  "sourceGlobs": ["src/**/*.{tsx,ts,jsx,js}"],
  "localesDir": "locales",
  "i18n": "src/i18n.ts",
  "cacheDir": ".ai-i18n",
  "provider": "openai",
  "model": "gpt-5-mini"
}
```

The CLI **parses `i18n`** (static analysis) to derive **`defaultLocale`**, **`locales`**, and usually **`resourceFormat`** / **`namespace`**. You maintain that module yourself (or point `"i18n"` at wherever you already call `i18next.init`). You can override any derived fields in JSON when needed — see [docs/configuration.md](./docs/configuration.md).

If **`generate`** / **`diff`** look for **`locales/en/translation.json`** but you only have **`locales/en.json`** (e.g. after `init` / postinstall), your `i18n` file’s nested `resources` made the CLI infer the wrong on-disk layout — add **`"resourceFormat": "flat"`** to `ai-i18n.config.json`. Details: [docs/configuration.md](./docs/configuration.md#troubleshooting-namespace-path-vs-flat-json-files).

Optional: set `"resourceFormat": "i18next-namespace"` (and `"namespace"` if not `translation`) when inference does not match your layout — see [docs/resource-contract.md](./docs/resource-contract.md).

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

Writes / updates target locale files from the default catalog (paths depend on `resourceFormat`; default is `locales/fr.json`, etc.).

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
npx ai-i18n init              # create ai-i18n.config.json (+ default catalog and translator-notes if missing)
npx ai-i18n init --force      # replace config from template
npx ai-i18n generate          # translate / fill target locale files
npx ai-i18n generate --force  # re-translate all keys from default catalog
npx ai-i18n diff              # report drift; exits 1 if anything is wrong (for CI)
```

**`diff` exit codes:** `0` = clean, `1` = keys missing in default, stale JSON, missing/empty targets, or stale keys in targets. Example CI: [docs/workflows.md](./docs/workflows.md).

---

## Features (summary)

- **Scan** — `t('literalKey', …)` string keys only; optional **`translator-notes.json`** for `generate`; **`i18n`** module for locale list inference.
- **Generate / diff** — merge from default locale, prune removed keys, `.ai-i18n` cache.
- **Providers** — `openai` (default) or `anthropic`; default OpenAI model **`gpt-5-mini`**.
- **Postinstall** — optional scaffold + configure reminder.
- **`.env`** — loaded from project root before CLI runs.

---

## Documentation index

| Doc | Contents |
|-----|----------|
| [docs/i18next.md](./docs/i18next.md) | Wiring catalogs into i18next, `import.meta.glob` |
| [docs/resource-contract.md](./docs/resource-contract.md) | File layout, `translator-notes.json`, plurals / ICU stance |
| [docs/configuration.md](./docs/configuration.md) | Slim `ai-i18n.config.json`, `i18n` path, optional overrides |
| [docs/cli-reference.md](./docs/cli-reference.md) | Scanner rules, catalog sync |
| [docs/workflows.md](./docs/workflows.md) | CI with `diff`, `missingKey` dev recipe |
| [docs/environment.md](./docs/environment.md) | API keys, PowerShell |
| [docs/install-and-postinstall.md](./docs/install-and-postinstall.md) | Lifecycle, rebuild |
| [ROADMAP.md](./ROADMAP.md) | Phases, acceptance status |

---

## Limitations

- Scanner: **`t('stringLiteral', …)`** only — no dynamic or template-literal keys.
- **Output layout:** default **`resourceFormat: flat`** (`{locale}.json`); optional **`i18next-namespace`**. Still **flat** `key → string` inside each catalog JSON file; plural/ICU/nested resource shapes beyond that are **i18next-side** — see [docs/resource-contract.md](./docs/resource-contract.md).

---

## FAQs

**Does the CLI require i18next in the same repo?**  
No. **`ai-i18n`** only reads your source and JSON catalogs and calls your chosen provider. Your **application** should depend on **i18next** (and usually **react-i18next**) to load the JSON at runtime.

**Why is a key missing from `generate` / `diff`?**  
The scanner only sees **`t('stringLiteral', …)`** — the callee must be named **`t`**, and the first argument must be a **string literal**. Dynamic keys, variables, or template literals are ignored. Add the key and source string to the **default locale** catalog file, then run **`generate`**.

**What is `translator-notes.json` for?**  
Optional **`{localesDir}/translator-notes.json`** maps message keys to short notes for the translation model. It is **not** loaded by i18next; your runtime **`t()`** stays standard. See [resource-contract.md](./docs/resource-contract.md).

**What is the difference between `flat` and `i18next-namespace`?**  
**`flat`** (default): one file per locale, e.g. `locales/en.json`. **`i18next-namespace`**: one namespace file per locale, e.g. `locales/en/translation.json`. The JSON inside is still a flat `key → string` map. Configure in [`ai-i18n.config.json`](./docs/configuration.md); **`diff`** and **`generate`** use the same paths.

**Can the CLI scan multiple namespace files per locale?**  
Not in the current release. Phase 2 v1 compares code keys to the **single** default-locale catalog path for your layout. Multiple on-disk namespaces and richer key syntax are [backlog](./ROADMAP.md).

**How do I skip postinstall creating config / locale files?**  
Set **`AI_I18N_SKIP_INIT=1`** in the environment when installing. Details: [docs/install-and-postinstall.md](./docs/install-and-postinstall.md).

**What should I run in CI?**  
Typically **`npx ai-i18n diff`** (non-zero exit on drift). It respects **`resourceFormat`**. See [docs/workflows.md](./docs/workflows.md).

**Which env vars hold API keys?**  
**OpenAI:** `OPENAI_API_KEY`. **Anthropic:** `ANTHROPIC_API_KEY`. The CLI loads **`.env`** from the project root; shell env wins over `.env`. See [docs/environment.md](./docs/environment.md).

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

## Upgrading from 3.x

Version **4** slims **`ai-i18n.config.json`**: rename **`catalogDir`** → **`localesDir`**, add **`i18n`** (path to the module that calls **`i18next.init({...})`**-style options), and remove **`defaultLocale`** / **`locales`** from the file unless you want explicit overrides. The CLI derives those from string-literal **`lng`**, **`supportedLngs`**, **`fallbackLng`**, and **`resources`** in that file. **`init`** / postinstall **do not** create that module — point **`i18n`** at your real file. See [docs/configuration.md](./docs/configuration.md).

---

## Upgrading from 2.x

Version **3** removes inline **`hint`** in source. Move any notes into **`{localesDir}/translator-notes.json`** as a string map keyed by message id (see [resource-contract.md](./docs/resource-contract.md)).

---

## Version

[![npm](https://img.shields.io/npm/v/ai-i18n.svg)](https://www.npmjs.com/package/ai-i18n) — repo `version` field: [package.json](./package.json).

---

## Roadmap

[ROADMAP.md](./ROADMAP.md) — Phase **1**, **2**, and **3** acceptance **met** for current scope; further scanner / format work remains in the roadmap backlog.

## Publish checklist (maintainers)

1. `npm run build`
2. `npm run typecheck` && `npm test`
3. `npm pack --dry-run`
