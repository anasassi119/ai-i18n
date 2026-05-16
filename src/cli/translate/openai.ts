import { DEFAULT_BATCH_SIZE } from "../config.js";
import type {
  TranslateBatchInput,
  TranslateBatchOptions,
  TranslateBatchResult,
} from "./types.js";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

const SYSTEM = `You are a professional UI translator. Reply with ONLY valid JSON (no markdown fences) in this exact shape:
{"translations":[{"key":"string","text":"string"}]}
Rules:
- Preserve every placeholder exactly as in the source, e.g. {{name}}, {{count}} — do not translate inside braces.
- "text" is the translation of the source string into the target locale.
- Include one object per input entry, same "key" values as provided.
- Do not add or remove keys from the input set.
- If an input entry includes optional "translatorNote", use it only as UI/context for disambiguation; "text" must still be the translation of "source" only.`;

function parseModelJson(raw: string): TranslateBatchResult {
  let text = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(text);
  if (fence) text = fence[1].trim();
  const parsed = JSON.parse(text) as { translations?: { key: string; text: string }[] };
  if (!parsed.translations || !Array.isArray(parsed.translations)) {
    throw new Error("Model JSON missing translations array");
  }
  return parsed.translations.map((t) => ({ key: t.key, text: t.text }));
}

export async function openAiTranslator(
  input: TranslateBatchInput,
  options: TranslateBatchOptions,
): Promise<TranslateBatchResult> {
  let OpenAI: (typeof import("openai"))["default"];
  try {
    const mod = await import("openai");
    OpenAI = mod.default;
  } catch {
    throw new Error(
      'Missing dependency "openai". Install it: npm install openai — and set OPENAI_API_KEY.',
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Export it in your shell or put OPENAI_API_KEY=… in a .env file next to ai-i18n.config.json (the CLI loads .env from the project root).",
    );
  }

  const client = new OpenAI({ apiKey });
  const model = options.model ?? "gpt-5-mini";
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const batches = chunk(input.entries, batchSize);
  const out: TranslateBatchResult = [];

  for (const batch of batches) {
    const user = JSON.stringify({
      targetLocale: input.targetLocale,
      sourceLocale: input.sourceLocale,
      entries: batch,
    });

    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const completion = await client.chat.completions.create({
          model,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
        });
        const raw = completion.choices[0]?.message?.content ?? "";
        const parsed = parseModelJson(raw);
        out.push(...parsed);
        lastErr = undefined;
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (lastErr) throw lastErr;
  }

  return out;
}
