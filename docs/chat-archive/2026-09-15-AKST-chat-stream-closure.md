# AKST Chat Stream Closure Record

**Date:** 2026-09-15  
**Purpose:** Preserve the implementation lineage mined from the AKST chat stream before conversational archival.

## Scope

This record captures the stream's actionable implementation history, governance decisions, production boundaries, and unresolved gates. It is not a replacement for the original chat transcript.

## Canonical architecture

`Sacred-Texts-Sacred-Truth → AKST Supabase → app-forge-studio-78 → visible AKST frontend`

Governance principle: **Claude builds. Nova orchestrates. Oracle speaks from governed evidence.**

## Completed implementation lineage

1. Source/runtime reconciliation — deployed-equivalent Oracle runtime recovered into the canonical backend and historical runtime material preserved.
2. Oracle v1 — additive response contract established without breaking legacy response fields.
3. Query decomposition — deterministic advisory evidence planner with explicit intent classes.
4. Query-plan shadow/recombination — bounded shadow execution; primary retrieval and answer remain unchanged.
5. Evidence relationship calibration — demonstrated that semantic similarity alone cannot establish support; direct corroboration is required.
6. Production lexical repair — `search_oracle_ancient_lexical` repaired against view/schema drift using explicit columns while preserving grants.
7. Hybrid ranking contract — deterministic advisory precedence emphasizing publication eligibility and direct corroboration before semantic similarity.
8. Hybrid shadow collection — vector and lexical candidate lanes unioned, de-duplicated, metadata-enriched, and failure-isolated.
9. Hybrid runtime wiring — PR #16 merged 2026-09-14 at `c6c00e113ca5d8d5f3675a1c09adbf85624b184c`; `shadow_hybrid_ranking=true` is explicitly opt-in.

## Non-authority boundary

Hybrid shadow output remains observational. The contract requires:

- `applied_to_primary_retrieval=false`
- `applied_to_answer=false`

Rights/publication eligibility remains a hard boundary.

## Production boundary

Repository merge is not deployment proof. The last explicitly recorded production checkpoint in the stream was `oracle-query` v11. A fresh deployment/canary is required before declaring the merged hybrid shadow live.

`ask-akst` provider readiness is independent of source merge and must be established by fresh runtime evidence.

## Carry-forward gates

- Verify current `oracle-query` production version.
- Run/verify the dedicated `shadow_hybrid_ranking=true` production canary if not already proven.
- Confirm vector + lexical union, rights filtering, diagnostics, and non-authority flags.
- Keep hybrid ranking advisory until calibration demonstrates improved evidence separation without weakening rights gates.
- Keep `ask-akst` provider monitoring separate from Oracle source completion.

## Archive classification

**Verified:** repository implementation and explicitly recorded tests.  
**Environment-specific:** live deployment/version, provider health, and frontend propagation.  
**Inferred:** the stream forms one coherent Oracle evolution program.  
**Unknown until freshly checked:** current production state after the latest merge.

## Archival rule

The original conversation remains the authoritative conversational record. This closure record is the bridge from conversation to executable project state and prevents the next workstream from having to reconstruct the entire archaeology from scratch.
