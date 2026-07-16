import type { TextSource } from './types.js';

/**
 * Seed catalog — the first texts to ingest.
 *
 * These mirror the five featured texts in the AKST deployment doc. Each
 * `civilization` / `tradition` value must match a row seeded by the schema
 * migration (0001_akst_schema.sql). Add more entries here to grow the library;
 * re-running ingestion is safe because upserts key on `sourceUrl`.
 *
 * `contentUrls` lists the actual text pages in reading order. Some works on
 * sacred-texts.com are split across many chapter pages; for the MVP we point
 * at representative content pages and can expand coverage per-text later.
 */
export const SOURCES: TextSource[] = [
  {
    title: 'Tao Te Ching',
    subtitle: 'The Way and Its Power',
    author: 'Lao Tzu',
    translator: 'James Legge',
    civilization: 'Ancient China',
    tradition: 'Taoism',
    language: 'en',
    originalLanguage: 'Classical Chinese',
    estimatedDate: '400 BCE',
    sourceUrl: 'https://sacred-texts.com/tao/taote.htm',
    contentUrls: ['https://sacred-texts.com/tao/taote.htm'],
    featured: true,
  },
  {
    title: 'Dhammapada',
    subtitle: 'The Path of Truth',
    author: 'Attributed to the Buddha',
    translator: 'F. Max Müller',
    civilization: 'Buddhism',
    tradition: 'Theravada',
    language: 'en',
    originalLanguage: 'Pali',
    estimatedDate: '300 BCE',
    sourceUrl: 'https://sacred-texts.com/bud/sbe10/index.htm',
    contentUrls: [
      'https://sacred-texts.com/bud/sbe10/sbe1003.htm',
      'https://sacred-texts.com/bud/sbe10/sbe1004.htm',
      'https://sacred-texts.com/bud/sbe10/sbe1005.htm',
    ],
    featured: true,
  },
  {
    title: 'Gospel of Thomas',
    subtitle: 'The Gnostic Sayings of Jesus',
    translator: 'Various',
    civilization: 'Early Christianity',
    tradition: 'Gnosticism',
    language: 'en',
    originalLanguage: 'Coptic',
    estimatedDate: '50-140 CE',
    sourceUrl: 'https://sacred-texts.com/chr/thomas.htm',
    contentUrls: ['https://sacred-texts.com/chr/thomas.htm'],
    featured: true,
  },
];
