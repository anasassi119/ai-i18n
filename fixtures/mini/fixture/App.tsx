/** Fixture for `ai-i18n` CLI scan tests only (no real `t` import). */
declare function t(key: string, opts?: Record<string, unknown>): string;

export function X() {
  return <span>{t("welcome", { name: "x" })}</span>;
}
