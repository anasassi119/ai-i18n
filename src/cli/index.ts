import { runDiff } from "./diff.js";
import { loadEnvFromProject } from "./env.js";
import { runGenerate } from "./generate.js";
import { runInit } from "./init.js";

function parseGenerateLocaleFlags(argv: string[]): string[] | undefined {
  const locales: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force" || a === "--sync-default-from-code") continue;
    if (a === "--locale") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("-")) {
        throw new Error("[ai-i18n] generate: expected a locale code after --locale (e.g. --locale de).");
      }
      locales.push(v);
    } else if (a.startsWith("--locale=")) {
      const v = a.slice("--locale=".length);
      if (!v || v.startsWith("-")) {
        throw new Error("[ai-i18n] generate: expected a value in --locale=<code> (e.g. --locale=de).");
      }
      locales.push(v);
    } else if (a.startsWith("-")) {
      throw new Error(`[ai-i18n] generate: unknown option ${a}`);
    }
  }
  return locales.length > 0 ? locales : undefined;
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  loadEnvFromProject(cwd);
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === "generate") {
    const argv = args.slice(1);
    const force = argv.includes("--force");
    const syncDefaultFromCode = argv.includes("--sync-default-from-code");
    let onlyLocales: string[] | undefined;
    try {
      onlyLocales = parseGenerateLocaleFlags(argv);
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
      return;
    }
    try {
      await runGenerate(cwd, { force, onlyLocales, syncDefaultFromCode });
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    }
    return;
  }

  if (cmd === "diff") {
    const addMissingToDefault = args.includes("--add-missing-default");
    const { ok } = await runDiff(cwd, { addMissingToDefault });
    if (!ok) process.exitCode = 1;
    return;
  }

  if (cmd === "init") {
    const argv = args.slice(1);
    const force = argv.includes("--force");
    const silent = argv.includes("--silent");
    const noInput = argv.includes("--no-input");
    let i18nOverride: string | undefined;
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === "--force" || a === "--silent" || a === "--no-input") continue;
      if (a === "--i18n") {
        const v = argv[++i];
        if (v === undefined || v.startsWith("-")) {
          console.error("[ai-i18n] init: expected a path after --i18n.");
          process.exitCode = 1;
          return;
        }
        i18nOverride = v;
      } else if (a.startsWith("--i18n=")) {
        const v = a.slice("--i18n=".length);
        if (!v || v.startsWith("-")) {
          console.error("[ai-i18n] init: expected a value in --i18n=<path>.");
          process.exitCode = 1;
          return;
        }
        i18nOverride = v;
      } else if (a.startsWith("-")) {
        console.error(`[ai-i18n] init: unknown option ${a}`);
        process.exitCode = 1;
        return;
      }
    }
    const useInteractive =
      Boolean(process.stdin.isTTY) && !silent && !force && i18nOverride === undefined && !noInput;
    try {
      if (useInteractive) {
        const { runInitInteractive } = await import("./initInteractive.js");
        await runInitInteractive(cwd, { force, silent });
      } else {
        await runInit(cwd, { force, silent, i18nOverride });
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    }
    return;
  }

  console.error(
    "Usage: ai-i18n init [--force] [--silent] [--no-input] [--i18n <path>] | ai-i18n generate [--force] [--sync-default-from-code] [--locale <code> ...] | ai-i18n diff [--add-missing-default]",
  );
  process.exitCode = 1;
}
main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
