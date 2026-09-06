# AKST Oracle Runtime History

This directory preserves SQL recovered from the live AKST Supabase runtime and from the historical `agent/oracle-nervous-system` branch.

## Safety boundary

**Files in this directory are historical/runtime reconciliation evidence. They are not Supabase migrations and MUST NOT be applied automatically.**

The canonical migration runner uses `supabase/migrations/`. Runtime-history files live outside that path deliberately so Stage 2.0 can restore source provenance without replaying already-applied production DDL.

## Reconciliation rules

1. Production runtime is the authority for what is currently deployed.
2. Historical branch SQL is retained when its definitions still match production.
3. Live-only definitions are captured in a dated runtime snapshot.
4. Grants/auth posture are documented as observed; Stage 2.0 does not change them.
5. A future migration may be authored only after the Stage 2.1 contract/auth decisions are explicit.

## Contents

- `historical/20260812174406_akst_match_publishable_chunks.sql` — original rights-gated legacy vector RPC migration; still matches live `match_chunks` logic.
- `historical/20260812174954_harden_akst_retrieval_runtime.sql` — original publishable-view security-invoker/touch-trigger hardening; live trigger definition still matches.
- `historical/20260817005633_add_native_oracle_embedding_lane.sql` — original GTE-small lane and internal dispatchers; live function definitions and indexes match.
- `historical/20260817013348_expand_sacred_writings_publishable_for_native_embeddings.sql` — original Sacred Writings publishable projection; current live projection retains this either-embedding rule.
- `20260906_oracle_runtime_snapshot.sql` — live RPC/view/grant snapshot for definitions not completely represented by the four historical files.

See `docs/ORACLE_RUNTIME_RECONCILIATION_LEDGER.md` for ownership, source lineage, function versions, callers, and closure gates.
