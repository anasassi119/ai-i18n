import { interpolate } from "./interpolate.js";
import type { AitResources, TranslationOptions } from "./types.js";

const HINT = "hint";

const warned = new Set<string>();

function isDev(): boolean {
  try {
    const g = globalThis as { __DEV__?: boolean };
    if (typeof g.__DEV__ !== "undefined" && g.__DEV__) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return process.env.NODE_ENV !== "production";
}

function stripHint(
  options?: TranslationOptions,
): Record<string, string | number | boolean> | undefined {
  if (!options) return undefined;
  const { [HINT]: _hint, ...rest } = options;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

export function createTranslator(
  resources: AitResources,
  locale: string,
  defaultLocale: string,
  strictMissingKeys: boolean,
): (key: string, options?: TranslationOptions) => string {
  return function t(key: string, options?: TranslationOptions): string {
    const primary = resources[locale];
    const fallback = resources[defaultLocale];
    let raw = primary?.[key] ?? fallback?.[key];

    if (raw === undefined) {
      if (strictMissingKeys) {
        throw new Error(`[ai-i18n] Missing translation key: "${key}" (locales: ${locale}, ${defaultLocale})`);
      }
      const wk = `${locale}:${key}`;
      if (isDev() && !warned.has(wk)) {
        warned.add(wk);
        console.warn(`[ai-i18n] Missing translation key: "${key}" for locale "${locale}"`);
      }
      raw = key;
    }

    const vars = stripHint(options);
    if (!vars) return raw;
    return interpolate(raw, vars);
  };
}
