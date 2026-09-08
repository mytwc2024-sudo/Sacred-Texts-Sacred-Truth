# AKST Oracle — Stage 2.2 Evidence Relationship

**Status:** source implementation / pre-production validation  
**Scope:** `oracle.v1` on `akst_learning` only  
**Production mutation:** none in this change set

## Purpose

Vector similarity answers **what is near this question**. It does not, by itself, prove that the corpus contains the requested source, event, teaching, or claim.

Live calibration showed that problem clearly:

- directly relevant ancient queries produced top native GTE scores around `0.884–0.949`;
- relevant paraphrases produced about `0.853–0.911`;
- coherent unrelated questions produced about `0.765–0.818`;
- in-domain but source/event-mismatched questions still produced about `0.852–0.895` against thematically adjacent Psalter passages;
- lexical score also overlapped between relevant and source-mismatched questions.

Therefore Stage 2.2 does **not** replace retrieval with a higher vector threshold and does **not** treat lexical overlap as proof of support.

## Additive contract field

`oracle.v1.retrieval.evidence_relationship` is advisory metadata. It does not rewrite the existing `state` field during this stage.

The assessment exposes:

- `level` — `supported`, `related`, `insufficient`, or `not_assessed`;
- `reasons[]` — machine-readable explanation codes;
- top semantic score when the evidence came from a vector lane;
- maximum significant-term coverage within one returned evidence unit;
- direct source-title match when present;
- direct passage-phrase match when present;
- significant query terms and the best-matched terms.

## Current classification rule

### Supported

AKST learning evidence is `supported` when at least one strong corroboration signal exists:

1. the question explicitly names a returned source title; or
2. a direct phrase of at least three words, containing at least two significant terms, appears in a returned passage/source context; or
3. native/legacy vector similarity is at least `0.86` **and** at least `80%` of significant query terms occur together in one evidence unit.

This is intentionally conservative. A relevant paraphrase may remain `related` rather than being over-promoted to direct support.

### Related

Evidence is `related` when semantic retrieval finds credible nearby material but the direct corroboration tests above do not establish that the requested source/event/teaching is actually present.

Examples from calibration include questions about Moses receiving the commandments or the teaching to love one's enemies when the current corpus returns adjacent Psalter material rather than the requested narrative/teaching itself.

### Insufficient

Evidence is `insufficient` when:

- no ancient evidence unit is returned; or
- vector evidence falls below the provisional off-domain floor of `0.83` **and** significant-term coverage is below `50%`, with no direct title or phrase corroboration.

The `0.83` value is not a universal truth threshold. It is a provisional off-domain guard derived from the current live corpus and must remain covered by the regression pack before future tuning.

### Not assessed

Multi-well `internal`, `ankhor_internal`, and `luminaria_client` requests remain `not_assessed` for this field in Stage 2.2. Their evidence relationships require separate calibration because the Grimoire and Sacred Writings have different provenance semantics.

## Compatibility rule

During Stage 2.2:

- existing `oracle.v1.state` semantics remain unchanged;
- retrieval ranking remains unchanged;
- vector thresholds remain unchanged;
- rights/Tier-A gates remain unchanged;
- no frontend caller is required to consume the new metadata.

A later promotion may use the relationship assessment to influence synthesis language or state semantics only after live canary evidence supports that change.

## Regression classes

The secret-free contract suite now locks these cases:

1. explicit source-title intent → supported;
2. direct passage phrase → supported;
3. high semantic + high term coverage → supported;
4. in-domain event/source mismatch → related;
5. thematically adjacent teaching → related;
6. unrelated low-score query → insufficient;
7. no evidence → insufficient;
8. multi-well surface → not assessed;
9. advisory classification must not silently rewrite the existing Oracle state.

## Next gate

After CI passes, deploy the additive contract/core source through an `oracle-query`-only canary. Compare the fixed regression query pack against production and record both the legacy state and `evidence_relationship.level` before deciding whether any caller-facing language should change.
