/** Read-only external acquisition preflight. Does not write to AKST Supabase or Notion. */
import { writeFile } from 'node:fs/promises';
import {
  CHARLES_1917_INDEX, fetchWitnessPage, extractWitnessPages, auditWitnessIndex,
  type AcquisitionReceipt,
} from '../src/ingest/enoch-witness.js';

const args = process.argv.slice(2);
const limitAt = args.indexOf('--limit');
const limit = limitAt < 0 ? 0 : Number(args[limitAt + 1]);
if (!Number.isInteger(limit) || limit < 0 || limit > 15) throw Error('--limit must be between 0 and 15; 0 means index-only preflight');
const index = await fetchWitnessPage(CHARLES_1917_INDEX);
const pages = extractWitnessPages(index.html);
const audit = auditWitnessIndex(pages);
const receipts: AcquisitionReceipt[] = [];
for (const p of pages.slice(0,limit)) {
  const result=await fetchWitnessPage(p.sourceUrl);
  receipts.push({...p,...result.receipt});
  await new Promise(resolve=>setTimeout(resolve,750));
}
const result = {
  project: 'AKST', edition:'R. H. Charles English translation, 1917',
  publicationStatus:'NO_DATABASE_WRITE_NO_PUBLICATION',
  indexUrl:CHARLES_1917_INDEX,indexSha256:index.receipt.rawSha256,
  indexByteCount:index.receipt.rawByteCount,
  audit, pages, inspectedReceipts:receipts,
};
await writeFile('enoch-charles1917-preflight.json',JSON.stringify(result,null,2)+'\n','utf8');
console.log(JSON.stringify({indexUrl:CHARLES_1917_INDEX, ...audit, inspected:receipts.length, status:result.publicationStatus}));
if (!audit.plausibleFullWitness) process.exitCode=2;
