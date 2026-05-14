# Workflows & recipes

Patterns for **i18next** + **ai-i18n** in development and CI. Paths follow [resource-contract.md](./resource-contract.md) (`resourceFormat`, default `flat`). **`ai-i18n diff`** uses the same layout as **`generate`** from your config.

---

## CI: fail the build on catalog drift

`ai-i18n diff` prints a report and exits with code **`1`** if any of the following are true:

- Keys appear in scanned `t('…')` calls but **not** in the default locale catalog.
- Keys exist in the default catalog but **not** as string-literal `t('…')` keys in scanned files (stale JSON).
- Any target locale is **missing or empty** for a key present in the default catalog.
- Any target locale has keys **not** in the default catalog (stale targets until you run `generate`).

**Example (GitHub Actions):**

```yaml
- run: npm ci
- run: npx ai-i18n diff
```

**Example (package.json script):**

```json
{
  "scripts": {
    "i18n:check": "ai-i18n diff"
  }
}
```

Use `AI_I18N_SKIP_INIT=1` in CI if you do not want postinstall scaffolding.

**Note:** Run **`npx ai-i18n diff`** only in CI — not **`diff --add-missing-default`**, which edits the default catalog unless you explicitly want pipelines to commit those changes.

---

## Dev: `missingKey` → queue keys → `generate`

i18next can call a handler when a key is missing. Use it **only in development** to log or collect keys; then run **`npx ai-i18n generate`** after adding strings to the default catalog (or let translators fill targets).

```ts
import i18next from "i18next";

if (import.meta.env.DEV) {
  i18next.on("missingKey", (lngs, namespace, key) => {
    console.warn(`[i18n] missing: ${String(lngs)} ${namespace}:${key}`);
    // Optionally append to a local file or open an issue — then add key to locales/en.json and run generate.
  });
}
```

**Workflow:** add the key and English string to **`locales/{defaultLocale}.json`**, run **`npx ai-i18n generate`** to fill other locales, commit JSON.

This package does **not** auto-write locale files from `missingKey` at runtime (no long-running translator in the browser).

---

## Translator notes for `generate`

Optional **`{localesDir}/translator-notes.json`** is a key → string map read only by **`generate`** (not by i18next). Use it for UI or product context when calling the model. **`init`** / **`generate`** create `{}` when the file is missing. See [resource-contract.md](./resource-contract.md).

---

## Related

- [resource-contract.md](./resource-contract.md) — on-disk shape and plural stance
- [environment.md](./environment.md) — API keys for `generate`
