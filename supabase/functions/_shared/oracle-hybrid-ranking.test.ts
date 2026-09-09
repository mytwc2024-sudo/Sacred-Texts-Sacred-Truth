import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  rankOracleHybridCandidates,
  type OracleHybridRankingCandidate,
  type OracleHybridRankingContext,
} from "./oracle-hybrid-ranking.ts";

function candidate(
  id: string,
  overrides: Partial<OracleHybridRankingCandidate> = {},
): OracleHybridRankingCandidate {
  return {
    id,
    title: `Source ${id}`,
    excerpt: "governed ancient evidence",
    vector_similarity: 0.85,
    lexical_score: 0,
    lexical_term_coverage: 0,
    content_tier: "A",
    rights_status: "public_domain",
    is_public: true,
    ...overrides,
  };
}

function context(
  overrides: Partial<OracleHybridRankingContext> = {},
): OracleHybridRankingContext {
  return {
    question: "What does this source say?",
    intent: "textual_claim",
    ...overrides,
  };
}

Deno.test("publication eligibility outranks even a much higher vector similarity", () => {
  const result = rankOracleHybridCandidates(context(), [
    candidate("blocked", {
      vector_similarity: 0.99,
      rights_status: "unknown",
    }),
    candidate("eligible", { vector_similarity: 0.72 }),
  ]);

  assertEquals(result.ranked[0].candidate.id, "eligible");
  assertEquals(result.ranked[0].signals.publication_eligible, true);
  assertEquals(result.ranked[1].signals.publication_eligible, false);
});

Deno.test("direct source-title intent outranks a higher semantic-only candidate", () => {
  const result = rankOracleHybridCandidates(
    context({ question: "What does Prayer of Manasses say about repentance?" }),
    [
      candidate("semantic", {
        title: "Psalter",
        vector_similarity: 0.94,
      }),
      candidate("title", {
        title: "Prayer of Manasses",
        vector_similarity: 0.84,
      }),
    ],
  );

  assertEquals(result.ranked[0].candidate.id, "title");
  assert(result.ranked[0].reason_codes.includes("direct_title_match"));
});

Deno.test("lexical corroboration outranks a higher semantic-only candidate", () => {
  const result = rankOracleHybridCandidates(context(), [
    candidate("semantic", { vector_similarity: 0.93 }),
    candidate("corroborated", {
      vector_similarity: 0.84,
      lexical_score: 3,
      lexical_term_coverage: 0.75,
    }),
  ]);

  assertEquals(result.ranked[0].candidate.id, "corroborated");
  assertEquals(result.ranked[0].signals.lexical_term_coverage, 0.75);
});

Deno.test("vector similarity breaks ties only after stronger corroboration signals", () => {
  const result = rankOracleHybridCandidates(context(), [
    candidate("lower", {
      vector_similarity: 0.84,
      lexical_score: 2,
      lexical_term_coverage: 0.5,
    }),
    candidate("higher", {
      vector_similarity: 0.90,
      lexical_score: 2,
      lexical_term_coverage: 0.5,
    }),
  ]);

  assertEquals(result.ranked[0].candidate.id, "higher");
});

Deno.test("explicit tradition filtering outranks a mismatch", () => {
  const result = rankOracleHybridCandidates(
    context({ requested_tradition_ids: ["tradition-a"] }),
    [
      candidate("mismatch", {
        tradition_id: "tradition-b",
        vector_similarity: 0.95,
      }),
      candidate("match", {
        tradition_id: "tradition-a",
        vector_similarity: 0.80,
      }),
    ],
  );

  assertEquals(result.ranked[0].candidate.id, "match");
  assert(result.ranked[0].reason_codes.includes("tradition_filter_match"));
});

Deno.test("chronology intent prefers specific composition metadata before vector score", () => {
  const result = rankOracleHybridCandidates(
    context({ intent: "chronology", question: "When was this composed?" }),
    [
      candidate("vague", {
        estimated_date: "ancient; translated 1851 CE",
        vector_similarity: 0.94,
      }),
      candidate("specific", {
        estimated_date: "2nd century BCE",
        vector_similarity: 0.82,
      }),
    ],
  );

  assertEquals(result.ranked[0].candidate.id, "specific");
  assert(
    result.ranked[0].reason_codes.includes(
      "specific_chronology_metadata_present",
    ),
  );
});

Deno.test("chronology metadata does not silently dominate an ordinary textual query", () => {
  const result = rankOracleHybridCandidates(context(), [
    candidate("higher-vector", {
      estimated_date: "ancient",
      vector_similarity: 0.91,
    }),
    candidate("dated", {
      estimated_date: "2nd century BCE",
      vector_similarity: 0.86,
    }),
  ]);

  assertEquals(result.ranked[0].candidate.id, "higher-vector");
});

Deno.test("provenance intent prefers stronger source/witness and location metadata", () => {
  const result = rankOracleHybridCandidates(
    context({ intent: "provenance_manuscript", question: "What is its provenance?" }),
    [
      candidate("thin", { vector_similarity: 0.94 }),
      candidate("documented", {
        vector_similarity: 0.82,
        source_url: "https://example.org/source",
        witness_key: "witness-1",
        verification_status: "verified",
        unit_path: "chapter-1/section-2",
      }),
    ],
  );

  assertEquals(result.ranked[0].candidate.id, "documented");
  assert(result.ranked[0].reason_codes.includes("provenance_metadata_present"));
  assert(
    result.ranked[0].reason_codes.includes("exact_location_metadata_present"),
  );
});

Deno.test("exact location and source metadata remain visible as ranking reasons", () => {
  const result = rankOracleHybridCandidates(context(), [
    candidate("located", {
      unit_path: "psalm/50/verse/3",
      source_url: "https://example.org/text",
      witness_key: "w1",
      verification_status: "verified",
    }),
  ]);

  const ranked = result.ranked[0];
  assertEquals(ranked.signals.exact_location_rank, 2);
  assertEquals(ranked.signals.source_metadata_completeness, 3);
  assert(ranked.reason_codes.includes("exact_location_metadata_present"));
  assert(ranked.reason_codes.includes("source_witness_metadata_present"));
});

Deno.test("hybrid ranking remains advisory and cannot control retrieval or answers", () => {
  const result = rankOracleHybridCandidates(context(), [candidate("one")]);

  assertEquals(result.version, "oracle.hybrid_ranking.v1");
  assertEquals(result.mode, "advisory");
  assertEquals(result.applied_to_primary_retrieval, false);
  assertEquals(result.applied_to_answer, false);
  assert(result.warnings.includes("weights_are_not_assumed_without_calibration"));
});
