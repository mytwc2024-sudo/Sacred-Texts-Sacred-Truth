import { assert, assertEquals } from "jsr:@std/assert@1";
import { planOracleQuery } from "./oracle-query-plan.ts";
import {
  ORACLE_SHADOW_MAX_SUBQUERIES,
  type OracleShadowRuntimeCallbacks,
  runAkstLearningQueryPlanShadow,
} from "./oracle-query-plan-shadow-runtime.ts";

function callbacks(log: string[] = []): OracleShadowRuntimeCallbacks {
  return {
    async retrieveAncient(question) {
      log.push(`retrieve:${question}`);
      return {
        retrieval_mode: "native_vector",
        vector_status: "ready",
        hits: [{
          id: "chunk-1",
          text_id: "text-1",
          title: "Prayer of Manasses",
          excerpt: "Thou hast appointed repentance for me a sinner.",
          score: 0.89,
          content_tier: "A",
          rights_status: "public_domain",
        }],
      };
    },
    async loadSourceMetadata(textIds) {
      log.push(`metadata:${textIds.join(",")}`);
      return [{
        id: "text-1",
        title: "Prayer of Manasses",
        estimated_date: "Ancient; English translation published 1851",
        original_language: "Greek",
        translator: "Sir Lancelot C. L. Brenton",
        source_url: "https://example.test/source.zip",
        source_file_name: "55-MAN.usfm",
        source_format: "USFM",
        witness_key: "prayer-of-manasses:brenton-1851",
        verification_status: "accepted",
        content_tier: "A",
        rights_status: "public_domain",
        is_public: true,
      }];
    },
  };
}

Deno.test("shadow runtime separately evaluates compound AKST-learning subqueries", async () => {
  const plan = planOracleQuery(
    "What does Prayer of Manasses say about repentance, and when was it composed?",
    "akst_learning",
  );
  const result = await runAkstLearningQueryPlanShadow(plan, callbacks());

  assertEquals(result.status, "complete");
  assertEquals(result.total_subqueries, 2);
  assertEquals(result.evaluated_subqueries, 2);
  assertEquals(result.subqueries[0].intent, "textual_claim");
  assertEquals(result.subqueries[0].satisfaction, "met");
  assertEquals(result.subqueries[1].intent, "chronology");
  assertEquals(result.subqueries[1].satisfaction, "partial");
  assertEquals(result.applied_to_primary_retrieval, false);
  assertEquals(result.applied_to_answer, false);
});

Deno.test("shadow runtime retrieves each planned subquery independently", async () => {
  const log: string[] = [];
  const plan = planOracleQuery(
    "What does Prayer of Manasses say about repentance, and when was it composed?",
    "akst_learning",
  );

  await runAkstLearningQueryPlanShadow(plan, callbacks(log));

  assert(
    log.includes("retrieve:What does Prayer of Manasses say about repentance,"),
  );
  assert(log.includes("retrieve:when was it composed"));
});

Deno.test("shadow runtime is bounded and exposes unevaluated plan items", async () => {
  const plan = planOracleQuery(
    "What does text one say?; What does text two say?; What does text three say?; What does text four say?; What does text five say?",
    "akst_learning",
  );
  const result = await runAkstLearningQueryPlanShadow(
    plan,
    callbacks(),
    ORACLE_SHADOW_MAX_SUBQUERIES,
  );

  assertEquals(result.status, "partial");
  assertEquals(result.total_subqueries, 5);
  assertEquals(result.evaluated_subqueries, ORACLE_SHADOW_MAX_SUBQUERIES);
  assert(
    result.warnings.includes(
      `shadow_subquery_limit:${ORACLE_SHADOW_MAX_SUBQUERIES}`,
    ),
  );
  assertEquals(result.subqueries[4].satisfaction, "not_assessed");
});

Deno.test("shadow runtime does not execute multi-well surfaces in v1", async () => {
  const log: string[] = [];
  const plan = planOracleQuery(
    "Compare these teachings across traditions",
    "internal",
  );
  const result = await runAkstLearningQueryPlanShadow(plan, callbacks(log));

  assertEquals(result.status, "not_evaluated");
  assertEquals(log, []);
  assert(
    result.warnings.includes("shadow_runtime_v1_is_akst_learning_only"),
  );
});

Deno.test("shadow runtime de-duplicates text ids before metadata loading", async () => {
  const loaded: string[][] = [];
  const cb = callbacks();
  cb.retrieveAncient = async () => ({
    retrieval_mode: "native_vector",
    vector_status: "ready",
    hits: [
      { text_id: "text-1", title: "Text", score: 0.9 },
      { text_id: "text-1", title: "Text", score: 0.88 },
      { text_id: "text-2", title: "Other", score: 0.86 },
    ],
  });
  cb.loadSourceMetadata = async (ids) => {
    loaded.push(ids);
    return [];
  };

  const plan = planOracleQuery("What does the passage say?", "akst_learning");
  await runAkstLearningQueryPlanShadow(plan, cb);

  assertEquals(loaded, [["text-1", "text-2"]]);
});

Deno.test("shadow runtime skips metadata fetch when retrieval has no text ids", async () => {
  let metadataCalls = 0;
  const cb = callbacks();
  cb.retrieveAncient = async () => ({
    retrieval_mode: "lexical",
    vector_status: "unavailable",
    hits: [],
  });
  cb.loadSourceMetadata = async () => {
    metadataCalls += 1;
    return [];
  };

  const plan = planOracleQuery("What does the passage say?", "akst_learning");
  const result = await runAkstLearningQueryPlanShadow(plan, cb);

  assertEquals(metadataCalls, 0);
  assertEquals(result.subqueries[0].satisfaction, "unmet");
});
