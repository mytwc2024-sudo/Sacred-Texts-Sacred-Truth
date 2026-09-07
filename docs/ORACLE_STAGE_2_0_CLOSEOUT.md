# AKST Oracle — Stage 2.0 Closeout

**Stage:** 2.0 Runtime / Source Reconciliation  
**Disposition:** COMPLETE on isolated source-control branch  
**Production changes:** NONE

## Gate status

| Gate | Result |
|---|---|
| 2.0-A — capture deployed source | **CLOSED** |
| 2.0-B — source lineage diff | **CLOSED** |
| 2.0-C — recover DB/RPC lineage | **CLOSED** |
| 2.0-D — contract inventory | **CLOSED** |
| 2.0-E — caller/ownership closeout | **CLOSED** |

## 2.0-A — deployed source

All live AKST Oracle/retrieval functions in scope were captured from the governed Supabase runtime into `agent/oracle-evolution-map` under `supabase/functions/`.

Core Oracle/retrieval:

- `ask-akst`
- `akst-editorial-sync`
- `oracle-query`
- `oracle-health`
- `oracle-client`
- `oracle-voice`
- `oracle-well3-ingest`
- `native-embedding-smoke`
- `native-embedding-worker`
- `native-embedding-drain`
- `native-embedding-diagnostic`

Adjacent AKST ingestion:

- `akst-ingest-brenton-psalter`
- `akst-continuous-ingestion`

The files are source recovery only. They were not redeployed.

## 2.0-B — lineage classification

Recovery branch: `app-forge-studio-78/agent/oracle-nervous-system`.

### Byte-for-byte source match

- `ask-akst`
- `native-embedding-drain`
- `native-embedding-smoke`
- `native-embedding-worker`
- `oracle-client`
- `oracle-health`
- `oracle-voice`
- `oracle-well3-ingest`

### Semantic match; blob differs only by formatting/comments

- `oracle-query`
- `akst-editorial-sync`

### Live-only relative to inspected recovery branch

- `native-embedding-diagnostic`
- `akst-ingest-brenton-psalter`
- `akst-continuous-ingestion`

**Unresolved behavioral forks: 0.**

## 2.0-C — database/RPC lineage

The following legacy RPCs already have canonical lineage in `supabase/migrations/0001_akst_schema.sql`:

- `akst_search_similar_chunks`
- `akst_search_texts`
- `akst_get_concept_network`

Verified historical runtime SQL was preserved outside the auto-run migration directory in `supabase/runtime-history/`:

- rights-gated `match_chunks`
- retrieval hardening / `akst_touch_updated_at`
- native GTE-small 384 lane
- `match_ancient_chunks_gte`
- `match_sacred_writings_gte`
- native embedding worker/drain dispatchers
- Sacred Writings publishable projection

A dated live snapshot also preserves:

- `search_oracle_ancient_lexical`
- `search_oracle_correspondences`
- `search_oracle_sacred_writings`
- `search_sacred_writings_lexical`
- `consume_oracle_voice_quota`
- current governed view definitions
- observed native GTE indexes
- observed function execution-grant posture

No SQL was replayed against production.

## Auth review finding

Observed runtime grants are split:

### Service-role-only

- `match_chunks`
- `match_ancient_chunks_gte`
- `match_sacred_writings_gte`
- `search_sacred_writings_lexical`
- `consume_oracle_voice_quota`
- `oracle_internal.kick_native_embedding_worker`
- `oracle_internal.kick_native_embedding_drain`

### Currently executable by `anon`, `authenticated`, and `service_role`

- `search_oracle_ancient_lexical`
- `search_oracle_correspondences`
- `search_oracle_sacred_writings`

This is an explicit **Stage 2.1 auth review gate**. Stage 2.0 does not change grants.

## 2.0-D — contract inventory

See `docs/ORACLE_CONTRACT_INVENTORY.md`.

Current contract roles:

- `akst-ask` — legacy compatibility candidate
- `ask-akst` — live AKST compatibility gateway
- `oracle-query` — canonical evidence-core candidate
- `oracle-client` — client adapter candidate

## 2.0-E — caller / ownership map

### Proven current caller

`app-forge-studio-78/main/src/pages/Ask.tsx`

```text
Ask.tsx -> ask-akst
```

### Proven canonical-backend legacy caller

`Sacred-Texts-Sacred-Truth/main/lovable/src/hooks/useAsk.ts`

```text
useAsk.ts -> akst-ask
```

### Recovered Luminaria gateway lineage

`app-forge-studio-78/agent/oracle-nervous-system/integrations/luminaria/oracle-gateway/index.ts`

```text
Luminaria gateway -> oracle-query(surface=luminaria_client)
                  -> oracle-health(mode=health)
                  -> oracle-voice
```

No separate connected repository named for Luminaria was located during this closeout. No current-main code-search caller was found for `oracle-client`, `oracle-query`, or `oracle-voice`; their deployed existence is therefore recorded as runtime/internal service state unless/until another external caller is identified.

## Stage 2.0 exit criteria

- [x] Every live Oracle/retrieval Edge Function in scope has canonical recovered source.
- [x] Live-only functions were captured from deployment rather than reconstructed.
- [x] Recovery-branch lineage is classified.
- [x] Every live retrieval RPC has canonical or runtime-history lineage.
- [x] Auth posture is recorded without changing it.
- [x] Known product and integration callers are mapped.
- [x] Endpoint naming drift is explicit.
- [x] No production behavior was changed to make repositories symmetrical.

## Stage 2.1 entry decision

Proceed with **Unified Oracle Response Contract** on this isolated branch.

Implementation order:

1. Add a shared `oracle.v1` TypeScript contract owned by the backend.
2. Make `oracle-query` the first implementation of that contract in source control.
3. Preserve its existing response fields temporarily as compatibility aliases where needed.
4. Add contract validation/tests before changing live callers.
5. Convert `ask-akst` into a delegating compatibility gateway only after the new core contract is testable.
6. Convert/reduce `oracle-client` to presentation/client policy after delegation is proven.
7. Review the three broad lexical RPC grants as a separate auth change with regression coverage.

Stage 2.0 is complete. The next work is architecture convergence, not further archaeology.
