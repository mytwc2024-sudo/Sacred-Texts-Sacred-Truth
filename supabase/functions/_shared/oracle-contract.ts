import {
  planOracleQuery,
  type OracleQueryPlan,
} from "./oracle-query-plan.ts";

export const ORACLE_CONTRACT_VERSION = "oracle.v1" as const;

export type OracleSurface =
  | "internal"
  | "ankhor_internal"
  | "akst_learning"
  | "luminaria_client";

export type OracleState = "grounded" | "partial" | "insufficient" | "degraded";
export type OracleAnswerMode = "generated_grounded" | "evidence_only";
export type OracleWell = "grimoire" | "akst_ancient" | "sacred_writings";

const ALL_WELLS: OracleWell[] = ["grimoire", "akst_ancient", "sacred_writings"];

export type OracleCitation = {
  label: string;
  well: OracleWell;
  title: string;
  url?: string | null;
  section_heading?: string | null;
  tier?: string | null;
  standpoint?: string | null;
};

export type OracleEvidenceUnit = {
  id: string;
  citation_label: string;
  well: OracleWell;
  source_id?: string | null;
  parent_source_id?: string | null;
  title: string;
  excerpt: string;
  source_name?: string | null;
  source_url?: string | null;
  author?: string | null;
  translator?: string | null;
  rights_status?: string | null;
  content_tier?: string | null;
  standpoint?: string | null;
  section_heading?: string | null;
  figure?: string | null;
  era?: string | null;
  element?: string | null;
  phase?: string | null;
  score?: number | null;
  retrieval_method?: string | null;
};

export type OracleEvidenceRelationshipLevel =
  | "supported"
  | "related"
  | "insufficient"
  | "not_assessed";

export type OracleEvidenceRelationship = {
  level: OracleEvidenceRelationshipLevel;
  scope: "akst_learning" | "multi_well_unassessed";
  reasons: string[];
  top_semantic_score: number | null;
  max_term_coverage: number | null;
  source_title_match: string | null;
  direct_phrase_match: string | null;
  query_terms: string[];
  matched_terms: string[];
};

export type OracleRetrieval = {
  methods: string[];
  wells_queried: OracleWell[];
  wells_returned: OracleWell[];
  degraded_reasons: string[];
  embedding_model?: string | null;
  embedding_dimensions?: number | null;
  embedding_count?: number | null;
  evidence_relationship?: OracleEvidenceRelationship;
  [key: string]: unknown;
};

export type OraclePolicy = {
  laws_applied: string[];
  surface_restrictions: string[];
};

export type OracleDiagnostics = {
  trace_id?: string | null;
  generation_provider?: string | null;
  asking_point?: string | null;
};

export type OracleResponseV1 = {
  contract_version: typeof ORACLE_CONTRACT_VERSION;
  query: {
    original: string;
    normalized?: string | null;
    surface: OracleSurface;
  };
  query_plan: OracleQueryPlan;
  state: OracleState;
  answer: string;
  answer_mode: OracleAnswerMode;
  evidence_units: OracleEvidenceUnit[];
  citations: OracleCitation[];
  retrieval: OracleRetrieval;
  policy: OraclePolicy;
  diagnostics?: OracleDiagnostics;
};

export type OracleLegacyWellResult = {
  status?: string;
  retrieval_mode?: string;
  vector_status?: string;
  hits?: Array<Record<string, unknown>>;
};

export type OracleV1BuildInput = {
  question: string;
  normalizedQuery?: string | null;
  surface: OracleSurface;
  answer: string;
  answerMode: OracleAnswerMode;
  generationProvider?: string | null;
  legacyEvidenceState: "three_well" | "partial" | "insufficient";
  grimoire: OracleLegacyWellResult;
  ancient: OracleLegacyWellResult;
  sacredWritings: OracleLegacyWellResult;
  citations: OracleCitation[];
  lawsApplied: string[];
  legacyRetrieval?: Record<string, unknown>;
  traceId?: string | null;
  wellsQueried?: OracleWell[];
};

export function buildOracleV1(input: OracleV1BuildInput): OracleResponseV1 {
  const wellsQueried = input.wellsQueried?.length
    ? uniqueWells(input.wellsQueried)
    : [...ALL_WELLS];
  const degradedReasons = collectDegradedReasons(input, wellsQueried);
  const evidenceUnits = [
    ...normalizeGrimoire(input.grimoire),
    ...normalizeAncient(input.ancient),
    ...normalizeSacred(input.sacredWritings),
  ];
  const wellsReturned = uniqueWells(evidenceUnits.map((unit) => unit.well));
  const state = deriveState(
    input.legacyEvidenceState,
    degradedReasons,
    evidenceUnits.length,
    wellsQueried,
    wellsReturned,
  );
  const methods = uniqueStrings(
    wellsQueried.map((well) =>
      methodFor(resultForWell(input, well), "lexical")
    ),
  );
  const evidenceRelationship = assessEvidenceRelationship(
    input.surface,
    input.question,
    evidenceUnits,
  );
  const queryPlan = planOracleQuery(input.question, input.surface);

  return {
    contract_version: ORACLE_CONTRACT_VERSION,
    query: {
      original: input.question,
      normalized: input.normalizedQuery ?? null,
      surface: input.surface,
    },
    query_plan: queryPlan,
    state,
    answer: input.answer,
    answer_mode: input.answerMode,
    evidence_units: evidenceUnits,
    citations: input.citations,
    retrieval: {
      ...(input.legacyRetrieval ?? {}),
      methods,
      wells_queried: wellsQueried,
      wells_returned: wellsReturned,
      degraded_reasons: degradedReasons,
      embedding_model: asString(input.legacyRetrieval?.embedding_model),
      embedding_dimensions: asNumber(
        input.legacyRetrieval?.embedding_dimensions,
      ),
      embedding_count: asNumber(input.legacyRetrieval?.embedding_count),
      evidence_relationship: evidenceRelationship,
    },
    policy: {
      laws_applied: input.lawsApplied,
      surface_restrictions: restrictionsFor(input.surface),
    },
    diagnostics: {
      trace_id: input.traceId ?? null,
      generation_provider: input.generationProvider ?? null,
      asking_point: asString(input.legacyRetrieval?.asking_point),
    },
  };
}

function deriveState(
  legacy: OracleV1BuildInput["legacyEvidenceState"],
  degradedReasons: string[],
  evidenceCount: number,
  wellsQueried: OracleWell[],
  wellsReturned: OracleWell[],
): OracleState {
  if (legacy === "insufficient" || evidenceCount === 0) return "insufficient";
  if (degradedReasons.some((reason) => reason.startsWith("well_error:"))) {
    return "degraded";
  }
  if (wellsQueried.every((well) => wellsReturned.includes(well))) {
    return "grounded";
  }
  return "partial";
}

function collectDegradedReasons(
  input: OracleV1BuildInput,
  wellsQueried: OracleWell[],
) {
  const reasons: string[] = [];
  for (const well of wellsQueried) {
    const result = resultForWell(input, well);
    if (result.status === "error") reasons.push(`well_error:${well}`);
    if (result.vector_status === "vector_error") {
      reasons.push(`vector_error:${well}`);
    }
    if (result.vector_status === "unavailable") {
      reasons.push(`vector_unavailable:${well}`);
    }
  }
  return uniqueStrings(reasons);
}

function resultForWell(
  input: OracleV1BuildInput,
  well: OracleWell,
): OracleLegacyWellResult {
  if (well === "grimoire") return input.grimoire;
  if (well === "akst_ancient") return input.ancient;
  return input.sacredWritings;
}

function normalizeGrimoire(
  result: OracleLegacyWellResult,
): OracleEvidenceUnit[] {
  return (result.hits ?? []).map((hit, index) => ({
    id: `grimoire:${asString(hit.id) ?? index}`,
    citation_label: `G${index + 1}`,
    well: "grimoire",
    source_id: asString(hit.id),
    title: asString(hit.title) ?? "Grimoire correspondence",
    excerpt: asString(hit.excerpt) ?? "",
    source_url: asString(hit.url),
    score: asNumber(hit.score),
    retrieval_method: methodFor(result, "lexical"),
  }));
}

function normalizeAncient(
  result: OracleLegacyWellResult,
): OracleEvidenceUnit[] {
  return (result.hits ?? []).map((hit, index) => ({
    id: `ancient:${asString(hit.id) ?? index}`,
    citation_label: `A${index + 1}`,
    well: "akst_ancient",
    source_id: asString(hit.id),
    parent_source_id: asString(hit.text_id),
    title: asString(hit.title) ?? "Ancient source",
    excerpt: asString(hit.excerpt) ?? "",
    source_name: asString(hit.source_name),
    source_url: asString(hit.source_url),
    author: asString(hit.author),
    translator: asString(hit.translator),
    rights_status: asString(hit.rights_status),
    content_tier: asString(hit.content_tier),
    score: asNumber(hit.score) ?? asNumber(hit.similarity),
    retrieval_method: methodFor(result, "lexical"),
  }));
}

function normalizeSacred(result: OracleLegacyWellResult): OracleEvidenceUnit[] {
  return (result.hits ?? []).map((hit, index) => ({
    id: `sacred:${asString(hit.id) ?? index}`,
    citation_label: `S${index + 1}`,
    well: "sacred_writings",
    source_id: asString(hit.id),
    parent_source_id: asString(hit.page_id),
    title: asString(hit.title) ?? "Sacred Writings",
    excerpt: asString(hit.excerpt) ?? "",
    source_url: asString(hit.url),
    content_tier: asString(hit.tier),
    standpoint: asString(hit.standpoint),
    section_heading: asString(hit.section_heading),
    figure: asString(hit.figure),
    era: asString(hit.era),
    element: asString(hit.element),
    phase: asString(hit.phase),
    score: asNumber(hit.score) ?? asNumber(hit.similarity),
    retrieval_method: methodFor(result, "lexical"),
  }));
}

const SUPPORT_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "what",
  "when",
  "where",
  "which",
  "who",
  "whom",
  "whose",
  "why",
  "how",
  "does",
  "did",
  "are",
  "was",
  "were",
  "been",
  "being",
  "into",
  "onto",
  "your",
  "their",
  "ours",
  "our",
  "his",
  "her",
  "its",
  "you",
  "they",
  "them",
  "those",
  "these",
  "someone",
  "person",
  "about",
  "after",
  "before",
  "toward",
  "towards",
  "through",
  "under",
  "over",
]);

const AKST_OFF_DOMAIN_SEMANTIC_FLOOR = 0.83;
const AKST_STRONG_SEMANTIC_SCORE = 0.86;
const AKST_STRONG_TERM_COVERAGE = 0.8;

export function assessEvidenceRelationship(
  surface: OracleSurface,
  question: string,
  evidenceUnits: OracleEvidenceUnit[],
): OracleEvidenceRelationship {
  if (surface !== "akst_learning") {
    return {
      level: "not_assessed",
      scope: "multi_well_unassessed",
      reasons: ["multi_well_relationship_not_yet_calibrated"],
      top_semantic_score: null,
      max_term_coverage: null,
      source_title_match: null,
      direct_phrase_match: null,
      query_terms: [],
      matched_terms: [],
    };
  }

  const ancientUnits = evidenceUnits.filter((unit) =>
    unit.well === "akst_ancient"
  );
  const queryTerms = significantTerms(question);
  if (!ancientUnits.length) {
    return {
      level: "insufficient",
      scope: "akst_learning",
      reasons: ["no_ancient_evidence"],
      top_semantic_score: null,
      max_term_coverage: 0,
      source_title_match: null,
      direct_phrase_match: null,
      query_terms: queryTerms,
      matched_terms: [],
    };
  }

  const normalizedQuestion = normalizeText(question);
  let sourceTitleMatch: string | null = null;
  let directPhraseMatch: string | null = null;
  let maxTermCoverage = 0;
  let matchedTerms: string[] = [];

  for (const unit of ancientUnits) {
    const evidenceText = [
      unit.title,
      unit.excerpt,
      unit.author,
      unit.source_name,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" ");
    const evidenceTokens = new Set(tokenize(evidenceText));
    const currentMatched = queryTerms.filter((term) =>
      evidenceTokens.has(term)
    );
    const coverage = queryTerms.length
      ? currentMatched.length / queryTerms.length
      : 0;
    if (coverage > maxTermCoverage) {
      maxTermCoverage = coverage;
      matchedTerms = currentMatched;
    }

    const normalizedTitle = normalizeText(unit.title);
    if (
      !sourceTitleMatch &&
      normalizedTitle.length >= 5 &&
      normalizedTitle !== "ancient source" &&
      normalizedQuestion.includes(normalizedTitle)
    ) {
      sourceTitleMatch = unit.title;
    }

    const phrase = findDirectPhrase(question, evidenceText);
    if (
      phrase &&
      (!directPhraseMatch ||
        tokenize(phrase).length > tokenize(directPhraseMatch).length)
    ) {
      directPhraseMatch = phrase;
    }
  }

  const semanticScores = ancientUnits
    .filter((unit) => unit.retrieval_method?.includes("vector"))
    .map((unit) => unit.score)
    .filter((score): score is number =>
      typeof score === "number" && Number.isFinite(score)
    );
  const topSemanticScore = semanticScores.length
    ? Math.max(...semanticScores)
    : null;

  const strongSemanticAndCoverage = topSemanticScore !== null &&
    topSemanticScore >= AKST_STRONG_SEMANTIC_SCORE &&
    maxTermCoverage >= AKST_STRONG_TERM_COVERAGE &&
    queryTerms.length >= 2;

  if (sourceTitleMatch || directPhraseMatch || strongSemanticAndCoverage) {
    const reasons: string[] = [];
    if (sourceTitleMatch) reasons.push("direct_source_title_match");
    if (directPhraseMatch) reasons.push("direct_passage_phrase_match");
    if (strongSemanticAndCoverage) {
      reasons.push("high_semantic_and_term_coverage");
    }
    return {
      level: "supported",
      scope: "akst_learning",
      reasons,
      top_semantic_score: topSemanticScore,
      max_term_coverage: maxTermCoverage,
      source_title_match: sourceTitleMatch,
      direct_phrase_match: directPhraseMatch,
      query_terms: queryTerms,
      matched_terms: matchedTerms,
    };
  }

  const clearlyOffDomain = topSemanticScore !== null &&
    topSemanticScore < AKST_OFF_DOMAIN_SEMANTIC_FLOOR &&
    maxTermCoverage < 0.5;
  if (clearlyOffDomain) {
    return {
      level: "insufficient",
      scope: "akst_learning",
      reasons: [
        "semantic_score_below_calibrated_floor",
        "weak_term_corroboration",
      ],
      top_semantic_score: topSemanticScore,
      max_term_coverage: maxTermCoverage,
      source_title_match: null,
      direct_phrase_match: null,
      query_terms: queryTerms,
      matched_terms: matchedTerms,
    };
  }

  return {
    level: "related",
    scope: "akst_learning",
    reasons: ["semantic_similarity_without_direct_corroboration"],
    top_semantic_score: topSemanticScore,
    max_term_coverage: maxTermCoverage,
    source_title_match: null,
    direct_phrase_match: null,
    query_terms: queryTerms,
    matched_terms: matchedTerms,
  };
}

function significantTerms(text: string) {
  return uniqueStrings(
    tokenize(text).filter((term) =>
      term.length > 2 && !SUPPORT_STOP_WORDS.has(term)
    ),
  );
}

function tokenize(text: string) {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function normalizeText(text: string) {
  return tokenize(text).join(" ");
}

function findDirectPhrase(query: string, evidence: string) {
  const queryTokens = tokenize(query);
  const evidenceText = ` ${normalizeText(evidence)} `;
  const maxWindow = Math.min(6, queryTokens.length);
  for (let size = maxWindow; size >= 3; size--) {
    for (let index = 0; index <= queryTokens.length - size; index++) {
      const window = queryTokens.slice(index, index + size);
      const significantCount = window.filter((term) =>
        term.length > 2 && !SUPPORT_STOP_WORDS.has(term)
      ).length;
      if (significantCount < 2) {
        continue;
      }
      const phrase = window.join(" ");
      if (evidenceText.includes(` ${phrase} `)) {
        return phrase;
      }
    }
  }
  return null;
}

function restrictionsFor(surface: OracleSurface) {
  if (surface === "luminaria_client") {
    return [
      "reflective_spiritual_educational_only",
      "no_diagnosis_or_treatment",
      "no_legal_advice",
      "no_fate_prediction",
      "no_hazardous_or_ingestion_instructions",
      "no_practitioner_private_material",
      "exclude_sacred_writings_tier_b",
    ];
  }
  if (surface === "akst_learning") {
    return [
      "rights_cleared_ancient_texts_only",
      "learning_context_may_refine_retrieval_not_source_rights",
    ];
  }
  return [];
}

function methodFor(result: OracleLegacyWellResult, fallback: string) {
  return result.retrieval_mode || fallback;
}

function uniqueWells(values: OracleWell[]) {
  return [...new Set(values)];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
