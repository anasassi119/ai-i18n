import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
