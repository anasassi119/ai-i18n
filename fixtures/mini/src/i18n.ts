/**
 * Fixture i18n module — ai-i18n derives locales from this file (static parse only).
 */
const i18next = {
  init(_options: Record<string, unknown>) {
    return undefined;
  },
};

void i18next.init({
  lng: "en",
  supportedLngs: ["en", "fr", "ar", "es"],
  resources: {},
});
