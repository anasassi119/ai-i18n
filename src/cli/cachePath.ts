import path from "node:path";

const CACHE_DIR_SEGMENTS = ["node_modules", ".cache", "ai-i18n"] as const;
const CACHE_FILE_NAME = ".ai-i18n-cache.json";

/** Project-relative directory for translation hash cache (under `node_modules/.cache/ai-i18n`). */
export function defaultCacheDir(cwd: string): string {
  return path.join(cwd, ...CACHE_DIR_SEGMENTS);
}

/** Absolute path to `.ai-i18n-cache.json`. */
export function defaultCacheFilePath(cwd: string): string {
  return path.join(defaultCacheDir(cwd), CACHE_FILE_NAME);
}
