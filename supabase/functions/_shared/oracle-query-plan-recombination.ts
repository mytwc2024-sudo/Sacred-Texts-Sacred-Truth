import type {
  OracleQueryPlanShadowEvaluation,
  OracleShadowSubqueryEvaluation,
} from "./oracle-query-plan-shadow.ts";

export const ORACLE_QUERY_PLAN_RECOMBINATION_VERSION =
  "oracle.query_plan_recombination.v1" as const;

export type OracleRecombinationState =
  | "fully_supported"
  | "partially_supported"
  | "mixed_with_gaps"
  | "insufficient"
  | "incomplete_evaluation"
  | "not_evaluated";

export type OracleRecombinationDisposition =
  | "may_assert_with_citations"
  | "must_qualify_uncertainty"
  | "must_state_evidence_gap"
  | "must_not_answer_from_shadow";

export type OracleRecombinationSection = {
  subquery_id: string;
  intent: OracleShadowSubqueryEvaluation["intent"];
  question: string;
  support_state: OracleShadowSubqueryEvaluation["satisfaction"];
  disposition: OracleRecombinationDisposition;
  reasons: string[];
  evidence_count: number;
  source_titles: string[];
  top_score: number | null;
};

export type OracleQueryPlanRecombination = {
  version: typeof ORACLE_QUERY_PLAN_RECOMBINATION_VERSION;
  mode: "shadow";
  source_shadow_version: OracleQueryPlanShadowEvaluation["version"];
  overall_state: OracleRecombinationState;
  total_subqueries: number;
  evaluated_subqueries: number;
  sections: OracleRecombinationSection[];
  can_control_primary_retrieval: false;
  can_control_answer: false;
  warnings: string[];
};

export function recombineOracleQueryPlanShadow(
  shadow: OracleQueryPlanShadowEvaluation,
): OracleQueryPlanRecombination {
  const sections = shadow.subqueries.map(toSection);
  const overallState = deriveOverallState(shadow);

  return {
    version: ORACLE_QUERY_PLAN_RECOMBINATION_VERSION,
    mode: "shadow",
    source_shadow_version: shadow.version,
    overall_state: overallState,
    total_subqueries: shadow.total_subqueries,
    evaluated_subqueries: shadow.evaluated_subqueries,
    sections,
    can_control_primary_retrieval: false,
    can_control_answer: false,
    warnings: [
      "recombination_is_shadow_only",
      "preserve_each_subquery_support_state",
      "do_not_collapse_partial_or_unmet_sections_into_global_grounding",
      "do_not_generate_final_answer_from_shadow_recombination_yet",
    ],
  };
}

function deriveOverallState(
  shadow: OracleQueryPlanShadowEvaluation,
): OracleRecombinationState {
  if (shadow.evaluated_subqueries === 0) return "not_evaluated";
  if (shadow.evaluated_subqueries < shadow.total_subqueries) {
    return "incomplete_evaluation";
  }

  const evaluated = shadow.subqueries.filter((section) =>
    section.satisfaction !== "not_assessed"
  );
  const met = evaluated.filter((section) => section.satisfaction === "met").length;
  const partial = evaluated.filter((section) =>
    section.satisfaction === "partial"
  ).length;
  const unmet = evaluated.filter((section) =>
    section.satisfaction === "unmet"
  ).length;

  if (unmet === evaluated.length) return "insufficient";
  if (unmet > 0) return "mixed_with_gaps";
  if (partial > 0) return "partially_supported";
  if (met === evaluated.length) return "fully_supported";
  return "not_evaluated";
}

function toSection(
  subquery: OracleShadowSubqueryEvaluation,
): OracleRecombinationSection {
  return {
    subquery_id: subquery.subquery_id,
    intent: subquery.intent,
    question: subquery.question,
    support_state: subquery.satisfaction,
    disposition: dispositionFor(subquery.satisfaction),
    reasons: [...subquery.reasons],
    evidence_count: subquery.evidence_count,
    source_titles: [...subquery.source_titles],
    top_score: subquery.top_score,
  };
}

function dispositionFor(
  satisfaction: OracleShadowSubqueryEvaluation["satisfaction"],
): OracleRecombinationDisposition {
  if (satisfaction === "met") return "may_assert_with_citations";
  if (satisfaction === "partial") return "must_qualify_uncertainty";
  if (satisfaction === "unmet") return "must_state_evidence_gap";
  return "must_not_answer_from_shadow";
}
