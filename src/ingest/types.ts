/** A single sacred text to ingest, described declaratively. */
export interface TextSource {
  /** Human title, e.g. "Bhagavad Gita". */
  title: string;
  subtitle?: string;
  author?: string;
  translator?: string;
  /** Must match a seeded row in akst_civilizations.name. */
  civilization: string;
  /** Must match a seeded row in akst_traditions.name. */
  tradition: string;
  language?: string;
  originalLanguage?: string;
  estimatedDate?: string;
  /**
   * Canonical page on sacred-texts.com. Used as the unique upsert key and as
   * the attribution link. For multi-page works this is the index/landing page.
   */
  sourceUrl: string;
  /**
   * Content page URLs to fetch and concatenate, in reading order. When a work
   * lives on a single page, this is just `[sourceUrl]`.
   */
  contentUrls: string[];
  featured?: boolean;
}

/** Cleaned text extracted from one source page. */
export interface ScrapedPage {
  url: string;
  text: string;
  wordCount: number;
}

/** A chunk ready to embed and store. */
export interface Chunk {
  chunkIndex: number;
  content: string;
  wordCount: number;
}
