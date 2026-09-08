import { assert, assertEquals } from "jsr:@std/assert@1";
import type {
  OracleQueryPlanShadowEvaluation,
  OracleShadowSubqueryEvaluation,
} from "./oracle-query-plan-shadow.ts";
import { recombineOracleQueryPlanShadow } from "./oracle-query-plan-recombination.ts";

function section(
  id: string,
  satisfaction: OracleShadowSubqueryEvaluation["satisfaction"],
  intent: OracleShadowSubqueryEvaluation["intent"] = "textual_claim",
): OracleShadowSubqueryEvaluation {
  return {
    subquery_id: id,
    intent,
    question: `Question ${id}`,
    requested_wells: ["akst_ancient"],
    satisfaction,
    reasons: [`reason:${satisfaction}`],
    evidence_count: satisfaction === "not_assessed" ? 0 : 2,
    top_score: satisfaction === "not_assessed" ? null : 0.88,
    source_titles: satisfaction === "not_assessed" ? [] : ["Source A"],
    relationship_level: satisfaction === "met"
      ? "supported"
      : satisfaction === "partial"
      ? "related"
      : satisfaction === "unmet"
      ? "insufficient"
      : "not_assessed",
    retrieval_mode: satisfaction === "not_assessed" ? null : "native_vector",
    vector_status: satisfaction === "not_assessed" ? null : "ready",
    metadata_fields_present: [],
  };
}

function shadow(
  sections: OracleShadowSubqueryEvaluation[],
  evaluated = sections.filter((item) => item.satisfaction !== "not_assessed").length,
): OracleQueryPlanShadowEvaluation {
  return {
    version: "oracle.query_plan_shadow.v1",
    mode: "shadow",
    status: evaluated === 0
      ? "not_evaluated"
      : evaluated === sections.length
      ? "complete"
      : "partial",
    plan_version: "oracle.query_plan.v1",
    plan_execution_status: "not_applied_to_retrieval",
    surface: "akst_learning",
    applied_to_primary_retrieval: false,
    applied_to_answer: false,
    evaluated_subqueries: evaluated,
    total_subqueries: sections.length,
    subqueries: sections,
    warnings: [],
  };
}

Deno.test("all met sections recombine as fully supported", () => {
  const result = recombineOracleQueryPlanShadow(
    shadow([section("q1", "met"), section("q2", "met", "chronology")]),
  );

  assertEquals(result.overall_state, "fully_supported");
  assertEquals(result.sections.map((item) => item.disposition), [
    "may_assert_with_citations",
    "may_assert_with_citations",
  ]);
});

Deno.test("met plus partial remains partially supported instead of globally grounded", () => {
  const result = recombineOracleQueryPlanShadow(
    shadow([section("q1", "met"), section("q2", "partial", "chronology")]),
  );

  assertEquals(result.overall_state, "partially_supported");
  assertEquals(result.sections[0].support_state, "met");
  assertEquals(result.sections[1].support_state, "partial");
  assertEquals(result.sections[1].disposition, "must_qualify_uncertainty");
});

Deno.test("met plus unmet exposes a mixed result with a visible evidence gap", () => {
  const result = recombineOracleQueryPlanShadow(
    shadow([section("q1", "met"), section("q2", "unmet", "identity_alias")]),
  );

  assertEquals(result.overall_state, "mixed_with_gaps");
  assertEquals(result.sections[1].disposition, "must_state_evidence_gap");
});

Deno.test("all unmet sections recombine as insufficient", () => {
  const result = recombineOracleQueryPlanShadow(
    shadow([section("q1", "unmet"), section("q2", "unmet", "chronology")]),
  );

  assertEquals(result.overall_state, "insufficient");
});

Deno.test("unevaluated sections prevent a complete-support ruling", () => {
  const sections = [section("q1", "met"), section("q2", "not_assessed", "chronology")];
  const result = recombineOracleQueryPlanShadow(shadow(sections, 1));

  assertEquals(result.overall_state, "incomplete_evaluation");
  assertEquals(result.sections[1].disposition, "must_not_answer_from_shadow");
});

Deno.test("zero evaluated sections remain not evaluated", () => {
  const result = recombineOracleQueryPlanShadow(
    shadow([section("q1", "not_assessed")], 0),
  );

  assertEquals(result.overall_state, "not_evaluated");
});

Deno.test("recombination preserves section reasons and evidence summaries", () => {
  const source = section("q1", "partial", "chronology");
  source.reasons = [
    "date_metadata_present_but_composition_date_remains_vague",
    "translation_or_witness_date_must_not_substitute_for_composition_date",
  ];
  source.source_titles = ["Prayer of Manasses"];
  source.evidence_count = 8;
  source.top_score = 0.862;

  const result = recombineOracleQueryPlanShadow(shadow([source]));
  const recombined = result.sections[0];

  assertEquals(recombined.reasons, source.reasons);
  assertEquals(recombined.source_titles, ["Prayer of Manasses"]);
  assertEquals(recombined.evidence_count, 8);
  assertEquals(recombined.top_score, 0.862);
});

Deno.test("shadow recombination can never control retrieval or the answer", () => {
  const result = recombineOracleQueryPlanShadow(shadow([section("q1", "met")]));

  assertEquals(result.can_control_primary_retrieval, false);
  assertEquals(result.can_control_answer, false);
  assert(result.warnings.includes("recombination_is_shadow_only"));
  assert(
    result.warnings.includes(
      "do_not_collapse_partial_or_unmet_sections_into_global_grounding",
    ),
  );
});
