/**
 * Embedding backfill.
 *
 * Reads chunks that have no embedding yet straight from Supabase, embeds them
 * with OpenAI, and writes the vectors back. This decouples embedding from
 * scraping: once texts + chunks are already stored (e.g. via
 * `npm run ingest -- --skip-embeddings`, or when the source site is
 * unreachable) this fills in the vectors without re-fetching anything.
 *
 * It is safe to re-run: it only ever touches chunks whose `embedding IS NULL`,
 * so an interrupted run simply resumes where it left off.
 *
 * Usage:
 *   npm run backfill:embeddings                     # embed every null-vector chunk
 *   npm run backfill:embeddings -- --only "Psalter" # one title only
 *   npm run backfill:embeddings -- --dry-run        # count what needs embedding
 *   npm run backfill:embeddings -- --limit 500      # cap chunks embedded this run
 */
import { supabase } from '../lib/supabase.js';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const onlyIdx = args.indexOf('--only');
const ONLY = onlyIdx !== -1 ? args[onlyIdx + 1] : undefined;
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx !== -1 ? Number(args[limitIdx + 1]) : Infinity;

/** How many chunks to embed per OpenAI request. */
const EMBED_BATCH = 96;
/** How many rows to pull from the DB per page. */
const PAGE_SIZE = 200;
/** How many embedding writes to run concurrently. */
const WRITE_CONCURRENCY = 8;

function log(msg: string): void {
  console.log(`[akst-backfill] ${msg}`);
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const parts = [e.message, e.details, e.hint, e.code].filter(Boolean);
    if (parts.length > 0) return parts.join(' | ');
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

/** Resolve a title to its text id, so --only can filter chunks. */
async function resolveTextId(title: string): Promise<string> {
  const { data, error } = await supabase
    .from('akst_texts')
    .select('id')
    .eq('title', title)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No text titled "${title}" (see: npm run list-sources / the akst_texts table)`);
  return data.id;
}

/** Count chunks still missing an embedding (optionally for one text). */
async function countPending(textId?: string): Promise<number> {
  let q = supabase
    .from('akst_text_chunks')
    .select('id', { count: 'exact', head: true })
    .is('embedding', null);
  if (textId) q = q.eq('text_id', textId);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

/** Fetch one page of chunks needing an embedding. */
async function fetchPage(textId: string | undefined, size: number): Promise<{ id: string; content: string }[]> {
  let q = supabase
    .from('akst_text_chunks')
    .select('id, content')
    .is('embedding', null)
    .order('id', { ascending: true })
    .limit(size);
  if (textId) q = q.eq('text_id', textId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as { id: string; content: string }[];
}

/** Write one embedding back to its chunk. */
async function writeEmbedding(id: string, embedding: number[]): Promise<void> {
  const { error } = await supabase.from('akst_text_chunks').update({ embedding }).eq('id', id);
  if (error) throw error;
}

/** Run tasks with bounded concurrency. */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      if (item !== undefined) await fn(item);
    }
  });
  await Promise.all(workers);
}

async function main(): Promise<void> {
  const textId = ONLY ? await resolveTextId(ONLY) : undefined;

  const pending = await countPending(textId);
  log(`${pending} chunk(s) need embeddings${ONLY ? ` for "${ONLY}"` : ''}`);

  if (DRY_RUN) {
    log('[dry-run] nothing written');
    return;
  }
  if (pending === 0) {
    log('nothing to do');
    return;
  }

  // Import OpenAI only once we know we have work and are not dry-running, so
  // --dry-run works without a funded/valid OPENAI_API_KEY.
  const { embedBatch } = await import('../lib/openai.js');

  const target = Math.min(pending, LIMIT);
  let done = 0;

  while (done < target) {
    const remaining = target - done;
    const page = await fetchPage(textId, Math.min(PAGE_SIZE, remaining));
    if (page.length === 0) break; // no more null-embedding chunks

    for (let i = 0; i < page.length; i += EMBED_BATCH) {
      const slice = page.slice(i, i + EMBED_BATCH);
      const vectors = await embedBatch(slice.map((c) => c.content));
      if (vectors.length !== slice.length) {
        throw new Error(`embedding count mismatch: got ${vectors.length} for ${slice.length} inputs`);
      }
      await mapLimit(
        slice.map((c, j) => ({ id: c.id, embedding: vectors[j] as number[] })),
        WRITE_CONCURRENCY,
        ({ id, embedding }) => writeEmbedding(id, embedding),
      );
      done += slice.length;
      log(`embedded ${done}/${target}`);
    }
  }

  log(`done — ${done} chunk(s) embedded`);
}

main().catch((err) => {
  console.error(formatError(err));
  process.exit(1);
});
