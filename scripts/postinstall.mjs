/**
 * Creates ai-i18n.config.json in the project that ran `npm install` when missing.
 * Set AI_I18N_SKIP_INIT=1 to disable (e.g. CI).
 */
import { access, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKIP = process.env.AI_I18N_SKIP_INIT === "1" || process.env.AI_I18N_SKIP_INIT === "true";
const DEBUG = process.env.AI_I18N_DEBUG === "1" || process.env.AI_I18N_DEBUG === "true";

async function packageDir() {
  return realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** True if this package.json lists ai-i18n (or @scope/ai-i18n) as a direct dependency. */
function manifestDependsOnAiI18n(pkg) {
  const merged = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.optionalDependencies,
  };
  return Object.keys(merged).some((k) => k === "ai-i18n" || k.endsWith("/ai-i18n"));
}

async function readRootPackage(dir) {
  const pkgPath = path.join(dir, "package.json");
  try {
    let raw = await readFile(pkgPath, "utf8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    return { dir, pkg: JSON.parse(raw) };
  } catch {
    return null;
  }
}

/** Path segments under node_modules for this package name (e.g. @scope/pkg or ai-i18n). */
function nodeModulesSegmentsForPackageName(pkgName) {
  if (!pkgName || pkgName === "ai-i18n") return ["ai-i18n"];
  if (pkgName.startsWith("@")) {
    const slash = pkgName.indexOf("/");
    if (slash === -1) return [pkgName];
    return [pkgName.slice(0, slash), pkgName.slice(slash + 1)];
  }
  return [pkgName];
}

/**
 * Walk up from the install folder: npm often runs postinstall before the consumer
 * package.json lists the new dependency, so we detect the consumer when
 * node_modules/<name> resolves (realpath) to this install.
 */
async function findConsumerWalkingUp(installedAt) {
  const self = await readRootPackage(installedAt);
  const pkgName = self?.pkg?.name ?? "ai-i18n";
  const segs = nodeModulesSegmentsForPackageName(pkgName);

  let cursor = path.dirname(installedAt);
  for (let depth = 0; depth < 50; depth++) {
    const atRoot = await readRootPackage(cursor);
    if (atRoot) {
      const nmPath = path.join(cursor, "node_modules", ...segs);
      if (await exists(nmPath)) {
        try {
          if ((await realpath(nmPath)) === installedAt) return cursor;
        } catch {
          /* missing or not a link */
        }
      }
      if (manifestDependsOnAiI18n(atRoot.pkg)) return cursor;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return null;
}

/**
 * Find the app/package that depends on ai-i18n. npm/yarn/pnpm sometimes run this
 * script with cwd inside node_modules/ai-i18n, where INIT_CWD is unset — walk up.
 */
async function findConsumerRoot(installedAt) {
  const fromInstall = await findConsumerWalkingUp(installedAt);
  if (fromInstall) return fromInstall;

  const starts = new Set(
    [
      process.env.INIT_CWD,
      process.env.npm_config_local_prefix,
      process.env.PROJECT_CWD,
      process.env.npm_config_initial_cwd,
      process.cwd(),
    ]
      .filter(Boolean)
      .map((s) => path.resolve(s)),
  );

  for (const start of starts) {
    let dir = start;
    for (let depth = 0; depth < 30; depth++) {
      const hit = await readRootPackage(dir);
      if (hit && manifestDependsOnAiI18n(hit.pkg)) {
        return hit.dir;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  return null;
}

/** Create `{catalogDir}/{defaultLocale}.json` as `{}` when missing (same rules as `ai-i18n init`). */
async function bootstrapDefaultCatalog(root, configPath) {
  let raw;
  try {
    raw = await readFile(configPath, "utf8");
  } catch {
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== "object") return;
  const catalogDir = typeof parsed.catalogDir === "string" ? parsed.catalogDir : "locales";
  const defaultLocale = typeof parsed.defaultLocale === "string" ? parsed.defaultLocale : "en";
  const dirAbs = path.resolve(root, catalogDir);
  const fileAbs = path.join(dirAbs, `${defaultLocale}.json`);
  if (await exists(fileAbs)) return;
  await mkdir(dirAbs, { recursive: true });
  await writeFile(fileAbs, "{}\n", "utf8");
  console.log(`[ai-i18n] Created ${path.relative(root, fileAbs)} (empty default catalog).`);
}

async function main() {
  if (SKIP) {
    if (DEBUG) console.warn("[ai-i18n] postinstall: skipped (AI_I18N_SKIP_INIT).");
    return false;
  }

  const installedAt = await packageDir();
  if (DEBUG) {
    console.warn("[ai-i18n] postinstall debug:", {
      cwd: process.cwd(),
      installedAt,
      INIT_CWD: process.env.INIT_CWD,
      npm_config_local_prefix: process.env.npm_config_local_prefix,
      PROJECT_CWD: process.env.PROJECT_CWD,
    });
  }

  const root = await findConsumerRoot(installedAt);
  if (!root) {
    if (DEBUG) {
      console.warn(
        "[ai-i18n] postinstall: could not find a package.json that lists ai-i18n in dependencies, devDependencies, or optionalDependencies.",
      );
    }
    return false;
  }

  const target = path.join(root, "ai-i18n.config.json");
  if (await exists(target)) {
    if (DEBUG) {
      console.warn("[ai-i18n] postinstall:", target, "already exists; not overwriting.");
    }
    return true;
  }

  const template = path.join(installedAt, "templates", "ai-i18n.config.default.json");
  const body = await readFile(template, "utf8");
  await writeFile(target, body, "utf8");
  await bootstrapDefaultCatalog(root, target);
  console.log("[ai-i18n] Created ai-i18n.config.json (postinstall) — edit sourceGlobs and locales as needed.");
  return true;
}

main()
  .then((showTips) => {
    if (!SKIP && showTips) printInstallHelp();
  })
  .catch((err) => {
    console.warn("[ai-i18n] postinstall could not create default config:", err.message);
  });

function printInstallHelp() {
  console.log(`
[ai-i18n] ─── Configure ─────────────────────────────────────────────
  ai-i18n.config.json → "provider": "openai" or "anthropic"

  OpenAI
    npm install openai
    OPENAI_API_KEY   use your platform secret (often starts with sk-, e.g. sk-proj-...)

  Anthropic
    npm install @anthropic-ai/sdk
    ANTHROPIC_API_KEY   console key (often starts with sk-ant-api03-...)

  Add keys to .env next to ai-i18n.config.json, or export them in your shell, then:
    npx ai-i18n generate

  This package does not install i18next — in your app run:
    npm install i18next react-i18next
────────────────────────────────────────────────────────────────────
`.trim());
}
