import { config } from '../lib/config.js';
import type { Chunk } from './types.js';

/**
 * Split text into chunks of roughly `chunkSizeWords`, breaking on paragraph
 * boundaries so we never cut mid-sentence. A paragraph longer than the target
 * on its own becomes its own chunk rather than being force-split.
 */
export function chunkText(
  text: string,
  chunkSizeWords: number = config.ingest.chunkSizeWords,
): Chunk[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0);

  const chunks: Chunk[] = [];
  let buffer: string[] = [];
  let bufferWords = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    const content = buffer.join('\n\n');
    chunks.push({
      chunkIndex: chunks.length,
      content,
      wordCount: content.split(/\s+/).length,
    });
    buffer = [];
    bufferWords = 0;
  };

  for (const para of paragraphs) {
    const words = para.split(/\s+/).length;
    if (bufferWords > 0 && bufferWords + words > chunkSizeWords) {
      flush();
    }
    buffer.push(para);
    bufferWords += words;
  }
  flush();

  return chunks;
}
