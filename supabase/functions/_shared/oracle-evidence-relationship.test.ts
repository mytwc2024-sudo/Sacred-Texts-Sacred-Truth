import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  assessEvidenceRelationship,
  buildOracleV1,
  type OracleEvidenceUnit,
} from "./oracle-contract.ts";

function ancientUnit(args: {
  title: string;
  excerpt: string;
  score?: number;
  retrievalMethod?: string;
}): OracleEvidenceUnit {
  return {
    id: `ancient:${args.title}`,
    citation_label: "A1",
    well: "akst_ancient",
    title: args.title,
    excerpt: args.excerpt,
    content_tier: "A",
    rights_status: "public_domain",
    score: args.score ?? null,
    retrieval_method: args.retrievalMethod ?? "native_vector",
  };
}

Deno.test("explicit source-title intent is supported", () => {
  const result = assessEvidenceRelationship(
    "akst_learning",
    "What does Prayer of Manasses say about repentance?",
    [
      ancientUnit({
        title: "Prayer of Manasses",
        excerpt: "Thou hast appointed repentance for me a sinner.",
        score: 0.88,
      }),
    ],
  );

  assertEquals(result.level, "supported");
  assertEquals(result.source_title_match, "Prayer of Manasses");
  assert(result.reasons.includes("direct_source_title_match"));
});

Deno.test("direct passage phrase is supported", () => {
  const result = assessEvidenceRelationship(
    "akst_learning",
    "release me Lord release me",
    [
      ancientUnit({
        title: "Prayer of Manasses",
        excerpt:
          "I pray and beseech thee, release me, Lord, release me, and destroy me not with my transgressions.",
        score: 0.87,
      }),
    ],
  );

  assertEquals(result.level, "supported");
  assertEquals(result.direct_phrase_match, "release me lord release me");
});

Deno.test("high semantic score plus strong term coverage is supported", () => {
  const result = assessEvidenceRelationship(
    "akst_learning",
    "mercy compassion sinner repentance",
    [
      ancientUnit({
        title: "Prayer of Manasses",
        excerpt:
          "The passage joins mercy, compassion, repentance, and the confession of a sinner.",
        score: 0.91,
      }),
    ],
  );

  assertEquals(result.level, "supported");
  assert(result.reasons.includes("high_semantic_and_term_coverage"));
  assertEquals(result.max_term_coverage, 1);
});

Deno.test("in-domain event intent remains related when only thematic evidence exists", () => {
  const result = assessEvidenceRelationship(
    "akst_learning",
    "Moses receives the ten commandments",
    [
      ancientUnit({
        title: "Psalter",
        excerpt:
          "He made known his ways to Moses, his will to the children of Israel.",
        score: 0.889,
      }),
    ],
  );

  assertEquals(result.level, "related");
  assertEquals(result.source_title_match, null);
  assertEquals(result.direct_phrase_match, null);
});

Deno.test("thematically adjacent teaching is related rather than overclaimed", () => {
  const result = assessEvidenceRelationship(
    "akst_learning",
    "love your enemies and pray for those who persecute you",
    [
      ancientUnit({
        title: "Psalter",
        excerpt:
          "Let the enemy persecute my soul, and take it; and let him trample my life on the ground.",
        score: 0.895,
      }),
    ],
  );

  assertEquals(result.level, "related");
});

Deno.test("low semantic score with weak corroboration is insufficient", () => {
  const result = assessEvidenceRelationship(
    "akst_learning",
    "how do I bake sourdough bread",
    [
      ancientUnit({
        title: "Psalter",
        excerpt: "He gave them the corn of heaven; man ate angels' bread.",
        score: 0.796,
      }),
    ],
  );

  assertEquals(result.level, "insufficient");
  assert(result.reasons.includes("semantic_score_below_calibrated_floor"));
});

Deno.test("no ancient evidence is insufficient", () => {
  const result = assessEvidenceRelationship(
    "akst_learning",
    "a question with no evidence",
    [],
  );

  assertEquals(result.level, "insufficient");
  assertEquals(result.reasons, ["no_ancient_evidence"]);
});

Deno.test("multi-well surfaces are explicitly not assessed in Stage 2.2", () => {
  const result = assessEvidenceRelationship(
    "internal",
    "What does this pattern mean?",
    [
      ancientUnit({
        title: "Psalter",
        excerpt: "A passage",
        score: 0.9,
      }),
    ],
  );

  assertEquals(result.level, "not_assessed");
  assertEquals(result.scope, "multi_well_unassessed");
});

Deno.test("evidence relationship is advisory and does not rewrite legacy state", () => {
  const result = buildOracleV1({
    question: "how do I bake sourdough bread",
    surface: "akst_learning",
    answer: "Evidence-only response",
    answerMode: "evidence_only",
    legacyEvidenceState: "partial",
    grimoire: { status: "skipped", retrieval_mode: "not_queried", hits: [] },
    ancient: {
      status: "grounded",
      retrieval_mode: "native_vector",
      vector_status: "ready",
      hits: [{
        id: "a1",
        title: "Psalter",
        excerpt: "He gave them the corn of heaven; man ate angels' bread.",
        content_tier: "A",
        rights_status: "public_domain",
        score: 0.796,
      }],
    },
    sacredWritings: {
      status: "skipped",
      retrieval_mode: "not_queried",
      hits: [],
    },
    citations: [{ label: "A1", well: "akst_ancient", title: "Psalter" }],
    lawsApplied: ["No fabrication"],
    wellsQueried: ["akst_ancient"],
  });

  assertEquals(result.state, "grounded");
  assertEquals(result.retrieval.evidence_relationship?.level, "insufficient");
});
