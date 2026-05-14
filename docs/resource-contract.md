# Resource contract (on-disk + runtime)

This document is the **single contract** for how **ai-i18n** expects locale files to look today, how that maps to **i18next**, and what is **out of scope** until [Phase 2](../ROADMAP.md#phase-2--cli-alignment-with-i18next-layouts).

---

## Recommended layout (supported today)

| Item | Rule |
|------|------|
| **Config** | `ai-i18n.config.json` at the **project root** (where you run the CLI). See [configuration.md](./configuration.md). |
| **Catalog directory** | `catalogDir` (default from template: `locales/`), resolved relative to the project root. |
| **Files** | One JSON file per locale: **`{catalogDir}/{locale}.json`**. Example: `locales/en.json`, `locales/fr.json`. |
| **Shape** | Each file is a **flat** JSON object: **string keys → string values** only. Values are message templates (e.g. with `{{name}}` for i18next interpolation). Non-string entries in the default catalog are ignored for generation key-set purposes. |

**Default locale** (`defaultLocale` in config) is the **source of truth** for which keys exist. **`generate`** fills target locale files from that set; **`diff`** compares code + default + targets using the same model.

---

## What `generate` does *not* produce today

**Important:** the CLI does **not** emit i18next-specific plural structures (e.g. `key_one` / `key_other` object branches), ICU message format, or nested key trees in JSON. It outputs **plain strings per key**.

Pluralization, [i18next pluralization rules](https://www.i18next.com/translation-function/plurals), ICU plugins, and structured messages are **configured and rendered by i18next** in your app. If you need those shapes in JSON, you either:

- Author them by hand in locale files (and teach the CLI to preserve them in a future **resourceFormat** — see roadmap), or
- Keep using flat keys and encode plural intent in separate keys (`items_one`, `items_other`) yourself.

---

## Alternatives (not implemented yet)

The following are **compatibility targets** for [Phase 2](../ROADMAP.md#phase-2--cli-alignment-with-i18next-layouts), not current behavior:

- Per-namespace files (e.g. `locales/en/common.json`, `locales/en/dashboard.json`).
- Nested JSON matching i18next deep resources.

Until Phase 2 ships a `resourceFormat` (or equivalent), only the **flat per-locale file** layout above is officially supported.

---

## `hint` — CLI-only metadata

| Rule | Detail |
|------|--------|
| **Purpose** | Optional string passed as `t('key', { hint: '…' })` so **translators** (OpenAI / Anthropic) get UI context. |
| **Scanner** | Only **string literal** hints are extracted; see [cli-reference.md](./cli-reference.md). |
| **Runtime** | **Do not** pass `hint` to `i18next.t` / `react-i18next` in production unless you strip it—i18next does not use `hint`, and you may leak internal notes to logs or analytics. |
| **Catalog JSON** | Hints are **not** written into `en.json` / `fr.json` by this CLI; they live in `.ai-i18n` hint cache from the scan step. |

Patterns: omit `hint` in production builds via env + dead-code elimination, keep hints only in branches the scanner sees, or document a wrapper that drops `hint` before calling `t`.

---

## i18next mapping

Flat files map cleanly to a **single default namespace** (commonly `translation`):

- Use [i18next.md](./i18next.md) for `init` / `react-i18next`.
- Use **`catalogsToI18nextResources()`** from `ai-i18n/i18next` to turn `{ en: { … }, fr: { … } }` into `resources` for `i18next.init`.

---

## Related docs

- [configuration.md](./configuration.md) — `catalogDir`, `locales`, `defaultLocale`
- [cli-reference.md](./cli-reference.md) — scanner, `generate`, `diff`
- [i18next.md](./i18next.md) — wiring JSON into the app
- [workflows.md](./workflows.md) — CI, `missingKey` recipes
