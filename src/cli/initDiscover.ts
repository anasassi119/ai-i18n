import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import type { ResourceFormat } from "./config.js";
import { inferLocaleShapeFromParsed, type LocaleShape } from "./catalogTree.js";
import { tryExtractI18nInitFromFile } from "./i18nInitExtract.js";

const I18N_SEARCH_GLOBS = [
  "src/**/*.{ts,tsx,js,jsx}",
  "app/**/*.{ts,tsx,js,jsx}",
  "lib/**/*.{ts,tsx,js,jsx}",
] as const;

/** Lower index = higher priority when multiple files parse as i18n init. */
const PREFERRED_I18N_BASENAMES = [
  "i18n.ts",
  "i18n.tsx",
  "i18n.client.ts",
  "i18n.client.tsx",
  "i18next.ts",
  "i18next.tsx",
  "i18n.js",
  "i18n.jsx",
  "i18next.js",
];

export interface InitDiscovery {
  /** Project-relative POSIX-ish path (forward slashes). */
  i18n: string;
  localesDir: string;
  sourceGlobs: string[];
  resourceFormat: ResourceFormat;
  /** When `i18next-namespace` and a single namespace file. */
  namespace?: string;
  /** When multiple namespace JSON files exist under `{localesDir}/{defaultLocale}/`. */
  namespaces?: string[];
  localeShape: LocaleShape;
  defaultLocale: string;
  /** True when any probed default-locale catalog path already existed before init. */
  hadDefaultCatalogOnDisk: boolean;
}

async function existsFile(p: string): Promise<boolean> {
  try {
    await access(p);
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

async function existsDir(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

function toPosixRel(cwd: string, abs: string): string {
  return path.relative(cwd, abs).split(path.sep).join("/");
}

function preferredBasenameRank(filePath: string): number {
  const base = path.basename(filePath);
  const i = PREFERRED_I18N_BASENAMES.indexOf(base);
  return i === -1 ? 1000 + (base.charCodeAt(0) ?? 0) : i;
}

async function findI18nModulePath(cwd: string, i18nOverride?: string): Promise<string> {
  if (i18nOverride !== undefined && i18nOverride.trim() !== "") {
    const abs = path.resolve(cwd, i18nOverride.trim());
    const hit = await tryExtractI18nInitFromFile(abs);
    if (!hit) {
      throw new Error(
        `[ai-i18n] init: could not use --i18n "${i18nOverride}": file must contain an i18next-style init({...}) with lng, supportedLngs, fallbackLng, or resources (string literals).`,
      );
    }
    return toPosixRel(cwd, abs);
  }

  const files = await fg([...I18N_SEARCH_GLOBS], {
    cwd,
    onlyFiles: true,
    unique: true,
    ignore: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
    dot: false,
  });

  type Hit = { abs: string; rank: number; rel: string };
  const hits: Hit[] = [];
  for (const rel of files) {
    const abs = path.resolve(cwd, rel);
    const ext = await tryExtractI18nInitFromFile(abs);
    if (!ext) continue;
    hits.push({ abs, rel, rank: preferredBasenameRank(abs) });
  }

  hits.sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.rel.localeCompare(b.rel)));
  if (hits.length === 0) {
    throw new Error(
      `[ai-i18n] init: no i18next init module found. Searched under:\n  ${I18N_SEARCH_GLOBS.join("\n  ")}\n` +
        `Point init at your file: npx ai-i18n init --i18n path/to/i18n.ts`,
    );
  }
  return toPosixRel(cwd, hits[0]!.abs);
}

/** All project files under standard globs that pass static i18next `init` extraction. */
export async function listExtractableI18nCandidates(cwd: string): Promise<
  {
    rel: string;
    abs: string;
    rank: number;
    defaultLocale: string;
    locales: string[];
  }[]
> {
  const files = await fg([...I18N_SEARCH_GLOBS], {
    cwd,
    onlyFiles: true,
    unique: true,
    ignore: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
    dot: false,
  });
  const out: { rel: string; abs: string; rank: number; defaultLocale: string; locales: string[] }[] = [];
  for (const rel of files) {
    const abs = path.resolve(cwd, rel);
    const ext = await tryExtractI18nInitFromFile(abs);
    if (!ext) continue;
    out.push({
      rel: rel.split(path.sep).join("/"),
      abs,
      rank: preferredBasenameRank(abs),
      defaultLocale: ext.defaultLocale,
      locales: ext.locales,
    });
  }
  out.sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.rel.localeCompare(b.rel)));
  return out;
}

const RESERVED_ROOT_JSON = new Set(["translator-notes"]);

function pickDefaultLocale(codes: string[]): string {
  if (codes.length === 0) return "en";
  if (codes.includes("en")) return "en";
  return [...codes].sort((a, b) => a.localeCompare(b))[0]!;
}

export type LocalesDirInference = {
  localesDirRel: string;
  resourceFormat: ResourceFormat;
  namespace?: string;
  namespaces?: string[];
  locales: string[];
  defaultLocale: string;
  localeShape: LocaleShape;
  /** Root has both `*.json` locale files and per-locale subdirs with JSON — user must choose unless `preferWhenAmbiguous` is set. */
  ambiguous: boolean;
  /** When `ambiguous`, locale basenames implied by root `*.json` files (excluding translator-notes). */
  flatLocaleCodes?: string[];
  /** When `ambiguous`, subdirectory names that contain namespace JSON. */
  namespaceLocaleCodes?: string[];
};

/**
 * Inspect a locales root directory (absolute) and infer catalog layout vs `cwd` (for relative `localesDir`).
 * When both flat files and per-locale dirs exist, pass `preferWhenAmbiguous` from an interactive choice, or handle `ambiguous: true`.
 */
export async function inferCatalogLayoutFromLocalesDir(
  localesAbsRoot: string,
  cwd: string,
  preferWhenAmbiguous?: "flat" | "namespace",
): Promise<LocalesDirInference> {
  const localesDirRel = toPosixRel(cwd, path.resolve(localesAbsRoot));
  let dirents;
  try {
    dirents = await readdir(localesAbsRoot, { withFileTypes: true });
  } catch {
    return {
      localesDirRel,
      resourceFormat: "flat",
      locales: [],
      defaultLocale: "en",
      localeShape: "flat",
      ambiguous: false,
    };
  }

  const jsonAtRoot: string[] = [];
  const subdirs: string[] = [];
  for (const d of dirents) {
    if (d.isFile() && d.name.endsWith(".json")) {
      const code = d.name.replace(/\.json$/i, "");
      if (code && !RESERVED_ROOT_JSON.has(code)) jsonAtRoot.push(code);
    } else if (d.isDirectory() && !d.name.startsWith(".")) {
      subdirs.push(d.name);
    }
  }

  const subdirsWithNsJson: string[] = [];
  for (const name of subdirs) {
    const nss = await listNamespaceJsonFiles(path.join(localesAbsRoot, name));
    if (nss.length > 0) subdirsWithNsJson.push(name);
  }

  const ambiguousRaw = jsonAtRoot.length > 0 && subdirsWithNsJson.length > 0;
  const flatCodesSorted = [...new Set(jsonAtRoot)].sort((a, b) => a.localeCompare(b));
  const nsCodesSorted = [...new Set(subdirsWithNsJson)].sort((a, b) => a.localeCompare(b));

  const buildNamespace = async (
    localeCodes: string[],
    ambiguousFlag: boolean,
  ): Promise<LocalesDirInference> => {
    const defaultLocale = pickDefaultLocale(localeCodes);
    const fromDir = await inferLayoutFromLocaleDir(cwd, localesDirRel, defaultLocale);
    let resourceFormat: ResourceFormat = "i18next-namespace";
    let namespace: string | undefined;
    let namespaces: string[] | undefined;
    if (fromDir?.namespaces) {
      namespaces = fromDir.namespaces;
    } else if (fromDir?.namespace) {
      namespace = fromDir.namespace;
    } else {
      namespace = "translation";
    }
    const primaryNs = namespaces?.[0] ?? namespace ?? "translation";
    const samplePath = path.join(localesAbsRoot, defaultLocale, `${primaryNs}.json`);
    let localeShape: LocaleShape = "flat";
    try {
      const raw = await readFile(samplePath, "utf8");
      localeShape = inferLocaleShapeFromParsed(JSON.parse(raw) as unknown);
    } catch {
      localeShape = "flat";
    }
    return {
      localesDirRel,
      resourceFormat,
      namespace,
      namespaces,
      locales: localeCodes,
      defaultLocale,
      localeShape,
      ambiguous: ambiguousFlag,
    };
  };

  const buildFlat = async (codes: string[], ambiguousFlag: boolean): Promise<LocalesDirInference> => {
    const defaultLocale = pickDefaultLocale(codes);
    const samplePath = path.join(localesAbsRoot, `${defaultLocale}.json`);
    let localeShape: LocaleShape = "flat";
    try {
      const raw = await readFile(samplePath, "utf8");
      localeShape = inferLocaleShapeFromParsed(JSON.parse(raw) as unknown);
    } catch {
      localeShape = "flat";
    }
    return {
      localesDirRel,
      resourceFormat: "flat",
      locales: codes,
      defaultLocale,
      localeShape,
      ambiguous: ambiguousFlag,
    };
  };

  if (ambiguousRaw && preferWhenAmbiguous === "flat") {
    return buildFlat(flatCodesSorted, false);
  }
  if (ambiguousRaw && preferWhenAmbiguous === "namespace") {
    return buildNamespace(nsCodesSorted, false);
  }

  const ambiguous = ambiguousRaw;

  if (ambiguous) {
    const ns = await buildNamespace(nsCodesSorted, true);
    return {
      ...ns,
      ambiguous: true,
      flatLocaleCodes: flatCodesSorted,
      namespaceLocaleCodes: nsCodesSorted,
    };
  }

  if (jsonAtRoot.length > 0) {
    const codes = [...new Set(jsonAtRoot)].sort((a, b) => a.localeCompare(b));
    return buildFlat(codes, false);
  }

  if (subdirsWithNsJson.length > 0) {
    const codes = [...new Set(subdirsWithNsJson)].sort((a, b) => a.localeCompare(b));
    return buildNamespace(codes, false);
  }

  return {
    localesDirRel,
    resourceFormat: "flat",
    locales: [],
    defaultLocale: "en",
    localeShape: "flat",
    ambiguous: false,
  };
}

/**
 * Order for finding an existing default-locale catalog on disk (first match wins).
 * `ns` is the namespace filename without `.json` from i18n extraction (often `translation`).
 */
function defaultLocaleProbeAbsPaths(
  cwd: string,
  lng: string,
  ns: string,
): { abs: string; kind: "flat" | "namespace" }[] {
  const bases = ["locales", path.join("src", "locales"), path.join("public", "locales")];
  const out: { abs: string; kind: "flat" | "namespace" }[] = [];
  for (const b of bases) {
    out.push({ abs: path.join(cwd, b, `${lng}.json`), kind: "flat" });
    out.push({ abs: path.join(cwd, b, lng, `${ns}.json`), kind: "namespace" });
  }
  return out;
}

/** Namespace `.json` basenames under a locale directory (e.g. `translation`, `common`). */
export async function listNamespaceJsonFiles(localeDirAbs: string): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(localeDirAbs);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const n of names) {
    if (!n.endsWith(".json")) continue;
    const code = n.replace(/\.json$/i, "");
    if (!code || code === "translator-notes") continue;
    out.push(code);
  }
  return [...new Set(out)].sort((a, b) => a.localeCompare(b));
}

export async function inferLayoutFromLocaleDir(
  cwd: string,
  localesDirRel: string,
  lng: string,
): Promise<Pick<InitDiscovery, "resourceFormat" | "namespace" | "namespaces"> | null> {
  const localeDirAbs = path.join(cwd, localesDirRel, lng);
  if (!(await existsDir(localeDirAbs))) return null;
  const nss = await listNamespaceJsonFiles(localeDirAbs);
  if (nss.length === 0) return null;
  if (nss.length === 1) {
    return { resourceFormat: "i18next-namespace", namespace: nss[0] };
  }
  return { resourceFormat: "i18next-namespace", namespaces: nss };
}

async function defaultLocalesDirWhenNothingOnDisk(cwd: string): Promise<string> {
  const hasSrc = await existsDir(path.join(cwd, "src"));
  const hasRootLocales = await existsDir(path.join(cwd, "locales"));
  if (hasSrc && !hasRootLocales) return path.join("src", "locales");
  return "locales";
}

export async function buildSourceGlobs(cwd: string): Promise<string[]> {
  const globs = ["src/**/*.{tsx,ts,jsx,js}"];
  const appHits = await fg(["app/**/*.{tsx,ts}"], {
    cwd,
    onlyFiles: true,
    ignore: ["**/node_modules/**"],
  });
  if (appHits.length > 0) globs.push("app/**/*.{tsx,ts,jsx,js}");
  return globs;
}

/**
 * Discover i18n path, locale layout, and `localeShape` for a new `ai-i18n.config.json`.
 */
export async function discoverInit(cwd: string, options: { i18nOverride?: string } = {}): Promise<InitDiscovery> {
  const i18nRel = await findI18nModulePath(cwd, options.i18nOverride);
  const i18nAbs = path.resolve(cwd, i18nRel);
  const extracted = (await tryExtractI18nInitFromFile(i18nAbs))!;
  const { defaultLocale: lng, resourceFormat: astFormat, namespace: astNs } = extracted;

  let hadDefaultCatalogOnDisk = false;
  let localesDir = "";
  let resourceFormat: ResourceFormat = astFormat;
  let namespace: string | undefined;
  let namespaces: string[] | undefined;
  let localeShape: LocaleShape = "flat";

  for (const { abs, kind } of defaultLocaleProbeAbsPaths(cwd, lng, astNs)) {
    if (!(await existsFile(abs))) continue;
    hadDefaultCatalogOnDisk = true;
    localesDir = toPosixRel(cwd, kind === "flat" ? path.dirname(abs) : path.dirname(path.dirname(abs)));
    if (kind === "flat") {
      resourceFormat = "flat";
      namespace = undefined;
      namespaces = undefined;
    } else {
      const fromDir = await inferLayoutFromLocaleDir(cwd, localesDir, lng);
      if (fromDir?.namespaces) {
        resourceFormat = "i18next-namespace";
        namespaces = fromDir.namespaces;
        namespace = undefined;
      } else if (fromDir?.namespace) {
        resourceFormat = "i18next-namespace";
        namespace = fromDir.namespace;
        namespaces = undefined;
      } else {
        resourceFormat = "i18next-namespace";
        namespace = path.basename(abs, ".json");
      }
    }
    try {
      const raw = await readFile(abs, "utf8");
      localeShape = inferLocaleShapeFromParsed(JSON.parse(raw) as unknown);
    } catch {
      localeShape = "flat";
    }
    break;
  }

  if (!hadDefaultCatalogOnDisk) {
    const scanBases = ["locales", path.join("src", "locales"), path.join("public", "locales")];
    for (const b of scanBases) {
      const localeDirAbs = path.join(cwd, b, lng);
      if (!(await existsDir(localeDirAbs))) continue;
      const nss = await listNamespaceJsonFiles(localeDirAbs);
      if (nss.length === 0) continue;
      hadDefaultCatalogOnDisk = true;
      localesDir = toPosixRel(cwd, path.join(cwd, b));
      resourceFormat = "i18next-namespace";
      if (nss.length > 1) {
        namespaces = nss;
        namespace = undefined;
      } else {
        namespace = nss[0];
        namespaces = undefined;
      }
      const primaryAbs = path.join(localeDirAbs, `${nss[0]}.json`);
      try {
        const raw = await readFile(primaryAbs, "utf8");
        localeShape = inferLocaleShapeFromParsed(JSON.parse(raw) as unknown);
      } catch {
        localeShape = "flat";
      }
      break;
    }
  }

  if (!hadDefaultCatalogOnDisk) {
    localesDir = await defaultLocalesDirWhenNothingOnDisk(cwd);
    resourceFormat = astFormat;
    if (astFormat === "i18next-namespace") {
      namespace = astNs;
      const fromDir = await inferLayoutFromLocaleDir(cwd, localesDir, lng);
      if (fromDir?.namespaces) namespaces = fromDir.namespaces;
      else if (fromDir?.namespace) namespace = fromDir.namespace;
    } else {
      namespace = undefined;
      namespaces = undefined;
    }
    localeShape = "flat";
  } else if (resourceFormat === "i18next-namespace") {
      const fromDir = await inferLayoutFromLocaleDir(cwd, localesDir, lng);
    if (fromDir?.namespaces) namespaces = fromDir.namespaces;
    else if (fromDir?.namespace) namespace = fromDir.namespace;
  }

  const sourceGlobs = await buildSourceGlobs(cwd);

  return {
    i18n: i18nRel,
    localesDir,
    sourceGlobs,
    resourceFormat,
    ...(namespace !== undefined ? { namespace } : {}),
    ...(namespaces !== undefined ? { namespaces } : {}),
    localeShape,
    defaultLocale: lng,
    hadDefaultCatalogOnDisk,
  };
}
