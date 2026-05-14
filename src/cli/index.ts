import { runDiff } from "./diff.js";
import { loadEnvFromProject } from "./env.js";
import { runGenerate } from "./generate.js";
import { runInit } from "./init.js";

function parseGenerateLocaleFlags(argv: string[]): string[] | undefined {
  const locales: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") continue;
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
    let onlyLocales: string[] | undefined;
    try {
      onlyLocales = parseGenerateLocaleFlags(argv);
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
      return;
    }
    await runGenerate(cwd, { force, onlyLocales });
    return;
  }

  if (cmd === "diff") {
    const addMissingToDefault = args.includes("--add-missing-default");
    const { ok } = await runDiff(cwd, { addMissingToDefault });
    if (!ok) process.exitCode = 1;
    return;
  }

  if (cmd === "init") {
    const force = args.includes("--force");
    await runInit(cwd, { force });
    return;
  }

  console.error(
    "Usage: ai-i18n init [--force] | ai-i18n generate [--force] [--locale <code> ...] | ai-i18n diff [--add-missing-default]",
  );
  process.exitCode = 1;
}
main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
