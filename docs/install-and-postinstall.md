# Install and `init`

## Install

```bash
npm install ai-i18n --save-dev
```

**`npm install` only adds the dependency** — it does **not** write `ai-i18n.config.json`, locale JSON, or `translator-notes.json`. There is **no** postinstall hook.

For cloud translation, install the SDK you use (optional peers):

```bash
npm install openai
# and/or
npm install @anthropic-ai/sdk
```

For the optional **`ai-i18n/i18next`** helper types at build time, install **`i18next`** in your app (you likely already have it with **react-i18next**).

## Required: `npx ai-i18n init`

From your **app root** (next to `package.json`), run:

```bash
npx ai-i18n init
```

This **discovers** your project and writes **`ai-i18n.config.json`** by merging the package template with inferred fields:

| Topic | Behavior |
|--------|-----------|
| **`i18n`** | Scans `src/`, `app/`, and `lib/` for a file containing an i18next-style **`*.init({...})`** with `lng`, `supportedLngs`, `fallbackLng`, or `resources` (string literals). Prefers basenames such as **`i18n.ts`**. Use **`--i18n <path>`** if the wrong file is chosen. |
| **`localesDir`** | Probes existing default-locale paths in order: `locales/{lng}.json`, `src/locales/{lng}.json`, `public/locales/{lng}.json`, then `{lng}/{namespace}.json` under those bases, then any **`{lng}/*.json`** directory. First hit wins. If nothing exists, defaults to **`locales`**, or **`src/locales`** when `src/` exists and root **`locales/`** does not. |
| **`resourceFormat` / `namespace` / `namespaces`** | Confirmed from disk when possible; otherwise follows static extraction from the `i18n` module (same rules as `loadConfig`). |
| **`sourceGlobs`** | Always includes `src/**/*.{tsx,ts,jsx,js}`; adds `app/**/*.{tsx,ts,jsx,js}` when any `.tsx`/`.ts` exists under **`app/`**. |
| **`localeShape`** | After the default locale file is found, set to **`nested`** when the JSON uses nested objects with string leaves; otherwise **`flat`** (omitted from JSON when flat). |

**Flags:** **`--force`** replaces an existing `ai-i18n.config.json`. **`--silent`** reduces console output (next-steps hints are skipped). **`--i18n path/to/file.ts`** pins the i18n module.

**Scaffolding:** if **no** default-locale catalog file was found during discovery, `init` creates empty default locale JSON (layout matches `resourceFormat`) and **`{localesDir}/translator-notes.json`** as `{}`. If **`src/{localesDir}`** already exists as a directory while **`localesDir`** is a single segment (e.g. `locales`), nothing is written under the project-root **`{localesDir}`** (avoids duplicate trees).

After a successful init (unless **`--silent`**), the CLI prints a short reminder: provider choice, API keys / `.env`, **`npx ai-i18n diff`** and **`npx ai-i18n generate`**, and that **i18next** is not installed by this package.

## Refreshing config

```bash
npx ai-i18n init --force
```

See [workflows.md](./workflows.md) for **CI** (`diff` exit code **`1`** on drift). API keys: [environment.md](./environment.md).
