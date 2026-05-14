import { useMemo } from "react";
import { useAitContext } from "./context.js";

export interface UseTranslationResult {
  t: (key: string, options?: import("./types.js").TranslationOptions) => string;
  locale: string;
  setLocale: (locale: string) => void;
  defaultLocale: string;
}

export function useTranslation(): UseTranslationResult {
  const { t, locale, setLocale, defaultLocale } = useAitContext();
  return useMemo(
    () => ({
      t,
      locale,
      setLocale,
      defaultLocale,
    }),
    [t, locale, setLocale, defaultLocale],
  );
}
