import type { OracleQueryPlan } from "./oracle-query-plan.ts";
import {
  type OracleHybridPlanShadowCallbacks,
  type OracleHybridRankingPlanShadowResult,
  runOracleHybridRankingPlanShadow,
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

export async function executeOracleHybridRankingPlanShadowAgainstDb(
  db: any,
  plan: OracleQueryPlan,
  nativeEmbed: (question: string) => Promise<{
    vector: number[] | null;
    status: "ready" | "unavailable";
  }>,
): Promise<OracleHybridRankingPlanShadowResult> {
  return executeOracleHybridRankingPlanShadow({
    plan,
    callbacksFor: () => ({
      retrieveVector: async (question) => {
        const embedding = await nativeEmbed(question);
        if (!embedding.vector) return [];
        const { data, error } = await db.rpc("match_ancient_chunks_gte", {
          query_embedding: embedding.vector,
          match_threshold: 0.30,
          match_count: 8,
        });
        if (error) throw error;
        return (data || []).map((row: any) => ({
          id: row.chunk_id,
          text_id: row.text_id,
          title: row.text_title,
          excerpt: row.content,
          score: Number(row.score ?? row.similarity ?? 0),
          content_tier: row.content_tier,
          rights_status: row.rights_status,
        }));
      },
      retrieveLexical: async (question) => {
        const { data, error } = await db.rpc("search_oracle_ancient_lexical", {
          query_text: question,
          match_count: 8,
        });
        if (error) throw error;
        return (data || []).map((row: any) => ({
          id: row.chunk_id,
          text_id: row.text_id,
          title: row.text_title,
          excerpt: row.content,
          score: Number(row.score ?? 0),
          content_tier: row.content_tier,
          rights_status: row.rights_status,
        }));
      },
      loadMetadata: async (chunkIds, textIds) => {
        let query = db
          .from("akst_publishable_chunks")
          .select(
            "chunk_id,text_id,tradition_id,estimated_date,source_name,source_url,witness_key,verification_status,unit_path,content_tier,rights_status,is_public",
          );
        if (chunkIds.length) query = query.in("chunk_id", chunkIds);
        if (textIds.length) query = query.in("text_id", textIds);
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
      },
    }),
  });
}
