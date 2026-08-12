/**
 * Central configuration, loaded from environment variables.
 *
 * Node 20.6+ loads `.env` automatically when started with `--env-file=.env`;
 * the npm scripts and CI pass that flag. We intentionally do NOT hardcode any
 * secret here — everything sensitive comes from the environment.
 *
 * The secret-bearing sections (`supabase`, `openai`) are exposed as lazy
 * getters so that commands which don't touch them — `--list`, `--dry-run` —
 * run without any secrets configured. They only throw when actually accessed.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Copy .env.example to .env and fill it in (see README).`,
    );
  }
  return value;
}

function optionalNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  get supabase() {
    return {
      url: required('SUPABASE_URL'),
      serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    };
  },
  get openai() {
    return {
      apiKey: required('OPENAI_API_KEY'),
      embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      /** text-embedding-3-small => 1536 dims, which matches the schema. */
      embeddingDimensions: 1536,
    };
  },
  get notion() {
    return {
      token: required('NOTION_TOKEN'),
      textsDatabaseId: required('NOTION_TEXTS_DATABASE_ID'),
    };
  },
  ingest: {
    requestDelayMs: optionalNumber('INGEST_REQUEST_DELAY_MS', 1500),
    chunkSizeWords: optionalNumber('INGEST_CHUNK_SIZE_WORDS', 800),
    userAgent:
      process.env.INGEST_USER_AGENT ||
      'AKST-Ingestion/0.1 (+https://github.com/mytwc2024-sudo/Sacred-Texts-Sacred-Truth)',
  },
} as const;
