import type { AitConfig } from "../config.js";
import { anthropicTranslator } from "./anthropic.js";
import { openAiTranslator } from "./openai.js";
import { stubTranslator } from "./stub.js";
import type { Translator } from "./types.js";

export function resolveTranslator(config: AitConfig): Translator {
  const p = config.provider ?? "stub";
  switch (p) {
    case "stub":
      return stubTranslator;
    case "openai":
      return openAiTranslator;
    case "anthropic":
      return anthropicTranslator;
    default:
      throw new Error(`Unknown ai-i18n.config.json provider: ${String(p)}`);
  }
}
