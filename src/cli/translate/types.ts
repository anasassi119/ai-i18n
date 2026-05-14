export interface TranslateEntry {
  key: string;
  source: string;
  hint?: string;
}

export interface TranslateBatchInput {
  targetLocale: string;
  sourceLocale: string;
  entries: TranslateEntry[];
}

export interface TranslateBatchOptions {
  model?: string;
}

export type TranslateBatchResult = Array<{ key: string; text: string }>;

export type Translator = (
  input: TranslateBatchInput,
  options: TranslateBatchOptions,
) => Promise<TranslateBatchResult>;
