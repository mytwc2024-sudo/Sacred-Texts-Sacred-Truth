# AKST Oracle Evolution & Completion Map

**Status date:** 2026-09-06  
**Purpose:** Keep Oracle development additive, non-duplicative, and evidence-governed across AKST's multi-repo platform.

## Architectural line

AKST is one platform with separate responsibilities:

- `Sacred-Texts-Sacred-Truth` — canonical backend / ingestion / evidence-pipeline source.
- AKST Supabase (`xhzyavyftgyqzftlqdlz`) — governed runtime data and Oracle services.
- `app-forge-studio-78` — frontend / product client.
- Oracle — evidence retrieval, comparison, reasoning, and grounded response layer.
- Nova — orchestration around Oracle: routing work, jobs, agents, and workflows. Nova does **not** become an evidence authority.

**Rule:** Claude builds. Nova orchestrates. Oracle speaks from governed evidence.

## Status legend

- **GREEN — Built / verified:** usable capability is present and its role is clear.
- **AMBER — Live but unreconciled:** capability exists in runtime or a branch, but source-of-truth / ownership / contracts need cleanup.
- **BLUE — Next:** the next implementation target after reconciliation.
- **GRAY — Planned:** intentionally later work.

---

## 0. Corpus & governance foundation — GREEN

### Already established
- Namespaced `akst_` corpus and taxonomy.
- Chunked texts with provenance and source attribution.
- Public/read gating through `is_public` and RLS.
- Rights/publication boundary before public retrieval.
- Governed AKST library now reachable from the frontend without manually copying every approved text into static pages.
- Existing educational/static material is preserved as context rather than deleted.

### Completion condition
A newly ingested and approved text can move through backend → Supabase → governed public corpus → frontend reader without creating a second copy of the system.

---

## 1. Oracle core — GREEN

### Already established
- Ask/Oracle endpoints exist.
- Retrieval is evidence-first and fails explicitly when support is insufficient.
- Rights-cleared ancient evidence is kept distinct from working-layer material.
- Inline/source citations exist.
- No-fabrication behavior is explicit.
- Core Oracle laws already include Non-Imposition, The Mirror, Return to Wholeness, evidence-conditioned lineage framing, and source-grounded synthesis.

### Completion condition
Oracle can answer a supported question, expose its evidence, and say "insufficient evidence" instead of filling gaps.

---

## 2. Retrieval intelligence — AMBER → FIRST ACTIVE WORKSTREAM

This stage is **not greenfield**. The live AKST Supabase runtime is ahead of repository `main`.

### Verified live runtime state
As of 2026-09-06, the canonical AKST Supabase contains:

- native `gte-small` retrieval structures;
- `embedding_gte` on ancient chunks;
- `sacred_writings_chunks`;
- `akst_correspondences`;
- `match_ancient_chunks_gte`;
- `match_sacred_writings_gte`;
- **2,550 / 2,550** publishable ancient chunks with native embeddings;
- **107 / 107** Sacred Writings chunks with native embeddings;
- **15** Grimoire correspondence rows in the Oracle runtime projection.

The live `oracle-query` also already implements a three-well model:

1. **Grimoire** — working/correspondence layer.
2. **Ancient AKST** — rights-cleared Tier-A evidence.
3. **Sacred Writings** — standpoint/tier-gated living-author layer.

It supports native vector retrieval with lexical fallback, distinct G/A/S citation labels, surface-specific filtering, and evidence-only fallback when synthesis is unavailable.

### The actual problem
Much of that capability lives in production and in the old `app-forge-studio-78` draft PR **#5 / `agent/oracle-nervous-system`**, while the canonical backend repo does not yet contain the full deployed Oracle implementation. This is source/runtime drift.

### 2.0 — Source/runtime reconciliation — BLUE / DO FIRST

Do **not** blindly merge the old 26-commit frontend branch and do **not** redeploy from `app-forge-studio-78`.

Required sequence:

1. Inventory every deployed Oracle function, RPC, view, migration, and auth setting in live AKST Supabase.
2. Diff live runtime against:
   - canonical backend `main`;
   - `app-forge-studio-78` current `main`;
   - draft PR #5.
3. Classify each artifact as **adopt**, **refresh**, **replace**, or **retire**.
4. Move canonical backend-owned Oracle runtime source into `Sacred-Texts-Sacred-Truth` through reviewed additive commits.
5. Preserve current live auth / `verify_jwt` behavior unless a separate reviewed security change intentionally alters it.
6. Make `app-forge-studio-78` a consumer of Oracle contracts, not a competing owner of backend truth.
7. Only after parity is proven, archive/close stale duplicate branches with an explicit replacement reference.

**Gate:** source, deployed runtime, and ownership map agree before new Oracle intelligence is added.

### 2.1 — One Oracle response contract — BLUE

Define one versioned response envelope used by AKST, Ankhor, and Luminaria clients:

- `query_id`
- `question`
- `surface`
- `answer`
- `answer_mode`
- `evidence_state`
- `claims[]`
- `citations[]`
- `wells.*.status`
- `retrieval_mode`
- `uncertainties[]`
- `contradictions[]`
- `gaps[]`
- `laws_applied[]`
- `generated_at`
- contract/version identifier

No client gets to redefine what "grounded," "partial," or "insufficient" means.

### 2.2 — Query decomposition — BLUE

For a complex question, Oracle should identify subquestions before retrieval. Example categories:

- textual claim;
- chronology;
- identity / alias;
- cross-tradition comparison;
- provenance / manuscript question;
- interpretive or reflective request.

Each subquery is routed to the appropriate well, then recombined without collapsing evidence classes.

### 2.3 — Hybrid ranking — BLUE

Use multiple signals rather than a single similarity score:

- native vector similarity;
- lexical/full-text match;
- title/entity match;
- chronology metadata;
- civilization/tradition filters;
- rights/publication eligibility;
- source/witness quality;
- exact-location support (chapter/section/verse/unit path).

Retrieval should preserve why a passage was selected.

### 2.4 — Claim-to-evidence binding — BLUE

Every material factual claim in a synthesized answer should have a machine-readable support relationship:

`claim → one or more evidence units → source metadata → confidence/support state`

A paragraph-level source list is not the final standard. The target is claim-level traceability.

---

## 3. Comparative textual intelligence — GRAY

Build comparison as a first-class mode rather than a prompt style.

Oracle should be able to:

- retrieve parallel passages across texts/traditions;
- separate similarity from direct dependence;
- show shared themes without claiming sameness;
- keep translation/witness differences visible;
- distinguish source text from later interpretation;
- present both convergences and meaningful differences.

**Gate:** every comparison cell is traceable to source evidence.

---

## 4. Chronology & provenance reasoning — GRAY

Oracle must understand sequence, not just semantic similarity.

Add structured handling for:

- estimated composition date/range;
- manuscript/witness date;
- source acquisition;
- original language;
- translator/edition;
- later recension/interpolation where documented;
- "earlier than / later than / uncertain" relations.

**Rule:** a later witness or interpretation must not silently rewrite an earlier source.

---

## 5. Identity resolution — GRAY

Build a governed entity layer for people, deities, places, texts, titles, aliases, transliterations, and contested identifications.

Relationship states must include at least:

- same entity;
- alias / transliteration;
- related but distinct;
- possible identification;
- disputed identification;
- insufficient evidence.

Oracle must never collapse two entities merely because embeddings say they are similar.

---

## 6. Contradiction preservation — GRAY

Contradiction is data, not an error to smooth away.

Oracle should represent:

- source A says X;
- source B says Y;
- chronology/context for each;
- whether the disagreement is textual, theological, historical, translational, or interpretive;
- whether scholarship offers competing explanations.

Synthesis may explain disagreement but may not erase it.

---

## 7. Knowledge graph & diachronic tracing — GRAY

Extend the existing concept/edge foundation into time-aware relationships:

- concept → text → passage;
- concept → civilization/tradition;
- concept → earlier/later occurrence;
- concept → related/contrasting concept;
- person/deity/place → source mentions;
- explicit distinction between attested edge and inferred edge.

Target capability: "Show me how this idea changes across time and sources."

---

## 8. Research modes — GRAY

Expose governed modes that all use the same Oracle evidence spine:

- Source Audit
- Parallel Passage Compare
- Chronology Trace
- Lineage / Provenance Trace
- Doctrinal or Concept Evolution
- Translation / Witness Compare
- Contradiction Review
- Evidence Gap Review

Modes change method and output structure, not truth authority.

---

## 9. Research gaps & durable research memory — GRAY

When Oracle cannot resolve something, store the gap instead of losing it in chat.

A gap record should capture:

- question/claim;
- missing evidence type;
- searched sources;
- current evidence state;
- last checked date;
- what future ingestion could close it;
- human notes/adjudication state.

As new texts enter AKST, gaps can be re-evaluated automatically.

---

## 10. Verification & adversarial search — GRAY

Before calling a research answer "strong," Oracle should actively search for:

- contrary passages;
- alternative translations;
- later-vs-earlier conflicts;
- weak provenance;
- unsupported lineage assumptions;
- evidence that would falsify the leading interpretation.

This is a verification pass, not a second Oracle.

---

## 11. Human adjudication — GRAY

Some questions should end in a governed human decision rather than model synthesis.

Human adjudication is required when:

- identity is genuinely disputed;
- rights status is uncertain;
- source classification is ambiguous;
- contradictory evidence cannot be responsibly reconciled;
- an inference would materially change publication or teaching status.

Preserve the decision, evidence reviewed, adjudicator, date, and rationale.

---

## 12. Research packets & export — GRAY

Oracle should eventually export a defensible research packet containing:

- the question;
- decomposed subquestions;
- claims;
- source passages;
- citations/provenance;
- chronology;
- contradictions;
- confidence/support states;
- unresolved gaps;
- human adjudications;
- reproducible retrieval metadata.

The packet should let another researcher retrace how Oracle reached the result.

---

## 13. Nova orchestration wrapper — PARALLEL TRACK

Nova sits **around** Oracle.

Nova may:

- accept complex work requests;
- split them into jobs;
- route jobs to retrieval/comparison/verification workers;
- monitor completion/failure;
- retry safe operations;
- assemble completed artifacts;
- schedule re-checks when new evidence arrives.

Nova may **not**:

- invent evidence;
- promote a private/unverified source;
- change rights/publication status on its own;
- convert inference into attestation;
- overwrite contradiction;
- become a separate knowledge repository or answer authority.

The final knowledge answer always comes back through Oracle's governed evidence contract.

---

# Execution order

Work the map in this order and do not skip the reconciliation gate:

1. **2.0 Runtime/source reconciliation**
2. **2.1 Unified Oracle response contract**
3. **2.2 Query decomposition**
4. **2.3 Hybrid ranking**
5. **2.4 Claim-to-evidence binding**
6. **3 Comparative textual intelligence**
7. **4 Chronology/provenance**
8. **5 Identity resolution**
9. **6 Contradiction preservation**
10. **7 Knowledge graph/diachronic tracing**
11. **8 Research modes**
12. **9 Gap memory**
13. **10 Adversarial verification**
14. **11 Human adjudication**
15. **12 Research packet/export**

Nova can evolve in parallel, but it cannot bypass these Oracle gates.

# Immediate next definition of done

**Stage 2.0 is complete when:**

- every currently deployed Oracle Edge Function has a canonical source file;
- every live Oracle RPC/view/migration has a canonical migration/history record;
- deployed auth settings are recorded and reproducible;
- backend ownership resides in `Sacred-Texts-Sacred-Truth`;
- frontend calls a documented Oracle contract rather than owning competing backend behavior;
- PR #5 has been mined for useful work and can be retired without losing live capability;
- no live capability is removed merely to make the repositories look tidy.

That is the next Oracle milestone.