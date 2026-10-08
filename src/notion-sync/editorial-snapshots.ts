/** Private Notion -> AKST snapshots. Does not promote evidence or publish works. */
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const PAGE_IDS = ['3e17d9c166ab8165bba0c5c3618e3bde', '3f27d9c166ab819ab660f0afc08ee331'];
type Json = Record<string, any>;
type Request = (path: string) => Promise<Json>;

export async function blockTree(request: Request, id: string, budget = { remaining: 10000 }, depth = 0): Promise<Json[]> {
  if (depth > 30) throw new Error('block depth limit exceeded');
  const blocks: Json[] = [];
  let cursor: string | null = null;
  const seen = new Set<string>();
  do {
    const page = await request(`/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (!Array.isArray(page.results)) throw new Error('invalid block response');
    for (const block of page.results) {
      if (--budget.remaining < 0) throw new Error('block budget exceeded');
      blocks.push({ ...block, children: block.has_children ? await blockTree(request, block.id, budget, depth + 1) : [] });
    }
    cursor = page.has_more ? page.next_cursor : null;
    if (page.has_more && (!cursor || seen.has(cursor))) throw new Error('invalid pagination cursor');
    if (cursor) seen.add(cursor);
  } while (cursor);
  return blocks;
}

export function snapshot(page: Json, blocks: Json[]) {
  if (page.archived || page.in_trash) throw new Error('page unavailable; retain prior snapshot');
  const content = { properties: page.properties, blocks };
  const hash = createHash('sha256').update(canonical(content)).digest('hex');
  return { hash, content, last_edited_time: page.last_edited_time };
}

export function patchFor(existing: Json, next: ReturnType<typeof snapshot>) {
  return {
    content_hash: next.hash,
    sync_status: 'synced',
    metadata: { ...existing.metadata, notion_snapshot: next, automatic_sync: 'snapshot worker; no evidence promotion or publishing' },
    last_synced_at: new Date().toISOString(),
  };
}

async function main() {
  const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`missing ${name}`); return value; };
  const token = required('NOTION_TOKEN');
  const base = required('SUPABASE_URL').replace(/\/$/, '');
  if (base !== 'https://xhzyavyftgyqzftlqdlz.supabase.co') throw new Error('AKST project mismatch');
  const key = required('SUPABASE_SERVICE_ROLE_KEY');
  const notion = async (path: string): Promise<Json> => {
    const response = await fetch(`https://api.notion.com/v1${path}`, { headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28' }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Notion HTTP ${response.status}`);
    return response.json() as Promise<Json>;
  };
  const db = async (query: string, init: RequestInit = {}) => {
    const response = await fetch(`${base}/rest/v1/akst_editorial_sources?${query}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Supabase HTTP ${response.status}`);
    return response.json() as Promise<Json[]>;
  };
  for (const id of PAGE_IDS) {
    const page = await notion(`/pages/${id}`);
    const blocks = await blockTree(notion, id);
    const after = await notion(`/pages/${id}`);
    if (after.last_edited_time !== page.last_edited_time) throw new Error('page changed during read; retry next run');
    const next = snapshot(after, blocks);
    const filter = `notion_page_id=eq.${id}`;
    const rows = await db(`${filter}&select=*`);
    if (rows.length !== 1) throw new Error('expected existing registered page; no automatic creation');
    const existing = rows[0]!;
    if (existing.content_hash === next.hash) { console.log(`${id}: unchanged`); continue; }
    if (process.argv.includes('--dry-run')) { console.log(`${id}: would snapshot`); continue; }
    // Compare-and-set prevents overwriting another writer's metadata or approval changes.
    const result = await db(`${filter}&updated_at=eq.${encodeURIComponent(existing.updated_at)}`, { method: 'PATCH', body: JSON.stringify(patchFor(existing, next)) });
    if (result.length !== 1) throw new Error('concurrent edit; snapshot not saved');
    const verified = await db(`${filter}&select=content_hash,metadata`);
    if (verified[0]?.content_hash !== next.hash || JSON.stringify(verified[0]?.metadata?.notion_snapshot?.content) !== JSON.stringify(next.content)) {
      // JSONB reorders object keys; verify canonical equality below instead.
      if (verified[0]?.content_hash !== next.hash || canonical(verified[0]?.metadata?.notion_snapshot?.content) !== canonical(next.content)) throw new Error('snapshot readback mismatch');
    }
    console.log(`${id}: saved and verified`);
  }
}

function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : 'snapshot failed'); process.exitCode = 1; });
}
