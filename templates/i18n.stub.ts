/**
 * Minimal i18next bootstrap — replace resources and options for your app.
 * Peer deps: i18next (and react-i18next / detectors if you use them).
 */
import i18next from "i18next";

void i18next.init({
  lng: "en",
  supportedLngs: ["en"],
  resources: {
    en: { translation: {} },
  },
  interpolation: { escapeValue: false },
});

export default i18next;
