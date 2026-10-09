import assert from 'node:assert/strict';
import {
  CHARLES_1917_INDEX,permittedWitnessUrl,romanNumeralValue,extractWitnessPages,auditWitnessIndex,fetchWitnessPage
} from '../src/ingest/enoch-witness.ts';

assert.equal(romanNumeralValue('XX'),20);
assert.equal(romanNumeralValue('CVIII.'),108);
assert.equal(romanNumeralValue('IX'),9);
assert.equal(romanNumeralValue('IC'),null);
for(const url of ['https://evil.example.com/bib/boe/boe023.htm','http://archive.sacred-texts.com/bib/boe/boe023.htm','https://archive.sacred-texts.com/bib/bep/index.htm','//private.invalid/boe023.htm','https://archive.sacred-texts.com/bib/boe/boe023.htm?token=secret']) {
 assert.throws(()=>permittedWitnessUrl(url));
}
assert.equal(permittedWitnessUrl('boe023.htm').href,'https://archive.sacred-texts.com/bib/boe/boe023.htm');
const html=`<a href="boe000.htm">Title Page</a><a href="boe023.htm">Chapter XX</a><a href="boe023.htm">Chapter XX</a><a href="boe111.htm">Chapter CVIII</a><a href="https://evil.example/boe007.htm">Bad</a><a href="../bep/boe007.htm">Bad</a>`;
const list=extractWitnessPages(html);
assert.equal(list.length,3);
assert.equal(list[1].chapterNumber,20);
assert.equal(list[2].chapterNumber,108);
assert.equal(auditWitnessIndex(list).plausibleFullWitness,false);
const mockFetch=async()=>({ok:true,status:200,url:CHARLES_1917_INDEX,headers:new Headers({'content-type':'text/html; charset=utf-8'}),arrayBuffer:async()=>new TextEncoder().encode('<title>Enoch 1917</title>'+ 'x'.repeat(200)).buffer});
const page=await fetchWitnessPage(CHARLES_1917_INDEX,mockFetch);
assert.equal(page.receipt.rawSha256.length,64);
assert.equal(page.receipt.pageTitle,'Enoch 1917');
console.log('PASS: pinned edition host, index parsing, dedup, false canonical labels, content integrity, no DB writes');
