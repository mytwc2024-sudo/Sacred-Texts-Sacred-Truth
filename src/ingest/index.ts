/**
 * AKST ingestion orchestrator.
 *
 * For each source in the catalog:
 *   1. Scrape its content page(s) from sacred-texts.com (rate-limited).
 *   2. Concatenate into full text and chunk it on paragraph boundaries.
 *   3. Embed each chunk with OpenAI.
 *   4. Upsert the text + replace its chunks in Supabase.
 *
 * Usage:
 *   npm run ingest            # ingest everything in the catalog
 *   npm run ingest:dry        # scrape + chunk only; no OpenAI, no DB writes
 *   npm run list-sources      # print the catalog and exit
 *   npm run ingest -- --only "Tao Te Ching"   # ingest one title
 *   npm run ingest -- --skip-embeddings        # store texts + chunks with
 *                                              # NULL vectors (no OpenAI calls);
 *                                              # backfill embeddings later
 */
import { config } from '../lib/config.js';
import { SOURCES } from './sources.js';
import { scrapePage, sleep } from './scrape.js';
import { chunkText } from './chunk.js';
import type { TextSource } from './types.js';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_EMBEDDINGS = args.includes('--skip-embeddings');
const LIST = args.includes('--list');
const onlyIdx = args.indexOf('--only');
const ONLY = onlyIdx !== -1 ? args[onlyIdx + 1] : undefined;

function log(msg: string): void {
  console.log(`[akst] ${msg}`);
}

/**
 * Preserve useful details from non-Error rejections such as PostgREST errors,
 * which reject with plain { message, details, hint, code } objects — so a bare
 * String(err) would print "[object Object]" and hide the cause.
 */
function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const value = err as Record<string, unknown>;
    const details = [value.message, value.details, value.hint, value.code]
      .filter((part): part is string => typeof part === 'string' && part.length > 0);

    if (details.length > 0) return details.join(' | ');

    try {
      return JSON.stringify(err);
    } catch {
      // Fall through for unusual values that cannot be serialized.
    }
  }

  return String(err);
}

async function ingestOne(source: TextSource): Promise<void> {
  log(`— ${source.title} (${source.tradition}) —`);

  // 1. Scrape all content pages in order.
  const parts: string[] = [];
  for (const url of source.contentUrls) {
    log(`  fetch ${url}`);
    const page = await scrapePage(url);
    parts.push(page.text);
    await sleep(config.ingest.requestDelayMs);
  }
  const fullText = parts.join('\n\n').trim();
  const wordCount = fullText === '' ? 0 : fullText.split(/\s+/).length;

  if (wordCount === 0) {
    throw new Error('no text extracted (page layout may need a custom selector)');
  }

  // 2. Chunk.
  const chunks = chunkText(fullText);
  log(`  ${wordCount} words -> ${chunks.length} chunks`);

  if (DRY_RUN) {
    log('  [dry-run] skipping embeddings + database writes');
    return;
  }

  // Lazily import the DB layer so --dry-run and --list work without secrets.
  // The OpenAI module is only imported when we actually embed, so
  // --skip-embeddings runs even with an unfunded/absent OPENAI_API_KEY.
  const { upsertText, replaceChunks, markComplete, markError } = await import('./store.js');

  const textId = await upsertText(source, fullText, wordCount);
  try {
    // 3. Embed (batch to reduce round-trips), unless embeddings are skipped.
    const embeddings: number[][] = [];
    if (SKIP_EMBEDDINGS) {
      log('  [skip-embeddings] storing chunks with NULL vectors (backfill later)');
    } else {
      const { embedBatch } = await import('../lib/openai.js');
      const BATCH = 96;
      for (let i = 0; i < chunks.length; i += BATCH) {
        const slice = chunks.slice(i, i + BATCH);
        const vectors = await embedBatch(slice.map((c) => c.content));
        embeddings.push(...vectors);
        log(`  embedded ${Math.min(i + BATCH, chunks.length)}/${chunks.length}`);
      }
    }

    // 4. Store chunks + finalize. With --skip-embeddings, `embeddings` is empty
    // and replaceChunks writes NULL for every chunk's vector.
    await replaceChunks(textId, chunks, embeddings);
    await markComplete(textId, chunks.length);
    log(`  ✓ stored ${chunks.length} chunks${SKIP_EMBEDDINGS ? ' (no embeddings)' : ''}`);
  } catch (err) {
    const message = formatError(err);
    await markError(textId, message);
    throw err;
  }
}

async function main(): Promise<void> {
  if (LIST) {
    log(`catalog (${SOURCES.length} texts):`);
    for (const s of SOURCES) log(`  • ${s.title} — ${s.civilization} / ${s.tradition}`);
    return;
  }

  const queue = ONLY ? SOURCES.filter((s) => s.title === ONLY) : SOURCES;
  if (queue.length === 0) {
    throw new Error(`No source matched --only "${ONLY}". Try: npm run list-sources`);
  }

  const mode = DRY_RUN ? '[dry-run] ' : SKIP_EMBEDDINGS ? '[skip-embeddings] ' : '';
  log(`${mode}ingesting ${queue.length} text(s)`);
  let ok = 0;
  const failures: string[] = [];

  for (const source of queue) {
    try {
      await ingestOne(source);
      ok++;
    } catch (err) {
      const message = formatError(err);
      log(`  ✗ ${source.title}: ${message}`);
      failures.push(`${source.title}: ${message}`);
    }
  }

  log(`done — ${ok} succeeded, ${failures.length} failed`);
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
