import OpenAI from 'openai';
import { config } from './config.js';

const client = new OpenAI({ apiKey: config.openai.apiKey });

/**
 * Embed a batch of strings. Returns one 1536-dim vector per input, in order.
 *
 * The OpenAI embeddings endpoint accepts arrays, so we batch to cut the number
 * of round-trips. Callers should keep batches to a few hundred short chunks.
 */
export async function embedBatch(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];

  const response = await client.embeddings.create({
    model: config.openai.embeddingModel,
    input: inputs,
  });

  // The API guarantees results come back aligned to the input order via `index`.
  return response.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding as number[]);
}

/**
 * Ask a chat model for a strict-JSON answer and parse it. Used by concept
 * extraction. Returns the parsed object typed as T (caller asserts the shape).
 */
export async function extractJson<T>(
  system: string,
  user: string,
  model = 'gpt-4o-mini',
): Promise<T> {
  const response = await client.chat.completions.create({
    model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from chat model');
  return JSON.parse(content) as T;
}
