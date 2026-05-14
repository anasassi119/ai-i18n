# Resource contract (on-disk + runtime)

This document is the **single contract** for how **ai-i18n** expects locale files to look, how that maps to **i18next**, and what is **out of scope** for the current scanner (literal `t('key')` only).

---

## Config: `resourceFormat`

| `resourceFormat` | On-disk paths | Notes |
|------------------|----------------|-------|
| **`flat`** (default when omitted) | **`{catalogDir}/{locale}.json`** | Original layout; unchanged if you do not add `resourceFormat` to config. |
| **`i18next-namespace`** | **`{catalogDir}/{locale}/{namespace}.json`** | Matches a common i18next folder layout (e.g. `locales/en/translation.json`). Same **flat** `Record<string, string>` inside each JSON file. |

Set optional **`namespace`** when using `i18next-namespace` (default **`translation`**, i18next’s default namespace). `namespace` must not appear when `resourceFormat` is `flat` or omitted.

**Scanner (Phase 2 v1):** unchanged — only **string literal** keys in `t('…')` are compared to the **default locale’s** catalog file for that layout (single namespace file in `i18next-namespace` mode). Multiple namespaces, `ns:key` syntax, and scanning across several JSON files per locale are **future work** (see [ROADMAP.md](../ROADMAP.md)).

```text
# flat (default)
catalogDir/
  en.json
  fr.json

# i18next-namespace (example: namespace "translation")
catalogDir/
  en/
    translation.json
  fr/
    translation.json
```

---

## Recommended layout

| Item | Rule |
|------|------|
| **Config** | `ai-i18n.config.json` at the **project root** (where you run the CLI). See [configuration.md](./configuration.md). |
| **Catalog directory** | `catalogDir` (default from template: `locales/`), resolved relative to the project root. |
| **Files** | Per `resourceFormat` table above. |
| **Shape** | Each catalog JSON file is a **flat** object: **string keys → string values** only. Values are message templates (e.g. with `{{name}}` for i18next interpolation). Non-string entries in the default catalog are ignored for generation key-set purposes. |

**Default locale** (`defaultLocale` in config) is the **source of truth** for which keys exist. **`generate`** fills target locale files from that set; **`diff`** uses the same rules and **layout-aware paths**.

---

## What `generate` does *not* produce today

**Important:** the CLI does **not** emit i18next-specific plural structures (e.g. `key_one` / `key_other` object branches), ICU message format, or nested key trees in JSON. It outputs **plain strings per key**.

Pluralization, [i18next pluralization rules](https://www.i18next.com/translation-function/plurals), ICU plugins, and structured messages are **configured and rendered by i18next** in your app. If you need those shapes in JSON, you either:

- Author them by hand in locale files (and teach the CLI to preserve them in a future **resourceFormat** — see roadmap), or
- Keep using flat keys and encode plural intent in separate keys (`items_one`, `items_other`) yourself.

---

## Future formats (not implemented)

Compatibility targets for later roadmap items:

- Multiple namespace files per locale scanned by the CLI.
- Nested JSON matching i18next deep resources.

---

## `hint` — CLI-only metadata

| Rule | Detail |
|------|--------|
| **Purpose** | Optional string passed as `t('key', { hint: '…' })` so **translators** (OpenAI / Anthropic) get UI context. |
| **Scanner** | Only **string literal** hints are extracted; see [cli-reference.md](./cli-reference.md). |
| **Runtime** | **Do not** pass `hint` to `i18next.t` / `react-i18next` in production unless you strip it—i18next does not use `hint`, and you may leak internal notes to logs or analytics. |
| **Catalog JSON** | Hints are **not** written into locale JSON by this CLI; they live in `.ai-i18n` hint cache from the scan step. |

Patterns: omit `hint` in production builds via env + dead-code elimination, keep hints only in branches the scanner sees, or document a wrapper that drops `hint` before calling `t`.

---

## i18next mapping

Flat catalogs map cleanly to **namespaces** in i18next (commonly `translation`):

- Use [i18next.md](./i18next.md) for `init` / `react-i18next`.
- Use **`catalogsToI18nextResources()`** from `ai-i18n/i18next` when you already have `{ lng: flatCatalog }` in memory.
- Use **`namespaceCatalogFilesToResources()`** when you load one JSON per `(lng, namespace)` (typical for `resourceFormat: "i18next-namespace"` on disk).

i18next concepts: [namespaces](https://www.i18next.com/principles/namespaces), [`addResourceBundle`](https://www.i18next.com/overview/api#addresourcebundle).

---

## Related docs

- [configuration.md](./configuration.md) — `catalogDir`, `locales`, `defaultLocale`, `resourceFormat`
- [cli-reference.md](./cli-reference.md) — scanner, `generate`, `diff`
- [i18next.md](./i18next.md) — wiring JSON into the app
- [workflows.md](./workflows.md) — CI, `missingKey` recipes
