import { assertEquals } from "jsr:@std/assert@1";
import type { OracleQueryPlanShadowEvaluation } from "./oracle-query-plan-shadow.ts";
import { buildOracleQueryPlanShadowDiagnostics } from "./oracle-query-plan-shadow-diagnostics.ts";

function shadow(): OracleQueryPlanShadowEvaluation {
  return {
    version: "oracle.query_plan_shadow.v1",
    mode: "shadow",
    status: "complete",
    plan_version: "oracle.query_plan.v1",
    plan_execution_status: "not_applied_to_retrieval",
    surface: "akst_learning",
    applied_to_primary_retrieval: false,
    applied_to_answer: false,
    evaluated_subqueries: 2,
    total_subqueries: 2,
    subqueries: [
      {
        subquery_id: "q1",
        intent: "textual_claim",
        question: "What does Prayer of Manasses say about repentance?",
        requested_wells: ["akst_ancient"],
        satisfaction: "met",
        reasons: ["textual_relationship_supported"],
        evidence_count: 8,
        top_score: 0.89,
        source_titles: ["Prayer of Manasses"],
        relationship_level: "supported",
        retrieval_mode: "native_vector",
        vector_status: "ready",
        metadata_fields_present: ["rights_status"],
      },
      {
        subquery_id: "q2",
        intent: "chronology",
        question: "when was it composed",
        requested_wells: ["akst_ancient"],
        satisfaction: "partial",
        reasons: [
          "date_metadata_present_but_composition_date_remains_vague",
          "translation_or_witness_date_must_not_substitute_for_composition_date",
        ],
        evidence_count: 8,
        top_score: 0.86,
        source_titles: ["Prayer of Manasses"],
        relationship_level: "related",
        retrieval_mode: "native_vector",
        vector_status: "ready",
        metadata_fields_present: ["estimated_date", "translator"],
      },
    ],
    warnings: ["shadow_results_are_diagnostic_only"],
  };
}

Deno.test("shadow diagnostics pair the exact shadow result with recombination", () => {
  const source = shadow();
  const diagnostics = buildOracleQueryPlanShadowDiagnostics(source);

  assertEquals(diagnostics.query_plan_shadow, source);
  assertEquals(
    diagnostics.query_plan_recombination.version,
    "oracle.query_plan_recombination.v1",
  );
  assertEquals(
    diagnostics.query_plan_recombination.overall_state,
    "partially_supported",
  );
});

Deno.test("shadow diagnostics preserve per-subquery uncertainty", () => {
  const diagnostics = buildOracleQueryPlanShadowDiagnostics(shadow());
  const sections = diagnostics.query_plan_recombination.sections;

  assertEquals(sections[0].support_state, "met");
  assertEquals(sections[0].disposition, "may_assert_with_citations");
  assertEquals(sections[1].support_state, "partial");
  assertEquals(sections[1].disposition, "must_qualify_uncertainty");
});

Deno.test("assembled recombination still cannot control retrieval or answer", () => {
  const recombination = buildOracleQueryPlanShadowDiagnostics(shadow())
    .query_plan_recombination;

  assertEquals(recombination.can_control_primary_retrieval, false);
  assertEquals(recombination.can_control_answer, false);
});
