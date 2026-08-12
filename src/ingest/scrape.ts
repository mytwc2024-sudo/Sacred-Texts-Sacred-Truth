import * as cheerio from 'cheerio';
import { config } from '../lib/config.js';
import type { ScrapedPage } from './types.js';

/** Small promise-based sleep for polite rate limiting. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

/**
 * Fetch one sacred-texts.com page and extract its readable body text.
 *
 * sacred-texts.com is old, hand-authored HTML. Content is usually the page
 * body minus navigation, the copyright footer, and the sronly "sacred-texts"
 * boilerplate. We strip obvious non-content elements, prefer <pre> blocks when
 * present (many texts are pre-formatted), and otherwise fall back to the body
 * text with normalized whitespace.
 */
export async function scrapePage(url: string): Promise<ScrapedPage> {
  const res = await fetch(url, {
    headers: { 'User-Agent': config.ingest.userAgent },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  // Remove structural / non-content noise.
  $('script, style, head, nav, header, footer, form, noscript').remove();
  // sacred-texts pages commonly bracket nav links and copyright notices in
  // small font / center tags around the body — drop the most common ones.
  $('center, hr').remove();
  $('a[href*="index.htm"], a[href*="cdshop"], a[href*="../.."]').remove();

  let text: string;
  const pre = $('pre');
  if (pre.length > 0) {
    text = pre
      .map((_, el) => $(el).text())
      .get()
      .join('\n\n');
  } else {
    text = $('body').text();
  }

  // Normalize whitespace: collapse runs of spaces, keep paragraph breaks.
  text = text
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  return { url, text, wordCount: countWords(text) };
}
