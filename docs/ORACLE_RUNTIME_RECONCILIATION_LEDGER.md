# AKST Oracle — Stage 2.0 Runtime / Source Reconciliation Ledger

**Status:** evidence snapshot / recovery plan  
**Scope:** AKST Oracle runtime, retrieval, embeddings, source-control ownership  
**Production mutation:** none  
**Parent map:** `docs/ORACLE_EVOLUTION_MAP.md`

---

## 1. Purpose

Stage 2.0 exists because the deployed AKST Oracle runtime is materially ahead of the canonical backend repository. The objective is not to rewrite Oracle and not to redeploy working production components. The objective is to recover the deployed architecture into traceable, reviewable canonical source control before Stage 2.1 changes the answer contract.

This ledger reconciles four surfaces:

1. **Canonical backend:** `mytwc2024-sudo/Sacred-Texts-Sacred-Truth` (`main`)
2. **Product frontend:** `mytwc2024-sudo/app-forge-studio-78` (`main`)
3. **Recovery branch:** `mytwc2024-sudo/app-forge-studio-78` (`agent/oracle-nervous-system`)
4. **Governed runtime:** Supabase project `xhzyavyftgyqzftlqdlz`

### Reconciliation rule

> Recover first. Compare second. Change runtime only after provenance, contract, auth, and regression gates are explicit.

No artifact is deleted or replaced merely because another artifact appears newer.

---

## 2. Executive finding

The live runtime contains an Oracle nervous system that is not represented in canonical backend `main`.

Canonical backend `main` currently contains the legacy Edge Function:

- `supabase/functions/akst-ask/index.ts`

and the embedded Lovable hook calls `akst-ask`.

The live AKST product frontend (`app-forge-studio-78/main/src/pages/Ask.tsx`) calls a different endpoint:

- `ask-akst`

The governed runtime contains `ask-akst` plus a wider Oracle stack (`oracle-query`, `oracle-health`, `oracle-client`, voice, Well 3 ingestion, native embedding workers and diagnostics).

The old `agent/oracle-nervous-system` branch contains source lineage for most of that wider stack, but it must be treated as a **recovery source**, not blindly merged as canonical truth. At least one deployed component (`native-embedding-diagnostic`) is live without a corresponding file in the inspected recovery-branch tree.

**Stage 2.0 conclusion:** production is not missing Oracle. Source control is missing production history.

---

## 3. Status vocabulary

| Status | Meaning | Allowed Stage 2.0 action |
|---|---|---|
| `LIVE_SOURCE_MATCH` | Live component has a strong source-lineage candidate | Recover into canonical backend after source comparison |
| `LIVE_SOURCE_MISSING` | Live component exists but inspected repositories do not contain its source | Export/capture deployed source before any edit |
| `LIVE_LEGACY_CONFLICT` | Live behavior conflicts with a canonical-repo legacy path/name/contract | Preserve both; resolve in Stage 2.1 contract migration |
| `REPO_RECOVERY_ONLY` | Source exists on old branch but production status is not established | Keep as reference; do not deploy automatically |
| `CANONICAL_LEGACY` | Source exists in canonical backend but is not the product's current live call path | Freeze pending contract decision |
| `RUNTIME_SCHEMA_AHEAD` | DB object exists live but migration lineage is not canonicalized | Recover migration lineage / schema snapshot |

---

## 4. Edge Function reconciliation

The runtime currently has **11 core Oracle/retrieval Edge Functions** and **2 adjacent AKST ingestion functions** relevant to the Stage 2.0 boundary. Non-AKST functions (Stripe, campaign renderers, general voice generation) are intentionally excluded from the Oracle ownership ledger.

### 4.1 Core Oracle / retrieval functions

| Live function | Runtime version | `verify_jwt` live | Recovery-branch source | Canonical backend `main` | Status | Safe next action |
|---|---:|---:|---|---|---|---|
| `ask-akst` | 1 | true | `supabase/functions/ask-akst/index.ts` | no same-named function | `LIVE_LEGACY_CONFLICT` | Capture live source; compare to recovery branch; recover under deployed name; do not rename yet |
| `akst-editorial-sync` | 1 | false | present | absent | `LIVE_SOURCE_MATCH` | Recover source + document caller/auth assumptions |
| `oracle-query` | 6 | false | present | absent | `LIVE_SOURCE_MATCH` | Treat live v6 as authority; diff recovery source before canonicalizing |
| `oracle-health` | 10 | false | present | absent | `LIVE_SOURCE_MATCH` | Recover live-equivalent source and health contract |
| `oracle-client` | 1 | false | present | absent | `LIVE_SOURCE_MATCH` | Recover after documenting whether it is public gateway or internal adapter |
| `oracle-voice` | 1 | false | present | absent | `LIVE_SOURCE_MATCH` | Recover separately from evidence authority; preserve voice as presentation layer |
| `oracle-well3-ingest` | 1 | false | present | absent | `LIVE_SOURCE_MATCH` | Recover with Well 3 provenance boundaries intact |
| `native-embedding-smoke` | 1 | false | present | absent | `LIVE_SOURCE_MATCH` | Recover as diagnostic/support function, not user-facing Oracle |
| `native-embedding-worker` | 2 | false | present | absent | `LIVE_SOURCE_MATCH` | Capture live v2; compare old branch before adoption |
| `native-embedding-drain` | 1 | false | present | absent | `LIVE_SOURCE_MATCH` | Recover with queue semantics documented |
| `native-embedding-diagnostic` | 2 | false | not found in inspected old branch | absent | `LIVE_SOURCE_MISSING` | **Export deployed source first**; create canonical source only from captured runtime, never from reconstruction by guesswork |

### 4.2 Adjacent AKST ingestion functions

| Live function | Runtime version | `verify_jwt` live | Recovery-branch source | Canonical backend `main` | Status | Safe next action |
|---|---:|---:|---|---|---|---|
| `akst-ingest-brenton-psalter` | 3 | false | not found in inspected recovery tree | absent | `LIVE_SOURCE_MISSING` | Export v3 source; reconcile with current Psalter ingestion work before adoption |
| `akst-continuous-ingestion` | 1 | false | not found in inspected recovery tree | absent | `LIVE_SOURCE_MISSING` | Export source and scheduler/caller assumptions; coordinate with active ingestion work |

### Authentication gate

`verify_jwt=false` is recorded here as **observed runtime state**, not an endorsement. Stage 2.0 MUST NOT toggle these flags opportunistically. Before any auth change, inspect each function body for custom authorization, webhook/service-role semantics, browser callers, and cron/service callers. Auth changes require a separate regression plan.

---

## 5. Endpoint naming and caller drift

There are currently at least two Ask contracts in source control:

### Product frontend — current live client lineage

`app-forge-studio-78/main/src/pages/Ask.tsx`

```text
supabase.functions.invoke("ask-akst", ...)
```

This matches a live Supabase Edge Function named `ask-akst`.

### Canonical backend — legacy embedded Lovable client

`Sacred-Texts-Sacred-Truth/main/lovable/src/hooks/useAsk.ts`

```text
supabase.functions.invoke("akst-ask", ...)
```

Canonical backend also contains:

`supabase/functions/akst-ask/index.ts`

but the inspected live Edge Function inventory does **not** contain `akst-ask`.

### Decision

Do **not** rename `ask-akst` to `akst-ask`, and do **not** repoint the production frontend during Stage 2.0.

Mark `akst-ask` as `CANONICAL_LEGACY` until Stage 2.1 defines one response contract and a compatibility migration. The migration must explicitly decide whether to:

- retire `akst-ask`,
- preserve it as a compatibility alias, or
- make it the canonical implementation behind a stable gateway.

The decision is contract-driven, not naming-driven.

---

## 6. Live database retrieval functions

The governed runtime currently exposes the following relevant public SQL functions/RPCs.

### Existing AKST semantic/search spine

- `akst_search_similar_chunks(query_embedding vector, match_threshold double precision, match_count integer)`
- `akst_search_texts(search_query text, max_results integer)`
- `akst_get_concept_network(concept_name_param text, depth integer)`
- `akst_touch_updated_at()`

These represent the earlier canonical AKST data/search lineage and must remain available until Stage 2.1/2.2 proves replacement compatibility.

### Native GTE embedding retrieval

- `match_ancient_chunks_gte(query_embedding vector, match_threshold double precision, match_count integer)`
- `match_sacred_writings_gte(query_embedding vector, match_threshold double precision, match_count integer)`

These are part of the live native embedding lane and are `RUNTIME_SCHEMA_AHEAD` relative to canonical backend migration history.

### Oracle lexical / correspondence lanes

- `search_oracle_ancient_lexical(query_text text, match_count integer)`
- `search_oracle_sacred_writings(query_text text, match_count integer)`
- `search_oracle_correspondences(query_text text, client_safe boolean, match_count integer)`

These establish that the runtime already supports more than one retrieval mode and more than one governed corpus well.

### Voice quota support

- `consume_oracle_voice_quota(p_scope text, p_key_hash text, p_limit integer)`

Voice remains an interface/service concern and must never become an independent evidence source.

### Safe next action

Recover the migration definitions for all live retrieval RPCs into canonical backend source before altering thresholds, signatures, ranking, or return fields.

---

## 7. Live schema objects relevant to Oracle

The live runtime includes a substantially richer AKST schema than canonical backend `0001_akst_schema.sql` alone communicates.

### Corpus / provenance

- `akst_texts`
- `akst_text_chunks`
- `akst_source_registry`
- `akst_source_assets`
- `akst_editorial_sources`
- `akst_ingestion_events`
- `akst_ingestion_jobs`
- `akst_ingestion_handlers`
- `akst_apparatus_notes`
- `akst_match_flags`

### Governed views

- `akst_publishable_chunks`
- `akst_embeddable_chunks`
- `akst_ingest_queue`
- `akst_chunks_public_scope`
- `akst_chunks_owner_scope`
- `akst_texts_with_metadata`
- `akst_continuous_ingestion_status`

### Knowledge graph / curriculum context

- `akst_concepts`
- `akst_concept_edges`
- `akst_concept_mentions`
- `akst_collections`
- `akst_traditions`
- `akst_civilizations`
- `akst_wisdom_domains`
- `akst_wisdom_paths`
- `akst_wisdom_steps`
- `akst_reading_paths`
- `akst_workings`

### Well 2 — Sacred Writings

- `sacred_writings_chunks`
- `sacred_writings_publishable`

### Well 3 — Correspondences / Grimoire lane

- `akst_correspondences`

### Oracle service state

- `oracle_voice_usage`

All objects above are treated as live evidence of architecture. Their existence alone does not prove every object is actively read by `oracle-query`; call-path verification remains part of source recovery.

---

## 8. Embedding state and columns

Live column inspection confirms dual embedding lineage on the principal text wells:

### `akst_text_chunks`

- `embedding` — vector
- `embedding_gte` — vector
- provenance fields include `source_sequence`, `source_checksum_sha256`, and `source_markup`

### `sacred_writings_chunks`

- `embedding` — vector
- `embedding_gte` — vector

Previous runtime verification established complete native embedding coverage for the current publishable sets:

- ancient publishable corpus: **2,550 / 2,550** native embeddings
- Sacred Writings corpus: **107 / 107** native embeddings

### Decision

Do not run a blanket re-embedding job during reconciliation. Existing vectors are production data. Stage 2.0 recovers the code and migration lineage that created/uses them; later stages can version embedding models explicitly if needed.

---

## 9. Recovery-branch assets worth preserving

The inspected `agent/oracle-nervous-system` branch contains the following high-value source lineage:

### Functions

- `ask-akst`
- `akst-editorial-sync`
- `oracle-query`
- `oracle-health`
- `oracle-client`
- `oracle-voice`
- `oracle-well3-ingest`
- `native-embedding-worker`
- `native-embedding-drain`
- `native-embedding-smoke`

### Migrations

- `20260812174406_akst_match_publishable_chunks.sql`
- `20260812174954_harden_akst_retrieval_runtime.sql`
- `20260817005633_add_native_oracle_embedding_lane.sql`
- `20260817013348_expand_sacred_writings_publishable_for_native_embeddings.sql`

### Integration surface

- `integrations/luminaria/oracle-gateway/index.ts`
- `src/pages/Ask.tsx`

### Recovery policy

Each artifact is copied/adopted only after one of these checks:

1. deployed source matches or clearly descends from the branch source;
2. DB signatures referenced by the source still exist live;
3. auth/caller assumptions are documented;
4. the artifact is placed in the canonical backend according to ownership, not merely copied wholesale from the frontend repo.

The old branch is **not** to be merged wholesale.

---

## 10. Canonical ownership target

After Stage 2.0, ownership should be intelligible without searching multiple abandoned branches.

### `Sacred-Texts-Sacred-Truth` owns

- Oracle/retrieval Edge Function source
- ingestion workers and governed ingestion logic
- SQL migrations and RPC definitions
- embedding queue/workers and model metadata
- corpus/provenance schema
- evidence contracts
- Oracle health semantics
- compatibility aliases during migration

### `app-forge-studio-78` owns

- browser/UI invocation
- rendering of answer/citation/evidence payloads
- interaction state
- accessibility / presentation
- product-specific navigation

### Shared integration contracts

Where practical, response/request types should be generated or published from one contract source instead of independently hand-maintained in both repos.

---

## 11. Stage 2.0 recovery sequence

### Gate 2.0-A — capture deployed source

Export/capture the deployed source for every live AKST/Oracle function, beginning with artifacts whose source is missing or whose live version exceeds the recovery branch:

1. `native-embedding-diagnostic` v2
2. `akst-ingest-brenton-psalter` v3
3. `akst-continuous-ingestion` v1
4. `oracle-query` v6
5. `oracle-health` v10
6. `native-embedding-worker` v2
7. remaining v1 functions

No redeploy.

### Gate 2.0-B — source diff

For each function with an old-branch candidate:

- compare deployed source against branch source;
- classify exact/near/diverged lineage;
- record environment variables and RPC dependencies by **name only** (never secrets);
- record callers;
- record `verify_jwt` runtime state.

### Gate 2.0-C — canonicalize migrations

Recover the live retrieval/embedding migration lineage into the backend repository without replaying it against production.

Every recovered migration must be marked as historical/runtime-reconciled if normal migration tooling could otherwise attempt to rerun it.

### Gate 2.0-D — contract inventory

Document response shapes from:

- `akst-ask` legacy backend
- `ask-akst` live product path
- `oracle-query`
- `oracle-client`

Identify overlapping concepts (`answer`, `sources`, wells, confidence, provenance, health/degraded state) before Stage 2.1 defines the unified contract.

### Gate 2.0-E — close reconciliation

Stage 2.0 closes only when:

- every live Oracle function has canonical source or a documented external owner;
- every live retrieval RPC has migration/source lineage;
- auth state is recorded;
- product caller(s) are mapped;
- no production behavior changed merely to satisfy repository symmetry.

---

## 12. Stage 2.1 handoff: unified Oracle response contract

Once reconciliation closes, Stage 2.1 can safely define one response envelope. Minimum future contract domains should include:

- query / normalized query
- answer
- evidence units / citations
- source well
- source identity and provenance
- retrieval method(s)
- score/confidence semantics
- claim support state
- contradiction/disagreement markers
- degraded/partial state
- timing/trace metadata appropriate for diagnostics

The contract must make unsupported synthesis harder, not merely make the response prettier.

`Nova` may orchestrate this contract but may not bypass Oracle evidence gates or become a second answer authority.

---

## 13. Explicit non-actions

Stage 2.0 does **not** authorize:

- deploying any recovered function;
- changing `verify_jwt` settings;
- dropping `akst-ask`;
- renaming `ask-akst`;
- merging `agent/oracle-nervous-system` wholesale;
- re-embedding the corpus;
- deleting legacy columns or RPCs;
- changing production retrieval thresholds;
- allowing Nova, Claude Code, or any other agent to fabricate missing source/provenance.

---

## 14. Reconciliation disposition

**Runtime:** functionally ahead  
**Canonical backend source:** materially behind  
**Frontend main:** currently wired to live `ask-akst`  
**Old Oracle branch:** valuable recovery source, incomplete relative to runtime  
**Primary risk:** source/runtime drift and contract split, not absence of retrieval capability  
**Next implementation stage after recovery:** **2.1 Unified Oracle Response Contract**

The correct move is therefore to pull the truth of production back into canonical source control before teaching Oracle new tricks.
