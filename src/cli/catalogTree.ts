/** How string message keys are stored in each locale JSON file. */
export type LocaleShape = "flat" | "nested";

const NS_SEP = ":";

/** Join segments for a logical key path inside one namespace file (dots). */
export function joinPathSegments(segments: string[]): string {
  return segments.join(".");
}

/** Prefix logical key for multi-namespace bundles (`ns` + inner path). */
export function namespacedLogicalKey(namespace: string, innerPath: string): string {
  return innerPath.length > 0 ? `${namespace}${NS_SEP}${innerPath}` : namespace;
}

export function splitNamespacedLogicalKey(
  key: string,
): { namespace: string; innerPath: string } | null {
  const i = key.indexOf(NS_SEP);
  if (i <= 0) return null;
  return { namespace: key.slice(0, i), innerPath: key.slice(i + 1) };
}

/**
 * Collect string leaf values from locale JSON.
 * - `flat`: only top-level `string` values (legacy).
 * - `nested`: recurse into plain objects; **arrays**, **null**, and **non-string primitives** under a key are **skipped** (no keys extracted from those branches). Use this for files that mix translatable nested objects with structured data (e.g. lists of CV items).
 */
export function flattenCatalogValues(parsed: unknown, shape: LocaleShape): Record<string, string> {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Catalog JSON must be a non-array object");
  }
  const root = parsed as Record<string, unknown>;
  const out: Record<string, string> = {};
  if (shape === "flat") {
    for (const k of Object.keys(root)) {
      const v = root[k];
      if (typeof v === "string") out[k] = v;
    }
    return out;
  }
  walkNested(root, [], out);
  return out;
}

function walkNested(node: Record<string, unknown>, prefix: string[], out: Record<string, string>): void {
  for (const k of Object.keys(node)) {
    const v = node[k];
    const path = [...prefix, k];
    if (typeof v === "string") {
      out[joinPathSegments(path)] = v;
    } else if (isPlainObject(v)) {
      walkNested(v, path, out);
    }
    /* skip arrays, null, undefined, numbers, booleans — structured content is not translated here */
  }
}

/**
 * Build JSON value for disk from flat logical keys.
 * - `flat`: top-level object (key order follows `orderedKeys` then any extra keys sorted).
 * - `nested`: merge values into a deep clone of `structureTemplate` (same nesting as default locale).
 */
export function buildCatalogJsonValue(
  shape: LocaleShape,
  flatValues: Record<string, string>,
  structureTemplate: unknown,
  orderedKeys: string[],
): unknown {
  if (shape === "flat") {
    const o: Record<string, string> = {};
    const seen = new Set<string>();
    for (const k of orderedKeys) {
      if (flatValues[k] === undefined) continue;
      o[k] = flatValues[k]!;
      seen.add(k);
    }
    const rest = Object.keys(flatValues)
      .filter((k) => !seen.has(k))
      .sort((a, b) => a.localeCompare(b));
    for (const k of rest) {
      o[k] = flatValues[k]!;
    }
    return o;
  }
  if (!structureTemplate || typeof structureTemplate !== "object" || Array.isArray(structureTemplate)) {
    throw new Error("Nested catalog requires the default locale JSON template to be a non-array object");
  }
  const clone = deepClone(structureTemplate) as Record<string, unknown>;
  for (const k of Object.keys(flatValues)) {
    setLeafAtDotPath(clone, k, flatValues[k]!);
  }
  return clone;
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function setLeafAtDotPath(root: Record<string, unknown>, dotPath: string, value: string): void {
  const segments = dotPath.split(".").filter((s) => s.length > 0);
  if (segments.length === 0) throw new Error(`Invalid empty key path`);
  let cur: unknown = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const s = segments[i]!;
    if (!isPlainObject(cur)) {
      throw new Error(`Cannot set "${dotPath}": "${segments.slice(0, i + 1).join(".")}" is not an object in the template`);
    }
    const o = cur as Record<string, unknown>;
    const next = o[s];
    if (!isPlainObject(next)) {
      throw new Error(`Cannot set "${dotPath}": missing object at "${segments.slice(0, i + 1).join(".")}" in template`);
    }
    cur = next;
  }
  const last = segments[segments.length - 1]!;
  if (!isPlainObject(cur)) {
    throw new Error(`Cannot set "${dotPath}": parent is not an object`);
  }
  const leafParent = cur as Record<string, unknown>;
  if (typeof leafParent[last] !== "string") {
    throw new Error(`Cannot set "${dotPath}": template has no string leaf at that path`);
  }
  leafParent[last] = value;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Namespace JSON files (e.g. `translation.json`) are already scoped to that namespace.
 * If the file body is `{ "translation": { ...messages } }`, flattening would produce
 * `translation.contact.calendly` while `t('contact.calendly')` is `contact.calendly`.
 * Unwrap to the inner object when the root has a single key equal to `namespace` whose
 * value is a plain object.
 */
export function unwrapRedundantNamespaceRoot(
  parsed: unknown,
  namespace: string,
): { body: unknown; didUnwrap: boolean } {
  if (!namespace) return { body: parsed, didUnwrap: false };
  if (!isPlainObject(parsed)) return { body: parsed, didUnwrap: false };
  const o = parsed;
  const keys = Object.keys(o);
  if (keys.length !== 1 || keys[0] !== namespace) return { body: parsed, didUnwrap: false };
  const inner = o[keys[0]!];
  if (!isPlainObject(inner)) return { body: parsed, didUnwrap: false };
  return { body: inner, didUnwrap: true };
}

/**
 * Infer whether locale JSON should use `nested` flattening: true when any string leaf
 * sits under a nested plain object (values `flattenCatalogValues` would skip in `flat` mode).
 */
export function inferLocaleShapeFromParsed(parsed: unknown): LocaleShape {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "flat";
  const root = parsed as Record<string, unknown>;
  for (const k of Object.keys(root)) {
    const v = root[k];
    if (isPlainObject(v) && nestedObjectHasStringLeaf(v)) return "nested";
  }
  return "flat";
}

function nestedObjectHasStringLeaf(node: Record<string, unknown>): boolean {
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (typeof v === "string") return true;
    if (isPlainObject(v) && nestedObjectHasStringLeaf(v)) return true;
  }
  return false;
}

/** Insert or set dotted keys into a flat or nested JSON object (for diff --add-missing-default). */
export function mergeMissingKeysIntoParsed(
  parsed: unknown,
  shape: LocaleShape,
  missingLogicalKeys: string[],
): unknown {
  return mergeKeysIntoParsed(
    parsed,
    shape,
    missingLogicalKeys.map((logicalKey) => ({ logicalKey, value: "" })),
  );
}

/** Insert missing keys or fill empty leaves; never overwrites non-empty strings. */
export function mergeKeysIntoParsed(
  parsed: unknown,
  shape: LocaleShape,
  entries: { logicalKey: string; value: string }[],
): unknown {
  const base =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (deepClone(parsed) as Record<string, unknown>)
      : {};
  if (shape === "flat") {
    for (const { logicalKey, value } of entries) {
      if (base[logicalKey] === undefined) {
        base[logicalKey] = value;
      } else if (base[logicalKey] === "") {
        base[logicalKey] = value;
      }
    }
    return base;
  }
  for (const { logicalKey, value } of entries) {
    const segments = logicalKey.split(".").filter(Boolean);
    const existing = getNestedStringLeaf(base, segments);
    if (existing === undefined) {
      ensureNestedPathStringLeaf(base, segments, value);
    } else if (existing === "") {
      setNestedStringLeaf(base, segments, value);
    }
  }
  return base;
}

function getNestedStringLeaf(root: Record<string, unknown>, segments: string[]): string | undefined {
  if (segments.length === 0) return undefined;
  let cur: unknown = root;
  for (const s of segments) {
    if (!isPlainObject(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[s];
  }
  return typeof cur === "string" ? cur : undefined;
}

function setNestedStringLeaf(root: Record<string, unknown>, segments: string[], value: string): void {
  if (segments.length === 0) return;
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const s = segments[i]!;
    const next = cur[s];
    if (next === undefined || !isPlainObject(next)) {
      cur[s] = {};
    }
    cur = cur[s] as Record<string, unknown>;
  }
  const last = segments[segments.length - 1]!;
  if (cur[last] !== undefined && typeof cur[last] !== "string") {
    throw new Error(`Cannot set key "${segments.join(".")}": existing value is not a string`);
  }
  cur[last] = value;
}

function ensureNestedPathStringLeaf(
  root: Record<string, unknown>,
  segments: string[],
  value: string,
): void {
  if (segments.length === 0) return;
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const s = segments[i]!;
    const next = cur[s];
    if (next === undefined || !isPlainObject(next)) {
      cur[s] = {};
    }
    cur = cur[s] as Record<string, unknown>;
  }
  const last = segments[segments.length - 1]!;
  if (cur[last] !== undefined && typeof cur[last] !== "string") {
    throw new Error(`Cannot add missing key "${segments.join(".")}": existing value is not a string`);
  }
  if (cur[last] === undefined) cur[last] = value;
}

/** Ordered leaf keys from a nested template (depth-first, object key order). */
export function nestedLeafKeyOrder(template: unknown): string[] {
  if (!template || typeof template !== "object" || Array.isArray(template)) return [];
  const out: string[] = [];
  walkOrder(template as Record<string, unknown>, [], out);
  return out;
}

function walkOrder(node: Record<string, unknown>, prefix: string[], out: string[]): void {
  for (const k of Object.keys(node)) {
    const v = node[k];
    const path = [...prefix, k];
    if (typeof v === "string") {
      out.push(joinPathSegments(path));
    } else if (isPlainObject(v)) {
      walkOrder(v, path, out);
    }
  }
}
