# Environment variables

The CLI loads a **`.env` file in the project root** (next to `ai-i18n.config.json`, i.e. current working directory) **before** commands run. Values already set in the real environment are **not** overwritten by `.env`.

## Providers

| Variable | When |
|----------|------|
| `OPENAI_API_KEY` | `provider` is `openai` |
| `ANTHROPIC_API_KEY` | `provider` is `anthropic` |

## Windows (PowerShell)

Set variables in the **same** session you use to run the CLI:

```powershell
$env:OPENAI_API_KEY = "sk-..."
npx ai-i18n generate
```

`SET VAR=value` is for **cmd.exe**, not PowerShell.

## Example `.env`

```env
OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=...
```

Never commit real keys. Add `.env` to `.gitignore`.
