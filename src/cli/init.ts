import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ResourceFormat } from "./config.js";
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

/** Ensures `{catalogDir}/{defaultLocale}.json` exists (empty `{}`) when missing; reads paths from config. */
export async function bootstrapDefaultCatalogIfNeeded(
  cwd: string,
  configPath: string,
  silent?: boolean,
): Promise<boolean> {
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
  const catalogDir = typeof o.catalogDir === "string" ? o.catalogDir : "locales";
  const defaultLocale = typeof o.defaultLocale === "string" ? o.defaultLocale : "en";
  const resourceFormatRaw = o.resourceFormat;
  let resourceFormat: ResourceFormat | undefined;
  if (resourceFormatRaw === "flat" || resourceFormatRaw === "i18next-namespace") {
    resourceFormat = resourceFormatRaw;
  } else if (resourceFormatRaw !== undefined && resourceFormatRaw !== null) {
    return false;
  }
  const namespaceRaw = o.namespace;
  const namespace =
    typeof namespaceRaw === "string" && namespaceRaw.trim() !== "" ? namespaceRaw.trim() : undefined;

  await ensureTranslatorNotesFile(cwd, catalogDir);

  const fileAbs = localeCatalogPathFromParts(
    cwd,
    catalogDir,
    defaultLocale,
    resourceFormat,
    resourceFormat === "i18next-namespace" ? namespace : undefined,
  );
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
    console.log("[ai-i18n] Created ai-i18n.config.json — edit sourceGlobs, locales, and provider.");
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
