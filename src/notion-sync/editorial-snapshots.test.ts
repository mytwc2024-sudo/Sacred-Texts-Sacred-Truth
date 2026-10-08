import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockTree, snapshot, patchFor } from './editorial-snapshots.js';

test('preserves nested blocks and all pagination pages', async () => {
  const calls: string[] = [];
  const blocks = await blockTree(async path => {
    calls.push(path);
    if (path.includes('/child/')) return { results: [{ id: 'nested', has_children: false }], has_more: false };
    if (path.includes('start_cursor')) return { results: [{ id: 'last', has_children: false }], has_more: false };
    return { results: [{ id: 'child', has_children: true }], has_more: true, next_cursor: 'next' };
  }, 'root');
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]?.children[0].id, 'nested');
  assert.equal(calls.length, 3);
});
test('failed nested fetch prevents a partial snapshot', async () => {
  await assert.rejects(blockTree(async path => {
    if (path.includes('/child/')) throw Error('HTTP 403');
    return { results: [{ id: 'child', has_children: true }], has_more: false };
  }, 'root'), /403/);
});
test('invalid pagination fails closed', async () => {
  await assert.rejects(blockTree(async () => ({ results: [], has_more: true }), 'root'), /pagination/);
});
test('metadata retained; no approval or publication fields changed', () => {
  const next = snapshot({ properties: {}, last_edited_time: '2026-10-07' }, []);
  const patch = patchFor({ metadata: { section_content: 'original pack', preservation_receipt: 'saved' } }, next);
  assert.equal(patch.metadata.section_content, 'original pack');
  assert.equal(patch.metadata.preservation_receipt, 'saved');
  assert.equal('editorial_status' in patch, false);
  assert.equal('is_public' in patch, false);
  assert.throws(() => snapshot({ archived: true }, []));
});
