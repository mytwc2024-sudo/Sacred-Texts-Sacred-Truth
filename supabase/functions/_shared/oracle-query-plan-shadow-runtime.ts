import {
  assessEvidenceRelationship,
  type OracleEvidenceUnit,
} from "./oracle-contract.ts";
import type { OracleQueryPlan } from "./oracle-query-plan.ts";
import {
  evaluateOracleQueryPlanShadow,
  type OracleQueryPlanShadowEvaluation,
  type OracleShadowSourceMetadata,
  type OracleShadowSubqueryEvidence,
} from "./oracle-query-plan-shadow.ts";

export const ORACLE_SHADOW_MAX_SUBQUERIES = 4;

export type OracleShadowRuntimeHit = {
  id?: string | null;
  text_id?: string | null;
  title: string;
  excerpt?: string | null;
  score?: number | null;
  source_name?: string | null;
  source_url?: string | null;
  author?: string | null;
  content_tier?: string | null;
  rights_status?: string | null;
};

export type OracleShadowRuntimeRetrieval = {
  retrieval_mode?: string | null;
  vector_status?: string | null;
  hits: OracleShadowRuntimeHit[];
};

export type OracleShadowRuntimeCallbacks = {
  retrieveAncient: (question: string) => Promise<OracleShadowRuntimeRetrieval>;
  loadSourceMetadata: (
    textIds: string[],
  ) => Promise<OracleShadowSourceMetadata[]>;
};

export async function runAkstLearningQueryPlanShadow(
  plan: OracleQueryPlan,
  callbacks: OracleShadowRuntimeCallbacks,
  maxSubqueries = ORACLE_SHADOW_MAX_SUBQUERIES,
): Promise<OracleQueryPlanShadowEvaluation> {
  if (plan.surface !== "akst_learning") {
    const result = evaluateOracleQueryPlanShadow(plan, []);
    return {
      ...result,
      warnings: [
        "shadow_runtime_v1_is_akst_learning_only",
        ...result.warnings,
      ],
    };
  }

  const bounded = plan.subqueries.slice(0, Math.max(0, maxSubqueries));
  const evidence = await Promise.all(
    bounded.map(async (subquery): Promise<OracleShadowSubqueryEvidence> => {
      const retrieval = await callbacks.retrieveAncient(subquery.question);
      const textIds = uniqueStrings(
        retrieval.hits.map((hit) => hit.text_id),
      );
      const sourceMetadata = textIds.length
        ? await callbacks.loadSourceMetadata(textIds)
        : [];
      const relationship = assessEvidenceRelationship(
        "akst_learning",
        subquery.question,
        toEvidenceUnits(retrieval),
      );

      return {
        subquery_id: subquery.id,
        retrieval_mode: retrieval.retrieval_mode ?? null,
        vector_status: retrieval.vector_status ?? null,
        relationship_level: relationship.level,
        relationship_reasons: relationship.reasons,
        hits: retrieval.hits.map((hit) => ({
          text_id: hit.text_id ?? null,
          title: hit.title,
          score: hit.score ?? null,
          content_tier: hit.content_tier ?? null,
          rights_status: hit.rights_status ?? null,
        })),
        source_metadata: sourceMetadata,
        metadata_status: textIds.length ? "ready" : "not_requested",
      };
    }),
  );

  const result = evaluateOracleQueryPlanShadow(plan, evidence);
  if (plan.subqueries.length <= bounded.length) return result;

  return {
    ...result,
    status: "partial",
    warnings: [
      `shadow_subquery_limit:${bounded.length}`,
      ...result.warnings,
    ],
  };
}

export function buildShadowRuntimeFailure(
  plan: OracleQueryPlan,
): OracleQueryPlanShadowEvaluation {
  const result = evaluateOracleQueryPlanShadow(plan, []);
  return {
    ...result,
    status: "not_evaluated",
    warnings: [
      "shadow_runtime_error",
      "primary_oracle_response_must_continue",
      ...result.warnings,
    ],
  };
}

function toEvidenceUnits(
  retrieval: OracleShadowRuntimeRetrieval,
): OracleEvidenceUnit[] {
  return retrieval.hits.map((hit, index) => ({
    id: `shadow:${hit.id ?? index}`,
    citation_label: `A${index + 1}`,
    well: "akst_ancient",
    source_id: hit.id ?? null,
    parent_source_id: hit.text_id ?? null,
    title: hit.title,
    excerpt: hit.excerpt ?? "",
    source_name: hit.source_name ?? null,
    source_url: hit.source_url ?? null,
    author: hit.author ?? null,
    rights_status: hit.rights_status ?? null,
    content_tier: hit.content_tier ?? null,
    score: hit.score ?? null,
    retrieval_method: retrieval.retrieval_mode ?? null,
  }));
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}
