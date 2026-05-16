import { readFile } from "node:fs/promises";
import fg from "fast-glob";
import * as parser from "@babel/parser";
import traverseImport from "@babel/traverse";
import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import type { AitConfig } from "./config.js";
import { effectiveNamespaceList } from "./catalogLayout.js";

const traverse: typeof import("@babel/traverse").default =
  typeof traverseImport === "function"
    ? (traverseImport as typeof import("@babel/traverse").default)
    : (traverseImport as { default: typeof import("@babel/traverse").default }).default;

export type ScannedKey = { logicalKey: string; defaultText?: string };

export interface ScanResult {
  keysInCode: Set<string>;
  scannedKeys: Map<string, ScannedKey>;
}

export type ScanContext = {
  activeNamespaces: string[] | undefined;
  multiNamespace: boolean;
};

export function scanContextFromConfig(config: AitConfig): ScanContext {
  const nss = effectiveNamespaceList(config);
  const multiNamespace = nss !== undefined && nss.length > 1;
  return { activeNamespaces: nss, multiNamespace };
}

type HookBinding = { namespace: string; keyPrefix: string };

const defaultTextConflictWarned = new Set<string>();

function bindingNamesFromPattern(id: t.LVal): string[] {
  if (t.isIdentifier(id)) return [id.name];
  if (t.isObjectPattern(id)) {
    const out: string[] = [];
    for (const prop of id.properties) {
      if (!t.isObjectProperty(prop) || prop.computed) continue;
      const val = prop.value;
      if (!t.isIdentifier(val)) continue;
      out.push(val.name);
    }
    return out;
  }
  if (t.isArrayPattern(id)) {
    const out: string[] = [];
    for (const el of id.elements) {
      if (!el) continue;
      if (t.isIdentifier(el)) out.push(el.name);
    }
    return out;
  }
  return [];
}

function isUseTranslationCall(call: t.CallExpression): boolean {
  return t.isIdentifier(call.callee) && call.callee.name === "useTranslation";
}

function namespaceFromUseTranslationCall(call: t.CallExpression): string {
  const a0 = call.arguments[0];
  if (t.isStringLiteral(a0)) return a0.value;
  return "translation";
}

function keyPrefixFromUseTranslationCall(call: t.CallExpression): string {
  const a1 = call.arguments[1];
  if (!a1 || !t.isObjectExpression(a1)) return "";
  for (const prop of a1.properties) {
    if (!t.isObjectProperty(prop) || prop.computed) continue;
    const name = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null;
    if (name !== "keyPrefix") continue;
    if (t.isStringLiteral(prop.value)) {
      const s = prop.value.value;
      if (!s) return "";
      return s.endsWith(".") ? s : `${s}.`;
    }
  }
  return "";
}

function resolveLogicalKey(
  rawKey: string,
  hook: HookBinding | undefined,
  ctx: ScanContext | undefined,
): string {
  if (rawKey.includes(":")) {
    return rawKey;
  }
  const nss = ctx?.activeNamespaces;
  const multi = ctx?.multiNamespace ?? false;
  const singleNs = nss !== undefined && nss.length === 1 ? nss[0]! : undefined;

  const keyPrefix = hook?.keyPrefix ?? "";
  const inner = keyPrefix ? `${keyPrefix}${rawKey}` : rawKey;

  if (!hook) {
    return inner;
  }

  const hookNs = hook.namespace;

  if (!multi) {
    if (singleNs !== undefined && hookNs === singleNs) {
      return inner;
    }
    if (singleNs !== undefined && hookNs !== singleNs) {
      return `${hookNs}:${inner}`;
    }
    return inner;
  }

  return `${hookNs}:${inner}`;
}

/** Static defaultValue from i18next `t(key, default)` or `t(key, { defaultValue: '…' })`. */
export function defaultTextFromTCall(args: t.Node[]): string | undefined {
  const a1 = args[1];
  if (a1 === undefined) return undefined;
  if (t.isStringLiteral(a1)) return a1.value;
  if (!t.isObjectExpression(a1)) return undefined;
  for (const prop of a1.properties) {
    if (!t.isObjectProperty(prop) || prop.computed) continue;
    const name = t.isIdentifier(prop.key)
      ? prop.key.name
      : t.isStringLiteral(prop.key)
        ? prop.key.value
        : null;
    if (name !== "defaultValue") continue;
    if (t.isStringLiteral(prop.value)) return prop.value.value;
  }
  return undefined;
}

function mergeScannedKey(
  scannedKeys: Map<string, ScannedKey>,
  logicalKey: string,
  defaultText: string | undefined,
): void {
  const existing = scannedKeys.get(logicalKey);
  if (!existing) {
    scannedKeys.set(
      logicalKey,
      defaultText !== undefined ? { logicalKey, defaultText } : { logicalKey },
    );
    return;
  }
  if (defaultText === undefined) return;
  if (existing.defaultText === undefined) {
    existing.defaultText = defaultText;
    return;
  }
  if (existing.defaultText === defaultText) return;
  existing.defaultText = undefined;
  if (!defaultTextConflictWarned.has(logicalKey)) {
    defaultTextConflictWarned.add(logicalKey);
    console.warn(
      `[ai-i18n] Conflicting defaultValue for key "${logicalKey}" in scanned files — omitting default text for this key.`,
    );
  }
}

function skipNestedFunctions(inner: NodePath<t.Node>): void {
  if (
    inner.isFunctionDeclaration() ||
    inner.isFunctionExpression() ||
    inner.isArrowFunctionExpression()
  ) {
    inner.skip();
  }
}

function applyUseTranslationDecl(decl: t.VariableDeclarator, hooks: Map<string, HookBinding>): void {
  if (!decl.init || !t.isCallExpression(decl.init) || !isUseTranslationCall(decl.init)) return;
  if (!t.isLVal(decl.id)) return;
  const ns = namespaceFromUseTranslationCall(decl.init);
  const keyPrefix = keyPrefixFromUseTranslationCall(decl.init);
  for (const name of bindingNamesFromPattern(decl.id)) {
    hooks.set(name, { namespace: ns, keyPrefix });
  }
}

function collectCallsInSubtree(
  rootPath: NodePath<t.Node>,
  hooks: Map<string, HookBinding>,
  ctx: ScanContext | undefined,
  keys: Set<string>,
  scannedKeys: Map<string, ScannedKey>,
): void {
  rootPath.traverse({
    FunctionDeclaration: skipNestedFunctions,
    FunctionExpression: skipNestedFunctions,
    ArrowFunctionExpression: skipNestedFunctions,
    CallExpression(callPath) {
      const callee = callPath.node.callee;
      if (!t.isIdentifier(callee)) return;
      const hook = hooks.get(callee.name);
      if (hook === undefined && callee.name !== "t") return;
      const arg0 = callPath.node.arguments[0];
      if (!t.isStringLiteral(arg0)) return;
      const logicalKey = resolveLogicalKey(arg0.value, hook, ctx);
      keys.add(logicalKey);
      mergeScannedKey(scannedKeys, logicalKey, defaultTextFromTCall(callPath.node.arguments));
    },
  });
}

function cloneHooks(hooks: Map<string, HookBinding>): Map<string, HookBinding> {
  return new Map(hooks);
}

function walkBlock(
  blockPath: NodePath<t.BlockStatement>,
  hooks: Map<string, HookBinding>,
  ctx: ScanContext | undefined,
  keys: Set<string>,
  scannedKeys: Map<string, ScannedKey>,
): void {
  for (const stmtPath of blockPath.get("body")) {
    if (stmtPath.isVariableDeclaration()) {
      for (const decl of stmtPath.node.declarations) {
        applyUseTranslationDecl(decl, hooks);
      }
      collectCallsInSubtree(stmtPath, hooks, ctx, keys, scannedKeys);
      continue;
    }
    if (stmtPath.isBlockStatement()) {
      walkBlock(stmtPath, cloneHooks(hooks), ctx, keys, scannedKeys);
      continue;
    }
    if (stmtPath.isIfStatement()) {
      const ifStmt = stmtPath.node;
      if (t.isBlockStatement(ifStmt.consequent)) {
        walkBlock(stmtPath.get("consequent") as NodePath<t.BlockStatement>, cloneHooks(hooks), ctx, keys, scannedKeys);
      } else {
        collectCallsInSubtree(stmtPath.get("consequent") as NodePath<t.Node>, hooks, ctx, keys, scannedKeys);
      }
      if (ifStmt.alternate) {
        if (t.isBlockStatement(ifStmt.alternate)) {
          walkBlock(stmtPath.get("alternate") as NodePath<t.BlockStatement>, cloneHooks(hooks), ctx, keys, scannedKeys);
        } else if (t.isIfStatement(ifStmt.alternate)) {
          walkIfChain(stmtPath.get("alternate") as NodePath<t.IfStatement>, hooks, ctx, keys, scannedKeys);
        } else {
          collectCallsInSubtree(stmtPath.get("alternate") as NodePath<t.Node>, hooks, ctx, keys, scannedKeys);
        }
      }
      continue;
    }
    if (stmtPath.isWhileStatement() || stmtPath.isDoWhileStatement()) {
      const bodyPath = stmtPath.get("body") as NodePath<t.Statement>;
      if (bodyPath.isBlockStatement()) walkBlock(bodyPath, cloneHooks(hooks), ctx, keys, scannedKeys);
      else collectCallsInSubtree(bodyPath, hooks, ctx, keys, scannedKeys);
      continue;
    }
    if (stmtPath.isForStatement()) {
      const initPath = stmtPath.get("init") as NodePath<t.ForStatement["init"]>;
      if (!Array.isArray(initPath) && initPath.node && initPath.isVariableDeclaration()) {
        for (const decl of initPath.node.declarations) applyUseTranslationDecl(decl, hooks);
      }
      const bodyPath = stmtPath.get("body") as NodePath<t.Statement>;
      if (bodyPath.isBlockStatement()) walkBlock(bodyPath, cloneHooks(hooks), ctx, keys, scannedKeys);
      else collectCallsInSubtree(bodyPath, hooks, ctx, keys, scannedKeys);
      continue;
    }
    if (stmtPath.isForOfStatement() || stmtPath.isForInStatement()) {
      const leftPath = stmtPath.get("left") as NodePath<t.VariableDeclaration | t.LVal>;
      if (!Array.isArray(leftPath) && leftPath.isVariableDeclaration()) {
        for (const decl of leftPath.node.declarations) applyUseTranslationDecl(decl, hooks);
      }
      const bodyPath = stmtPath.get("body") as NodePath<t.Statement>;
      if (bodyPath.isBlockStatement()) walkBlock(bodyPath, cloneHooks(hooks), ctx, keys, scannedKeys);
      else collectCallsInSubtree(bodyPath, hooks, ctx, keys, scannedKeys);
      continue;
    }
    if (stmtPath.isTryStatement()) {
      const tryStmt = stmtPath.node;
      walkBlock(stmtPath.get("block") as NodePath<t.BlockStatement>, cloneHooks(hooks), ctx, keys, scannedKeys);
      if (tryStmt.handler?.body) {
        walkBlock(stmtPath.get("handler").get("body") as NodePath<t.BlockStatement>, cloneHooks(hooks), ctx, keys, scannedKeys);
      }
      if (tryStmt.finalizer) {
        walkBlock(stmtPath.get("finalizer") as NodePath<t.BlockStatement>, cloneHooks(hooks), ctx, keys, scannedKeys);
      }
      continue;
    }
    collectCallsInSubtree(stmtPath as NodePath<t.Node>, hooks, ctx, keys, scannedKeys);
  }
}

function walkIfChain(
  ifPath: NodePath<t.IfStatement>,
  hooks: Map<string, HookBinding>,
  ctx: ScanContext | undefined,
  keys: Set<string>,
  scannedKeys: Map<string, ScannedKey>,
): void {
  const node = ifPath.node;
  if (t.isBlockStatement(node.consequent)) {
    walkBlock(ifPath.get("consequent") as NodePath<t.BlockStatement>, cloneHooks(hooks), ctx, keys, scannedKeys);
  } else {
    collectCallsInSubtree(ifPath.get("consequent") as NodePath<t.Node>, hooks, ctx, keys, scannedKeys);
  }
  if (node.alternate) {
    if (t.isIfStatement(node.alternate)) {
      walkIfChain(ifPath.get("alternate") as NodePath<t.IfStatement>, hooks, ctx, keys, scannedKeys);
    } else if (t.isBlockStatement(node.alternate)) {
      walkBlock(ifPath.get("alternate") as NodePath<t.BlockStatement>, cloneHooks(hooks), ctx, keys, scannedKeys);
    } else {
      collectCallsInSubtree(ifPath.get("alternate") as NodePath<t.Node>, hooks, ctx, keys, scannedKeys);
    }
  }
}

function walkProgramSurface(
  programPath: NodePath<t.Program>,
  ctx: ScanContext | undefined,
  keys: Set<string>,
  scannedKeys: Map<string, ScannedKey>,
): void {
  const hooks = new Map<string, HookBinding>();
  for (const stmtPath of programPath.get("body")) {
    if (stmtPath.isFunctionDeclaration()) continue;
    if (stmtPath.isExportNamedDeclaration() && stmtPath.node.declaration?.type === "FunctionDeclaration") {
      continue;
    }
    if (stmtPath.isExportDefaultDeclaration()) {
      const d = stmtPath.get("declaration");
      if (d.isFunctionDeclaration() || d.isFunctionExpression() || d.isArrowFunctionExpression()) continue;
    }
    if (stmtPath.isVariableDeclaration()) {
      for (const decl of stmtPath.node.declarations) applyUseTranslationDecl(decl, hooks);
      collectCallsInSubtree(stmtPath, hooks, ctx, keys, scannedKeys);
      continue;
    }
    collectCallsInSubtree(stmtPath as NodePath<t.Node>, hooks, ctx, keys, scannedKeys);
  }
}

function walkAnyFunction(
  fnPath: NodePath<t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression>,
  ctx: ScanContext | undefined,
  keys: Set<string>,
  scannedKeys: Map<string, ScannedKey>,
): void {
  const body = fnPath.get("body") as NodePath<t.BlockStatement | t.Expression>;
  if (body.isBlockStatement()) {
    walkBlock(body, new Map(), ctx, keys, scannedKeys);
  } else if (body.node) {
    collectCallsInSubtree(body as NodePath<t.Node>, new Map(), ctx, keys, scannedKeys);
  }
}

export async function scanSources(
  cwd: string,
  sourceGlobs: string[],
  context?: ScanContext,
): Promise<ScanResult> {
  defaultTextConflictWarned.clear();
  const keysInCode = new Set<string>();
  const scannedKeys = new Map<string, ScannedKey>();

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
      Program(path) {
        walkProgramSurface(path, context, keysInCode, scannedKeys);
      },
      FunctionDeclaration(path) {
        walkAnyFunction(path, context, keysInCode, scannedKeys);
      },
      FunctionExpression(path) {
        walkAnyFunction(path, context, keysInCode, scannedKeys);
      },
      ArrowFunctionExpression(path) {
        walkAnyFunction(path, context, keysInCode, scannedKeys);
      },
      ClassMethod(path) {
        const body = path.get("body");
        if (body.isBlockStatement()) walkBlock(body, new Map(), context, keysInCode, scannedKeys);
      },
    });
  }

  return { keysInCode, scannedKeys };
}
