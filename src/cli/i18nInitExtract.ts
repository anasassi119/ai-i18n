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

function getObjectStringProp(obj: t.ObjectExpression, name: string): string | undefined {
  for (const prop of obj.properties) {
    if (!t.isObjectProperty(prop) || prop.computed) continue;
    const key = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null;
    if (key !== name) continue;
    if (t.isStringLiteral(prop.value)) return prop.value.value;
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
    return null;
  }
  return out;
}

function localesFromFallbackLng(node: t.Expression): string[] | null {
  if (t.isStringLiteral(node)) return [node.value];
  if (t.isArrayExpression(node)) return stringLiteralsFromArray(node);
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

function findInitOptionObjects(ast: parser.ParseResult<t.File>): t.ObjectExpression[] {
  const found: t.ObjectExpression[] = [];
  traverse(ast, {
    CallExpression(path) {
      const { callee, arguments: args } = path.node;
      if (args.length < 1 || !t.isObjectExpression(args[0])) return;
      let isInit = false;
      if (t.isMemberExpression(callee) && !callee.computed) {
        if (t.isIdentifier(callee.property) && callee.property.name === "init") isInit = true;
      }
      if (!isInit) return;
      const opts = args[0] as t.ObjectExpression;
      if (
        getObjectPropValue(opts, "lng") ||
        getObjectPropValue(opts, "supportedLngs") ||
        getObjectPropValue(opts, "fallbackLng") ||
        getObjectPropValue(opts, "resources")
      ) {
        found.push(opts);
      }
    },
  });
  return found;
}

function mergeLocalesFromInitObject(opts: t.ObjectExpression): { locales: string[]; defaultLocale: string } | null {
  const supported = getObjectPropValue(opts, "supportedLngs");
  if (supported && t.isArrayExpression(supported)) {
    const list = stringLiteralsFromArray(supported);
    if (list && list.length) {
      const lng = getObjectStringProp(opts, "lng") ?? list[0];
      return { locales: dedupeLocales(list), defaultLocale: lng };
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
  const res = getObjectPropValue(opts, "resources");
  if (res && t.isObjectExpression(res)) {
    const keys = localesFromResourcesKeys(res);
    if (keys && keys.length) {
      const lng = getObjectStringProp(opts, "lng") ?? keys[0];
      return { locales: dedupeLocales(keys), defaultLocale: lng };
    }
  }
  return null;
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

  const inits = findInitOptionObjects(ast);
  if (inits.length === 0) {
    throw new Error(
      `ai-i18n: no init({...}) call with lng/supportedLngs/fallbackLng/resources found in ${absolutePath}. Use string-literal options or set defaultLocale/locales in ai-i18n.config.json.`,
    );
  }

  let chosenOpts: t.ObjectExpression | null = null;
  let merged: { locales: string[]; defaultLocale: string } | null = null;
  for (const opts of inits) {
    const m = mergeLocalesFromInitObject(opts);
    if (m) {
      merged = m;
      chosenOpts = opts;
      break;
    }
  }
  if (!merged || !chosenOpts) {
    throw new Error(
      `ai-i18n: could not derive locales from ${absolutePath}. Add supportedLngs (string literal array), fallbackLng (string or string array), or resources (object literal with locale keys), or set "locales" in ai-i18n.config.json.`,
    );
  }

  const defaultNS = getObjectStringProp(chosenOpts, "defaultNS") ?? "translation";
  const resNode = getObjectPropValue(chosenOpts, "resources");
  const resourcesObj = resNode && t.isObjectExpression(resNode) ? resNode : undefined;
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
