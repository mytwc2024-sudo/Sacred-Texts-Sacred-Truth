# AKST Oracle — Stage 2.2 Query Decomposition

**Status:** advisory planner contract / pre-integration  
**Planner version:** `oracle.query_plan.v1`  
**Production mutation:** none in this change set

## Map alignment

The canonical Oracle evolution map names **2.2 Query Decomposition** and **2.3 Hybrid Ranking**.

The live supported/related/insufficient confidence work already validated in production is therefore treated as early **2.3 substrate**. It is retained; it does not replace or rename 2.2.

Stage 2.2 now resumes in canonical order.

## Boundary with Nova

Oracle query decomposition answers:

> What evidence questions must be resolved before Oracle can responsibly answer the user's question?

It does **not** answer:

> Which agent should run this job, when should it run, how should it retry, or how should workflow completion be monitored?

Those are Nova orchestration concerns.

The Stage 2.2 planner therefore contains no jobs, agents, schedules, retries, queues, workflow status, or execution ownership.

**Rule:** Oracle plans evidence needs. Nova may orchestrate work around those needs. Oracle remains the evidence authority.

## Advisory first

`oracle.query_plan.v1` is initially advisory:

- `mode = advisory`;
- `execution_status = not_applied_to_retrieval`;
- no current retrieval ranking changes;
- no current well execution changes;
- no answer-state changes;
- no frontend caller changes.

This lets decomposition semantics be tested before they can change evidence retrieval.

## Intent classes

The deterministic first pass recognizes the map's required categories:

- `textual_claim`;
- `chronology`;
- `identity_alias`;
- `cross_tradition_comparison`;
- `provenance_manuscript`;
- `interpretive_reflective`.

A clause may produce more than one evidence intent when the question genuinely asks for more than one kind of proof.

## Explicit clause splitting

The planner does not split every occurrence of the word `and`.

It splits only strong boundaries such as:

- semicolon/newline;
- a completed question followed by another clause;
- `and/then` followed by a new interrogative such as `when`, `how`, `what`, or `is`.

This preserves ordinary phrases such as `mercy and repentance` as one textual question.

## Evidence routing

Routing expresses **permitted evidence wells**, not jobs.

### AKST learning surface

Every intent is constrained to:

- `akst_ancient`

This preserves the rights-cleared ancient-learning boundary.

### Internal surfaces

- provenance/manuscript → `akst_ancient`;
- chronology / identity / comparison → `akst_ancient` + `sacred_writings`;
- textual / interpretive → all three current wells, while evidence-class rules remain explicit.

The planner never states that Grimoire similarity can prove ancient provenance or identity.

## Evidence requirements

Each planned subquery carries requirements appropriate to its claim type.

Examples:

- chronology must separate composition date from witness date and preserve uncertainty;
- identity must require explicit attestation or a governed identification state;
- comparison requires evidence on each side and must not convert similarity into dependence;
- provenance requires source/witness/edition metadata;
- interpretation requires attested text before reflection and must keep interpretation labeled;
- textual claims require governed passage/location support and source metadata.

## Deterministic v1

The first planner is deliberately provider-independent. It uses explicit lexical intent markers and safe clause boundaries rather than an LLM call.

This is not intended to solve every natural-language decomposition problem. It establishes a reproducible baseline that continues to work when external AI providers are unavailable.

A later model-assisted planner may propose richer decompositions, but it must be validated against this governed contract and may not bypass evidence requirements.

## Regression pack

Stage 2.2 tests cover:

1. simple AKST textual question;
2. compound textual + chronology question without splitting `mercy and repentance`;
3. identity/alias evidence rules;
4. comparison requiring evidence on both sides;
5. provenance routing to ancient metadata;
6. interpretive request separated from attestation;
7. one clause with multiple evidence intents but no workflow semantics;
8. AKST-learning surface constraining every planned intent to ancient evidence.

## Next gate

After the planner contract is green:

1. expose the advisory plan additively in `oracle.v1`;
2. production-canary the plan metadata without changing retrieval;
3. only then allow planned subqueries to influence retrieval execution;
4. require recombination to preserve evidence classes and per-subquery support states.

Stage 2.2 is not complete merely because the planner can label a question. Completion requires Oracle to retrieve and recombine evidence per planned subquery without collapsing claim types.
