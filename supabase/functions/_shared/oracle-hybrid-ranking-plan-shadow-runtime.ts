import type { OracleQueryPlan } from "./oracle-query-plan.ts";
import {
  runOracleHybridRankingPlanShadow,
  type OracleHybridRankingPlanShadowResult,
  type OracleHybridPlanShadowCallbacks,
} from "./oracle-hybrid-ranking-plan-shadow.ts";

export type OracleHybridRankingPlanShadowRuntimeOptions = {
  plan: OracleQueryPlan;
  callbacksFor: OracleHybridPlanShadowCallbacks;
};

export async function executeOracleHybridRankingPlanShadow(
  options: OracleHybridRankingPlanShadowRuntimeOptions,
): Promise<OracleHybridRankingPlanShadowResult> {
  try {
    return await runOracleHybridRankingPlanShadow(
      options.plan,
      options.callbacksFor,
    );
  } catch (error) {
    console.error("Oracle hybrid-ranking plan shadow", error);
    return {
      version: "oracle.hybrid_ranking_plan_shadow.v1",
      mode: "shadow",
      status: "not_evaluated",
      plan_version: options.plan.version,
      surface: options.plan.surface,
      applied_to_primary_retrieval: false,
      applied_to_answer: false,
      evaluated_subqueries: 0,
      total_subqueries: options.plan.subqueries.length,
      subqueries: options.plan.subqueries.map((subquery) => ({
        subquery_id: subquery.id,
        intent: subquery.intent,
        question: subquery.question,
        status: "not_evaluated" as const,
        warnings: ["hybrid_plan_shadow_runtime_error"],
      })),
      warnings: ["hybrid_plan_shadow_runtime_error"],
    };
  }
}
