import type { TranslateBatchInput, TranslateBatchOptions, TranslateBatchResult } from "./types.js";

const BATCH_SIZE = 35;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

const SYSTEM = `You are a professional UI translator. Reply with ONLY valid JSON (no markdown) in this exact shape:
{"translations":[{"key":"string","text":"string"}]}
Preserve placeholders like {{name}} exactly. Include every input key once.`;

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

export async function anthropicTranslator(
  input: TranslateBatchInput,
  options: TranslateBatchOptions,
): Promise<TranslateBatchResult> {
  let Anthropic: (typeof import("@anthropic-ai/sdk"))["default"];
  try {
    const mod = await import("@anthropic-ai/sdk");
    Anthropic = mod.default;
  } catch {
    throw new Error(
      'Missing dependency "@anthropic-ai/sdk". Install it: npm install @anthropic-ai/sdk — and set ANTHROPIC_API_KEY.',
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Export it in your shell or put ANTHROPIC_API_KEY=… in a .env file at root",
    );
  }

  const client = new Anthropic({ apiKey });
  const model = options.model ?? "claude-3-5-haiku-20241022";
  const batches = chunk(input.entries, BATCH_SIZE);
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
        const msg = await client.messages.create({
          model,
          max_tokens: 8192,
          system: SYSTEM,
          messages: [{ role: "user", content: user }],
        });
        const block = msg.content.find((b) => b.type === "text");
        const raw = block && block.type === "text" ? block.text : "";
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
