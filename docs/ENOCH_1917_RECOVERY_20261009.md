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


## Verified runtime acquisition checkpoint — 2026-10-09

**Deployed and verified:** [PR #19](https://github.com/mytwc2024-sudo/Sacred-Texts-Sacred-Truth/pull/19) merged to main as commit `fcecb6721e254f87a7c227dcf6f7924896d3850c`; AKST private witness-staging migrations were applied and their RLS / absent client grants queried. Automated `Oracle Contract CI` and `AKST Private Enoch Witness Stage` workflows passed on the last PR head. The isolated `akst-stage-enoch-1917` handler was **deployed**, ACTIVE at **version 1**, with its custom transport-secret verification; the existing `akst-ingest-sacred-texts` handler remains untouched.

**Actual database readback:**
- The 1917 Charles index was acquired via the isolated handler (HTTP 200); the private `akst_reconciliation.enoch_witness_stage_runs` register now has **113 indexed source-page records**, stage `collecting`, publication `NOT_AUTHORIZED`.
- First page acquisition rounds **successfully fetched 30 pages**, with **83 still pending and 0 fetch failures** at this checkpoint. All 30 have byte count, raw encoded original bytes, and SHA-256 hashes. An independent SQL re-hash of decoded original bytes returned **30/30 matches**.
- **Chapter XX** (source index sequence 24, `boe023.htm`) is acquired privately, alongside Chapters I, VI, VIII and others. The later Chapter LXIX, LXXII and final CVIII are **indexed but not yet fetched**.
- Index-headings audit: 113 distinct linked page files, **106 distinct numbered chapter labels**; **55 and 81 absent as labels**, with duplicated labels **54, 71, and 91**. These reflect source-index labeling inconsistencies; do not infer the underlying original chapters are missing until individual page headings and contents are inspected. Preserve source sequence and original headings.

**Crucial limitation:** This is **30 / 113 raw source pages privately staged**, not a complete ingested `akst_texts` witness, not verified 108-chapter reconstruction, and not public content. The old rights-cleared Enoch jobs remain manually gated. The next acquisition rounds and exact source/verse alignment require continued authenticated retrieval with individual integrity readback. No new public Luminaria data or private Notion visitor link was created.

**Next checkpoint:** Finish the 83 pending page acquisitions with strict pinned-host/hash checks, reconcile mislabeled chapter headings against page contents, reconstruct the exact Charles 1917 text privately, assess rights and edition completeness, and separately approve promotion into the canonical AKST text tables. Until complete, **never label Enoch fully ingested or release the Atlas as source-complete**.


### Unauthenticated transport smoke test (2026-10-09)
A POST with JSON action `status` but **no private transport token** was sent to the isolated deployed staging handler. AKST `pg_net` response ID `14809` returned **HTTP 401**, confirming an unauthenticated request was denied. The authenticated index/page acquisition returned successful requests and 30 verified source records. This does not replace a full adversarial security audit. No secret or raw private witness was returned in this report.
