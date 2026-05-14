import { readFile } from "node:fs/promises";
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
}

export async function scanSources(
  cwd: string,
  sourceGlobs: string[],
): Promise<ScanResult> {
  const keysInCode = new Set<string>();

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
        keysInCode.add(keyArg.value);
      },
    });
  }

  return { keysInCode };
}
