import { readFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import * as parser from "@babel/parser";
import traverseImport from "@babel/traverse";
import * as t from "@babel/types";

const traverse: typeof import("@babel/traverse").default =
  typeof traverseImport === "function"
    ? (traverseImport as typeof import("@babel/traverse").default)
    : (traverseImport as { default: typeof import("@babel/traverse").default }).default;

export interface ScanResult {
  /** Keys observed in `t('key')` calls with string literal keys. */
  keysInCode: Set<string>;
  /** Static `hint` values from `t('key', { hint: '...' })`. */
  hints: Record<string, string>;
}

export async function scanSources(
  cwd: string,
  sourceGlobs: string[],
): Promise<ScanResult> {
  const keysInCode = new Set<string>();
  const hints: Record<string, string> = {};

  const files = await fg(sourceGlobs, { cwd, absolute: true, onlyFiles: true });
  for (const file of files) {
    const code = await readFile(file, "utf8");
    let ast: parser.ParseResult<t.File>;
    try {
      ast = parser.parse(code, {
        sourceType: "unambiguous",
        plugins: ["typescript", "jsx"],
        errorRecovery: true,
      });
    } catch {
      continue;
    }

    traverse(ast, {
      CallExpression(callPath) {
        const callee = callPath.node.callee;
        if (!t.isIdentifier(callee) || callee.name !== "t") return;
        const args = callPath.node.arguments;
        if (args.length < 1) return;
        const keyArg = args[0];
        if (!t.isStringLiteral(keyArg)) return;
        const key = keyArg.value;
        keysInCode.add(key);

        const opts = args[1];
        if (!opts || !t.isObjectExpression(opts)) return;
        for (const prop of opts.properties) {
          if (!t.isObjectProperty(prop) || prop.computed) continue;
          const name = t.isIdentifier(prop.key)
            ? prop.key.name
            : t.isStringLiteral(prop.key)
              ? prop.key.value
              : null;
          if (name !== "hint") continue;
          if (t.isStringLiteral(prop.value)) {
            hints[key] = prop.value.value;
          }
        }
      },
    });
  }

  return { keysInCode, hints };
}

export async function writeHintsFile(
  cacheDir: string,
  hints: Record<string, string>,
): Promise<void> {
  await fs.promises.mkdir(cacheDir, { recursive: true });
  const p = path.join(cacheDir, ".ai-i18n-hints.json");
  await fs.promises.writeFile(p, JSON.stringify({ hints }, null, 2) + "\n", "utf8");
}
