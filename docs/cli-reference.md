# CLI reference

## Commands

```bash
npx ai-i18n init
npx ai-i18n init --force     # replace existing ai-i18n.config.json
npx ai-i18n generate         # fill missing/outdated keys in target locale JSON
npx ai-i18n generate --force # re-translate every key from default catalog
npx ai-i18n diff             # compare code vs catalogs; exits 1 if drift (for CI)
```

**Exit code:** `diff` exits **`1`** when there is anything to fix (keys in code missing from default, keys only in default JSON, missing/empty target strings, or stale keys in targets). Exit **`0`** when clean. See [workflows.md](./workflows.md).

Equivalent:

```bash
npm exec -- ai-i18n init
npm exec -- ai-i18n generate --force
```

Do **not** use `npm ai-i18n` (invalid). Prefer **`npx ai-i18n …`**.

## Scanner rules (strict)

- Only **`t('literalKey', …?)`** is extracted: the callee must be the identifier **`t`**, first argument a **string literal** key.
- **`hint`** is read only when it is a **string literal** in the options object. Dynamic hints are ignored by the CLI.

## Catalog sync (default → targets)

Each target locale file is **rebuilt from keys in the default catalog** (string entries only). Keys removed or renamed in the default JSON are **pruned** from targets on the next `generate` (no `--force` needed for pruning). `diff` lists keys in targets that are absent from the default catalog.

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
