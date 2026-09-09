import type { OracleQueryPlan } from "./oracle-query-plan.ts";
import {
  type OracleHybridRankingShadowResult,
  type OracleHybridShadowCallbacks,
  runOracleHybridRankingShadow,
} from "./oracle-hybrid-ranking-shadow.ts";

export const ORACLE_HYBRID_RANKING_PLAN_SHADOW_VERSION =
  "oracle.hybrid_ranking_plan_shadow.v1" as const;

export const ORACLE_HYBRID_PLAN_SHADOW_MAX_SUBQUERIES = 4;

export type OracleHybridPlanShadowSubquery = {
  subquery_id: string;
  intent: OracleQueryPlan["subqueries"][number]["intent"];
  question: string;
  status: "evaluated" | "not_evaluated";
  ranking_shadow?: OracleHybridRankingShadowResult;
  warnings: string[];
};

export type OracleHybridRankingPlanShadowResult = {
  version: typeof ORACLE_HYBRID_RANKING_PLAN_SHADOW_VERSION;
  mode: "shadow";
  status: "complete" | "partial" | "not_evaluated";
  plan_version: OracleQueryPlan["version"];
  surface: OracleQueryPlan["surface"];
  applied_to_primary_retrieval: false;
  applied_to_answer: false;
  evaluated_subqueries: number;
  total_subqueries: number;
  subqueries: OracleHybridPlanShadowSubquery[];
  warnings: string[];
};

export type OracleHybridPlanShadowCallbacks = (
  subquery: OracleQueryPlan["subqueries"][number],
) => OracleHybridShadowCallbacks;

export async function runOracleHybridRankingPlanShadow(
  plan: OracleQueryPlan,
  callbacksFor: OracleHybridPlanShadowCallbacks,
  maxSubqueries = ORACLE_HYBRID_PLAN_SHADOW_MAX_SUBQUERIES,
): Promise<OracleHybridRankingPlanShadowResult> {
  if (plan.surface !== "akst_learning") {
    return {
      version: ORACLE_HYBRID_RANKING_PLAN_SHADOW_VERSION,
      mode: "shadow",
      status: "not_evaluated",
      plan_version: plan.version,
      surface: plan.surface,
      applied_to_primary_retrieval: false,
      applied_to_answer: false,
      evaluated_subqueries: 0,
      total_subqueries: plan.subqueries.length,
      subqueries: plan.subqueries.map((subquery) => ({
        subquery_id: subquery.id,
        intent: subquery.intent,
        question: subquery.question,
        status: "not_evaluated",
        warnings: ["hybrid_plan_shadow_v1_is_akst_learning_only"],
      })),
      warnings: [
        "hybrid_plan_shadow_v1_is_akst_learning_only",
        "hybrid_plan_shadow_must_not_change_primary_retrieval",
      ],
    };
  }

  const limit = Math.max(0, maxSubqueries);
  const bounded = plan.subqueries.slice(0, limit);
  const evaluated = await Promise.all(
    bounded.map(async (subquery): Promise<OracleHybridPlanShadowSubquery> => {
      try {
        const rankingShadow = await runOracleHybridRankingShadow(
          {
            question: subquery.question,
            intent: subquery.intent,
          },
          callbacksFor(subquery),
        );
        return {
          subquery_id: subquery.id,
          intent: subquery.intent,
          question: subquery.question,
          status: "evaluated",
          ranking_shadow: rankingShadow,
          warnings: [],
        };
      } catch {
        return {
          subquery_id: subquery.id,
          intent: subquery.intent,
          question: subquery.question,
          status: "not_evaluated",
          warnings: ["hybrid_plan_subquery_shadow_error"],
        };
      }
    }),
  );

  const unevaluated = plan.subqueries.slice(bounded.length).map((subquery) => ({
    subquery_id: subquery.id,
    intent: subquery.intent,
    question: subquery.question,
    status: "not_evaluated" as const,
    warnings: ["hybrid_plan_shadow_subquery_limit"],
  }));
  const subqueries = [...evaluated, ...unevaluated];
  const evaluatedCount = subqueries.filter((item) =>
    item.status === "evaluated"
  ).length;
  const status = evaluatedCount === 0
    ? "not_evaluated"
    : evaluatedCount === plan.subqueries.length
    ? "complete"
    : "partial";
  const warnings = [
    "hybrid_plan_shadow_is_diagnostic_only",
    "preserve_subquery_intent_during_ranking",
    "hybrid_plan_shadow_must_not_change_primary_retrieval",
    "hybrid_plan_shadow_must_not_change_answer",
  ];
  if (plan.subqueries.length > bounded.length) {
    warnings.push(`hybrid_plan_shadow_subquery_limit:${bounded.length}`);
  }
  if (evaluatedCount < bounded.length) {
    warnings.push("hybrid_plan_shadow_subquery_error");
  }

  return {
    version: ORACLE_HYBRID_RANKING_PLAN_SHADOW_VERSION,
    mode: "shadow",
    status,
    plan_version: plan.version,
    surface: plan.surface,
    applied_to_primary_retrieval: false,
    applied_to_answer: false,
    evaluated_subqueries: evaluatedCount,
    total_subqueries: plan.subqueries.length,
    subqueries,
    warnings,
  };
}
