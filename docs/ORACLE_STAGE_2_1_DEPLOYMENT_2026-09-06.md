# AKST Oracle — Stage 2.1 Production Canary Record

**Date:** 2026-09-06  
**Project:** `xhzyavyftgyqzftlqdlz`  
**Change set:** PR #3 / `agent/oracle-evolution-map`  

## Result

Stage 2.1 production deployment was executed sequentially under the canary/rollback gate.

- **Canary A (`oracle-query`) — DEPLOYED AND PASSED.**
- **Canary B (`ask-akst`) — DEPLOYED, FAILED PRODUCT-COMPLETION CHECK, ROLLED BACK.**
- The Canary B failure was then reproduced on the preserved pre-Stage-2.1 `ask-akst` baseline, proving the blocking provider condition pre-existed the Stage 2.1 gateway change.

Stage 2.1 therefore remains **partially production-validated**: the evidence core is live; the learning gateway remains on its preserved baseline until provider health permits a complete Canary B.

## Canary A — `oracle-query`

Production version advanced from v6 to v7 with `verify_jwt=false` preserved and custom Vault-backed transport authentication unchanged.

Observed checks:

- authenticated custom transport request returned HTTP 200;
- legacy top-level fields remained present;
- `contract_version = oracle.v1`;
- ordinary internal scope queried and returned all three wells;
- `akst_learning` queried exactly `["akst_ancient"]`;
- AKST learning returned no Grimoire or Sacred Writings units;
- returned AKST learning evidence was Tier A and `public_domain` in the known-source canary;
- normalized AKST learning state was `grounded` when the requested ancient well returned evidence;
- `evidence_only=true` reported generation provider `none`;
- Luminaria client canary returned no Tier B Sacred Writings evidence;
- custom Oracle transport authentication succeeded.

The fixed known-source query returned native GTE retrieval and rights-cleared passages including `Prayer of Manasses` and `Psalter`.

### No-match observation

Multiple deliberately nonsensical AKST-learning queries still returned eight native-vector candidates above the current `match_ancient_chunks_gte` threshold. The explicit insufficient/no-evidence branch therefore could not be induced through the live native-vector path during this window. That behavior was already present in the retrieval design and is not a Stage 2.1 contract regression; the insufficient-state logic remains covered by the green contract tests. This is recorded as a retrieval-threshold follow-up, not silently treated as a successful no-match canary.

## Canary B — `ask-akst`

The Stage 2.1 gateway was deployed as v2 with `verify_jwt=true` preserved. A browser-equivalent request using the enabled legacy anon JWT reached the function, but the request completed as HTTP 503 with:

`AI provider unavailable`

Per the canary gate, `ask-akst` was immediately restored to the preserved pre-Stage-2.1 source as v3, keeping `verify_jwt=true`.

The identical request was then replayed against that restored baseline and also returned HTTP 503, this time at the earlier legacy embedding stage:

`AKST embedding provider unavailable`

This confirms the live blocker is external/provider availability already affecting the baseline path, not the new Oracle retrieval delegation.

## Current production posture

- `oracle-query`: Stage 2.1 source live in production, Canary A passed.
- `ask-akst`: preserved pre-Stage-2.1 baseline live after automatic rollback.
- Database migrations: none.
- RPC grants/auth posture: unchanged.
- Frontend caller: unchanged.
- `oracle.v1` source and the converged `ask-akst` gateway remain in PR #3 ready for Canary B once provider health is restored.

## Promotion rule

Do not call Stage 2.1 fully production-validated until `ask-akst` can complete the fixed learning query successfully on the Stage 2.1 gateway and the response verifies:

- `retrieval = oracle.v1/akst_ancient`;
- nested `oracle_v1.query.surface = akst_learning`;
- wells queried exactly `["akst_ancient"]`;
- only Tier A rights-cleared sources;
- browser-facing compatibility fields intact;
- one learning synthesis only;
- no auth/JWT regression.
