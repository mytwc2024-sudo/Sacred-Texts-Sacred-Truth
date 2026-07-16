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
