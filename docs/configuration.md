# Configuration (`ai-i18n.config.json`)

Place at the **project root** (where you run the CLI).

## Example

```json
{
  "sourceGlobs": ["src/**/*.{tsx,ts,jsx,js}"],
  "defaultLocale": "en",
  "locales": ["fr", "es"],
  "catalogDir": "locales",
  "cacheDir": ".ai-i18n",
  "provider": "openai",
  "model": "gpt-5-mini",
  "resourceFormat": "flat"
}
```

## Fields

| Field | Required | Description |
|--------|----------|-------------|
| `sourceGlobs` | yes | Glob patterns for files to scan. |
| `defaultLocale` | yes | Source catalog path depends on `resourceFormat` (see [resource-contract.md](./resource-contract.md)). |
| `locales` | yes | Target locale codes. Default locale is skipped for generation. |
| `catalogDir` | yes | Directory of locale JSON files (layout under it follows `resourceFormat`). Optional **`translator-notes.json`** lives here too — see [resource-contract.md](./resource-contract.md). |
| `cacheDir` | no (default `.ai-i18n`) | `.ai-i18n-cache.json` only. |
| `provider` | no (defaults to `openai` if omitted) | `openai` \| `anthropic`. **Generated** default from `init` / postinstall is `openai`. |
| `model` | no | Provider model id. OpenAI CLI default when omitted: **`gpt-5-mini`**. |
| `resourceFormat` | no (default `flat`) | `flat` → `{catalogDir}/{locale}.json`. `i18next-namespace` → `{catalogDir}/{locale}/{namespace}.json`. |
| `namespace` | no | Used only with `resourceFormat: "i18next-namespace"`; default **`translation`**. Must be omitted when `resourceFormat` is `flat` (or omitted). |

## Runtime vs this file

This file is for the **CLI** only. **i18next** loads translations from the JSON (or bundles) you provide in your app — see [i18next integration](./i18next.md).

## Related

- [resource-contract.md](./resource-contract.md) — on-disk file layout and what `generate` does *not* emit (plurals / ICU).
- [workflows.md](./workflows.md) — CI with `diff`, dev recipes.
