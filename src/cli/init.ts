import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { localeJsonFilesForLocale } from "./catalogLayout.js";
import { loadConfig } from "./config.js";
import { discoverInit } from "./initDiscover.js";
import { translatorNotesPath } from "./translatorNotes.js";

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

export async function i18nStubTemplatePath(): Promise<string> {
  return path.join(packageRootFromCli(), "templates", "i18n.stub.ts");
}

function discoveryToWrittenFields(d: Awaited<ReturnType<typeof discoverInit>>): Record<string, unknown> {
  const o: Record<string, unknown> = {
    i18n: d.i18n,
    localesDir: d.localesDir,
    sourceGlobs: d.sourceGlobs,
  };
  if (d.resourceFormat !== "flat") {
    o.resourceFormat = d.resourceFormat;
  }
  if (d.namespaces !== undefined && d.namespaces.length > 0) {
    o.namespaces = d.namespaces;
  } else if (d.namespace !== undefined && d.namespace.length > 0) {
    o.namespace = d.namespace;
  }
  if (d.localeShape === "nested") {
    o.localeShape = "nested";
  }
  return o;
}

/** Short reminder after successful `init` (provider, keys, diff / generate). */
export function printInitNextSteps(): void {
  console.log(
    [
      "[ai-i18n] Next: set `provider` in ai-i18n.config.json, add API keys to `.env`, install `openai` or `@anthropic-ai/sdk`, then run:",
      "    npx ai-i18n diff",
      "    npx ai-i18n generate",
      "  (This package does not install i18next — add i18next / react-i18next in your app.)",
    ].join("\n"),
  );
}

/**
 * When the default locale catalog files are all missing, create empty JSON and
 * `translator-notes.json`. Skips when `src/{localesDir}` exists as a directory while
 * `localesDir` is a single segment (avoids duplicate trees under the project root).
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

  const posix = localesDir.replace(/\\/g, "/");
  if (!posix.startsWith("src/")) {
    const srcLocalesAbs = path.resolve(cwd, "src", localesDir);
    if (await isDirectory(srcLocalesAbs)) {
      return false;
    }
  }

  let files: { path: string }[];
  try {
    const { config } = await loadConfig(cwd);
    files = localeJsonFilesForLocale(cwd, config, config.defaultLocale);
  } catch {
    files = [{ path: path.join(path.resolve(cwd, localesDir), "en.json") }];
  }

  const allMissing = (await Promise.all(files.map((f) => fileExists(f.path)))).every((x) => !x);
  if (!allMissing) {
    return false;
  }

  const notesAbs = translatorNotesPath(cwd, localesDir);
  if (!(await fileExists(notesAbs))) {
    await mkdir(path.dirname(notesAbs), { recursive: true });
    await writeFile(notesAbs, "{}\n", "utf8");
    if (!silent) {
      console.log(`[ai-i18n] Created ${path.relative(cwd, notesAbs)} (translator notes).`);
    }
  }

  let created = false;
  for (const { path: fileAbs } of files) {
    if (await fileExists(fileAbs)) continue;
    await mkdir(path.dirname(fileAbs), { recursive: true });
    await writeFile(fileAbs, "{}\n", "utf8");
    created = true;
  }
  if (created && !silent) {
    console.log(
      `[ai-i18n] Created default locale catalog(s): ${files.map((f) => path.relative(cwd, f.path)).join(", ")} (empty).`,
    );
  }
  return created;
}

export async function runInit(
  cwd: string,
  options: { force?: boolean; silent?: boolean; i18nOverride?: string } = {},
): Promise<"created" | "skipped" | "overwritten"> {
  const target = path.join(cwd, "ai-i18n.config.json");
  const exists = await fileExists(target);
  if (exists && !options.force) {
    if (!options.silent) {
      console.log("[ai-i18n] ai-i18n.config.json already exists — skipped. Use `ai-i18n init --force` to replace.");
    }
    return "skipped";
  }

  const discovery = await discoverInit(cwd, { i18nOverride: options.i18nOverride });
  const templatePath = await defaultConfigTemplatePath();
  const templateRaw = await readFile(templatePath, "utf8");
  const template = JSON.parse(templateRaw) as Record<string, unknown>;
  const merged = { ...template, ...discoveryToWrittenFields(discovery) };

  await writeFile(target, JSON.stringify(merged, null, 2) + "\n", "utf8");

  if (!discovery.hadDefaultCatalogOnDisk) {
    await bootstrapDefaultCatalogIfNeeded(cwd, target, options.silent);
  }

  if (exists && options.force) {
    if (!options.silent) {
      console.log("[ai-i18n] Overwrote ai-i18n.config.json");
    }
    if (!options.silent) printInitNextSteps();
    return "overwritten";
  }

  if (!options.silent) {
    console.log("[ai-i18n] Created ai-i18n.config.json from project discovery.");
    printInitNextSteps();
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

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}
