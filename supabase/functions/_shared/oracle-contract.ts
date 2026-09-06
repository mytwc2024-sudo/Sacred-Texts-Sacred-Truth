export const ORACLE_CONTRACT_VERSION = "oracle.v1" as const;

export type OracleSurface =
  | "internal"
  | "ankhor_internal"
  | "akst_learning"
  | "luminaria_client";

export type OracleState = "grounded" | "partial" | "insufficient" | "degraded";
export type OracleAnswerMode = "generated_grounded" | "evidence_only";
export type OracleWell = "grimoire" | "akst_ancient" | "sacred_writings";

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

export type OracleRetrieval = {
  methods: string[];
  wells_queried: OracleWell[];
  wells_returned: OracleWell[];
  degraded_reasons: string[];
  embedding_model?: string | null;
  embedding_dimensions?: number | null;
  embedding_count?: number | null;
  // Compatibility/detail fields may be retained during migration.
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
};

export function buildOracleV1(input: OracleV1BuildInput): OracleResponseV1 {
  const degradedReasons = collectDegradedReasons(input);
  const evidenceUnits = [
    ...normalizeGrimoire(input.grimoire),
    ...normalizeAncient(input.ancient),
    ...normalizeSacred(input.sacredWritings),
  ];

  const state = deriveState(input.legacyEvidenceState, degradedReasons, evidenceUnits.length);
  const wellsReturned = uniqueWells(evidenceUnits.map((unit) => unit.well));
  const methods = uniqueStrings([
    methodFor(input.grimoire, "lexical"),
    methodFor(input.ancient, "lexical"),
    methodFor(input.sacredWritings, "lexical"),
  ]);

  return {
    contract_version: ORACLE_CONTRACT_VERSION,
    query: {
      original: input.question,
      normalized: input.normalizedQuery ?? null,
      surface: input.surface,
    },
    state,
    answer: input.answer,
    answer_mode: input.answerMode,
    evidence_units: evidenceUnits,
    citations: input.citations,
    retrieval: {
      ...(input.legacyRetrieval ?? {}),
      methods,
      wells_queried: ["grimoire", "akst_ancient", "sacred_writings"],
      wells_returned: wellsReturned,
      degraded_reasons: degradedReasons,
      embedding_model: asString(input.legacyRetrieval?.embedding_model),
      embedding_dimensions: asNumber(input.legacyRetrieval?.embedding_dimensions),
      embedding_count: asNumber(input.legacyRetrieval?.embedding_count),
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
): OracleState {
  if (legacy === "insufficient" || evidenceCount === 0) return "insufficient";
  if (degradedReasons.some((reason) => reason.startsWith("well_error:"))) return "degraded";
  if (legacy === "partial") return "partial";
  return "grounded";
}

function collectDegradedReasons(input: OracleV1BuildInput) {
  const reasons: string[] = [];
  const wells: Array<[OracleWell, OracleLegacyWellResult]> = [
    ["grimoire", input.grimoire],
    ["akst_ancient", input.ancient],
    ["sacred_writings", input.sacredWritings],
  ];
  for (const [well, result] of wells) {
    if (result.status === "error") reasons.push(`well_error:${well}`);
    if (result.vector_status === "vector_error") reasons.push(`vector_error:${well}`);
    if (result.vector_status === "unavailable") reasons.push(`vector_unavailable:${well}`);
  }
  return uniqueStrings(reasons);
}

function normalizeGrimoire(result: OracleLegacyWellResult): OracleEvidenceUnit[] {
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

function normalizeAncient(result: OracleLegacyWellResult): OracleEvidenceUnit[] {
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
