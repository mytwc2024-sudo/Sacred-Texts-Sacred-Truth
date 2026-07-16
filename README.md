# AKST — Ancient Knowledge Sacred Texts

Backend + data pipeline for **Ancient Knowledge Sacred Texts (AKST)** — a
searchable digital library of the world's sacred texts. This repository holds
the code that **connects the moving parts** of the platform:

```
Sacred-Texts.com ──(ingestion pipeline, this repo)──▶ Supabase ──▶ Lovable frontend
                                                          ▲
                                                          └── Notion (planning / catalog)
```

- **Supabase** (project `xhzyavyftgyqzftlqdlz`, "EXTRA Ankhor MasterHub") — the
  database. AKST tables are namespaced with the `akst_` prefix so they live
  cleanly alongside the other tables in that shared project.
- **Ingestion pipeline** (this repo) — scrapes public-domain texts from
  Sacred-Texts.com, chunks them, generates OpenAI embeddings, and writes them
  to Supabase.
- **Lovable frontend** — reads from Supabase at runtime using the *publishable*
  key (never the service-role key). Lovable syncs its own code to GitHub.
- **Notion** — where the platform is designed and the catalog is planned. A
  Notion ↔ Supabase sync is a planned next milestone.

## Current status

**Milestone 1 (in progress): Sacred-Texts.com → Supabase ingestion pipeline.**

- ✅ Namespaced schema: `supabase/migrations/0001_akst_schema.sql`
- ✅ Ingestion pipeline: `src/`
- ⬜ Schema applied to the Supabase project
- ⬜ First texts ingested and verified

## Prerequisites

- Node.js ≥ 20
- A Supabase **service-role** key for project `xhzyavyftgyqzftlqdlz`
- An OpenAI API key (for embeddings)

## Setup

```bash
npm install
cp .env.example .env      # then fill in the three secrets
```

`.env` (gitignored — never commit it):

| Variable | What it is |
| --- | --- |
| `SUPABASE_URL` | `https://xhzyavyftgyqzftlqdlz.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side key. **Never** ship to the browser. |
| `OPENAI_API_KEY` | Used to embed chunks (`text-embedding-3-small`, 1536 dims). |

## Deploy the schema

Apply `supabase/migrations/0001_akst_schema.sql` to the project once (via the
Supabase SQL editor or the Supabase CLI). It is additive and idempotent — it
only creates `akst_*` objects and never touches existing tables.

## Run the pipeline

```bash
npm run list-sources          # print the catalog
npm run ingest:dry            # scrape + chunk only (no OpenAI, no DB writes)
npm run ingest                # full run: scrape → chunk → embed → store
npm run ingest -- --only "Tao Te Ching"   # a single title
```

The npm scripts load `.env` automatically. Re-running is safe: each text is
upserted on its `source_url` and its chunks are replaced, so you never get
duplicates.

## What ends up in the database

| Table | Contents |
| --- | --- |
| `akst_texts` | One row per text (metadata + full text). Keyed on `source_url`. |
| `akst_text_chunks` | ~800-word chunks with a `vector(1536)` embedding each. |
| `akst_civilizations`, `akst_traditions` | Taxonomy (seeded by the migration). |
| `akst_concepts`, `akst_concept_edges`, `akst_concept_mentions` | Knowledge graph (future milestone). |
| `akst_reading_paths`, `akst_collections` | Curated journeys / saved sets. |

Search helpers: `akst_search_similar_chunks()` (vector), `akst_search_texts()`
(full-text), `akst_get_concept_network()` (graph walk), and the
`akst_texts_with_metadata` view.

## Automation

`.github/workflows/ingest.yml` runs ingestion weekly and on demand. Configure
these repo secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`.

## Security notes

- The **service-role key bypasses RLS** — it lives only in `.env` / CI secrets
  and only in this server-side pipeline. The Lovable frontend uses the
  publishable key.
- Attribution: every text stores its `source_url` / `source_name` back to
  Sacred-Texts.com. Only public-domain texts are ingested.
