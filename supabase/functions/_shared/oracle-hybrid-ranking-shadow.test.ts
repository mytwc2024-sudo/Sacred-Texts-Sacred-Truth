import { assert, assertEquals } from "jsr:@std/assert@1";
import type { OracleHybridRankingContext } from "./oracle-hybrid-ranking.ts";
import {
  runOracleHybridRankingShadow,
  type OracleHybridShadowCallbacks,
  type OracleHybridShadowLaneHit,
  type OracleHybridShadowMetadata,
} from "./oracle-hybrid-ranking-shadow.ts";

const BASE_CONTEXT: OracleHybridRankingContext = {
  question: "What does Prayer of Manasses say about repentance?",
  intent: "textual_claim",
};

function hit(
  id: string,
  score: number,
  overrides: Partial<OracleHybridShadowLaneHit> = {},
): OracleHybridShadowLaneHit {
  return {
    id,
    text_id: `text-${id}`,
    title: id === "prayer" ? "Prayer of Manasses" : `Source ${id}`,
    excerpt: "repentance mercy and forgiveness",
    score,
    content_tier: "A",
    rights_status: "public_domain",
    ...overrides,
  };
}

function metadata(
  id: string,
  overrides: Partial<OracleHybridShadowMetadata> = {},
): OracleHybridShadowMetadata {
  return {
    chunk_id: id,
    text_id: `text-${id}`,
    content_tier: "A",
    rights_status: "public_domain",
    is_public: true,
    ...overrides,
  };
}

function callbacks(
  vector: OracleHybridShadowLaneHit[],
  lexical: OracleHybridShadowLaneHit[],
  meta: OracleHybridShadowMetadata[] = [],
): OracleHybridShadowCallbacks {
  return {
    retrieveVector: () => Promise.resolve(vector),
    retrieveLexical: () => Promise.resolve(lexical),
    loadMetadata: () => Promise.resolve(meta),
  };
}

Deno.test("shadow collection union-deduplicates a chunk returned by both lanes", async () => {
  const result = await runOracleHybridRankingShadow(
    BASE_CONTEXT,
    callbacks([hit("prayer", 0.86)], [hit("prayer", 4)]),
  );

  assertEquals(result.vector_candidate_count, 1);
  assertEquals(result.lexical_candidate_count, 1);
  assertEquals(result.union_candidate_count, 1);
  assertEquals(result.lane_membership.prayer, ["vector", "lexical"]);
  assertEquals(result.ranking.ranked[0].candidate.vector_similarity, 0.86);
  assertEquals(result.ranking.ranked[0].candidate.lexical_score, 4);
});

Deno.test("vector-only and lexical-only candidates are both preserved", async () => {
  const result = await runOracleHybridRankingShadow(
    BASE_CONTEXT,
    callbacks([hit("vector", 0.91)], [hit("lexical", 3)]),
  );

  assertEquals(result.union_candidate_count, 2);
  assertEquals(result.lane_membership.vector, ["vector"]);
  assertEquals(result.lane_membership.lexical, ["lexical"]);
});

Deno.test("shadow collection derives lexical term coverage from evidence text", async () => {
  const result = await runOracleHybridRankingShadow(
    {
      question: "repentance mercy forgiveness",
      intent: "textual_claim",
    },
    callbacks([hit("prayer", 0.86)], []),
  );

  assertEquals(
    result.ranking.ranked[0].signals.lexical_term_coverage,
    1,
  );
});

Deno.test("governed metadata is merged before chronology ranking", async () => {
  const result = await runOracleHybridRankingShadow(
    {
      question: "When was this composed?",
      intent: "chronology",
    },
    callbacks(
      [hit("vague", 0.95), hit("dated", 0.82)],
      [],
      [
        metadata("vague", { estimated_date: "ancient" }),
        metadata("dated", { estimated_date: "2nd century BCE" }),
      ],
    ),
  );

  assertEquals(result.metadata_status, "ready");
  assertEquals(result.ranking.ranked[0].candidate.id, "dated");
});

Deno.test("metadata exposes exact location and witness signals to the ranker", async () => {
  const result = await runOracleHybridRankingShadow(
    {
      question: "What is the provenance of this passage?",
      intent: "provenance_manuscript",
    },
    callbacks(
      [hit("documented", 0.82)],
      [],
      [
        metadata("documented", {
          source_url: "https://example.org/source",
          witness_key: "witness-1",
          verification_status: "verified",
          unit_path: "chapter-1/section-2",
        }),
      ],
    ),
  );

  const ranked = result.ranking.ranked[0];
  assertEquals(ranked.signals.exact_location_rank, 2);
  assertEquals(ranked.signals.source_metadata_completeness, 3);
});

Deno.test("vector shadow failure preserves lexical candidates and reports the lane error", async () => {
  const result = await runOracleHybridRankingShadow(BASE_CONTEXT, {
    retrieveVector: () => Promise.reject(new Error("vector unavailable")),
    retrieveLexical: () => Promise.resolve([hit("prayer", 4)]),
    loadMetadata: () => Promise.resolve([]),
  });

  assertEquals(result.vector_status, "error");
  assertEquals(result.lexical_status, "ready");
  assertEquals(result.union_candidate_count, 1);
  assert(result.warnings.includes("vector_shadow_lane_error"));
});

Deno.test("lexical shadow failure preserves vector candidates and reports the lane error", async () => {
  const result = await runOracleHybridRankingShadow(BASE_CONTEXT, {
    retrieveVector: () => Promise.resolve([hit("prayer", 0.86)]),
    retrieveLexical: () => Promise.reject(new Error("lexical unavailable")),
    loadMetadata: () => Promise.resolve([]),
  });

  assertEquals(result.vector_status, "ready");
  assertEquals(result.lexical_status, "error");
  assertEquals(result.union_candidate_count, 1);
  assert(result.warnings.includes("lexical_shadow_lane_error"));
});

Deno.test("metadata failure degrades only shadow metadata and does not discard candidates", async () => {
  const result = await runOracleHybridRankingShadow(BASE_CONTEXT, {
    retrieveVector: () => Promise.resolve([hit("prayer", 0.86)]),
    retrieveLexical: () => Promise.resolve([hit("prayer", 4)]),
    loadMetadata: () => Promise.reject(new Error("metadata unavailable")),
  });

  assertEquals(result.metadata_status, "error");
  assertEquals(result.union_candidate_count, 1);
  assert(result.warnings.includes("metadata_shadow_lane_error"));
});

Deno.test("publication eligibility remains a hard ranking boundary after lane union", async () => {
  const result = await runOracleHybridRankingShadow(
    BASE_CONTEXT,
    callbacks(
      [
        hit("blocked", 0.99, { rights_status: "unknown" }),
        hit("eligible", 0.78),
      ],
      [],
    ),
  );

  assertEquals(result.ranking.ranked[0].candidate.id, "eligible");
  assertEquals(result.ranking.ranked[1].candidate.id, "blocked");
});

Deno.test("shadow candidate collection and ranking can never control retrieval or answers", async () => {
  const result = await runOracleHybridRankingShadow(
    BASE_CONTEXT,
    callbacks([hit("prayer", 0.86)], [hit("prayer", 4)]),
  );

  assertEquals(result.version, "oracle.hybrid_ranking_shadow.v1");
  assertEquals(result.mode, "shadow");
  assertEquals(result.applied_to_primary_retrieval, false);
  assertEquals(result.applied_to_answer, false);
  assertEquals(result.ranking.applied_to_primary_retrieval, false);
  assertEquals(result.ranking.applied_to_answer, false);
});
