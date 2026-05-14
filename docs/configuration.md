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
  "model": "gpt-5-mini"
}
```

## Fields

| Field | Required | Description |
|--------|----------|-------------|
| `sourceGlobs` | yes | Glob patterns for files to scan. |
| `defaultLocale` | yes | Source catalog: `{catalogDir}/{defaultLocale}.json`. |
| `locales` | yes | Target locale codes (`{code}.json`). Default locale is skipped for generation. |
| `catalogDir` | yes | Directory of locale JSON files. |
| `cacheDir` | no (default `.ai-i18n`) | `.ai-i18n-cache.json`, `.ai-i18n-hints.json`. |
| `provider` | no (defaults to `openai` if omitted) | `openai` \| `anthropic`. **Generated** default from `init` / postinstall is `openai`. |
| `model` | no | Provider model id. OpenAI CLI default when omitted: **`gpt-5-mini`**. |

## Runtime vs this file

This file is for the **CLI** only. **i18next** loads translations from the JSON (or bundles) you provide in your app — see [i18next integration](./i18next.md).

## Related

- [resource-contract.md](./resource-contract.md) — on-disk file layout and what `generate` does *not* emit (plurals / ICU).
- [workflows.md](./workflows.md) — CI with `diff`, dev recipes.
