import { useCallback, useEffect, useMemo, useState } from "react";
import { createTranslator } from "./createTranslator.js";
import { AitContext } from "./context.js";
import type { AitProviderProps } from "./types.js";

export function AitProvider({
  locale: localeProp,
  defaultLocale,
  resources,
  children,
  strictMissingKeys = false,
}: AitProviderProps) {
  const [locale, setLocaleState] = useState(localeProp);

  useEffect(() => {
    setLocaleState(localeProp);
  }, [localeProp]);

  const setLocale = useCallback((next: string) => {
    setLocaleState(next);
  }, []);

  const t = useMemo(
    () => createTranslator(resources, locale, defaultLocale, strictMissingKeys),
    [resources, locale, defaultLocale, strictMissingKeys],
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      defaultLocale,
      resources,
      t,
    }),
    [locale, setLocale, defaultLocale, resources, t],
  );

  return <AitContext.Provider value={value}>{children}</AitContext.Provider>;
}
