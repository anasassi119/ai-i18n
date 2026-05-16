# CLI reference

## Commands

```bash
npx ai-i18n init
npx ai-i18n init --no-input           # skip interactive wizard (auto-discovery)
npx ai-i18n init --force              # replace existing ai-i18n.config.json
npx ai-i18n init --silent             # minimal console output (non-interactive)
npx ai-i18n init --i18n src/lib/i18n.ts   # explicit i18next init module path (non-interactive)
npx ai-i18n generate         # fill missing/outdated keys in target locale JSON
npx ai-i18n generate --force # re-translate every key for every target locale
npx ai-i18n generate --sync-default-from-code  # merge default catalog from code defaultValue, then translate
npx ai-i18n generate --locale de         # only update locale `de` (missing/outdated; repeat `--locale` for several)
npx ai-i18n generate --force --locale de # re-translate only `de` (ignores per-key cache for that locale)
```

**`generate`** only updates **non-default** locales listed in **`locales`** (the default language is the source catalog). If **`locales`** only contains the default, the CLI prints a short message and exits — add other language codes (from i18next `supportedLngs`) or use **`--locale`**.

Chunk size for each translation API call comes from **`batchSize`** in `ai-i18n.config.json` (default **40**; see [configuration.md](./configuration.md)).

```bash
npx ai-i18n diff             # compare code vs catalogs; exits 1 if drift (for CI)
npx ai-i18n diff --add-missing-default  # add missing keys; seed/fill from static defaultValue when present
```

**Exit code:** `diff` exits **`1`** when there is anything to fix (keys in code missing from default, keys only in default JSON, default catalog empty/mismatched vs code **`defaultValue`**, missing/empty target strings, or stale keys in targets). Exit **`0`** when clean. After **`--add-missing-default`**, exit code still reflects remaining drift (e.g. keys without **`defaultValue`** in code still get `""` until you fill them). See [workflows.md](./workflows.md).

**`--add-missing-default`:** adds keys in code but not in the default file (value from **`defaultValue`** / string shorthand when static, else `""`). Also fills **empty** default-catalog entries when code has **`defaultValue`**. Does **not** remove stale keys only in the default catalog; use **`generate`** for target locales once the default catalog is complete.

Equivalent:

```bash
npm exec -- ai-i18n init
npm exec -- ai-i18n generate --force
```

Do **not** use `npm ai-i18n` (invalid). Prefer **`npx ai-i18n …`**.

## Scanner rules

- The callee must be the identifier **`t`**, first argument a **string literal** (logical key).
- **Second argument (static only):**
  - **String literal** → i18next shorthand **`defaultValue`** (e.g. `t('save', 'Save changes')`).
  - **Object** with string-literal **`defaultValue`** → used for **`diff`** / **`--add-missing-default`** / **`generate --sync-default-from-code`** (e.g. `t('save', { defaultValue: 'Save changes', count: 1 })`).
  - Dynamic expressions, template literals, and **`defaultValue_plural`** are ignored.
- If the same logical key has **conflicting** static **`defaultValue`** strings in different files, the CLI warns once and omits **`defaultText`** for that key.
- Keys containing **`:`** in the literal are treated as **fully qualified** logical ids (e.g. **`t('nav:home')`**).
- **`useTranslation('namespace')`** (string literal) binds **`t('key')`** in the same function body: with **multiple** configured namespace files per locale, logical ids become **`namespace:key`** (with optional **`keyPrefix`** from the hook’s second argument object). With a **single** namespace file that matches the hook, **short keys** are used so one `translation.json` stays the default case.
- Optional translator context for **`generate`** lives in **`{localesDir}/translator-notes.json`**, keyed by the same **logical** ids the CLI uses (short, dotted, or **`ns:…`**). See [resource-contract.md](./resource-contract.md).

## Catalog sync (default → targets)

Each target locale file is **rebuilt from keys in the default catalog** (string entries only), using the **same key order** as the default locale JSON. Keys removed or renamed in the default JSON are **pruned** from targets on the next `generate` (no `--force` needed for pruning). `diff` lists keys in targets that are absent from the default catalog.

**`generate --locale <code>`:** limits work to locale(s) that appear in config `locales` and are **not** the default locale. You can pass **`--locale` more than once** or use **`--locale=de`**. Omit **`--locale`** to process every target locale as before.

**Cache:** `node_modules/.cache/ai-i18n/.ai-i18n-cache.json` (see [configuration.md](./configuration.md)).

## Optional helper: `ai-i18n/i18next`

```ts
import { catalogsToI18nextResources } from "ai-i18n/i18next";

const resources = catalogsToI18nextResources({
  en: { welcome: "Hello, {{name}}!" },
  fr: { welcome: "Bonjour, {{name}} !" },
});
// Pass `resources` to i18next.init({ resources })
```

Default namespace is **`translation`**. See [i18next integration](./i18next.md).
