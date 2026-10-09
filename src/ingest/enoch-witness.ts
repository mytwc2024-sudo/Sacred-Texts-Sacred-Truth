/**
 * 1 Enoch (R. H. Charles, 1917) source-witness preflight.
 * Intentionally NO database client, no source status mutation, and no publication.
 * This module does not replace the deployed AKST ingest handler.
 */
import { createHash } from 'node:crypto';

export const CHARLES_1917_INDEX = 'https://archive.sacred-texts.com/bib/boe/index.htm';
const SOURCE_ORIGIN = 'https://archive.sacred-texts.com';
const SOURCE_PATH = /^\/bib\/boe\/(?:index|boe\d{3})\.htm$/;

export interface WitnessPage {
  sequence: number;
  sourceUrl: string;
  indexLabel: string;
  chapterNumber: number | null;
}
export interface AcquisitionReceipt extends WitnessPage {
  rawSha256: string;
  rawByteCount: number;
  contentType: string;
  pageTitle: string;
}

export function permittedWitnessUrl(raw: string, base = CHARLES_1917_INDEX): URL {
  if (typeof raw !== 'string' || /[\\\r\n\t]/.test(raw)) throw new Error('Malformed source URL');
  const url = new URL(raw, base);
  if (url.protocol !== 'https:' || url.origin !== SOURCE_ORIGIN || url.username || url.password ||
      url.search || url.hash || !SOURCE_PATH.test(url.pathname)) {
    throw new Error(`Source URL not in pinned R. H. Charles 1917 witness: ${url.origin}${url.pathname}`);
  }
  return url;
}

/** 1=I ... 108=CVIII. Used for warnings; chapter labels are not rewritten. */
export function romanNumeralValue(input: string): number | null {
  const s = input.trim().toUpperCase().replace(/\.$/, '');
  if (!/^(?=[MDCLXVI]+$)M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(s)) return null;
  const values: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const current = values[s.charAt(i)] ?? 0;
    const next = values[s.charAt(i + 1)] ?? 0;
    n += next > current ? -current : current;
  }
  return n;
}

function htmlLabel(fragment: string): string {
  return fragment.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}

export function extractWitnessPages(indexHtml: string): WitnessPage[] {
  const pages: WitnessPage[] = [];
  const seen = new Set<string>();
  const anchors = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi;
  for (const match of indexHtml.matchAll(anchors)) {
    let url: URL;
    try { url = permittedWitnessUrl(match[1] ?? ''); } catch { continue; }
    if (url.pathname.endsWith('index.htm') || !/\/boe\d{3}\.htm$/.test(url.pathname)) continue;
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    const label = htmlLabel(match[2] ?? '');
    const chapter = label.match(/\bchapter\s+([IVXLCDM]+)\b/i);
    pages.push({ sequence: pages.length + 1, sourceUrl: url.href, indexLabel: label,
      chapterNumber: chapter ? romanNumeralValue(chapter[1] ?? '') : null });
  }
  return pages;
}

export function auditWitnessIndex(pages: readonly WitnessPage[]) {
  const allNumbers = new Set(pages.map(p => p.chapterNumber).filter((n): n is number => n !== null));
  const duplicateChapterNumbers = [...new Set(pages.filter(p => p.chapterNumber !== null &&
    pages.filter(x => x.chapterNumber === p.chapterNumber).length > 1).map(p => p.chapterNumber as number))].sort((a,b)=>a-b);
  // The historical site's navigation has repeated/mislabeled headings.
  // Treat labels as evidence, not as an excuse to silently overwrite canonical verses.
  const missingChapterNumbers = Array.from({length:108},(_,i)=>i+1).filter(n=>!allNumbers.has(n));
  return { pages: pages.length, chapterLabels: allNumbers.size, missingChapterNumbers, duplicateChapterNumbers,
    hasChapter20: allNumbers.has(20), hasChapter108: allNumbers.has(108),
    plausibleFullWitness: pages.length >= 105 && allNumbers.has(20) && allNumbers.has(108) };
}

export async function fetchWitnessPage(url: string, fetchImpl: typeof fetch = fetch): Promise<{ html: string; receipt: {rawSha256:string;rawByteCount:number;contentType:string;pageTitle:string} }> {
  const requested = permittedWitnessUrl(url);
  const res = await fetchImpl(requested.href, {
    redirect: 'manual',
    headers: { accept: 'text/html', 'user-agent': 'AKST-Witness-Audit/1.0 (no automatic publication)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Witness fetch failed: HTTP ${res.status} ${requested.pathname}`);
  if (res.url && res.url !== requested.href) throw new Error('Witness URL changed unexpectedly');
  const type = res.headers.get('content-type') ?? '';
  if (!/text\/html/i.test(type)) throw new Error(`Unexpected content type: ${type}`);
  const raw = await res.arrayBuffer();
  if (raw.byteLength < 100 || raw.byteLength > 600_000) throw new Error('Witness page outside expected size limits');
  const html = new TextDecoder().decode(raw);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return { html, receipt: {
    rawSha256:createHash('sha256').update(Buffer.from(raw)).digest('hex'),
    rawByteCount:raw.byteLength,contentType:type,pageTitle:title?htmlLabel(title[1] ?? ''):''
  } };
}
