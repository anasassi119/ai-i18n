# ai-i18n

Standalone React **runtime** (`useTranslation`, `t`) plus a **CLI** that scans `t('messageKey', { hint: '…' })` calls, reads your **default-locale JSON**, and fills **target locale** files using **OpenAI** (default in the generated config), a **stub** translator, or **Anthropic** (your API keys).

No dependency on `i18next` or `react-i18next`.

## Install

```bash
npm install ai-i18n react
```

On **`npm install`**, if **`ai-i18n.config.json` is missing**, the postinstall script picks your app root by walking up from this package: it prefers a directory whose **`node_modules` entry for this package** resolves to the installed copy (so it still works on the **first** install, when npm has not yet written `ai-i18n` into your `package.json`), and otherwise falls back to a **`package.json` that lists `ai-i18n`** (including when the script’s cwd is inside `node_modules/ai-i18n` and `INIT_CWD` is missing). Set **`AI_I18N_SKIP_INIT=1`** to skip (e.g. CI). Set **`AI_I18N_DEBUG=1`** for a short log (resolved paths, skip reasons). Lifecycle scripts do not re-run on a no-op install — use **`npm rebuild ai-i18n`** or **`npx ai-i18n init`** if you need the default config again.

You can always scaffold or overwrite manually:

```bash
npx ai-i18n init
npx ai-i18n init --force
```

For cloud translation, also install the SDK you use (optional peer dependencies). The **postinstall / `init` default** config sets `"provider": "openai"`, so install **`openai`** unless you change the provider to `stub` or `anthropic`:

```bash
npm install openai
# and/or
npm install @anthropic-ai/sdk
```

## Example React app (this repo)

From the repo root, after a library build, install and start the Vite demo:

```bash
npm run example:dev
```

Details: [examples/react-test-app/README.md](examples/react-test-app/README.md). From the example directory you can run `npm run i18n:diff` / `i18n:generate` against `ai-i18n.config.json` and `locales/`.

## Runtime

Messages are **flat JSON** maps: `resources[locale][key] = "Hello {{name}}"`. Placeholders use **`{{variable}}`** (double braces).

```tsx
import { useState } from "react";
import { AitProvider, useTranslation } from "ai-i18n";

const resources = {
  en: { welcome: "Welcome back, {{name}}!" },
  fr: { welcome: "Bon retour, {{name}} !" },
};

export function App() {
  const [locale, setLocale] = useState("en");
  return (
    <AitProvider locale={locale} defaultLocale="en" resources={resources}>
      <Home />
      <button type="button" onClick={() => setLocale(locale === "en" ? "fr" : "en")}>
        Toggle
      </button>
    </AitProvider>
  );
}

function Home() {
  const { t } = useTranslation();
  return <p>{t("welcome", { name: "Ada", hint: "main dashboard greeting" })}</p>;
}
```

- **`hint`** is reserved: passed only for tooling / `ai-i18n generate`; it is **not** interpolated. All other options are interpolation values.
- Missing keys: by default `t` returns the key and logs a **warning** in development. Set **`strictMissingKeys`** on `AitProvider` to throw instead.

## `ai-i18n.config.json`

Place at the project root (where you run the CLI).

```json
{
  "sourceGlobs": ["src/**/*.{tsx,ts,jsx,js}"],
  "defaultLocale": "en",
  "locales": ["fr", "es"],
  "catalogDir": "locales",
  "cacheDir": ".ai-i18n",
  "provider": "openai",
  "model": "gpt-5-mini"
}
```

| Field | Required | Description |
|--------|----------|-------------|
| `sourceGlobs` | yes | Glob patterns for files to scan. |
| `defaultLocale` | yes | Locale code for the source catalog file `{catalogDir}/{defaultLocale}.json`. |
| `locales` | yes | Target locale codes (files `{code}.json`). The default locale is skipped for generation. |
| `catalogDir` | yes | Directory containing `en.json`, `fr.json`, … |
| `cacheDir` | no (default `.ai-i18n`) | Stores `.ai-i18n-cache.json` (source-string hashes) and `.ai-i18n-hints.json` (static hints from code). |
| `provider` | no (default `stub` when omitted) | `stub` \| `openai` \| `anthropic`. The **generated** default from `init` / postinstall is `openai`. |
| `model` | no | Provider-specific model id override. OpenAI CLI default when omitted: **`gpt-5-mini`**. |

### Runtime vs CLI config

`ai-i18n.config.json` is read by the **CLI** (`init`, `generate`, `diff`). **`AitProvider` does not load it**; it expects a `resources` object already in JavaScript memory so your bundler can include message strings in the client bundle. The browser has **no access to arbitrary paths** on disk, so the CLI cannot “inject” catalogs into React for you without an **import**, **`import.meta.glob`**, or a **build/codegen** step.

**Single source of truth:** Treat `defaultLocale`, `locales`, and `catalogDir` in `ai-i18n.config.json` as the canonical list of **which locale files exist** for `generate`. At runtime, build `resources` from the same `catalogDir` JSON files so the lists stay aligned—for example with Vite:

```ts
import aitCfg from "../ai-i18n.config.json";

const modules = import.meta.glob("../locales/*.json", { eager: true }) as Record<
  string,
  { default?: Record<string, string> } | Record<string, string>
>;

function localeFromPath(file: string): string {
  const m = file.match(/\/([a-z0-9-]+)\.json$/i);
  if (!m) throw new Error(`Bad locale path: ${file}`);
  return m[1];
}

const resources: Record<string, Record<string, string>> = {};
for (const [file, mod] of Object.entries(modules)) {
  const loc = localeFromPath(file);
  const data = "default" in mod && mod.default ? mod.default : mod;
  resources[loc] = data as Record<string, string>;
}

// aitCfg.defaultLocale, aitCfg.locales — use for locale pickers / validation
```

For **server-only** rendering you could read `catalogDir` with `fs` at startup; that path is not shipped in this package as a public API.

### Environment variables

The CLI loads a **`.env` file in the project root** (next to `ai-i18n.config.json`, i.e. the current working directory) **before** reading config or calling providers. Values already set in the real environment **win** over entries in `.env`.

- **OpenAI:** `OPENAI_API_KEY` (when `provider` is `openai`).
- **Anthropic:** `ANTHROPIC_API_KEY` (when `provider` is `anthropic`).

**Windows (PowerShell):** use `$env:OPENAI_API_KEY = "sk-..."` in the **same** terminal session before running the CLI. The `SET VAR=value` form is for **cmd.exe**, not PowerShell, so Node will not see the variable.

## CLI

```bash
npx ai-i18n init
npx ai-i18n init --force     # replace existing ai-i18n.config.json
npx ai-i18n generate        # fill missing/outdated keys in target locale JSON
npx ai-i18n generate --force  # re-translate every key from default catalog
npx ai-i18n diff            # report keys in code missing from default catalog, keys only in JSON, and per-locale gaps
```

Equivalent with `npm exec` (note the `--` before the binary name and subcommand):

```bash
npm exec -- ai-i18n init
npm exec -- ai-i18n init --force
npm exec -- ai-i18n generate
npm exec -- ai-i18n generate --force
npm exec -- ai-i18n diff
```

Do **not** use `npm ai-i18n` (invalid) or `npx exec ai-i18n` (invalid). Use **`npx ai-i18n …`** or **`npm exec -- ai-i18n …`**.

### Scanner rules (strict)

- Only **`t('literalKey', …?)`** is extracted: the first argument must be a **string literal** callee name **`t`** (identifier).
- **`hint`** is only read when it is a **string literal** in the options object. Dynamic hints are ignored by the CLI.

### Catalog sync (default → targets)

Each target locale file is **rebuilt from the set of keys in the default catalog** (string entries only). Keys you **remove or rename** in the default JSON disappear from targets on the next `generate` (no `--force` needed for pruning). `diff` also lists keys still present in a target file but absent from the default catalog.

### Stub provider

With `"provider": "stub"`, target strings are copies of the default locale (useful for CI and wiring tests). Use `openai` or `anthropic` for real translation.

## Publish checklist

1. `npm run build` — produces `dist/index.js`, `dist/index.d.ts`, `dist/cli.js`.
2. `npm run typecheck` / `npm test`.
3. `npm pack --dry-run` — the tarball only includes the built JS/DTS, `templates/`, `scripts/postinstall.mjs`, `README.md`, and `LICENSE` (no `examples/`, `fixtures/`, `src/`, or source maps). See `package.json` → `"files"` and [`.npmignore`](./.npmignore).

## Limitations (v0.1)

- No plural/ICU, no rich markup component, no namespaces.
- The `ai-i18n` CLI depends on `@babel/parser`, `@babel/traverse`, `@babel/types`, and `fast-glob` (declared in `dependencies`). Optional peers: `openai`, `@anthropic-ai/sdk`.
- No `t(variable)` or template-literal keys.

## License

MIT — see [LICENSE](./LICENSE).
