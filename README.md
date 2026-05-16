<p align="center">
  <img src="https://raw.githubusercontent.com/anasassi119/ai-i18n/master/docs/banner.svg" alt="ai-i18n — AI-assisted translation for i18next" width="640" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/ai-i18n"><img src="https://img.shields.io/npm/v/ai-i18n.svg" alt="npm version" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License MIT" /></a>
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
npx ai-i18n init
npm install i18next react-i18next react
# Pick one provider SDK to match ai-i18n.config.json:
npm install openai
# or
npm install @anthropic-ai/sdk
```

**`npm install ai-i18n` does not create or modify project files.** Run **`npx ai-i18n init`** once from the project root so the CLI can discover your i18next init module and locale layout, write **`ai-i18n.config.json`**, and optionally scaffold an empty default catalog plus **`translator-notes.json`** when those files are missing. From a **TTY**, `init` runs **interactively** by default (absolute paths for locales + optional i18n; blank i18n omits `"i18n"` from config). Use **`--no-input`** for non-interactive discovery in a terminal (e.g. CI). Flags: **`--force`**, **`--silent`**, **`--i18n <path>`**. Details: [docs/install-and-postinstall.md](./docs/install-and-postinstall.md).

---

## Minimal example (end-to-end)

### 1. Source code the CLI can scan

Callee must be named **`t`**, first argument a **string literal** key. Use normal i18next options in the second argument (e.g. `{{name}}` interpolation); the CLI does not read custom fields there.

```tsx
// src/App.tsx
declare function t(key: string, opts?: Record<string, unknown>): string;

export function Greeting() {
  return <p>{t("welcome", { name: "Anas Assi" })}</p>;
}
```

At runtime you use **`react-i18next`** `t` — the **scanner** only needs the string literal key.

### 1b. Optional translator notes (not in `t()`)

Edit **`locales/translator-notes.json`** (or **`{localesDir}/translator-notes.json`**) — a flat map of message key → note for the model. **`init`** may create `{}` together with a missing default catalog; **`generate`** uses it when present. See [docs/resource-contract.md](./docs/resource-contract.md).

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
  "provider": "openai",
  "model": "gpt-5-mini"
}
```

The CLI **parses `i18n`** (static analysis) when set to derive **`defaultLocale`**, **`locales`**, and usually **`resourceFormat`** / **`namespace`**. You maintain that module yourself (or point `"i18n"` at wherever you already call `i18next.init`). Omit **`i18n`** entirely if you only want catalog-driven config: then **`defaultLocale`**, **`locales`**, and layout fields must be explicit in JSON. You can override any derived fields in JSON when needed — see [docs/configuration.md](./docs/configuration.md).

If **`generate`** / **`diff`** look for **`locales/en/translation.json`** but you only have **`locales/en.json`** (for example after **`init`**), your `i18n` file’s nested `resources` made the CLI infer the wrong on-disk layout — add **`"resourceFormat": "flat"`** to `ai-i18n.config.json`. Details: [docs/configuration.md](./docs/configuration.md#troubleshooting-namespace-path-vs-flat-json-files).

Optional: set `"resourceFormat": "i18next-namespace"` (and `"namespace"` if not `translation`) when inference does not match your layout — see [docs/resource-contract.md](./docs/resource-contract.md).

#### `ai-i18n.config.json` — every key and allowed values

| Key | JSON type | Possible values | Notes |
|-----|-----------|-----------------|-------|
| `sourceGlobs` | `string[]` | <code>*</code> | Required. Glob pattern per array element. |
| `localesDir` | `string` | <code>*</code> | Required. Project-relative locale directory (+ `translator-notes.json`). |
| `i18n` | <code>string</code> or omit | <code>omit &#124; *</code> | Optional. Init path; omit = catalog-only (set `defaultLocale`, `locales`, layout). |
| `defaultLocale` | `string` | <code>*</code> | Required if no `i18n`. Else overrides inferred default. |
| `locales` | `string[]` | <code>*</code> | Required if no `i18n`. Else optional; CLI prepends `defaultLocale` if missing. |
| `resourceFormat` | `string` | <code>flat &#124; i18next-namespace</code> | Pin `flat` when files are per-locale `*.json` but init AST looks namespace-style. |
| `namespace` | `string` | <code>translation &#124; *</code> | Namespace layout only; basename without `.json`. Omit if `flat` or if `namespaces` set. |
| `namespaces` | `string[]` | <code>*</code> | Namespace layout only; e.g. `["nav","common"]`. Omit if `flat`. |
| `localeShape` | `string` | <code>flat &#124; nested</code> | Key structure inside each locale JSON file. |
| `localesAutoDiscover` | `boolean` | <code>true &#124; false</code> | Only `true` rescans `localesDir` into `locales`. |
| `provider` | `string` | <code>openai &#124; anthropic</code> | Default `openai`. |
| `model` | `string` | <code>*</code> | Optional model id (e.g. `gpt-5-mini`). |
| `batchSize` | `number` | integer **1–100**, default **40** | Keys per API request in **`generate`**; lower = more calls, higher = fewer calls (watch prompt size). |

<code>*</code> = any non-empty string (or non-empty `string[]`) the field allows.

**Large catalogs:** optional **`batchSize`** controls how many keys each `generate` API call translates (default **40**). Use a smaller value if responses truncate or JSON parsing fails; use a larger value (e.g. 50–80) for many short labels to reduce total API calls.

**Translation cache (not in config):** `node_modules/.cache/ai-i18n/.ai-i18n-cache.json` (gitignored via `node_modules`).

**Rejected / errors:** Removed v5 keys (`catalogDir`, `catalogShape`, `cacheDir`). Unknown `provider`. `namespace` / `namespaces` with `flat`. Invalid `resourceFormat` / `localeShape`.

Full narrative: [docs/configuration.md](./docs/configuration.md).

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
  return <p>{t("welcome", { name: "Anas Assi" })}</p>;
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
npx ai-i18n init              # TTY: interactive wizard; else auto-discovery (beta)
npx ai-i18n init --no-input   # non-interactive discovery (use in CI from a terminal)
npx ai-i18n init --force      # replace config from template
npx ai-i18n generate          # translate / fill target locale files
npx ai-i18n generate --force  # re-translate all keys for every target locale
npx ai-i18n generate --locale de          # only update locale `de` (missing/outdated)
npx ai-i18n generate --force --locale de # re-translate only `de` (ignores per-key cache for that locale)
npx ai-i18n diff              # report drift; exits 1 if anything is wrong (for CI)
npx ai-i18n diff --add-missing-default  # append code-only keys to default catalog (empty strings), then re-check
```

**`diff` exit codes:** `0` = clean, `1` = keys missing in default, stale JSON, missing/empty targets, or stale keys in targets. Example CI: [docs/workflows.md](./docs/workflows.md). For local fixing only, **`diff --add-missing-default`** writes missing default keys (see [docs/cli-reference.md](./docs/cli-reference.md)); do **not** use that flag in CI unless you intend to mutate the repo.

---

## Features (summary)

- **Scan** — `t('literalKey', …)` string keys only; optional **`translator-notes.json`** for `generate`; **`i18n`** module for locale list inference.
- **Generate / diff** — merge from default locale, prune removed keys; hash cache under `node_modules/.cache/ai-i18n`.
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
| [docs/install-and-postinstall.md](./docs/install-and-postinstall.md) | Install, `init`, discovery |
| [ROADMAP.md](./ROADMAP.md) | Phases, acceptance status |

---

## Limitations

- Scanner: **`t('stringLiteral', …)`** only — no dynamic or template-literal keys.
- **Output layout:** default **`resourceFormat: flat`** (`{locale}.json`); optional **`i18next-namespace`**. Logical catalogs are string maps; on-disk JSON may use **`localeShape: nested`** (dot-path keys) — see [docs/resource-contract.md](./docs/resource-contract.md). Plural/ICU shapes beyond that are **i18next-side**.

---

## FAQs

**Does the CLI require i18next in the same repo?**  
No. **`ai-i18n`** only reads your source and JSON catalogs and calls your chosen provider. Your **application** should depend on **i18next** to load the JSON at runtime.

**Why is a key missing from `generate` / `diff`?**  
The scanner only sees **`t('stringLiteral', …)`** — the callee must be named **`t`**, and the first argument must be a **string literal**. Dynamic keys, variables, or template literals are ignored. Add the key and source string to the **default locale** catalog file, then run **`generate`**.

**What is `translator-notes.json` for?**  
Optional **`{localesDir}/translator-notes.json`** maps message keys to short notes for the translation model. It is **not** loaded by i18next; your runtime **`t()`** stays standard. See [resource-contract.md](./docs/resource-contract.md).

**What is the difference between `flat` and `i18next-namespace`?**  
**`flat`** (default): one file per locale, e.g. `locales/en.json`. **`i18next-namespace`**: one namespace file per locale, e.g. `locales/en/translation.json`. The JSON inside is still a flat `key → string` map. Configure in [`ai-i18n.config.json`](./docs/configuration.md); **`diff`** and **`generate`** use the same paths.

**Can the CLI scan multiple namespace files per locale?**  
Yes. Set **`resourceFormat": "i18next-namespace"`** and **`namespaces`** (array of JSON basenames per locale). Logical keys use the **`namespace:key`** form when more than one namespace file is configured. See [configuration.md](./docs/configuration.md) and [resource-contract.md](./docs/resource-contract.md).

**What do I do after I `npm install ai-i18n`?**  
Run **`npx ai-i18n init`** after installing. See [docs/install-and-postinstall.md](./docs/install-and-postinstall.md).

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

## Upgrading from 4.x

Version **5** removes legacy config keys and moves the translation cache:

- Remove **`catalogDir`**, **`catalogShape`**, and **`cacheDir`** from **`ai-i18n.config.json`** (use **`localesDir`** / **`localeShape`** only).
- Delete project-root **`.ai-i18n/`**; cache is now **`node_modules/.cache/ai-i18n/.ai-i18n-cache.json`**.
- Scanner reads static **`defaultValue`** from `t()`; **`diff`** flags empty/mismatched default strings; **`diff --add-missing-default`** and **`generate --sync-default-from-code`** seed from code when present.

See [docs/configuration.md](./docs/configuration.md#migration-v4--v5).

## Upgrading from 3.x

Version **4** slims **`ai-i18n.config.json`**: rename **`catalogDir`** → **`localesDir`**, add **`i18n`** (path to the module that calls **`i18next.init({...})`**-style options), and remove **`defaultLocale`** / **`locales`** from the file unless you want explicit overrides. The CLI derives those from string-literal **`lng`**, **`supportedLngs`**, **`fallbackLng`**, and **`resources`** in that file. **`init`** does **not** create that module — point **`i18n`** at your real file. See [docs/configuration.md](./docs/configuration.md).

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
