import fs from "node:fs/promises";
import path from "node:path";
import type { AitConfig } from "./config.js";
import { effectiveNamespaceList, localeJsonFilesForLocale } from "./catalogLayout.js";
import type { LocaleShape } from "./catalogTree.js";
import {
  buildCatalogJsonValue,
  flattenCatalogValues,
  namespacedLogicalKey,
  nestedLeafKeyOrder,
  splitNamespacedLogicalKey,
  unwrapRedundantNamespaceRoot,
} from "./catalogTree.js";

export type LocaleCatalogBundle = {
  localeShape: LocaleShape;
  /** Merged logical keys → source strings (`ns:inner` when multi-namespace). */
  mergedFlat: Record<string, string>;
  perNsParsed: Record<string, unknown>;
  /** Global key order (merged logical keys). */
  orderedLogicalKeys: string[];
  /** Inner key order inside each namespace file (for stable JSON key ordering). */
  orderedInnerKeysPerNs: Record<string, string[]>;
  multiNamespace: boolean;
  namespaces: string[];
  /**
   * When set for a namespace slot, `writeLocaleCatalogBundle` wraps output as `{ [key]: body }`
   * so JSON that redundantly repeated the namespace at the root keeps the same on-disk shape.
   */
  redundantRootOuterKey?: Record<string, string>;
};

async function readJsonFile(file: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function orderedKeysFlat(parsed: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const k of Object.keys(parsed)) {
    if (typeof parsed[k] === "string") out.push(k);
  }
  return out;
}

export type LoadLocaleCatalogOptions = {
  /** When true, missing JSON files are treated as `{}` (for target locales). */
  allowMissing?: boolean;
};

export async function loadLocaleCatalogBundle(
  cwd: string,
  config: AitConfig,
  locale: string,
  options: LoadLocaleCatalogOptions = {},
): Promise<LocaleCatalogBundle> {
  const allowMissing = options.allowMissing ?? false;
  const localeShape = config.localeShape ?? "flat";
  const files = localeJsonFilesForLocale(cwd, config, locale);
  const nss = effectiveNamespaceList(config);
  const multiNamespace = nss !== undefined && nss.length > 1;

  const mergedFlat: Record<string, string> = {};
  const perNsParsed: Record<string, unknown> = {};
  const orderedLogicalKeys: string[] = [];
  const orderedInnerKeysPerNs: Record<string, string[]> = {};
  const redundantRootOuterKey: Record<string, string> = {};

  if (nss === undefined) {
    const f = files[0]!;
    const rawParsed = await readJsonFile(f.path);
    if (rawParsed === null && !allowMissing) {
      throw new Error(`Missing or invalid catalog: ${f.path}`);
    }
    const raw = rawParsed === null ? {} : rawParsed;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Missing or invalid catalog: ${f.path}`);
    }
    const defaultNs = config.namespace ?? "translation";
    const { body, didUnwrap } = unwrapRedundantNamespaceRoot(raw, defaultNs);
    if (didUnwrap) redundantRootOuterKey[""] = defaultNs;
    const obj = body as Record<string, unknown>;
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      throw new Error(`Missing or invalid catalog: ${f.path}`);
    }
    perNsParsed[""] = obj;
    const inner = flattenCatalogValues(obj, localeShape);
    const innerOrder =
      localeShape === "nested" ? nestedLeafKeyOrder(obj) : orderedKeysFlat(obj);
    orderedInnerKeysPerNs[""] = innerOrder;
    for (const ik of innerOrder) {
      orderedLogicalKeys.push(ik);
      mergedFlat[ik] = inner[ik]!;
    }
    return {
      localeShape,
      mergedFlat,
      perNsParsed,
      orderedLogicalKeys,
      orderedInnerKeysPerNs,
      multiNamespace: false,
      namespaces: [""],
      ...(Object.keys(redundantRootOuterKey).length ? { redundantRootOuterKey } : {}),
    };
  }

  for (const ns of nss) {
    const f = files.find((x) => x.namespace === ns);
    if (!f) throw new Error(`Internal: missing path for namespace "${ns}"`);
    const rawParsed = await readJsonFile(f.path);
    if (rawParsed === null && !allowMissing) {
      throw new Error(`Missing or invalid catalog: ${f.path}`);
    }
    const raw = rawParsed === null ? {} : rawParsed;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Missing or invalid catalog: ${f.path}`);
    }
    const { body, didUnwrap } = unwrapRedundantNamespaceRoot(raw, ns);
    if (didUnwrap) redundantRootOuterKey[ns] = ns;
    const obj = body as Record<string, unknown>;
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      throw new Error(`Missing or invalid catalog: ${f.path}`);
    }
    perNsParsed[ns] = obj;
    const inner = flattenCatalogValues(obj, localeShape);
    const innerOrder =
      localeShape === "nested" ? nestedLeafKeyOrder(obj) : orderedKeysFlat(obj);
    orderedInnerKeysPerNs[ns] = innerOrder;

    for (const ik of innerOrder) {
      const logical = multiNamespace ? namespacedLogicalKey(ns, ik) : ik;
      mergedFlat[logical] = inner[ik]!;
      orderedLogicalKeys.push(logical);
    }
  }

  return {
    localeShape,
    mergedFlat,
    perNsParsed,
    orderedLogicalKeys,
    orderedInnerKeysPerNs,
    multiNamespace,
    namespaces: nss,
    ...(Object.keys(redundantRootOuterKey).length ? { redundantRootOuterKey } : {}),
  };
}

export function splitMergedFlatPerNamespace(
  mergedFlat: Record<string, string>,
  namespaces: string[],
  multiNamespace: boolean,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const ns of namespaces) out[ns] = {};

  if (!multiNamespace) {
    const ns = namespaces[0] ?? "";
    out[ns] = { ...mergedFlat };
    return out;
  }

  for (const [k, v] of Object.entries(mergedFlat)) {
    const sp = splitNamespacedLogicalKey(k);
    if (sp && namespaces.includes(sp.namespace)) {
      out[sp.namespace]![sp.innerPath] = v;
    } else if (!k.includes(":")) {
      const fallbackNs = namespaces[0];
      if (fallbackNs !== undefined) out[fallbackNs]![k] = v;
    }
  }
  return out;
}

export async function writeLocaleCatalogBundle(
  cwd: string,
  config: AitConfig,
  locale: string,
  mergedFlat: Record<string, string>,
  defaultBundle: LocaleCatalogBundle,
): Promise<void> {
  const perNs = splitMergedFlatPerNamespace(
    mergedFlat,
    defaultBundle.namespaces,
    defaultBundle.multiNamespace,
  );
  const files = localeJsonFilesForLocale(cwd, config, locale);
  const shape = defaultBundle.localeShape;

  for (const { namespace: ns, path: filePath } of files) {
    const innerFlat = perNs[ns];
    if (!innerFlat) continue;
    const template = defaultBundle.perNsParsed[ns];
    const innerOrder = defaultBundle.orderedInnerKeysPerNs[ns] ?? Object.keys(innerFlat);

    let jsonValue = buildCatalogJsonValue(shape, innerFlat, template, innerOrder);
    const outer = defaultBundle.redundantRootOuterKey?.[ns];
    if (outer !== undefined) {
      jsonValue = { [outer]: jsonValue } as Record<string, unknown>;
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(jsonValue, null, 2) + "\n", "utf8");
  }
}
