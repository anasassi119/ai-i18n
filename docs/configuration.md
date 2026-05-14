# Configuration (`ai-i18n.config.json`)

Place at the **project root** (where you run the CLI).

## Example

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

## Core fields

| Field | Required | Description |
|--------|----------|-------------|
| `sourceGlobs` | yes | Glob patterns for files to scan. |
| `localesDir` | yes | Directory of locale JSON files (layout under it follows `resourceFormat`). **`translator-notes.json`** lives here — see [resource-contract.md](./resource-contract.md). |
| `i18n` | yes | Project-relative path to **your** module that calls **`*.init({...})`** for i18next-style setup. The CLI **parses this file only** (no execution) to derive **`defaultLocale`**, **`locales`**, and usually **`resourceFormat`** / **`namespace`**. This package **does not** create that file — point it at the module you already use (or add one), then adjust the path in JSON if it lives elsewhere. |
| `cacheDir` | no (default `.ai-i18n`) | `.ai-i18n-cache.json` only. |
| `provider` | no (defaults to `openai` if omitted) | `openai` \| `anthropic`. **Generated** default from `init` / postinstall is `openai`. |
| `model` | no | Provider model id. OpenAI CLI default when omitted: **`gpt-5-mini`**. |

## Optional overrides (when static inference is wrong or you prefer explicit values)

| Field | When to use |
|--------|----------------|
| `defaultLocale` | Override the language inferred from `lng` / first entry in the derived locale list. |
| `locales` | Override the full target list (must include `defaultLocale`; the CLI normalizes order). |
| `resourceFormat` | Force `flat` or `i18next-namespace` instead of inferring from the `resources` object shape in the `i18n` file. **Common fix:** your files are `locales/en.json` (flat) but `i18next.init({ resources: { en: { translation: … }}})` makes the CLI guess **namespace** paths (`locales/en/translation.json`). If that guess is wrong for your repo, set **`"resourceFormat": "flat"`**. |
| `namespace` | Only with `resourceFormat: "i18next-namespace"`; default **`translation`**. Must be omitted when `resourceFormat` is `flat` (or omitted and inferred as flat). |

For **adding keys that appear in code but not yet in the default JSON**, use the CLI (not this file): `npx ai-i18n diff --add-missing-default` — see [cli-reference.md](./cli-reference.md).

## Troubleshooting: namespace path vs flat JSON files

The CLI infers **`resourceFormat`** from the **AST shape** of `resources` in your `i18n` file. Nested objects (per locale → namespace → keys) suggest **`i18next-namespace`** on disk (`locales/en/translation.json`). **`init` / postinstall** only scaffold a **flat** empty catalog (`locales/en.json`).

If your real catalogs are **flat** (`{locale}.json`), add:

```json
"resourceFormat": "flat"
```

If your catalogs really live under **`{locale}/{namespace}.json`**, keep the inferred layout (or set `"resourceFormat": "i18next-namespace"` and optional `"namespace"`).

## Runtime vs this file

This file is for the **CLI** only. **i18next** loads translations from the JSON (or bundles) you provide in your app — see [i18next integration](./i18next.md).

## Related

- [resource-contract.md](./resource-contract.md) — on-disk file layout and what `generate` does *not* emit (plurals / ICU).
- [workflows.md](./workflows.md) — CI with `diff`, dev recipes.
