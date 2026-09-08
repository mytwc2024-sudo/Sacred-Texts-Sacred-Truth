# AKST Oracle — Stage 2.1 Canary / Rollback Gate

**Status:** pre-deploy readiness specification  
**Production mutation:** none  
**Applies to:** `oracle-query`, `ask-akst`, `oracle.v1`  

---

## 1. Purpose

Stage 2.1 source convergence is not permission to deploy blindly. This gate defines the minimum evidence required before a production cutover can be considered successful and the exact rollback posture if the new source changes observable behavior unexpectedly.

No database migration, RPC privilege change, `verify_jwt` change, or frontend caller change is part of this canary.

---

## 2. Baseline preserved for rollback

The reconciled pre-Stage-2.1 production-equivalent source is already preserved in Git history.

- `oracle-query` production baseline blob: `ad9b76224cad36a92f5cf5905a1ce70c871a6323`
- `ask-akst` production baseline blob: `3a07378b03e675b9d6f97b025d12468495cc402c`

Runtime auth posture must remain unchanged during a canary:

- `oracle-query`: existing custom Vault-backed Oracle transport authentication; keep current `verify_jwt` posture.
- `ask-akst`: keep current JWT requirement.

Rollback means redeploying the exact preserved baseline source for the affected function. It does **not** require a database rollback because Stage 2.1 introduces no DDL.

---

## 3. Deployment order when explicitly approved

Deployment must be sequential, never simultaneous.

### Canary A — `oracle-query` first

Deploy only `oracle-query` plus its shared `_shared/oracle-contract.ts` dependency.

Do not deploy `ask-akst` yet.

Pass Canary A before proceeding.

### Canary B — `ask-akst` second

After Canary A passes, deploy `ask-akst` with the same shared contract module.

The current browser frontend continues to call `ask-akst`; no frontend release is required for this backend canary.

---

## 4. Canary A — `oracle-query` pass criteria

### Compatibility response

For an ordinary internal Oracle query, the response must retain the existing top-level compatibility fields:

- `question`
- `surface`
- `evidence_state`
- `grimoire`
- `akst`
- `sacred_writings`
- `laws_applied`
- `generation_provider`

The same response must additionally contain:

- `contract_version = "oracle.v1"`
- normalized `query`
- normalized `state`
- `answer`
- `answer_mode`
- `evidence_units[]`
- `citations[]`
- normalized `retrieval`
- `policy`
- `diagnostics.trace_id`

### AKST learning scope

A request with:

```json
{
  "surface": "akst_learning",
  "evidence_only": true
}
```

must satisfy all of the following:

1. `contract_version` is `oracle.v1`.
2. `query.surface` is `akst_learning`.
3. `retrieval.wells_queried` is exactly `["akst_ancient"]`.
4. `evidence_units[]` contains no `grimoire` or `sacred_writings` unit.
5. Every returned ancient evidence unit is Tier A and rights-cleared by the governed publishable boundary.
6. A successful ancient-only hit may be `state = "grounded"`; it must not be downgraded merely because unrequested wells were skipped.
7. `evidence_only=true` must not invoke synthesis.
8. Empty evidence must return `state = "insufficient"` and must not fabricate a source or answer claim.

### Existing full Oracle behavior

For existing internal/Luminaria paths:

- native GTE vector retrieval remains primary where available;
- lexical fallback remains available;
- Luminaria Tier B exclusion remains enforced;
- evidence-well errors remain visible as degradation rather than being hidden;
- citation labels continue to map to returned source units.

---

## 5. Canary B — `ask-akst` pass criteria

### Existing product contract remains intact

The browser-facing response must continue to expose:

- `answer`
- `sources`
- `evidence_state`
- `retrieval`
- `learning_mode`
- `learning_context`

It may additionally expose `oracle_v1`.

### Retrieval convergence

When Oracle transport is healthy:

1. `retrieval` is `oracle.v1/akst_ancient`.
2. `oracle_v1.query.surface` is `akst_learning`.
3. `oracle_v1.retrieval.wells_queried` is exactly `["akst_ancient"]`.
4. `sources[]` contains only rights-cleared Tier A AKST passages.
5. Source ordering follows Oracle ranking.
6. Chapter/section/verse metadata is enriched from `akst_publishable_chunks` without changing evidence identity.
7. Learning context may refine the retrieval query but never bypass source-rights gates.
8. The gateway performs the learning synthesis once; the Oracle core is called in evidence-only mode to avoid duplicate generation cost.

### Fallback behavior

If Oracle transport or the new core path is unavailable:

- `ask-akst` may use the existing OpenAI 1536-vector `match_chunks` path.
- Fallback success must still be limited to `akst_publishable_chunks`.
- Infrastructure failure in both primary and fallback paths must return a 503-style retrieval error; it must not be mislabeled as a legitimate no-evidence result.

### No-evidence behavior

A genuine no-match result must:

- return `evidence_state = "insufficient"`;
- return an empty `sources` array;
- include an `oracle_v1` object whose state is also `insufficient`;
- state the gap rather than generate unsupported source claims.

---

## 6. Canary query classes

Use a small fixed query pack rather than exploratory testing during the deployment window.

1. **Known-source semantic query** — a topic known to have a Tier A passage in the current corpus.
2. **Comparative internal query** — expected to exercise more than one Oracle well.
3. **AKST learning query with learning context** — verifies ancient-only scoping and metadata enrichment.
4. **Luminaria client query** — verifies client policy and Tier B exclusion.
5. **Deliberate no-match query** — verifies explicit insufficiency/no fabrication.

Record request surface, HTTP status, contract version, state, retrieval method, wells queried/returned, evidence-unit count, source IDs, and latency. Do not record secrets.

---

## 7. Stop / rollback conditions

Rollback the affected function immediately if any of the following occurs:

- a legacy top-level field disappears from an existing caller response;
- `akst_learning` returns Grimoire or Sacred Writings evidence;
- Tier B or non-rights-cleared content appears on the AKST learning surface;
- a no-evidence query is reported as grounded;
- citations no longer map to source/evidence units;
- the gateway performs duplicate model generation;
- custom Oracle transport authentication stops working;
- JWT behavior changes unexpectedly;
- error rate or latency materially regresses across the fixed canary pack;
- the live frontend can no longer complete an `ask-akst` request.

Rollback is function-specific: restore the preserved baseline function source and re-run the same fixed query pack.

---

## 8. Promotion gate

Stage 2.1 may be called production-validated only when:

- branch CI remains green (`deno fmt --check` + all Oracle contract tests);
- Canary A passes after an explicitly approved `oracle-query` deployment;
- Canary B passes after an explicitly approved `ask-akst` deployment;
- no auth/grant/frontend change was smuggled into the canary;
- rollback source remains immediately available;
- observed results are written back to the PR or a deployment record.

Until then, Stage 2.1 is **source-complete / production-unvalidated**.
