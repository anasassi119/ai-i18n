/**
 * Creates ai-i18n.config.json in the project that ran `npm install` when missing.
 * Set AI_I18N_SKIP_INIT=1 to disable (e.g. CI).
 */
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKIP = process.env.AI_I18N_SKIP_INIT === "1" || process.env.AI_I18N_SKIP_INIT === "true";

function installRoot() {
  return (
    process.env.INIT_CWD ||
    process.env.npm_config_local_prefix ||
    process.cwd()
  );
}

function packageDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function isDirectAiI18nDependency(root) {
  const pkgPath = path.join(root, "package.json");
  try {
    const raw = await readFile(pkgPath, "utf8");
    const pkg = JSON.parse(raw);
    const merged = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.optionalDependencies,
    };
    return Object.prototype.hasOwnProperty.call(merged, "ai-i18n");
  } catch {
    return false;
  }
}

async function main() {
  if (SKIP) return;

  const root = installRoot();
  if (!(await isDirectAiI18nDependency(root))) return;

  const target = path.join(root, "ai-i18n.config.json");
  if (await exists(target)) return;

  const template = path.join(packageDir(), "templates", "ai-i18n.config.default.json");
  const body = await readFile(template, "utf8");
  await writeFile(target, body, "utf8");
  console.log("[ai-i18n] Created ai-i18n.config.json (postinstall) — edit sourceGlobs and locales as needed.");
}

main().catch((err) => {
  console.warn("[ai-i18n] postinstall could not create default config:", err.message);
});
