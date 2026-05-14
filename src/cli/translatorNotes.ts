import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const FILE_NAME = "translator-notes.json";

export function translatorNotesPath(cwd: string, catalogDir: string): string {
  return path.join(path.resolve(cwd, catalogDir), FILE_NAME);
}

/** Creates `{catalogDir}/translator-notes.json` as `{}` when missing. */
export async function ensureTranslatorNotesFile(cwd: string, catalogDir: string): Promise<void> {
  const p = translatorNotesPath(cwd, catalogDir);
  try {
    await access(p);
  } catch {
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, "{}\n", "utf8");
  }
}

/**
 * Loads translator context keyed by message id (same keys as `t('…')` / default catalog).
 * File must be a JSON object with string values only.
 */
export async function loadTranslatorNotes(cwd: string, catalogDir: string): Promise<Record<string, string>> {
  const p = translatorNotesPath(cwd, catalogDir);
  let raw: string;
  try {
    raw = await readFile(p, "utf8");
  } catch {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`${FILE_NAME}: invalid JSON (${p}): ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${FILE_NAME} must be a JSON object with string keys and string values: ${p}`);
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v !== "string") {
      throw new Error(`${FILE_NAME}: value for key "${k}" must be a string (${p})`);
    }
    out[k] = v;
  }
  return out;
}
