import { supabase } from '../lib/supabase.js';
import type { Chunk, TextSource } from './types.js';

/** Look up a civilization UUID by name (seeded by the migration). */
async function civilizationId(name: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('akst_civilizations')
    .select('id')
    .eq('name', name)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

/** Look up a tradition UUID by name. */
async function traditionId(name: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('akst_traditions')
    .select('id')
    .eq('name', name)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

/**
 * Upsert the text row (keyed on source_url) and return its id. Marks the row
 * `processing` while chunks are being written.
 */
export async function upsertText(
  source: TextSource,
  fullText: string,
  wordCount: number,
): Promise<string> {
  const [civId, tradId] = await Promise.all([
    civilizationId(source.civilization),
    traditionId(source.tradition),
  ]);

  const { data, error } = await supabase
    .from('akst_texts')
    .upsert(
      {
        title: source.title,
        subtitle: source.subtitle ?? null,
        author: source.author ?? null,
        translator: source.translator ?? null,
        civilization_id: civId,
        tradition_id: tradId,
        language: source.language ?? 'en',
        original_language: source.originalLanguage ?? null,
        estimated_date: source.estimatedDate ?? null,
        source_url: source.sourceUrl,
        source_name: 'Sacred-Texts.com',
        full_text: fullText,
        word_count: wordCount,
        is_public: true,
        is_featured: source.featured ?? false,
        processing_status: 'processing',
        error_message: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'source_url' },
    )
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

/**
 * Replace all chunks for a text with a fresh set. We delete first so that
 * re-ingesting a text never leaves stale chunks behind.
 */
export async function replaceChunks(
  textId: string,
  chunks: Chunk[],
  embeddings: number[][],
): Promise<void> {
  const { error: delError } = await supabase
    .from('akst_text_chunks')
    .delete()
    .eq('text_id', textId);
  if (delError) throw delError;

  if (chunks.length === 0) return;

  const rows = chunks.map((chunk, i) => ({
    text_id: textId,
    chunk_index: chunk.chunkIndex,
    content: chunk.content,
    word_count: chunk.wordCount,
    embedding: embeddings[i] ?? null,
  }));

  // Insert in batches to stay well under payload limits.
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from('akst_text_chunks').insert(rows.slice(i, i + BATCH));
    if (error) throw error;
  }
}

/** Mark a text complete and record its chunk count. */
export async function markComplete(textId: string, chunkCount: number): Promise<void> {
  const { error } = await supabase
    .from('akst_texts')
    .update({
      processing_status: 'complete',
      chunk_count: chunkCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', textId);
  if (error) throw error;
}

/** Mark a text errored with a message for later diagnosis. */
export async function markError(textId: string, message: string): Promise<void> {
  const { error } = await supabase
    .from('akst_texts')
    .update({
      processing_status: 'error',
      error_message: message.slice(0, 2000),
      updated_at: new Date().toISOString(),
    })
    .eq('id', textId);
  if (error) throw error;
}
