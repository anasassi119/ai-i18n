import { readFile } from "node:fs/promises";
import * as parser from "@babel/parser";
import traverseImport from "@babel/traverse";
import * as t from "@babel/types";
import type { ResourceFormat } from "./config.js";

const traverse: typeof import("@babel/traverse").default =
  typeof traverseImport === "function"
    ? (traverseImport as typeof import("@babel/traverse").default)
    : (traverseImport as { default: typeof import("@babel/traverse").default }).default;

export interface I18nInitExtraction {
  defaultLocale: string;
  locales: string[];
  resourceFormat: ResourceFormat;
  namespace: string;
}

/** `const x = { … }` / `['a','b']` bindings we can follow into `.init(x)` in the same file. */
type LiteralBindings = {
  objects: Map<string, t.ObjectExpression>;
  arrays: Map<string, t.ArrayExpression>;
};

function unwrapExpressionDeep(node: t.Expression): t.Expression {
  let cur: t.Node = node;
  while (
    t.isTSAsExpression(cur) ||
    t.isTSSatisfiesExpression(cur) ||
    t.isParenthesizedExpression(cur)
  ) {
    cur = (cur as t.TSAsExpression | t.TSSatisfiesExpression | t.ParenthesizedExpression).expression;
  }
  return cur as t.Expression;
}

/** Static string from `lng`, `fallbackLng`, etc.: literals, `as const`, no-substitution templates. */
function expressionToStaticString(expr: t.Expression | undefined): string | undefined {
  if (!expr) return undefined;
  const e = unwrapExpressionDeep(expr);
  if (t.isStringLiteral(e)) return e.value;
  if (t.isTemplateLiteral(e) && e.expressions.length === 0 && e.quasis.length === 1) {
    const c = e.quasis[0]?.value.cooked;
    if (c !== undefined && c.length > 0) return c;
  }
  return undefined;
}

function getObjectStringProp(obj: t.ObjectExpression, name: string): string | undefined {
  for (const prop of obj.properties) {
    if (!t.isObjectProperty(prop) || prop.computed) continue;
    const key = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null;
    if (key !== name) continue;
    const s = expressionToStaticString(prop.value as t.Expression);
    if (s !== undefined) return s;
    return undefined;
  }
  return undefined;
}

function getObjectPropValue(obj: t.ObjectExpression, name: string): t.Expression | undefined {
  for (const prop of obj.properties) {
    if (!t.isObjectProperty(prop) || prop.computed) continue;
    const key = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null;
    if (key !== name) continue;
    return prop.value as t.Expression;
  }
  return undefined;
}

function stringLiteralsFromArray(node: t.ArrayExpression): string[] | null {
  const out: string[] = [];
  for (const el of node.elements) {
    if (el === null) continue;
    if (t.isStringLiteral(el)) {
      out.push(el.value);
      continue;
    }
    const fromTpl = t.isTemplateLiteral(el) && el.expressions.length === 0 && el.quasis.length === 1;
    if (fromTpl) {
      const c = (el as t.TemplateLiteral).quasis[0]?.value.cooked;
      if (c !== undefined && c.length > 0) {
        out.push(c);
        continue;
      }
    }
    return null;
  }
  return out;
}

function localesFromFallbackLng(node: t.Expression): string[] | null {
  const u = unwrapExpressionDeep(node);
  const single = expressionToStaticString(u);
  if (single !== undefined) return [single];
  if (t.isArrayExpression(u)) return stringLiteralsFromArray(u);
  return null;
}

function localesFromResourcesKeys(node: t.ObjectExpression): string[] | null {
  const out: string[] = [];
  for (const prop of node.properties) {
    if (!t.isObjectProperty(prop) || prop.computed) continue;
    if (t.isIdentifier(prop.key)) out.push(prop.key.name);
    else if (t.isStringLiteral(prop.key)) out.push(prop.key.value);
    else return null;
  }
  return out.length ? out : null;
}

/** Per-locale `resources[lang]` value: flat catalog vs namespace map vs empty. */
function classifyLocaleResourceValue(inner: t.ObjectExpression): "flat" | "nested" | "empty" {
  if (inner.properties.length === 0) return "empty";
  for (const prop of inner.properties) {
    if (!t.isObjectProperty(prop) || prop.computed) return "nested";
    if (t.isObjectExpression(prop.value)) return "nested";
    if (t.isStringLiteral(prop.value) || t.isTemplateLiteral(prop.value)) continue;
    return "nested";
  }
  return "flat";
}

function inferFormatAndNamespace(
  resourcesNode: t.ObjectExpression | undefined,
  defaultNS: string,
): { resourceFormat: ResourceFormat; namespace: string } {
  if (!resourcesNode) {
    return { resourceFormat: "flat", namespace: defaultNS };
  }
  let anyNested = false;
  let anyFlat = false;
  for (const prop of resourcesNode.properties) {
    if (!t.isObjectProperty(prop) || prop.computed) continue;
    if (!t.isObjectExpression(prop.value)) {
      return { resourceFormat: "flat", namespace: defaultNS };
    }
    const c = classifyLocaleResourceValue(prop.value);
    if (c === "nested") anyNested = true;
    if (c === "flat") anyFlat = true;
  }
  if (anyNested) {
    return { resourceFormat: "i18next-namespace", namespace: defaultNS };
  }
  if (anyFlat) {
    return { resourceFormat: "flat", namespace: defaultNS };
  }
  return { resourceFormat: "flat", namespace: defaultNS };
}

function dedupeLocales(locales: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of locales) {
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

function collectLiteralBindings(ast: parser.ParseResult<t.File>): LiteralBindings {
  const objects = new Map<string, t.ObjectExpression>();
  const arrays = new Map<string, t.ArrayExpression>();
  traverse(ast, {
    VariableDeclarator(path) {
      if (!t.isIdentifier(path.node.id)) return;
      const name = path.node.id.name;
      if (!path.node.init) return;
      const inner = unwrapExpressionDeep(path.node.init);
      if (t.isObjectExpression(inner)) {
        objects.set(name, inner);
      }
      if (t.isArrayExpression(inner)) {
        const list = stringLiteralsFromArray(inner);
        if (list && list.length > 0) arrays.set(name, inner);
      }
    },
  });
  return { objects, arrays };
}

function resolveToObjectExpression(
  expr: t.Expression | undefined,
  objects: Map<string, t.ObjectExpression>,
): t.ObjectExpression | undefined {
  if (!expr) return undefined;
  const inner = unwrapExpressionDeep(expr);
  if (t.isObjectExpression(inner)) return inner;
  if (t.isIdentifier(inner) && objects.has(inner.name)) return objects.get(inner.name);
  return undefined;
}

function resolveArrayOfStrings(
  expr: t.Expression | undefined,
  arrays: Map<string, t.ArrayExpression>,
): string[] | null {
  if (!expr) return null;
  const inner = unwrapExpressionDeep(expr);
  if (t.isArrayExpression(inner)) return stringLiteralsFromArray(inner);
  if (t.isIdentifier(inner) && arrays.has(inner.name)) return stringLiteralsFromArray(arrays.get(inner.name)!);
  return null;
}

function isInitCallee(
  callee: t.Expression | t.Super | t.V8IntrinsicIdentifier,
): callee is t.MemberExpression | t.OptionalMemberExpression {
  if (
    t.isMemberExpression(callee) &&
    !callee.computed &&
    t.isIdentifier(callee.property) &&
    callee.property.name === "init"
  ) {
    return true;
  }
  if (
    t.isOptionalMemberExpression(callee) &&
    !callee.computed &&
    t.isIdentifier(callee.property) &&
    callee.property.name === "init"
  ) {
    return true;
  }
  return false;
}

function visitInitLikeCall(
  node: t.CallExpression | t.OptionalCallExpression,
  bindings: LiteralBindings,
  found: t.ObjectExpression[],
): void {
  const { callee, arguments: args } = node;
  if (args.length < 1) return;
  const a0 = args[0];
  if (a0 === undefined || !t.isExpression(a0)) return;
  const opts = resolveToObjectExpression(a0, bindings.objects);
  if (!opts) return;
  if (!isInitCallee(callee)) return;
  if (
    getObjectPropValue(opts, "lng") ||
    getObjectPropValue(opts, "supportedLngs") ||
    getObjectPropValue(opts, "fallbackLng") ||
    getObjectPropValue(opts, "resources")
  ) {
    found.push(opts);
  }
}

function findInitOptionObjects(ast: parser.ParseResult<t.File>, bindings: LiteralBindings): t.ObjectExpression[] {
  const found: t.ObjectExpression[] = [];
  traverse(ast, {
    CallExpression(path) {
      visitInitLikeCall(path.node, bindings, found);
    },
    OptionalCallExpression(path) {
      visitInitLikeCall(path.node, bindings, found);
    },
  });
  return found;
}

function mergeLocalesFromInitObject(
  opts: t.ObjectExpression,
  bindings: LiteralBindings,
): { locales: string[]; defaultLocale: string } | null {
  const supported = getObjectPropValue(opts, "supportedLngs");
  if (supported) {
    const list = resolveArrayOfStrings(supported, bindings.arrays);
    if (list && list.length) {
      const lng = getObjectStringProp(opts, "lng") ?? list[0];
      return { locales: dedupeLocales(list), defaultLocale: lng };
    }
  }
  const resRaw = getObjectPropValue(opts, "resources");
  const res = resolveToObjectExpression(resRaw, bindings.objects);
  if (res) {
    const keys = localesFromResourcesKeys(res);
    if (keys && keys.length) {
      const lngProp = getObjectStringProp(opts, "lng");
      const fb = getObjectPropValue(opts, "fallbackLng");
      let defaultLocale = lngProp;
      if (!defaultLocale && fb) {
        const staticFb = expressionToStaticString(fb);
        if (staticFb !== undefined) defaultLocale = staticFb;
        else if (t.isArrayExpression(unwrapExpressionDeep(fb))) {
          const fbList = stringLiteralsFromArray(unwrapExpressionDeep(fb) as t.ArrayExpression);
          if (fbList && fbList.length) defaultLocale = fbList[0];
        }
      }
      if (!defaultLocale) defaultLocale = keys[0]!;
      let locales = dedupeLocales(keys);
      if (!locales.includes(defaultLocale)) {
        locales = dedupeLocales([defaultLocale, ...locales]);
      }
      return { locales, defaultLocale };
    }
  }
  const fb = getObjectPropValue(opts, "fallbackLng");
  if (fb) {
    const list = localesFromFallbackLng(fb);
    if (list && list.length) {
      const lng = getObjectStringProp(opts, "lng") ?? list[0];
      return { locales: dedupeLocales(list), defaultLocale: lng };
    }
  }
  return null;
}

/**
 * Statically parse `i18next.init({...})` / `*.init({...})`-shaped calls and derive locale list,
 * default language, and on-disk layout hints from `resources` shape.
 */
export async function extractI18nInitFromFile(absolutePath: string): Promise<I18nInitExtraction> {
  let code: string;
  try {
    code = await readFile(absolutePath, "utf8");
  } catch {
    throw new Error(`ai-i18n: could not read i18n file: ${absolutePath}`);
  }
  let ast: parser.ParseResult<t.File>;
  try {
    ast = parser.parse(code, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
      errorRecovery: true,
    });
  } catch (e) {
    throw new Error(
      `ai-i18n: failed to parse i18n file ${absolutePath}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const bindings = collectLiteralBindings(ast);
  const inits = findInitOptionObjects(ast, bindings);
  if (inits.length === 0) {
    throw new Error(
      `ai-i18n: no init({...}) call with lng/supportedLngs/fallbackLng/resources found in ${absolutePath}. ` +
        `Supported: inline options, \`as object\` / \`as const\`, optional chaining (\`?.init\`), ` +
        `options passed as a variable pointing at an object literal in the same file, ` +
        `or \`supportedLngs\` / \`resources\` bound to array/object literals. ` +
        `Otherwise set "locales" in ai-i18n.config.json.`,
    );
  }

  let chosenOpts: t.ObjectExpression | null = null;
  let merged: { locales: string[]; defaultLocale: string } | null = null;
  for (const opts of inits) {
    const m = mergeLocalesFromInitObject(opts, bindings);
    if (m) {
      merged = m;
      chosenOpts = opts;
      break;
    }
  }
  if (!merged || !chosenOpts) {
    throw new Error(
      `ai-i18n: could not derive locales from ${absolutePath}. Add supportedLngs (string array literal or const), ` +
        `fallbackLng (string or array literal), or resources (object literal or const), or set "locales" in ai-i18n.config.json.`,
    );
  }

  const defaultNS = getObjectStringProp(chosenOpts, "defaultNS") ?? "translation";
  const resRaw = getObjectPropValue(chosenOpts, "resources");
  const resourcesObj = resolveToObjectExpression(resRaw, bindings.objects);
  const { resourceFormat, namespace } = inferFormatAndNamespace(resourcesObj, defaultNS);

  let locales = merged.locales;
  let defaultLocale = merged.defaultLocale;
  if (!locales.includes(defaultLocale)) {
    locales = dedupeLocales([defaultLocale, ...locales]);
  }

  return { defaultLocale, locales, resourceFormat, namespace };
}

/**
 * Like {@link extractI18nInitFromFile} but returns null when the file cannot be read,
 * parsed, or does not contain extractable init options.
 */
export async function tryExtractI18nInitFromFile(absolutePath: string): Promise<I18nInitExtraction | null> {
  try {
    return await extractI18nInitFromFile(absolutePath);
  } catch {
    return null;
  }
}
