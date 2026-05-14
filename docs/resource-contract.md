# Resource contract (on-disk + runtime)



This document is the **single contract** for how **ai-i18n** expects locale files to look, how that maps to **i18next**, and how the **scanner** maps source calls to catalog keys.



---



## Config: `resourceFormat`



| `resourceFormat` | On-disk paths | Notes |

|------------------|----------------|-------|

| **`flat`** (default when inferred / omitted) | **`{localesDir}/{locale}.json`** | Original layout. |

| **`i18next-namespace`** | **`{localesDir}/{locale}/{namespace}.json`** | One JSON file per `(locale, namespace)` segment. Use **`namespaces`** (array) for multiple files per locale (e.g. `nav.json` + `common.json`). Logical keys merge as **`namespace:inner.path`** when more than one namespace is configured. |

**Redundant namespace root:** the file `translation.json` is **already** the `translation` namespace. Its JSON body should look like `{ "nav": { … } }`, not `{ "translation": { "nav": { … } } }`. If the root object has **only** one key and that key equals the filename namespace (e.g. **`translation`**) whose value is a plain object, the CLI **unwraps** that layer when loading so keys align with **`t('nav.home')`** (`nav.home`), not `translation.nav.home`. The same applies to **`flat`** `en.json` when the sole root key is **`translation`** (using **`namespace`** from config, default **`translation`**). When writing catalogs back, the same outer wrapper is preserved if it was present on load.

Set optional **`namespace`** when using **`i18next-namespace`** with a **single** file per locale (default **`translation`**). Use **`namespaces`** instead when you have several JSON files per locale; **`namespaces`** requires **`resourceFormat": "i18next-namespace"`** and takes precedence over **`namespace`**.

Optional **`localeShape`**: **`flat`** (default) — only top-level string keys in each JSON file. **`nested`** — plain object trees whose **leaves** are strings; logical keys use **dot paths** (e.g. `nav.home`) inside each namespace file. The deprecated config key **`catalogShape`** maps to **`localeShape`** with a one-time console warning.

Optional **`localesAutoDiscover`: true`** — rebuild the **`locales`** list from disk under **`localesDir`** (`*.json` basenames for `flat`, subdirectory names for **`i18next-namespace`**), keeping **`defaultLocale`** first. When **`locales`** is also set in JSON, **`localesAutoDiscover`** still wins when the flag is **`true`** and at least one locale is found on disk.

**Scanner:** the callee must be the identifier **`t`**, first argument a **string literal**. The CLI resolves **logical keys** for **`diff`** (and **`--add-missing-default`**) as follows:

- Literal keys containing **`:`** are kept as-is (e.g. **`t('nav:home')`** → `nav:home`).
- With **`useTranslation('ns')`** (or default **`translation`** when omitted), **`t('key')`** becomes **`ns:key`** when **`namespaces`** has **more than one** entry; when there is only one on-disk namespace and it matches the hook namespace, **short keys** (`key`) are used so single-file catalogs stay unchanged.
- Optional second argument object: **`keyPrefix`** (string literal) is prepended to the key segment before namespace rules apply.

See [cli-reference.md](./cli-reference.md) for a short summary.



```text

# flat (default)

localesDir/

  translator-notes.json

  en.json

  fr.json



# i18next-namespace (example: namespace "translation")

localesDir/

  translator-notes.json

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

| **Locale directory** | `localesDir` (default from template: `locales/`), resolved relative to the project root. |

| **Files** | Per `resourceFormat` table above, plus optional **`{localesDir}/translator-notes.json`**. |

| **Shape** | With **`localeShape": "flat"`** (default), each file is a flat map of string keys → string values. With **`localeShape": "nested"`**, each file is a JSON object whose **string leaves** define messages; keys are **dot paths** to each leaf. **Arrays** and non-object values under a key are **ignored** for extraction (strings inside array entries are not lifted to separate keys). |



**Default locale** (derived from the **`i18n`** module’s `lng` / locale list when possible, or overridden in config) is the **source of truth** for which keys exist. **`generate`** fills target locale files from that set; **`diff`** uses the same rules and **layout-aware paths**. **`generate`** writes each target catalog’s keys in the **same order** as the default locale JSON (incremental runs keep ordering aligned with the default file).



---



## What `generate` does *not* produce



**Plural / ICU bundles:** the CLI does **not** emit i18next plural object branches (e.g. `key_one` / `key_other`), ICU message format trees, or non-string JSON leaves. It reads and writes **string** messages only (flat keys or nested **string** leaves). Pluralization and ICU remain **i18next** concerns at runtime.

You can still encode plural intent with **separate flat keys** (`items_one`, `items_other`) or maintain advanced JSON by hand outside what **`generate`** overwrites.

---




## `translator-notes.json` — optional translator context



| Rule | Detail |

|------|--------|

| **Purpose** | Optional **key → string** map at **`{localesDir}/translator-notes.json`** gives OpenAI / Anthropic extra UI or product context when translating. Keys match **logical** message ids (same strings **`diff`** / **`generate`** use: short keys, dot paths for **`nested`**, or **`namespace:inner`** when multiple namespace files are configured). |

| **Runtime** | **Not** read by i18next. Your app only loads locale catalogs; keep using standard **`t('key', { … })`** without any CLI-specific options. |

| **Lifecycle** | **`init`** may create `{}` when the default catalog and sidecar are missing; **`generate`** and other commands expect the file when you use translator notes. You edit it by hand or generate tooling. |

| **Shape** | Top-level JSON object: **string keys → string values** only. Invalid types cause **`generate`** to fail with a clear error. |



---



## i18next mapping



Flat catalogs map cleanly to **namespaces** in i18next (commonly `translation`):



- Use [i18next.md](./i18next.md) for `init` / `react-i18next`.

- Use **`catalogsToI18nextResources()`** from `ai-i18n/i18next` when you already have `{ lng: flatCatalog }` in memory.

- Use **`namespaceCatalogFilesToResources()`** when you load one JSON per `(lng, namespace)` (typical for `resourceFormat: "i18next-namespace"` on disk).



i18next concepts: [namespaces](https://www.i18next.com/principles/namespaces), [`addResourceBundle`](https://www.i18next.com/overview/api#addresourcebundle).



---



## Related docs



- [configuration.md](./configuration.md) — `localesDir`, `i18n`, `translator-notes.json`, `resourceFormat`, `namespace`, `namespaces`, `localeShape`, `localesAutoDiscover`

- [cli-reference.md](./cli-reference.md) — scanner, `generate`, `diff`

- [i18next.md](./i18next.md) — wiring JSON into the app

- [workflows.md](./workflows.md) — CI, `missingKey` recipes

