import { assert, assertEquals } from "jsr:@std/assert@1";
import { planOracleQuery } from "./oracle-query-plan.ts";

Deno.test("simple AKST textual question stays one ancient-only subquery", () => {
  const plan = planOracleQuery(
    "What does Prayer of Manasses say about repentance?",
    "akst_learning",
  );

  assertEquals(plan.version, "oracle.query_plan.v1");
  assertEquals(plan.mode, "advisory");
  assertEquals(plan.execution_status, "not_applied_to_retrieval");
  assertEquals(plan.complexity, "simple");
  assertEquals(plan.subqueries.length, 1);
  assertEquals(plan.subqueries[0].intent, "textual_claim");
  assertEquals(plan.subqueries[0].requested_wells, ["akst_ancient"]);
});

Deno.test("compound textual plus chronology question decomposes without splitting ordinary and phrases", () => {
  const plan = planOracleQuery(
    "What does Prayer of Manasses say about mercy and repentance, and when was the text composed?",
    "internal",
  );

  assertEquals(plan.complexity, "compound");
  assertEquals(plan.subqueries.length, 2);
  assertEquals(plan.subqueries[0].intent, "textual_claim");
  assertEquals(plan.subqueries[1].intent, "chronology");
  assertEquals(
    plan.subqueries[0].question,
    "What does Prayer of Manasses say about mercy and repentance,",
  );
  assertEquals(plan.subqueries[1].question, "when was the text composed");
  assert(
    plan.warnings.includes(
      "preserve_subquery_evidence_classes_during_recombination",
    ),
  );
});

Deno.test("identity question requires explicit identity evidence and avoids Grimoire routing", () => {
  const plan = planOracleQuery(
    "Are Inanna and Ishtar the same deity?",
    "internal",
  );

  assertEquals(plan.subqueries.length, 1);
  assertEquals(plan.subqueries[0].intent, "identity_alias");
  assertEquals(plan.subqueries[0].requested_wells, [
    "akst_ancient",
    "sacred_writings",
  ]);
  assert(
    plan.subqueries[0].evidence_requirements.includes(
      "do_not_equate_entities_from_semantic_similarity_alone",
    ),
  );
  assert(
    plan.warnings.includes(
      "do_not_collapse_identity_from_embedding_similarity",
    ),
  );
});

Deno.test("comparison question requires evidence on both sides", () => {
  const plan = planOracleQuery(
    "Compare mercy in Prayer of Manasses versus the Psalter",
    "internal",
  );

  assertEquals(plan.subqueries[0].intent, "cross_tradition_comparison");
  assert(
    plan.subqueries[0].evidence_requirements.includes(
      "evidence_from_each_compared_source_or_tradition",
    ),
  );
  assert(plan.warnings.includes("comparison_requires_evidence_on_each_side"));
});

Deno.test("provenance question routes to ancient source metadata only", () => {
  const plan = planOracleQuery(
    "Which manuscript witnesses preserve this variant reading?",
    "internal",
  );

  assertEquals(plan.subqueries[0].intent, "provenance_manuscript");
  assertEquals(plan.subqueries[0].requested_wells, ["akst_ancient"]);
  assertEquals(
    plan.subqueries[0].evidence_class_rule,
    "metadata_claims_require_source_or_witness_metadata_not_working-layer_similarity",
  );
});

Deno.test("interpretive request is explicitly separated from attestation", () => {
  const plan = planOracleQuery(
    "What might this passage mean spiritually as a reflection?",
    "internal",
  );

  assertEquals(plan.subqueries[0].intent, "interpretive_reflective");
  assert(
    plan.subqueries[0].evidence_requirements.includes(
      "label_reflection_as_interpretive_not_historical_fact",
    ),
  );
  assert(
    plan.warnings.includes("do_not_promote_interpretation_to_attestation"),
  );
});

Deno.test("one clause may surface multiple evidence intents without becoming workflow orchestration", () => {
  const plan = planOracleQuery(
    "Compare the manuscript provenance and dating of these two texts",
    "internal",
  );

  assertEquals(plan.complexity, "compound");
  assertEquals(
    plan.subqueries.map((subquery) => subquery.intent),
    ["provenance_manuscript", "chronology", "cross_tradition_comparison"],
  );
  assertEquals(plan.mode, "advisory");
  assertEquals(plan.execution_status, "not_applied_to_retrieval");
  assertEquals("jobs" in plan, false);
  assertEquals("agents" in plan, false);
});

Deno.test("AKST learning surface constrains every intent to governed ancient evidence", () => {
  const plan = planOracleQuery(
    "Compare these teachings and explain their spiritual meaning",
    "akst_learning",
  );

  assert(plan.subqueries.length >= 2);
  for (const subquery of plan.subqueries) {
    assertEquals(subquery.requested_wells, ["akst_ancient"]);
  }
});
