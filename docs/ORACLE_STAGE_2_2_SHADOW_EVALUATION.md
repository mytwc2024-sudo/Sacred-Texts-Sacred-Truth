# Oracle Stage 2.2 — Query-Plan Shadow Evaluation

## Purpose

Validate whether decomposed Oracle subqueries can be evaluated against their own evidence requirements **before** those subqueries are allowed to change primary retrieval or answer recombination.

This is the safety bridge between advisory query planning and executable query decomposition.

## Hard boundary

Shadow evaluation is diagnostic only.

It must always report:

- `mode = shadow`
- `applied_to_primary_retrieval = false`
- `applied_to_answer = false`

A shadow result may show that a planned subquery has stronger, weaker, or different evidence than the current monolithic query. That observation alone does not authorize the Oracle to rewrite the answer.

Nova remains outside this contract. The shadow evaluator contains no jobs, agents, schedules, retries, queues, or workflow state.

## Satisfaction states

Each planned subquery receives one of four diagnostic states:

- `met` — the intent-specific evidence requirement is present.
- `partial` — useful evidence exists, but the requested claim type is not fully established.
- `unmet` — the evidence requirement is not satisfied.
- `not_assessed` — shadow evidence was not supplied or the evaluator intentionally did not make the judgment.

These are **not** replacements for `oracle.v1.state` or `evidence_relationship`.

## Intent rules

### Textual claim

Uses the already-calibrated AKST evidence relationship:

- `supported` → `met`
- `related` → `partial`
- `insufficient` → `unmet`

The shadow evaluator does not invent a second support classifier.

### Chronology

Chronology requires composition/date metadata. A witness or translation date may not substitute for the composition date.

Example: `Ancient; English translation published 1851` is **partial**, not met. The 1851 translation date does not establish when the ancient work was composed.

### Provenance / manuscript

Requires governed source metadata such as source URL/file/format, original language, witness key, and verification state. Partial metadata remains partial.

### Identity / alias

Shadow v1 does not have a governed identity adjudication layer. Passage or embedding similarity therefore cannot satisfy an identity claim. Identity remains unmet until explicit identity evidence or a governed identification state exists.

### Cross-tradition comparison

Requires independent evidence from both sides. A one-tradition result is partial even when its semantic score is high.

### Interpretive / reflective

Attested evidence may provide a basis for reflection, but interpretation is never converted into historical attestation. Therefore an interpretive subquery can be partial in shadow v1, but retrieval alone does not make interpretation an attested fact.

## Runtime Gate B

After this pure evaluator and regression pack pass CI and merge, a separate small runtime change may add an explicit request flag such as `shadow_query_plan=true` to `oracle-query`.

That runtime gate should:

1. keep the existing primary retrieval untouched;
2. evaluate a bounded number of planned subqueries separately;
3. retrieve only from wells permitted by the plan and surface;
4. enrich metadata-dependent intents from governed `akst_texts` metadata;
5. return compact shadow diagnostics only;
6. never feed shadow results into synthesis, citations, `state`, or the primary evidence list.

No default request should pay the extra shadow-evaluation cost until a later reviewed decision intentionally changes that posture.

## Production canary target

Use the already validated compound AKST-learning question:

`What does Prayer of Manasses say about repentance, and when was it composed?`

Expected shadow behavior:

- textual subquery: `met` if direct support remains present;
- chronology subquery: `partial` while composition metadata remains only `Ancient`;
- primary retrieval remains the existing monolithic AKST-learning retrieval;
- answer remains unchanged;
- all rights/Tier-A restrictions remain intact.
