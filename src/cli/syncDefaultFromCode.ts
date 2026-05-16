import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AitConfig } from "./config.js";
import { loadLocaleCatalogBundle } from "./catalogBundle.js";
import { localeJsonFilesForLocale } from "./catalogLayout.js";
import {
  mergeKeysIntoParsed,
  splitNamespacedLogicalKey,
  unwrapRedundantNamespaceRoot,
} from "./catalogTree.js";
import type { ScannedKey } from "./scan.js";

async function readJson<T>(file: string): Promise<T | null> {
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export type SyncDefaultEntries = {
  missing: { logicalKey: string; value: string }[];
  fillEmpty: { logicalKey: string; value: string }[];
};

/** Build catalog merge entries from scan results and current default catalog. */
export function buildSyncDefaultEntries(
  scannedKeys: Map<string, ScannedKey>,
  defaultFlat: Record<string, string>,
): SyncDefaultEntries {
  const missing: { logicalKey: string; value: string }[] = [];
  const fillEmpty: { logicalKey: string; value: string }[] = [];

  for (const [logicalKey, entry] of scannedKeys) {
    const defaultText = entry.defaultText;
    if (defaultText === undefined) continue;

    const current = defaultFlat[logicalKey];
    if (current === undefined) {
      missing.push({ logicalKey, value: defaultText });
    } else if (current === "") {
      fillEmpty.push({ logicalKey, value: defaultText });
    }
  }

  return { missing, fillEmpty };
}

function entriesForNamespace(
  entries: { logicalKey: string; value: string }[],
  ns: string,
  namespaces: string[],
): { logicalKey: string; value: string }[] {
  const out: { logicalKey: string; value: string }[] = [];
  for (const e of entries) {
    const sp = splitNamespacedLogicalKey(e.logicalKey);
    if (sp && sp.namespace === ns) {
      out.push({ logicalKey: sp.innerPath, value: e.value });
    } else if (!e.logicalKey.includes(":") && namespaces[0] === ns) {
      out.push(e);
    }
  }
  return out;
}

/** Add missing keys (optional) and fill empty default-catalog strings from scan `defaultText`. */
export async function syncDefaultCatalogFromCode(
  cwd: string,
  config: AitConfig,
  scannedKeys: Map<string, ScannedKey>,
  options: { missingLogicalKeys?: string[] } = {},
): Promise<{ added: number; filled: number }> {
  const shape = config.localeShape ?? "flat";
  const defaultBundle = await loadLocaleCatalogBundle(cwd, config, config.defaultLocale);
  const defaultFlat = defaultBundle.mergedFlat;
  const { fillEmpty } = buildSyncDefaultEntries(scannedKeys, defaultFlat);

  const missingEntries =
    options.missingLogicalKeys !== undefined
      ? entriesForMissingKeys(scannedKeys, options.missingLogicalKeys)
      : [];
  const allEntries = [...missingEntries, ...fillEmpty];
  if (allEntries.length === 0) return { added: missingEntries.length, filled: 0 };

  if (!defaultBundle.multiNamespace) {
    const filePath = localeJsonFilesForLocale(cwd, config, config.defaultLocale)[0]!.path;
    const raw = (await readJson<unknown>(filePath)) ?? {};
    const defaultNs = config.namespace ?? "translation";
    const { body, didUnwrap } = unwrapRedundantNamespaceRoot(raw, defaultNs);
    const merged = mergeKeysIntoParsed(body, shape, allEntries);
    const out = didUnwrap ? { [defaultNs]: merged } : merged;
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(out, null, 2) + "\n", "utf8");
    return { added: missingEntries.length, filled: fillEmpty.length };
  }

  for (const ns of defaultBundle.namespaces) {
    const nsEntries = entriesForNamespace(allEntries, ns, defaultBundle.namespaces);
    if (nsEntries.length === 0) continue;
    const filePath = localeJsonFilesForLocale(cwd, config, config.defaultLocale).find((x) => x.namespace === ns)!.path;
    const raw = (await readJson<unknown>(filePath)) ?? {};
    const { body, didUnwrap } = unwrapRedundantNamespaceRoot(raw, ns);
    const merged = mergeKeysIntoParsed(body, shape, nsEntries);
    const out = didUnwrap ? { [ns]: merged } : merged;
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(out, null, 2) + "\n", "utf8");
  }

  return { added: missingEntries.length, filled: fillEmpty.length };
}

export function computeDefaultValueDrift(
  scannedKeys: Map<string, ScannedKey>,
  defaultFlat: Record<string, string>,
): { emptyWithDefaultText: string[]; mismatched: string[] } {
  const emptyWithDefaultText: string[] = [];
  const mismatched: string[] = [];
  for (const [logicalKey, entry] of scannedKeys) {
    const defaultText = entry.defaultText;
    if (defaultText === undefined) continue;
    const current = defaultFlat[logicalKey];
    if (current === undefined) continue;
    if (current === "") emptyWithDefaultText.push(logicalKey);
    else if (current !== defaultText) mismatched.push(logicalKey);
  }
  return { emptyWithDefaultText, mismatched };
}

export function warnDefaultValueDrift(
  scannedKeys: Map<string, ScannedKey>,
  defaultFlat: Record<string, string>,
): void {
  const { emptyWithDefaultText, mismatched } = computeDefaultValueDrift(scannedKeys, defaultFlat);
  if (emptyWithDefaultText.length > 0) {
    console.log(
      "[ai-i18n] Default catalog has empty string(s) but code specifies defaultValue:",
    );
    for (const k of emptyWithDefaultText.sort()) console.log(`  - ${k}`);
  }
  if (mismatched.length > 0) {
    console.log("[ai-i18n] Default catalog value differs from code defaultValue:");
    for (const k of mismatched.sort()) console.log(`  - ${k}`);
  }
}

/** Keys in code missing from default catalog (any initial value). */
export function missingKeysFromScan(
  scannedKeys: Map<string, ScannedKey>,
  keysInDefault: Set<string>,
): string[] {
  const out: string[] = [];
  for (const k of scannedKeys.keys()) {
    if (!keysInDefault.has(k)) out.push(k);
  }
  return out;
}

export function entriesForMissingKeys(
  scannedKeys: Map<string, ScannedKey>,
  missingLogicalKeys: string[],
): { logicalKey: string; value: string }[] {
  return missingLogicalKeys.map((logicalKey) => {
    const defaultText = scannedKeys.get(logicalKey)?.defaultText;
    return { logicalKey, value: defaultText ?? "" };
  });
}
