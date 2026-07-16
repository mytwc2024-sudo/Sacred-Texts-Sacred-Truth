/**
 * Concept extraction — populates the AKST knowledge graph.
 *
 * For each fully-ingested text that has no concept mentions yet, this asks an
 * LLM to identify the philosophical/spiritual concepts present, then:
 *   - upserts each concept into akst_concepts (unique by name),
 *   - links it to the chunks that mention it in akst_concept_mentions,
 *   - refreshes akst_concepts.mention_count.
 *
 * Usage:
 *   npm run concepts                 # process texts missing concepts
 *   npm run concepts -- --force      # re-extract even if mentions exist
 *   npm run concepts -- --only "Tao Te Ching"
 *
 * Cost is bounded: we sample up to MAX_CHUNKS chunks per text for extraction.
 */
import { supabase } from '../lib/supabase.js';
import { extractJson } from '../lib/openai.js';

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const onlyIdx = args.indexOf('--only');
const ONLY = onlyIdx !== -1 ? args[onlyIdx + 1] : undefined;

const MAX_CHUNKS = 24;
const VALID_TYPES = ['theme', 'character', 'place', 'practice', 'deity', 'philosophy'] as const;
type ConceptType = (typeof VALID_TYPES)[number];

interface ExtractedConcept {
  name: string;
  type: ConceptType;
  description?: string;
  chunk_indices: number[];
  confidence?: number;
}

function log(msg: string): void {
  console.log(`[concepts] ${msg}`);
}

const SYSTEM =
  'You extract the key philosophical, spiritual, and mythological concepts from ' +
  'passages of a sacred text. Return strict JSON of the form ' +
  '{"concepts":[{"name":"Soul","type":"theme","description":"...","chunk_indices":[0,3],"confidence":0.9}]}. ' +
  `"type" must be one of: ${VALID_TYPES.join(', ')}. Use canonical, singular, ` +
  'title-case names (e.g. "Karma", "Atman", "The Dao"). Only include concepts ' +
  'actually discussed. chunk_indices must reference the provided chunk numbers.';

async function processText(text: { id: string; title: string }): Promise<void> {
  log(`— ${text.title} —`);

  const { data: chunks, error: chunkErr } = await supabase
    .from('akst_text_chunks')
    .select('id, chunk_index, content')
    .eq('text_id', text.id)
    .order('chunk_index', { ascending: true });
  if (chunkErr) throw chunkErr;
  if (!chunks || chunks.length === 0) {
    log('  no chunks; skipping');
    return;
  }

  // Sample evenly across the text to stay within budget.
  const step = Math.max(1, Math.floor(chunks.length / MAX_CHUNKS));
  const sample = chunks.filter((_, i) => i % step === 0).slice(0, MAX_CHUNKS);
  const idToChunk = new Map(chunks.map((c) => [c.chunk_index, c.id] as const));

  const userMsg = sample
    .map((c) => `Chunk ${c.chunk_index}:\n${c.content}`)
    .join('\n\n---\n\n');

  const result = await extractJson<{ concepts: ExtractedConcept[] }>(SYSTEM, userMsg);
  const concepts = (result.concepts ?? []).filter(
    (c) => c.name && VALID_TYPES.includes(c.type),
  );
  log(`  extracted ${concepts.length} concepts from ${sample.length}/${chunks.length} chunks`);

  for (const concept of concepts) {
    // Upsert the concept (unique by name).
    const { data: conceptRow, error: upErr } = await supabase
      .from('akst_concepts')
      .upsert(
        {
          name: concept.name.trim(),
          concept_type: concept.type,
          description: concept.description ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'name' },
      )
      .select('id')
      .single();
    if (upErr) throw upErr;

    // Link to the sampled chunks that mention it.
    const mentions = concept.chunk_indices
      .map((idx) => idToChunk.get(idx))
      .filter((id): id is string => Boolean(id))
      .map((chunkId) => ({
        concept_id: conceptRow.id,
        chunk_id: chunkId,
        text_id: text.id,
        confidence: concept.confidence ?? 0.8,
      }));

    if (mentions.length > 0) {
      const { error: mErr } = await supabase
        .from('akst_concept_mentions')
        .upsert(mentions, { onConflict: 'concept_id,chunk_id' });
      if (mErr) throw mErr;
    }
  }

  // Refresh mention counts for the concepts we just touched.
  await refreshMentionCounts(concepts.map((c) => c.name.trim()));
  log(`  ✓ linked concepts for "${text.title}"`);
}

async function refreshMentionCounts(names: string[]): Promise<void> {
  for (const name of [...new Set(names)]) {
    const { data: c } = await supabase.from('akst_concepts').select('id').eq('name', name).maybeSingle();
    if (!c) continue;
    const { count } = await supabase
      .from('akst_concept_mentions')
      .select('id', { count: 'exact', head: true })
      .eq('concept_id', c.id);
    await supabase.from('akst_concepts').update({ mention_count: count ?? 0 }).eq('id', c.id);
  }
}

async function main(): Promise<void> {
  let query = supabase
    .from('akst_texts')
    .select('id, title')
    .eq('processing_status', 'complete');
  if (ONLY) query = query.eq('title', ONLY);

  const { data: texts, error } = await query;
  if (error) throw error;
  if (!texts || texts.length === 0) {
    log('no completed texts to process');
    return;
  }

  let processed = 0;
  for (const text of texts) {
    if (!FORCE) {
      const { count } = await supabase
        .from('akst_concept_mentions')
        .select('id', { count: 'exact', head: true })
        .eq('text_id', text.id);
      if ((count ?? 0) > 0) {
        log(`skip "${text.title}" (already has concepts; use --force to redo)`);
        continue;
      }
    }
    await processText(text);
    processed++;
  }
  log(`done — processed ${processed} text(s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
