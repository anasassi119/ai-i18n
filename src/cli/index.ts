import { runDiff } from "./diff.js";
import { runGenerate } from "./generate.js";
import { runInit } from "./init.js";

async function main(): Promise<void> {
  const cwd = process.cwd();
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === "generate") {
    const force = args.includes("--force");
    await runGenerate(cwd, force);
    return;
  }

  if (cmd === "diff") {
    await runDiff(cwd);
    return;
  }

  if (cmd === "init") {
    const force = args.includes("--force");
    await runInit(cwd, { force });
    return;
  }

  console.error("Usage: ai-i18n init [--force] | ai-i18n generate [--force] | ai-i18n diff");
  process.exitCode = 1;
}
main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
