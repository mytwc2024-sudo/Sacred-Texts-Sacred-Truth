# CLAUDE.md

Guidance for Claude Code and other AI assistants working in this repository.

## What this repository is

Backend + data pipeline for **Ancient Knowledge Sacred Texts (AKST)** — a
searchable digital library of the world's sacred texts. This repo is the
**connective tissue** between the platform's parts:

```
Sacred-Texts.com ──(ingestion pipeline, this repo)──▶ Supabase ──▶ Lovable frontend
                                                          ▲
                                                          └── Notion (planning / catalog)
```

- **Supabase** — project `xhzyavyftgyqzftlqdlz` ("EXTRA Ankhor MasterHub").
  AKST tables are **namespaced with the `akst_` prefix** because they share
  that project with ~400 unrelated tables (there is already a non-AKST
  `traditions` table, hence `akst_traditions`, etc.). Always keep the prefix.
- **Ingestion pipeline** (`src/`) — scrapes public-domain texts, chunks them,
  embeds them with OpenAI, writes them to Supabase.
- **Lovable frontend** — reads Supabase at runtime with the *publishable* key.
- **Notion** — where AKST is designed (workspace: Ankhor MasterHub). A
  Notion ↔ Supabase sync is a planned milestone.

> Design docs live in Notion, not this repo. Note that some Notion docs point
> at an older Supabase project ref (`gaekonovyykhqeykmuny`) that is **not** in
> the connected account — the live target is `xhzyavyftgyqzftlqdlz`.

## Repository

- **Name:** Sacred-Texts-Sacred-Truth
- **Remote:** `mytwc2024-sudo/sacred-texts-sacred-truth`
- **Default branch:** `main`

## Project structure

```
supabase/migrations/   SQL migrations (0001_akst_schema.sql — the akst_ schema)
src/
  lib/                 config, Supabase (service-role) client, OpenAI client
  ingest/              the pipeline: types, sources, scrape, chunk, store, index
.github/workflows/     ingest.yml — scheduled + on-demand ingestion
.env.example           template for local secrets (copy to .env; never commit .env)
```

## Build, run & test

```bash
npm install
cp .env.example .env          # fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
npm run typecheck             # tsc --noEmit
npm run list-sources          # print the ingestion catalog
npm run ingest:dry            # scrape + chunk only (no OpenAI, no DB writes)
npm run ingest                # full pipeline
npm run ingest -- --only "Tao Te Ching"
```

There is no automated test suite yet. `npm run typecheck` is the fast
correctness gate; `npm run ingest:dry` exercises scrape+chunk without secrets.

## Conventions & style

- **TypeScript, ESM** (`"type": "module"`). Use `.js` extensions on relative
  imports (required by ESM), `strict` + `noUncheckedIndexedAccess` are on.
- **Namespacing:** every AKST database object is prefixed `akst_`. Do not create
  un-prefixed tables in this shared Supabase project.
- **Secrets:** never hardcode keys. Everything sensitive comes from the
  environment via `src/lib/config.ts`. `.env` is gitignored. The service-role
  key is server-side only and must never reach the Lovable frontend.
- **Migrations are additive & idempotent** (`create ... if not exists`,
  policy-existence guards) so they can run safely against the shared project.
- **Politeness:** the scraper rate-limits (`INGEST_REQUEST_DELAY_MS`) and sends a
  descriptive User-Agent. Only ingest public-domain texts; always store
  attribution (`source_url`, `source_name`).

## Working conventions

- `main` is the integration branch — do not commit feature work directly to it;
  use a branch and open a PR only when asked.
- Push with `git push -u origin <branch>`; retry transient failures with
  exponential backoff (2s, 4s, 8s, 16s).
- Keep this file and `README.md` in sync with the code as the project grows.

## Notes for AI assistants

- Verify against the real tree (`git ls-files`) and the live Supabase project
  (`akst_`-prefixed tables) rather than trusting Notion docs, which contain some
  stale project refs and internally inconsistent schema names.
- Roadmap after ingestion: knowledge-graph concept extraction, the AI Q&A
  (`Ask AKST`) endpoint over `akst_search_similar_chunks`, and Notion↔Supabase
  sync.
