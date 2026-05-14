import { createContext, useContext } from "react";
import type { AitResources, TranslationOptions } from "./types.js";

export interface AitContextValue {
  locale: string;
  setLocale: (locale: string) => void;
  defaultLocale: string;
  resources: AitResources;
  t: (key: string, options?: TranslationOptions) => string;
}

export const AitContext = createContext<AitContextValue | null>(null);

export function useAitContext(): AitContextValue {
  const ctx = useContext(AitContext);
  if (!ctx) {
    throw new Error("[ai-i18n] useTranslation must be used within AitProvider");
  }
  return ctx;
}
