import type { OracleQueryPlanShadowEvaluation } from "./oracle-query-plan-shadow.ts";
import {
  recombineOracleQueryPlanShadow,
  type OracleQueryPlanRecombination,
} from "./oracle-query-plan-recombination.ts";

export type OracleQueryPlanShadowDiagnostics = {
  query_plan_shadow: OracleQueryPlanShadowEvaluation;
  query_plan_recombination: OracleQueryPlanRecombination;
};

export function buildOracleQueryPlanShadowDiagnostics(
  shadow: OracleQueryPlanShadowEvaluation,
): OracleQueryPlanShadowDiagnostics {
  return {
    query_plan_shadow: shadow,
    query_plan_recombination: recombineOracleQueryPlanShadow(shadow),
  };
}
