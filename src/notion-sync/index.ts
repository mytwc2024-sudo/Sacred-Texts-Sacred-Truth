/**
 * Notion ↔ Supabase sync (one-way: Supabase is the source of truth).
 *
 * Mirrors the AKST library from Supabase into a Notion database so the team can
 * see and plan against the live catalog. Each text becomes one Notion page,
 * upserted (matched, not duplicated) on its "Source URL" property.
 *
 * Setup (see docs/SETUP.md):
 *   1. Create a Notion integration -> NOTION_TOKEN.
 *   2. Create a database with these properties and share it with the
 *      integration, then put its id in NOTION_TEXTS_DATABASE_ID:
 *        Title (title), Author (text), Tradition (select),
 *        Civilization (select), Language (text), Estimated Date (text),
 *        Word Count (number), Chunks (number), Featured (checkbox),
 *        Status (select), Source URL (url), Supabase ID (text)
 *
 * Usage:
 *   npm run sync:notion
 *   npm run sync:notion -- --dry-run   # log what would change, write nothing
 */
import { Client } from '@notionhq/client';
import { config } from '../lib/config.js';
import { supabase } from '../lib/supabase.js';

const DRY_RUN = process.argv.slice(2).includes('--dry-run');

function log(msg: string): void {
  console.log(`[notion-sync] ${msg}`);
}

interface TextRow {
  id: string;
  title: string;
  author: string | null;
  tradition_name: string | null;
  civilization_name: string | null;
  language: string | null;
  estimated_date: string | null;
  word_count: number | null;
  chunk_count: number | null;
  is_featured: boolean;
  processing_status: string;
  source_url: string | null;
}

function text(value: string | null | undefined) {
  return { rich_text: value ? [{ text: { content: value.slice(0, 2000) } }] : [] };
}
function select(value: string | null | undefined) {
  return value ? { select: { name: value.slice(0, 100) } } : { select: null };
}

function propertiesFor(row: TextRow) {
  return {
    Title: { title: [{ text: { content: row.title } }] },
    Author: text(row.author),
    Tradition: select(row.tradition_name),
    Civilization: select(row.civilization_name),
    Language: text(row.language),
    'Estimated Date': text(row.estimated_date),
    'Word Count': { number: row.word_count ?? 0 },
    Chunks: { number: row.chunk_count ?? 0 },
    Featured: { checkbox: row.is_featured },
    Status: select(row.processing_status),
    'Source URL': { url: row.source_url ?? null },
    'Supabase ID': text(row.id),
  };
}

async function findExistingPageId(notion: Client, databaseId: string, sourceUrl: string) {
  const res = await notion.databases.query({
    database_id: databaseId,
    filter: { property: 'Source URL', url: { equals: sourceUrl } },
    page_size: 1,
  });
  return res.results[0]?.id;
}

async function main(): Promise<void> {
  const { data: rows, error } = await supabase
    .from('akst_texts_with_metadata')
    .select(
      'id, title, author, tradition_name, civilization_name, language, estimated_date, word_count, chunk_count, is_featured, processing_status, source_url',
    );
  if (error) throw error;
  if (!rows || rows.length === 0) {
    log('no texts in Supabase to sync');
    return;
  }
  log(`${DRY_RUN ? '[dry-run] ' : ''}syncing ${rows.length} text(s) to Notion`);

  if (DRY_RUN) {
    for (const r of rows as TextRow[]) log(`  would upsert: ${r.title}`);
    return;
  }

  const notion = new Client({ auth: config.notion.token });
  const databaseId = config.notion.textsDatabaseId;

  let created = 0;
  let updated = 0;
  for (const row of rows as TextRow[]) {
    if (!row.source_url) {
      log(`  skip "${row.title}" (no source_url to key on)`);
      continue;
    }
    const properties = propertiesFor(row);
    const existing = await findExistingPageId(notion, databaseId, row.source_url);
    if (existing) {
      await notion.pages.update({ page_id: existing, properties: properties as never });
      updated++;
    } else {
      await notion.pages.create({
        parent: { database_id: databaseId },
        properties: properties as never,
      });
      created++;
    }
  }
  log(`done — ${created} created, ${updated} updated`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
