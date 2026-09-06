import { assertEquals, assert } from "jsr:@std/assert@1";
import { buildOracleV1, ORACLE_CONTRACT_VERSION } from "./oracle-contract.ts";

Deno.test("oracle.v1 normalizes a three-well grounded response", () => {
  const result = buildOracleV1({
    question: "What does this pattern mean?",
    normalizedQuery: "what does this pattern mean",
    surface: "internal",
    answer: "Grounded synthesis.",
    answerMode: "generated_grounded",
    generationProvider: "lovable",
    legacyEvidenceState: "three_well",
    grimoire: { status: "grounded", hits: [{ id: "g1", title: "Rose", excerpt: "A correspondence", score: 3 }] },
    ancient: { status: "grounded", retrieval_mode: "native_vector", vector_status: "ready", hits: [{ id: "a1", text_id: "t1", title: "Ancient Text", excerpt: "Ancient passage", content_tier: "A", rights_status: "public_domain", score: 0.81 }] },
    sacredWritings: { status: "grounded", retrieval_mode: "native_vector", vector_status: "ready", hits: [{ id: "s1", page_id: "p1", title: "Sacred Writing", excerpt: "Living voice", tier: "A", standpoint: "andre_standpoint", score: 0.77 }] },
    citations: [
      { label: "G1", well: "grimoire", title: "Rose" },
      { label: "A1", well: "akst_ancient", title: "Ancient Text" },
      { label: "S1", well: "sacred_writings", title: "Sacred Writing" },
    ],
    lawsApplied: ["No fabrication"],
    legacyRetrieval: { asking_point: "oracle-query", embedding_model: "gte-small", embedding_dimensions: 384, embedding_count: 1 },
  });

  assertEquals(result.contract_version, ORACLE_CONTRACT_VERSION);
  assertEquals(result.state, "grounded");
  assertEquals(result.evidence_units.length, 3);
  assertEquals(result.retrieval.wells_returned, ["grimoire", "akst_ancient", "sacred_writings"]);
  assertEquals(result.retrieval.embedding_model, "gte-small");
  assertEquals(result.diagnostics?.asking_point, "oracle-query");
});

Deno.test("oracle.v1 preserves partial evidence without overstating grounding", () => {
  const result = buildOracleV1({
    question: "Question",
    surface: "internal",
    answer: "Partial answer",
    answerMode: "evidence_only",
    legacyEvidenceState: "partial",
    grimoire: { status: "empty", hits: [] },
    ancient: { status: "grounded", retrieval_mode: "lexical", hits: [{ id: "a1", title: "Text", excerpt: "Passage" }] },
    sacredWritings: { status: "empty", hits: [] },
    citations: [{ label: "A1", well: "akst_ancient", title: "Text" }],
    lawsApplied: ["No fabrication"],
  });

  assertEquals(result.state, "partial");
  assertEquals(result.evidence_units.length, 1);
  assertEquals(result.retrieval.wells_returned, ["akst_ancient"]);
});

Deno.test("oracle.v1 marks well errors as degraded when evidence still exists", () => {
  const result = buildOracleV1({
    question: "Question",
    surface: "internal",
    answer: "Degraded answer",
    answerMode: "evidence_only",
    legacyEvidenceState: "partial",
    grimoire: { status: "error", hits: [] },
    ancient: { status: "grounded", retrieval_mode: "lexical", vector_status: "vector_error", hits: [{ id: "a1", title: "Text", excerpt: "Passage" }] },
    sacredWritings: { status: "empty", hits: [] },
    citations: [{ label: "A1", well: "akst_ancient", title: "Text" }],
    lawsApplied: ["No fabrication"],
  });

  assertEquals(result.state, "degraded");
  assert(result.retrieval.degraded_reasons.includes("well_error:grimoire"));
  assert(result.retrieval.degraded_reasons.includes("vector_error:akst_ancient"));
});

Deno.test("oracle.v1 keeps empty evidence insufficient even when a well reports an error", () => {
  const result = buildOracleV1({
    question: "Question",
    surface: "internal",
    answer: "Gap stated.",
    answerMode: "evidence_only",
    legacyEvidenceState: "insufficient",
    grimoire: { status: "error", hits: [] },
    ancient: { status: "empty", hits: [] },
    sacredWritings: { status: "empty", hits: [] },
    citations: [],
    lawsApplied: ["No fabrication"],
  });

  assertEquals(result.state, "insufficient");
  assertEquals(result.evidence_units, []);
});

Deno.test("luminaria surface publishes explicit client restrictions", () => {
  const result = buildOracleV1({
    question: "Question",
    surface: "luminaria_client",
    answer: "Reflection",
    answerMode: "evidence_only",
    legacyEvidenceState: "partial",
    grimoire: { status: "grounded", hits: [{ id: "g1", title: "Rose", excerpt: "Correspondence" }] },
    ancient: { status: "empty", hits: [] },
    sacredWritings: { status: "empty", hits: [] },
    citations: [{ label: "G1", well: "grimoire", title: "Rose" }],
    lawsApplied: ["Non-Imposition"],
  });

  assert(result.policy.surface_restrictions.includes("exclude_sacred_writings_tier_b"));
  assert(result.policy.surface_restrictions.includes("no_diagnosis_or_treatment"));
});

Deno.test("oracle.v1 preserves legacy retrieval metadata during additive migration", () => {
  const result = buildOracleV1({
    question: "Question",
    surface: "internal",
    answer: "Answer",
    answerMode: "evidence_only",
    legacyEvidenceState: "partial",
    grimoire: { status: "grounded", hits: [{ id: "g1", title: "Rose", excerpt: "Correspondence" }] },
    ancient: { status: "empty", hits: [] },
    sacredWritings: { status: "empty", hits: [] },
    citations: [{ label: "G1", well: "grimoire", title: "Rose" }],
    lawsApplied: ["No fabrication"],
    legacyRetrieval: {
      asking_point: "oracle-query",
      embedding_status: "ready",
      well_1: "legacy-well-description",
      runtime_authority: "AKST Supabase",
    },
  });

  assertEquals(result.retrieval.embedding_status, "ready");
  assertEquals(result.retrieval.well_1, "legacy-well-description");
  assertEquals(result.retrieval.runtime_authority, "AKST Supabase");
  assertEquals(result.diagnostics?.asking_point, "oracle-query");
});
