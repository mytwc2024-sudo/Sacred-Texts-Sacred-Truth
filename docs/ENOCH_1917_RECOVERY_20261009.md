# AKST / First Enoch ingestion recovery — source preflight, not publication

**Status:** read-only preflight code prepared on a review branch. The 1917 R. H. Charles witness remains **not ingested into AKST**. The existing ingestion jobs are still blocked with 530 host-fetch errors and marked human-adjudication required. Do not edit their state based on this document.

## Verified infrastructure evidence

The deployed AKST `akst-ingest-sacred-texts` Edge Function at version 10 rewrites `sacred-texts.com` to `original.sacred-texts.com`, where both registered First Enoch source requests previously failed with HTTP 530. A **new read-only connectivity probe** from the same Supabase project's PostgreSQL `pg_net` service to `https://archive.sacred-texts.com/bib/boe/index.htm` returned **HTTP 200** (request 14210). This does **not** establish that the Edge Function has the same egress behavior, or that index parsing/full chapter ingestion works.

The Charles 1917 online index was independently inspected; it lists the main chapters through CVIII with inconsistent/duplicate chapter headings (e.g. duplicate LIV and LXXI labels). The source URL, ordered page sequence and original labels must be preserved rather than making up contiguous canonical verses.

## Changes in this branch

- `src/ingest/enoch-witness.ts` pins the exact `archive.sacred-texts.com/bib/boe` host and document URL grammar, rejects unsafe redirects and cross-host URLs, discovers ordered links without collapsing duplicate *labels*, computes SHA-256 metadata for fetched pages, and flags source-index anomalies.
- `scripts/audit-enoch-witness.ts` runs index-only by default; `--limit N` checks at most 15 child files while rate-limiting requests. It writes a local *metadata manifest only*, no source text and **no network data to AKST tables or public Luminaria**.
- `scripts/test-enoch-witness.mjs` contains fixture tests for hostile URLs, index de-duplication, Roman numeral parsing and witness hashes.

Run `npm run test:enoch` and `npm run audit:enoch` on a machine with network access and Node tooling. `npm run audit:enoch -- --limit 2` checks index plus two sources. Report index count, named chapter omissions, duplicates, hashes and failures; verify the expected actual edition with a human review of the title page and chapter XX.

## Safety gates remaining

1. Prove source-host fetch/parsing from **AKST Edge Function runtime** (not merely browser or pg_net).
2. Do not patch the deployed function by globally changing every source host; use a scoped source-witness fallback pinned to the Charles source registry ID.
3. The deployed function currently moves any successfully reconstructed witness directly to `verification_status='accepted'`, `is_public=true`, `access_scope='public'`. **That is unsafe for an unreviewed new Enoch corpus.** Implement private/staging acquisition and independent witness completeness/edition review before any acceptance and release.
4. Prove page-level ingestion of chapters 1–108, including whether separate chapter IX, XX, LXIX and LXXII–LXXXII witnesses are complete and accurately located; preserve duplicate historical page labels.
5. Ensure private RLS, exact rights/edition information, source checksums, and read-back evidence. Publish curated angelic dossier claims only via a separate audited approval path, never via private Notion or public reconciliation tables.
6. Leave the earlier *Calls of Enoch* (Dee/Kelley tradition) on rights hold. It is not ancient 1 Enoch.

**Next deployment:** After a reviewed scoped fix and a runtime dry-run prove content integrity, ingest privately through the canonical AKST workflow and only then reconcile 1 Enoch chapter 20 with the Luminaria Angelic Realm Atlas. Do not merge unrelated open project drafts indiscriminately.


## Implementation checkpoint — private staging (2026-10-09)

**Verified production AKST database DDL, without any public records:** migration `20261009_enoch_private_stage.sql` created two tables under existing restricted `akst_reconciliation` schema. `20261009_enoch_stage_exact_bytes.sql` added raw-byte base64 retention for verifiable SHA-256. SQL read-back confirmed **RLS enabled and zero SELECT privileges for `anon`, `authenticated`, and `service_role`** on these specific stage tables. No source acquisition rows are presumed present until a separately verified fetch.

The new function source `supabase/functions/akst-stage-enoch-1917/index.ts` is an **isolated collector**, not a replacement for the existing ingest function. It accepts transport-authenticated POST actions `discover`, `collect`, `status`; pins all network requests to one known 1917 archival host and known index/page names; stages exact encoded HTTP bytes, hashes, decoded HTML and page labels; disallows unsafe redirects and never touches `akst_texts`, `akst_text_chunks`, `akst_source_assets`, existing ingest jobs, or public publication fields. A run can end only at `acquired_pending_review`, with `publication_status='NOT_AUTHORIZED'` enforced in SQL. It must not be accessible from the public Luminaria client.

**Do not mislabel source-code existence as runtime:** the new function is not deployed until the Deno/Node CI checks and integration safeguards pass. The database staging tables do not themselves contain the complete Enoch book. Once the function is deployed securely, independently verify its private transport authentication, discover one index, enumerate every source page, fetch in bounded batches, reread page statuses and checksums, and independently compare all 108 chapter labels against the original edition. The preexisting two HTTP-530 jobs remain gated and unchanged. Do not use this staged data to bypass a subsequent separate editorial acceptance/publication decision.
