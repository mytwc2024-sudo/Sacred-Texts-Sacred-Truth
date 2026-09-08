import { assert, assertEquals } from "jsr:@std/assert@1";
import { planOracleQuery } from "./oracle-query-plan.ts";
import {
  evaluateOracleQueryPlanShadow,
  ORACLE_QUERY_PLAN_SHADOW_VERSION,
  type OracleShadowSubqueryEvidence,
} from "./oracle-query-plan-shadow.ts";

function evidence(
  subqueryId: string,
  overrides: Partial<OracleShadowSubqueryEvidence> = {},
): OracleShadowSubqueryEvidence {
  return {
    subquery_id: subqueryId,
    retrieval_mode: "native_vector",
    vector_status: "ready",
    relationship_level: "supported",
    relationship_reasons: ["fixture"],
    hits: [{
      text_id: "text-1",
      title: "Prayer of Manasses",
      score: 0.88,
      content_tier: "A",
      rights_status: "public_domain",
    }],
    source_metadata: [],
    metadata_status: "ready",
    ...overrides,
  };
}

Deno.test("shadow evaluation is explicitly diagnostic and never applied to answers", () => {
  const plan = planOracleQuery(
    "What does Prayer of Manasses say about repentance?",
    "akst_learning",
  );
  const result = evaluateOracleQueryPlanShadow(plan, [evidence("q1")]);

  assertEquals(result.version, ORACLE_QUERY_PLAN_SHADOW_VERSION);
  assertEquals(result.mode, "shadow");
  assertEquals(result.status, "complete");
  assertEquals(result.applied_to_primary_retrieval, false);
  assertEquals(result.applied_to_answer, false);
  assert(
    result.warnings.includes(
      "do_not_use_shadow_results_for_answer_recombination_yet",
    ),
  );
});

Deno.test("supported textual evidence satisfies a textual subquery", () => {
  const plan = planOracleQuery(
    "What does the text say about repentance?",
    "akst_learning",
  );
  const result = evaluateOracleQueryPlanShadow(plan, [evidence("q1")]);

  assertEquals(result.subqueries[0].intent, "textual_claim");
  assertEquals(result.subqueries[0].satisfaction, "met");
  assertEquals(result.subqueries[0].reasons, [
    "textual_relationship_supported",
  ]);
});

Deno.test("related textual evidence remains partial instead of becoming support", () => {
  const plan = planOracleQuery(
    "What does the text say about repentance?",
    "akst_learning",
  );
  const result = evaluateOracleQueryPlanShadow(plan, [
    evidence("q1", { relationship_level: "related" }),
  ]);

  assertEquals(result.subqueries[0].satisfaction, "partial");
  assertEquals(result.subqueries[0].reasons, [
    "textual_relationship_related_not_supported",
  ]);
});

Deno.test("insufficient textual evidence leaves the subquery unmet", () => {
  const plan = planOracleQuery(
    "What does the text say about repentance?",
    "akst_learning",
  );
  const result = evaluateOracleQueryPlanShadow(plan, [
    evidence("q1", { relationship_level: "insufficient" }),
  ]);

  assertEquals(result.subqueries[0].satisfaction, "unmet");
});

Deno.test("vague ancient date stays partial even when translation year is known", () => {
  const plan = planOracleQuery(
    "When was Prayer of Manasses composed?",
    "akst_learning",
  );
  const result = evaluateOracleQueryPlanShadow(plan, [
    evidence("q1", {
      source_metadata: [{
        id: "text-1",
        title: "Prayer of Manasses",
        estimated_date: "Ancient; English translation published 1851",
        original_language: "Greek",
        translator: "Sir Lancelot C. L. Brenton",
        witness_key: "prayer-of-manasses:brenton-1851",
      }],
    }),
  ]);

  assertEquals(result.subqueries[0].intent, "chronology");
  assertEquals(result.subqueries[0].satisfaction, "partial");
  assert(
    result.subqueries[0].reasons.includes(
      "translation_or_witness_date_must_not_substitute_for_composition_date",
    ),
  );
});

Deno.test("specific composition date metadata can satisfy chronology shadow requirements", () => {
  const plan = planOracleQuery("When was this text composed?", "akst_learning");
  const result = evaluateOracleQueryPlanShadow(plan, [
    evidence("q1", {
      source_metadata: [{
        id: "text-1",
        title: "Example Text",
        estimated_date: "2nd century BCE; manuscript witness much later",
      }],
    }),
  ]);

  assertEquals(result.subqueries[0].satisfaction, "met");
  assertEquals(result.subqueries[0].reasons, [
    "specific_composition_date_metadata_present",
  ]);
});

Deno.test("complete governed source metadata satisfies provenance shadow requirements", () => {
  const plan = planOracleQuery(
    "What manuscript witness and original language support this text?",
    "akst_learning",
  );
  const result = evaluateOracleQueryPlanShadow(plan, [
    evidence("q1", {
      source_metadata: [{
        id: "text-1",
        title: "Prayer of Manasses",
        source_url: "https://example.test/source.zip",
        source_file_name: "55-MAN.usfm",
        source_format: "USFM",
        original_language: "Greek",
        witness_key: "prayer-of-manasses:brenton-1851",
        verification_status: "accepted",
      }],
    }),
  ]);

  assertEquals(result.subqueries[0].intent, "provenance_manuscript");
  assertEquals(result.subqueries[0].satisfaction, "met");
  assert(result.subqueries[0].metadata_fields_present.includes("witness_key"));
});

Deno.test("identity questions cannot be satisfied by passage similarity in shadow v1", () => {
  const plan = planOracleQuery(
    "Is figure A the same as figure B?",
    "akst_learning",
  );
  const result = evaluateOracleQueryPlanShadow(plan, [evidence("q1")]);

  assertEquals(result.subqueries[0].intent, "identity_alias");
  assertEquals(result.subqueries[0].satisfaction, "unmet");
  assertEquals(result.subqueries[0].reasons, [
    "governed_identity_attestation_not_available_in_shadow_v1",
  ]);
});

Deno.test("cross-tradition comparison stays partial without evidence from two traditions", () => {
  const plan = planOracleQuery(
    "Compare these teachings across traditions",
    "internal",
  );
  const result = evaluateOracleQueryPlanShadow(plan, [
    evidence("q1", {
      source_metadata: [{
        id: "text-1",
        title: "Text One",
        tradition_id: "tradition-1",
      }],
    }),
  ]);

  assertEquals(result.subqueries[0].intent, "cross_tradition_comparison");
  assertEquals(result.subqueries[0].satisfaction, "partial");
});

Deno.test("cross-tradition comparison can be met only with independent tradition evidence", () => {
  const plan = planOracleQuery(
    "Compare these teachings across traditions",
    "internal",
  );
  const result = evaluateOracleQueryPlanShadow(plan, [
    evidence("q1", {
      source_metadata: [
        { id: "text-1", title: "Text One", tradition_id: "tradition-1" },
        { id: "text-2", title: "Text Two", tradition_id: "tradition-2" },
      ],
    }),
  ]);

  assertEquals(result.subqueries[0].satisfaction, "met");
});

Deno.test("interpretive requests remain partial even with attested textual support", () => {
  const plan = planOracleQuery(
    "What is the spiritual meaning of this passage?",
    "internal",
  );
  const result = evaluateOracleQueryPlanShadow(plan, [evidence("q1")]);

  assertEquals(result.subqueries[0].intent, "interpretive_reflective");
  assertEquals(result.subqueries[0].satisfaction, "partial");
  assert(
    result.subqueries[0].reasons.includes(
      "interpretation_remains_separate_from_attestation",
    ),
  );
});

Deno.test("missing shadow evidence is visible instead of silently treated as failure", () => {
  const plan = planOracleQuery(
    "What does Prayer of Manasses say about repentance, and when was it composed?",
    "akst_learning",
  );
  const result = evaluateOracleQueryPlanShadow(plan, [evidence("q1")]);

  assertEquals(result.status, "partial");
  assertEquals(result.evaluated_subqueries, 1);
  assertEquals(result.total_subqueries, 2);
  assertEquals(result.subqueries[1].satisfaction, "not_assessed");
  assertEquals(result.subqueries[1].reasons, ["shadow_evidence_not_supplied"]);
});
