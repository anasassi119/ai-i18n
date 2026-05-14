import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export type Provider = "openai" | "anthropic";

export interface AitConfig {
  sourceGlobs: string[];
  defaultLocale: string;
  locales: string[];
  catalogDir: string;
  /** Where `.ai-i18n-cache.json` and `.ai-i18n-hints.json` are stored (default: ".ai-i18n"). */
  cacheDir: string;
  provider: Provider;
  model?: string;
}

export async function loadConfig(cwd: string): Promise<{ path: string; config: AitConfig }> {
  const path = resolve(cwd, "ai-i18n.config.json");
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("ai-i18n.config.json must be a JSON object");
  }
  const o = parsed as Record<string, unknown>;
  const sourceGlobs = o.sourceGlobs;
  const defaultLocale = o.defaultLocale;
  const locales = o.locales;
  const catalogDir = o.catalogDir;
  if (!Array.isArray(sourceGlobs) || !sourceGlobs.every((x) => typeof x === "string")) {
    throw new Error("ai-i18n.config.json: sourceGlobs must be an array of strings");
  }
  if (typeof defaultLocale !== "string") {
    throw new Error("ai-i18n.config.json: defaultLocale must be a string");
  }
  if (!Array.isArray(locales) || !locales.every((x) => typeof x === "string")) {
    throw new Error("ai-i18n.config.json: locales must be an array of strings");
  }
  if (typeof catalogDir !== "string") {
    throw new Error("ai-i18n.config.json: catalogDir must be a string");
  }
  const providerRaw = o.provider;
  let provider: Provider = "openai";
  if (providerRaw !== undefined && providerRaw !== null) {
    if (providerRaw === "stub") {
      throw new Error(
        'ai-i18n.config.json: "stub" provider was removed. Use "openai" or "anthropic".',
      );
    }
    if (providerRaw === "openai" || providerRaw === "anthropic") {
      provider = providerRaw;
    } else {
      throw new Error('ai-i18n.config.json: provider must be "openai" or "anthropic"');
    }
  }
  const model = o.model;
  if (model !== undefined && typeof model !== "string") {
    throw new Error("ai-i18n.config.json: model must be a string when set");
  }
  const cacheDirRaw = o.cacheDir;
  const cacheDir = typeof cacheDirRaw === "string" ? cacheDirRaw : ".ai-i18n";

  const config: AitConfig = {
    sourceGlobs,
    defaultLocale,
    locales,
    catalogDir,
    cacheDir,
    provider,
    ...(typeof model === "string" ? { model } : {}),
  };
  return { path, config };
}
