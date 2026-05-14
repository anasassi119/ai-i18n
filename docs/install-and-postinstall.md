# Install and postinstall

## Install

```bash
npm install ai-i18n --save-dev
```

For cloud translation, install the SDK you use (optional peers):

```bash
npm install openai
# and/or
npm install @anthropic-ai/sdk
```

For the optional **`ai-i18n/i18next`** helper types at build time, install **`i18next`** in your app (you likely already have it with **react-i18next**).

## Postinstall

When **`ai-i18n.config.json`** is missing at your app root, the **postinstall** script tries to create it from the package template, then creates **`{localesDir}/en.json`** as `{}` (first-install default) and **`{localesDir}/translator-notes.json`** as `{}` when those files are missing. It does **not** run the full Babel-based config merge and **does not** create the file at **`"i18n"`** — you must point that key at your real i18next init module before `generate` / `diff` / `loadConfig`-based tooling can run.

On every successful run (unless **`AI_I18N_SKIP_INIT=1`**), after postinstall detects your **consumer app root** (installing `ai-i18n` as a dependency), it prints a short **configure** reminder: `openai` vs `anthropic`, **`OPENAI_API_KEY`** / **`ANTHROPIC_API_KEY`** shape, `.env`, `npx ai-i18n generate`, and that **i18next is not installed** with this package. It does **not** print when the script cannot find a consumer project (e.g. `npm install` inside this repo while developing the library).

- **`AI_I18N_SKIP_INIT=1`** — skip postinstall scaffolding and the configure banner (e.g. CI).
- **`AI_I18N_DEBUG=1`** — log resolved paths and skip reasons.

npm may run lifecycle scripts with `cwd` inside `node_modules/ai-i18n`; the script walks up to find your project and matches **`node_modules/ai-i18n`** to the installed copy (first-install safe).

Lifecycle scripts **do not** run again on a no-op install. To re-run scaffolding:

```bash
npm rebuild ai-i18n
# or
npx ai-i18n init
npx ai-i18n init --force
```

See [workflows.md](./workflows.md) for **CI** (`diff` exit code **`1`** on drift) and **`missingKey`** patterns. API keys: [environment.md](./environment.md).
