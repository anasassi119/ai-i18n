import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { localeCatalogPathFromParts } from "./catalogLayout.js";
import { ensureTranslatorNotesFile } from "./translatorNotes.js";

function packageRootFromCli(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const normalized = here.replace(/\\/g, "/");
  if (normalized.endsWith("/dist")) {
    return path.resolve(here, "..");
  }
  return path.resolve(here, "..", "..");
}

export async function defaultConfigTemplatePath(): Promise<string> {
  return path.join(packageRootFromCli(), "templates", "ai-i18n.config.default.json");
}

/**
 * Ensures `translator-notes.json` and an empty default-locale catalog when missing.
 * Does not create or modify the `i18n` module — that file must exist for `loadConfig` / CLI commands.
 *
 * After a fresh `init`, `loadConfig` may fail until the user points `"i18n"` at their real file;
 * in that case we still scaffold flat `{localesDir}/en.json` (same as postinstall).
 */
export async function bootstrapDefaultCatalogIfNeeded(
  cwd: string,
  configPath: string,
  silent?: boolean,
): Promise<boolean> {
  if (path.resolve(cwd, "ai-i18n.config.json") !== path.resolve(configPath)) {
    return false;
  }

  let raw: string;
  try {
    raw = await readFile(configPath, "utf8");
  } catch {
    return false;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== "object") return false;
  const o = parsed as Record<string, unknown>;
  const localesDir = typeof o.localesDir === "string" ? o.localesDir : "locales";

  await ensureTranslatorNotesFile(cwd, localesDir);

  let fileAbs: string;
  try {
    const { config } = await loadConfig(cwd);
    fileAbs = localeCatalogPathFromParts(
      cwd,
      config.localesDir,
      config.defaultLocale,
      config.resourceFormat,
      config.resourceFormat === "i18next-namespace" ? config.namespace : undefined,
    );
  } catch {
    fileAbs = path.join(path.resolve(cwd, localesDir), "en.json");
  }

  if (await fileExists(fileAbs)) return false;
  await mkdir(path.dirname(fileAbs), { recursive: true });
  await writeFile(fileAbs, "{}\n", "utf8");
  if (!silent) {
    console.log(`[ai-i18n] Created ${path.relative(cwd, fileAbs)} (empty default catalog).`);
  }
  return true;
}

export async function runInit(
  cwd: string,
  options: { force?: boolean; silent?: boolean } = {},
): Promise<"created" | "skipped" | "overwritten"> {
  const target = path.join(cwd, "ai-i18n.config.json");
  const exists = await fileExists(target);
  if (exists && !options.force) {
    if (!options.silent) {
      console.log("[ai-i18n] ai-i18n.config.json already exists — skipped. Use `ai-i18n init --force` to replace.");
    }
    return "skipped";
  }

  const templatePath = await defaultConfigTemplatePath();
  const body = await readFile(templatePath, "utf8");

  await writeFile(target, body, "utf8");
  await bootstrapDefaultCatalogIfNeeded(cwd, target, options.silent);

  if (exists && options.force) {
    if (!options.silent) {
      console.log("[ai-i18n] Overwrote ai-i18n.config.json");
    }
    return "overwritten";
  }

  if (!options.silent) {
    console.log(
      "[ai-i18n] Created ai-i18n.config.json — set `i18n` to your i18next init module, then edit sourceGlobs and provider.",
    );
  }
  return "created";
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}
