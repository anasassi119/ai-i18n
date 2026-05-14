import type { Translator } from "./types.js";

export const stubTranslator: Translator = async (input) => {
  return input.entries.map((e) => ({ key: e.key, text: e.source }));
};
