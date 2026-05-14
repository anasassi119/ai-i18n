# CLI reference

## Commands

```bash
npx ai-i18n init
npx ai-i18n init --force              # replace existing ai-i18n.config.json
npx ai-i18n init --silent             # minimal console output
npx ai-i18n init --i18n src/lib/i18n.ts   # explicit i18next init module path
npx ai-i18n generate         # fill missing/outdated keys in target locale JSON
npx ai-i18n generate --force # re-translate every key for every target locale
npx ai-i18n generate --locale de         # only update locale `de` (missing/outdated; repeat `--locale` for several)
npx ai-i18n generate --force --locale de # re-translate only `de` (ignores per-key cache for that locale)
```

**`generate`** only updates **non-default** locales listed in **`locales`** (the default language is the source catalog). If **`locales`** only contains the default, the CLI prints a short message and exits — add other language codes (from i18next `supportedLngs`) or use **`--locale`**.

```bash
npx ai-i18n diff             # compare code vs catalogs; exits 1 if drift (for CI)
npx ai-i18n diff --add-missing-default  # append keys in code but missing from default catalog (empty values); then re-check
```

**Exit code:** `diff` exits **`1`** when there is anything to fix (keys in code missing from default, keys only in default JSON, missing/empty target strings, or stale keys in targets). Exit **`0`** when clean. After **`--add-missing-default`**, exit code still reflects remaining drift (e.g. empty new default strings still count as missing in targets until you fill them and run **`generate`**). See [workflows.md](./workflows.md).

**`--add-missing-default`:** only addresses **keys in code, not in the default file**. It does **not** remove keys that are only in the default catalog; use **`generate`** for target locales once the default catalog is complete.

Equivalent:

```bash
npm exec -- ai-i18n init
npm exec -- ai-i18n generate --force
```

Do **not** use `npm ai-i18n` (invalid). Prefer **`npx ai-i18n …`**.

## Scanner rules

- The callee must be the identifier **`t`**, first argument a **string literal** (the second argument is **not** inspected; use standard i18next options only).
- Keys containing **`:`** in the literal are treated as **fully qualified** logical ids (e.g. **`t('nav:home')`**).
- **`useTranslation('namespace')`** (string literal) binds **`t('key')`** in the same function body: with **multiple** configured namespace files per locale, logical ids become **`namespace:key`** (with optional **`keyPrefix`** from the hook’s second argument object). With a **single** namespace file that matches the hook, **short keys** are used so one `translation.json` stays the default case.
- Optional translator context for **`generate`** lives in **`{localesDir}/translator-notes.json`**, keyed by the same **logical** ids the CLI uses (short, dotted, or **`ns:…`**). See [resource-contract.md](./resource-contract.md).

## Catalog sync (default → targets)

Each target locale file is **rebuilt from keys in the default catalog** (string entries only), using the **same key order** as the default locale JSON. Keys removed or renamed in the default JSON are **pruned** from targets on the next `generate` (no `--force` needed for pruning). `diff` lists keys in targets that are absent from the default catalog.

**`generate --locale <code>`:** limits work to locale(s) that appear in config `locales` and are **not** the default locale. You can pass **`--locale` more than once** or use **`--locale=de`**. Omit **`--locale`** to process every target locale as before.

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
