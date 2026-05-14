import type { ReactNode } from "react";

/** Per-locale flat message map (keys may use dot notation, e.g. "nav.home"). */
export type MessageCatalog = Record<string, string>;

export type AitResources = Record<string, MessageCatalog>;

export interface AitProviderProps {
  /** Active locale code, e.g. "en", "fr". */
  locale: string;
  /** Fallback when a key is missing in `locale`. */
  defaultLocale: string;
  /** `resources[locale][messageKey] = "Hello {{name}}"` */
  resources: AitResources;
  children: ReactNode;
  /**
   * When true, missing keys throw. When false (default), missing keys return the key
   * and a one-time console warning.
   */
  strictMissingKeys?: boolean;
}

export type TranslationOptions = Record<
  string,
  string | number | boolean | undefined
>;
