import { assertEquals } from "jsr:@std/assert@1";
import { buildOracleV1 } from "./oracle-contract.ts";

Deno.test("oracle.v1 exposes the advisory query plan without applying it to retrieval", () => {
  const response = buildOracleV1({
    question:
      "What does Prayer of Manasses say about mercy and repentance, and when was the text composed?",
    surface: "akst_learning",
    answer: "Evidence-only response",
    answerMode: "evidence_only",
    generationProvider: "none",
    legacyEvidenceState: "partial",
    grimoire: {
      status: "skipped",
      retrieval_mode: "not_queried",
      hits: [],
    },
    ancient: {
      status: "grounded",
      retrieval_mode: "native_vector",
      vector_status: "ready",
      hits: [{
        id: "a1",
        text_id: "t1",
        title: "Prayer of Manasses",
        excerpt: "Thou hast appointed repentance for me a sinner.",
        content_tier: "A",
        rights_status: "public_domain",
        score: 0.88,
      }],
    },
    sacredWritings: {
      status: "skipped",
      retrieval_mode: "not_queried",
      hits: [],
    },
    citations: [{
      label: "A1",
      well: "akst_ancient",
      title: "Prayer of Manasses",
    }],
    lawsApplied: ["No fabrication"],
    wellsQueried: ["akst_ancient"],
  });

  assertEquals(response.contract_version, "oracle.v1");
  assertEquals(response.query_plan.version, "oracle.query_plan.v1");
  assertEquals(response.query_plan.mode, "advisory");
  assertEquals(
    response.query_plan.execution_status,
    "not_applied_to_retrieval",
  );
  assertEquals(response.query_plan.complexity, "compound");
  assertEquals(
    response.query_plan.subqueries.map((subquery) => subquery.intent),
    ["textual_claim", "chronology"],
  );
  for (const subquery of response.query_plan.subqueries) {
    assertEquals(subquery.requested_wells, ["akst_ancient"]);
  }

  assertEquals(response.retrieval.wells_queried, ["akst_ancient"]);
  assertEquals(response.retrieval.wells_returned, ["akst_ancient"]);
  assertEquals(response.state, "grounded");
});
