import { assert, assertEquals } from "jsr:@std/assert@1";
import type { OracleQueryPlan } from "./oracle-query-plan.ts";
import {
  runOracleHybridRankingPlanShadow,
  type OracleHybridPlanShadowCallbacks,
} from "./oracle-hybrid-ranking-plan-shadow.ts";

function plan(
  subqueries: OracleQueryPlan["subqueries"],
  surface: OracleQueryPlan["surface"] = "akst_learning",
): OracleQueryPlan {
  return {
    version: "oracle.query_plan.v1",
    mode: "advisory",
    execution_status: "not_applied_to_retrieval",
    surface,
    original_question: "compound question",
    complexity: subqueries.length > 1 ? "compound" : "simple",
    decomposition_method: "deterministic_v1",
    subqueries,
    warnings: [],
  };
}

function subquery(
  id: string,
  intent: OracleQueryPlan["subqueries"][number]["intent"],
): OracleQueryPlan["subqueries"][number] {
  return {
    id,
    question: `Question ${id}`,
    intent,
    requested_wells: ["akst_ancient"],
    evidence_requirements: [],
    evidence_class_rule: "test",
  };
}

function callbacks(
  seen: Array<{ id: string; intent: string }> = [],
): OracleHybridPlanShadowCallbacks {
  return (item) => {
    seen.push({ id: item.id, intent: item.intent });
    return {
      retrieveVector: () => Promise.resolve([{
        id: `${item.id}-chunk`,
        text_id: `${item.id}-text`,
        title: `Source ${item.id}`,
        excerpt: "source evidence",
        score: 0.86,
        content_tier: "A",
        rights_status: "public_domain",
      }]),
      retrieveLexical: () => Promise.resolve([]),
      loadMetadata: () => Promise.resolve([{
        chunk_id: `${item.id}-chunk`,
        text_id: `${item.id}-text`,
        content_tier: "A",
        rights_status: "public_domain",
        is_public: true,
      }]),
    };
  };
}

Deno.test("compound textual and chronology subqueries are ranked separately", async () => {
  const sourcePlan = plan([
    subquery("q1", "textual_claim"),
    subquery("q2", "chronology"),
  ]);
  const result = await runOracleHybridRankingPlanShadow(
    sourcePlan,
    callbacks(),
  );

  assertEquals(result.status, "complete");
  assertEquals(result.evaluated_subqueries, 2);
  assertEquals(result.subqueries.map((item) => item.intent), [
    "textual_claim",
    "chronology",
  ]);
});

Deno.test("each subquery keeps its own intent when callbacks are constructed", async () => {
  const seen: Array<{ id: string; intent: string }> = [];
  await runOracleHybridRankingPlanShadow(
    plan([
      subquery("q1", "textual_claim"),
      subquery("q2", "provenance_manuscript"),
    ]),
    callbacks(seen),
  );

  assertEquals(seen, [
    { id: "q1", intent: "textual_claim" },
    { id: "q2", intent: "provenance_manuscript" },
  ]);
});

Deno.test("plan shadow is bounded and exposes unevaluated subqueries", async () => {
  const result = await runOracleHybridRankingPlanShadow(
    plan([
      subquery("q1", "textual_claim"),
      subquery("q2", "chronology"),
      subquery("q3", "provenance_manuscript"),
    ]),
    callbacks(),
    2,
  );

  assertEquals(result.status, "partial");
  assertEquals(result.evaluated_subqueries, 2);
  assertEquals(result.total_subqueries, 3);
  assertEquals(result.subqueries[2].status, "not_evaluated");
  assert(
    result.warnings.includes("hybrid_plan_shadow_subquery_limit:2"),
  );
});

Deno.test("non-AKST surfaces are not executed in hybrid plan shadow v1", async () => {
  const seen: Array<{ id: string; intent: string }> = [];
  const result = await runOracleHybridRankingPlanShadow(
    plan([subquery("q1", "textual_claim")], "internal"),
    callbacks(seen),
  );

  assertEquals(result.status, "not_evaluated");
  assertEquals(result.evaluated_subqueries, 0);
  assertEquals(seen.length, 0);
  assert(
    result.warnings.includes("hybrid_plan_shadow_v1_is_akst_learning_only"),
  );
});

Deno.test("one subquery callback failure degrades only that subquery", async () => {
  const result = await runOracleHybridRankingPlanShadow(
    plan([
      subquery("q1", "textual_claim"),
      subquery("q2", "chronology"),
    ]),
    (item) => {
      if (item.id === "q2") throw new Error("callback construction failed");
      return callbacks()(item);
    },
  );

  assertEquals(result.status, "partial");
  assertEquals(result.evaluated_subqueries, 1);
  assertEquals(result.subqueries[0].status, "evaluated");
  assertEquals(result.subqueries[1].status, "not_evaluated");
  assert(result.warnings.includes("hybrid_plan_shadow_subquery_error"));
});

Deno.test("lane failure remains visible inside a successfully evaluated subquery", async () => {
  const result = await runOracleHybridRankingPlanShadow(
    plan([subquery("q1", "textual_claim")]),
    () => ({
      retrieveVector: () => Promise.reject(new Error("vector lane failed")),
      retrieveLexical: () => Promise.resolve([{
        id: "lexical",
        text_id: "text-lexical",
        title: "Lexical source",
        excerpt: "source evidence",
        score: 3,
        content_tier: "A",
        rights_status: "public_domain",
      }]),
      loadMetadata: () => Promise.resolve([]),
    }),
  );

  assertEquals(result.status, "complete");
  assertEquals(result.subqueries[0].status, "evaluated");
  assertEquals(
    result.subqueries[0].ranking_shadow?.vector_status,
    "error",
  );
  assertEquals(
    result.subqueries[0].ranking_shadow?.lexical_status,
    "ready",
  );
});

Deno.test("plan shadow can never control primary retrieval or answers", async () => {
  const result = await runOracleHybridRankingPlanShadow(
    plan([subquery("q1", "textual_claim")]),
    callbacks(),
  );

  assertEquals(result.version, "oracle.hybrid_ranking_plan_shadow.v1");
  assertEquals(result.mode, "shadow");
  assertEquals(result.applied_to_primary_retrieval, false);
  assertEquals(result.applied_to_answer, false);
  assertEquals(
    result.subqueries[0].ranking_shadow?.applied_to_primary_retrieval,
    false,
  );
  assertEquals(
    result.subqueries[0].ranking_shadow?.applied_to_answer,
    false,
  );
});
