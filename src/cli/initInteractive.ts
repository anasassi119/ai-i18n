import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import {
  bootstrapDefaultCatalogIfNeeded,
  defaultConfigTemplatePath,
  i18nStubTemplatePath,
  printInitNextSteps,
} from "./init.js";
import {
  buildSourceGlobs,
  inferCatalogLayoutFromLocalesDir,
  listExtractableI18nCandidates,
} from "./initDiscover.js";
import { tryExtractI18nInitFromFile } from "./i18nInitExtract.js";

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function toPosixRel(cwd: string, abs: string): string {
  return path.relative(cwd, path.resolve(abs)).split(path.sep).join("/");
}

/** Normalize user absolute path to project-relative POSIX for config JSON. */
export function absolutePathToConfigRel(cwd: string, userPath: string): string {
  const trimmed = userPath.trim();
  const abs = path.isAbsolute(trimmed) ? path.normalize(trimmed) : path.resolve(cwd, trimmed);
  return toPosixRel(cwd, abs);
}

async function askLine(rl: ReturnType<typeof createInterface>, prompt: string): Promise<string> {
  const s = await rl.question(prompt);
  return typeof s === "string" ? s.trim() : "";
}

export type RunInitInteractiveOptions = {
  force?: boolean;
  silent?: boolean;
};

/**
 * Interactive `init`: absolute locales dir (traversed for layout), optional absolute i18n path (blank = omit `i18n`).
 */
export async function runInitInteractive(
  cwd: string,
  options: RunInitInteractiveOptions = {},
): Promise<"created" | "skipped" | "overwritten"> {
  const silent = options.silent ?? false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    const target = path.join(cwd, "ai-i18n.config.json");
    const exists = await fileExists(target);
    if (exists && !options.force) {
      const ans = await askLine(rl, "[ai-i18n] ai-i18n.config.json exists. Replace it? [y/N] ");
      if (ans.toLowerCase() !== "y" && ans.toLowerCase() !== "yes") {
        if (!silent) console.log("[ai-i18n] init: left existing ai-i18n.config.json unchanged.");
        return "skipped";
      }
    }

    if (!silent) {
      console.log(
        [
          "[ai-i18n] Interactive init (project root = cwd):",
          "  1) Absolute path to your locales directory (folder with *.json per locale or per-locale subfolders).",
          "  2) Absolute path to your i18next init module — or press Enter to omit `i18n` from config.",
          "",
        ].join("\n"),
      );
      const hints = await listExtractableI18nCandidates(cwd);
      if (hints.length > 0) {
        console.log("[ai-i18n] Init modules found under src/ / app/ / lib/ (for reference):");
        for (let i = 0; i < Math.min(hints.length, 12); i++) {
          const h = hints[i]!;
          console.log(`  ${i + 1}. ${h.rel}  (defaultLocale=${h.defaultLocale})`);
        }
        if (hints.length > 12) console.log(`  … and ${hints.length - 12} more`);
        console.log("");
      }
    }

    let localesAbs = "";
    while (true) {
      localesAbs = await askLine(rl, "Locales directory (absolute path): ");
      if (!localesAbs) {
        if (!silent) console.log("[ai-i18n] Path is required.");
        continue;
      }
      const resolved = path.isAbsolute(localesAbs) ? path.normalize(localesAbs) : path.resolve(cwd, localesAbs);
      try {
        if (!(await stat(resolved)).isDirectory()) {
          if (!silent) console.log("[ai-i18n] Not a directory. Try again.");
          continue;
        }
      } catch {
        if (!silent) console.log("[ai-i18n] Path not found. Try again.");
        continue;
      }
      localesAbs = resolved;
      break;
    }

    let layout = await inferCatalogLayoutFromLocalesDir(localesAbs, cwd);
    if (layout.ambiguous && layout.flatLocaleCodes?.length && layout.namespaceLocaleCodes?.length) {
      if (!silent) {
        console.log(
          "[ai-i18n] This folder has both root locale *.json files and per-locale subfolders with JSON — ambiguous layout.",
        );
        console.log(`  Flat locales from files: ${layout.flatLocaleCodes.join(", ")}`);
        console.log(`  Namespace locale dirs: ${layout.namespaceLocaleCodes.join(", ")}`);
      }
      let choice = "";
      while (choice !== "1" && choice !== "2") {
        choice = await askLine(rl, "Choose layout: [1] flat (root *.json)  [2] i18next-namespace (subdirs): ");
      }
      layout = await inferCatalogLayoutFromLocalesDir(localesAbs, cwd, choice === "1" ? "flat" : "namespace");
    }

    if (!silent) {
      console.log(
        [
          "[ai-i18n] Inferred layout:",
          `  localesDir (relative): ${layout.localesDirRel}`,
          `  resourceFormat: ${layout.resourceFormat}`,
          `  defaultLocale: ${layout.defaultLocale}`,
          `  locales: ${layout.locales.join(", ") || "(none — empty folder)"}`,
          `  localeShape: ${layout.localeShape}`,
          layout.namespace ? `  namespace: ${layout.namespace}` : "",
          layout.namespaces?.length ? `  namespaces: ${layout.namespaces.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    let i18nRel: string | undefined;
    const i18nAns = await askLine(rl, "i18n module file (absolute path, or Enter to skip): ");
    let stubI18n = false;
    let i18nAbsResolved = "";
    if (i18nAns) {
      i18nAbsResolved = path.isAbsolute(i18nAns) ? path.normalize(i18nAns) : path.resolve(cwd, i18nAns);
      let fileOk = false;
      try {
        fileOk = (await stat(i18nAbsResolved)).isFile();
      } catch {
        fileOk = false;
      }
      if (fileOk) {
        const ext = await tryExtractI18nInitFromFile(i18nAbsResolved);
        if (!ext) {
          if (!silent) {
            console.log(
              "[ai-i18n] Could not parse i18next init() from that file — omitting i18n unless you scaffold a stub.",
            );
          }
          const stub = await askLine(rl, "Overwrite this file with a minimal i18n stub? [y/N] ");
          stubI18n = stub.toLowerCase() === "y" || stub.toLowerCase() === "yes";
        } else {
          i18nRel = toPosixRel(cwd, i18nAbsResolved);
          const diskLocales = new Set(layout.locales);
          const initLocales = new Set(ext.locales);
          const mismatch = [...initLocales].filter((l) => !diskLocales.has(l)).length > 0;
          if (mismatch && !silent) {
            console.log(
              `[ai-i18n] Note: init() locales [${[...initLocales].sort().join(", ")}] differ from disk [${[...diskLocales].sort().join(", ")}]. Using disk-derived layout for catalogs.`,
            );
          }
        }
      } else {
        const stub = await askLine(rl, "File does not exist. Create it with a minimal i18n stub? [y/N] ");
        stubI18n = stub.toLowerCase() === "y" || stub.toLowerCase() === "yes";
      }
    }

    if (stubI18n && i18nAbsResolved) {
      const stubPath = await i18nStubTemplatePath();
      const stubBody = await readFile(stubPath, "utf8");
      await mkdir(path.dirname(i18nAbsResolved), { recursive: true });
      await writeFile(i18nAbsResolved, stubBody, "utf8");
      i18nRel = toPosixRel(cwd, i18nAbsResolved);
      if (!silent) console.log(`[ai-i18n] Wrote stub i18n module: ${path.relative(cwd, i18nAbsResolved)}`);
    }

    const templatePath = await defaultConfigTemplatePath();
    const templateRaw = await readFile(templatePath, "utf8");
    const template = JSON.parse(templateRaw) as Record<string, unknown>;
    const sourceGlobs = await buildSourceGlobs(cwd);

    const merged: Record<string, unknown> = {
      ...template,
      localesDir: layout.localesDirRel,
      sourceGlobs,
      defaultLocale: layout.defaultLocale,
      locales: layout.locales.length > 0 ? layout.locales : ["en"],
      /** Always set so loadConfig does not re-derive `resourceFormat` from `i18n` AST (nested `resources` → i18next-namespace would override flat on-disk layout). */
      resourceFormat: layout.resourceFormat,
      ...(layout.namespace !== undefined && layout.namespaces === undefined ? { namespace: layout.namespace } : {}),
      ...(layout.namespaces !== undefined ? { namespaces: layout.namespaces } : {}),
      /** Always set when inferred nested so JSON stays self-consistent with disk; flat is the default when omitted in AitConfig but writing it avoids ambiguity. */
      localeShape: layout.localeShape,
    };
    if (i18nRel) merged.i18n = i18nRel;
    else delete merged.i18n;

    await writeFile(target, JSON.stringify(merged, null, 2) + "\n", "utf8");

    const hadCatalogs =
      layout.locales.length > 0 &&
      (await fileExists(
        layout.resourceFormat === "flat"
          ? path.join(localesAbs, `${layout.defaultLocale}.json`)
          : path.join(
              localesAbs,
              layout.defaultLocale,
              `${layout.namespaces?.[0] ?? layout.namespace ?? "translation"}.json`,
            ),
      ));
    if (!hadCatalogs) {
      await bootstrapDefaultCatalogIfNeeded(cwd, target, silent);
    }

    if (!silent) {
      console.log(`[ai-i18n] Wrote ${path.relative(cwd, target)}`);
      if (!i18nRel) {
        console.log(
          "[ai-i18n] No `i18n` entry — set \"defaultLocale\", \"locales\", and layout fields explicitly; add \"i18n\" later if you want init-derived hints.",
        );
      }
      printInitNextSteps();
    }

    return exists ? "overwritten" : "created";
  } finally {
    rl.close();
  }
}
