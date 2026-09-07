# AKST Oracle — Stage 2.2 Retrieval Calibration

**Date:** 2026-09-07  
**Production project:** `xhzyavyftgyqzftlqdlz`  
**Mutation during calibration:** none  
**Scope:** `oracle-query` / `akst_learning` / ancient Tier A retrieval

## Result

Stage 2.2 begins with a production-read calibration of the current native GTE ancient-retrieval lane. The goal was to explain why deliberately unrelated questions still produced eight ancient candidates and to determine whether simply raising the vector threshold would create a trustworthy no-match state.

The answer is **no**: a score floor can reject obvious off-domain noise, but it cannot by itself distinguish a requested source/event that is absent from the corpus from a thematically related passage that happens to embed nearby.

## Observed vector score bands

All observations used `surface = akst_learning` and `evidence_only = true`, so synthesis/provider availability did not affect the measurements.

### Known / directly relevant corpus questions

Examples included repentance, mercy, transgression, righteous reproof, and phrases represented in Prayer of Manasses or Psalter.

- exact/near-exact known-query top scores: approximately **0.884–0.949**
- paraphrased relevant-query top scores: approximately **0.853–0.911**

### Coherent but unrelated questions

Examples included sourdough baking, solar eclipses, bicycle repair, stock dividends, and tomato growing.

- top scores: approximately **0.765–0.818**

This shows a useful separation for obvious off-domain traffic. A provisional floor in the low-to-mid 0.83 range would have rejected this sample without losing the tested relevant paraphrases.

### In-domain but absent/source-mismatched questions

Harder probes asked for specific biblical events or sayings that are not represented as such in the currently public corpus, including resurrection of Jesus, Noah's ark/flood, Moses receiving the commandments, Genesis creation, and 'love your enemies.'

Those still produced high Psalter similarities:

- resurrection probe: ~**0.852**
- Noah/flood probe: ~**0.863**
- Moses/commandments probe: ~**0.889**
- Genesis creation probe: ~**0.870**
- love-your-enemies probe: ~**0.895**

The returned passages were often thematically adjacent (dead/tomb language, water, Moses, creation language, enemy/persecution language) but did not establish that the requested event or source text was present.

## Design ruling

**Do not solve no-match with vector threshold alone.**

Stage 2.2 should distinguish at least three retrieval outcomes:

1. **Supported match** — passage is semantically relevant and the claim/source intent is corroborated.
2. **Related evidence** — semantically nearby material exists, but the requested source/event/entity is not actually established by the retrieved evidence.
3. **Insufficient** — neither semantic nor corroborating evidence supports the request.

A future confidence gate should combine vector evidence with lexical/entity/source-intent corroboration rather than treating similarity as proof of corpus coverage.

## Lexical fallback finding

During calibration, the live `search_oracle_ancient_lexical` RPC failed with PostgreSQL `42803` before returning rows.

Root cause:

- the function used `select p.*` from `akst_publishable_chunks`;
- its `GROUP BY` listed the older publishable-view fields;
- the view now also includes provenance fields such as `unit_path`, `source_sequence`, `work_key`, `witness_key`, `source_checksum_sha256`, and `verification_status`;
- PostgreSQL therefore requires those additional `p.*` columns to be grouped even though the function's public return contract does not use them.

Native vector retrieval currently masks this defect because successful GTE results return before lexical fallback is needed.

## Repair

`supabase/migrations/20260907170000_fix_oracle_ancient_lexical_view_drift.sql` replaces `p.*` with an explicit projection of only the fields returned by the function contract. The repaired query shape was executed read-only against production data and returned expected Tier A lexical hits, including Prayer of Manasses for a repentance/compassion query.

The migration intentionally does **not** change:

- function signature;
- RPC grants;
- `verify_jwt` posture;
- vector thresholds;
- publishable-view rights rules;
- frontend behavior.

## Next Stage 2.2 gate

Before changing live retrieval confidence behavior:

- apply and verify the lexical fallback repair through a controlled migration path;
- add a source/entity-intent corroboration layer to Oracle retrieval;
- represent `related evidence` separately from `grounded/supported` where the retrieved text is only thematically adjacent;
- build a repeatable regression pack containing known, paraphrased, unrelated, and in-domain-absent queries;
- only then tune vector score floors using a larger corpus-aware sample.

This calibration is evidence for the next retrieval-intelligence design; it is not authorization to hard-code a new similarity threshold in production.
