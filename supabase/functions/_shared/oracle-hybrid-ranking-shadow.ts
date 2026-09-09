import {
  type OracleHybridRankingCandidate,
  type OracleHybridRankingContext,
  type OracleHybridRankingResult,
  rankOracleHybridCandidates,
} from "./oracle-hybrid-ranking.ts";

export const ORACLE_HYBRID_RANKING_SHADOW_VERSION =
  "oracle.hybrid_ranking_shadow.v1" as const;

export type OracleHybridShadowLaneHit = {
  id: string;
  text_id?: string | null;
  title: string;
  excerpt?: string | null;
  score?: number | null;
  source_name?: string | null;
  source_url?: string | null;
  content_tier?: string | null;
  rights_status?: string | null;
};

export type OracleHybridShadowMetadata = {
  chunk_id: string;
  text_id?: string | null;
  tradition_id?: string | null;
  estimated_date?: string | null;
  source_name?: string | null;
  source_url?: string | null;
  witness_key?: string | null;
  verification_status?: string | null;
  unit_path?: string | null;
  chapter_title?: string | null;
  section_title?: string | null;
  content_tier?: string | null;
  rights_status?: string | null;
  is_public?: boolean | null;
};

export type OracleHybridShadowCallbacks = {
  retrieveVector: (question: string) => Promise<OracleHybridShadowLaneHit[]>;
  retrieveLexical: (question: string) => Promise<OracleHybridShadowLaneHit[]>;
  loadMetadata: (
    chunkIds: string[],
    textIds: string[],
  ) => Promise<OracleHybridShadowMetadata[]>;
};

export type OracleHybridShadowLaneStatus = "ready" | "error";
export type OracleHybridShadowMetadataStatus =
  | "ready"
  | "error"
  | "not_requested";

export type OracleHybridRankingShadowResult = {
  version: typeof ORACLE_HYBRID_RANKING_SHADOW_VERSION;
  mode: "shadow";
  applied_to_primary_retrieval: false;
  applied_to_answer: false;
  vector_status: OracleHybridShadowLaneStatus;
  lexical_status: OracleHybridShadowLaneStatus;
  metadata_status: OracleHybridShadowMetadataStatus;
  vector_candidate_count: number;
  lexical_candidate_count: number;
  union_candidate_count: number;
  lane_membership: Record<string, Array<"vector" | "lexical">>;
  ranking: OracleHybridRankingResult;
  warnings: string[];
};

export async function runOracleHybridRankingShadow(
  context: OracleHybridRankingContext,
  callbacks: OracleHybridShadowCallbacks,
): Promise<OracleHybridRankingShadowResult> {
  const [vectorSettled, lexicalSettled] = await Promise.allSettled([
    callbacks.retrieveVector(context.question),
    callbacks.retrieveLexical(context.question),
  ]);

  const vectorStatus: OracleHybridShadowLaneStatus =
    vectorSettled.status === "fulfilled" ? "ready" : "error";
  const lexicalStatus: OracleHybridShadowLaneStatus =
    lexicalSettled.status === "fulfilled" ? "ready" : "error";
  const vectorHits = vectorSettled.status === "fulfilled"
    ? vectorSettled.value
    : [];
  const lexicalHits = lexicalSettled.status === "fulfilled"
    ? lexicalSettled.value
    : [];

  const merged = mergeLanes(vectorHits, lexicalHits);
  const chunkIds = [...merged.keys()];
  const textIds = uniqueStrings(
    [...merged.values()].map((entry) => entry.base.text_id),
  );

  let metadataStatus: OracleHybridShadowMetadataStatus = "not_requested";
  let metadata: OracleHybridShadowMetadata[] = [];
  if (chunkIds.length) {
    try {
      metadata = await callbacks.loadMetadata(chunkIds, textIds);
      metadataStatus = "ready";
    } catch {
      metadataStatus = "error";
    }
  }

  const metadataByChunk = new Map(metadata.map((row) => [row.chunk_id, row]));
  const candidates: OracleHybridRankingCandidate[] = [];
  const laneMembership: Record<string, Array<"vector" | "lexical">> = {};

  for (const [id, entry] of merged.entries()) {
    const row = metadataByChunk.get(id);
    const title = rowTitle(entry.base.title);
    const excerpt = entry.base.excerpt ?? "";
    const lexicalEvidenceText = [
      title,
      excerpt,
      row?.chapter_title,
      row?.section_title,
    ].filter((value): value is string => Boolean(value)).join(" ");

    candidates.push({
      id,
      title,
      excerpt,
      vector_similarity: entry.vectorScore,
      lexical_score: entry.lexicalScore,
      lexical_term_coverage: termCoverage(
        context.question,
        lexicalEvidenceText,
      ),
      tradition_id: row?.tradition_id ?? null,
      estimated_date: row?.estimated_date ?? null,
      source_name: row?.source_name ?? entry.base.source_name ?? null,
      source_url: row?.source_url ?? entry.base.source_url ?? null,
      witness_key: row?.witness_key ?? null,
      verification_status: row?.verification_status ?? null,
      unit_path: row?.unit_path ?? null,
      chapter_title: row?.chapter_title ?? null,
      section_title: row?.section_title ?? null,
      content_tier: row?.content_tier ?? entry.base.content_tier ?? null,
      rights_status: row?.rights_status ?? entry.base.rights_status ?? null,
      is_public: row?.is_public ?? null,
    });
    laneMembership[id] = [...entry.lanes];
  }

  const ranking = rankOracleHybridCandidates(context, candidates);
  const warnings = [
    "hybrid_candidate_collection_is_shadow_only",
    "vector_and_lexical_candidates_are_union_deduplicated",
    "metadata_failure_must_not_change_primary_retrieval",
    "shadow_ranking_must_not_change_primary_order",
  ];
  if (vectorStatus === "error") warnings.push("vector_shadow_lane_error");
  if (lexicalStatus === "error") warnings.push("lexical_shadow_lane_error");
  if (metadataStatus === "error") warnings.push("metadata_shadow_lane_error");

  return {
    version: ORACLE_HYBRID_RANKING_SHADOW_VERSION,
    mode: "shadow",
    applied_to_primary_retrieval: false,
    applied_to_answer: false,
    vector_status: vectorStatus,
    lexical_status: lexicalStatus,
    metadata_status: metadataStatus,
    vector_candidate_count: vectorHits.length,
    lexical_candidate_count: lexicalHits.length,
    union_candidate_count: candidates.length,
    lane_membership: laneMembership,
    ranking,
    warnings,
  };
}

type MergedLaneCandidate = {
  base: OracleHybridShadowLaneHit;
  vectorScore: number | null;
  lexicalScore: number | null;
  lanes: Set<"vector" | "lexical">;
};

function mergeLanes(
  vectorHits: OracleHybridShadowLaneHit[],
  lexicalHits: OracleHybridShadowLaneHit[],
) {
  const merged = new Map<string, MergedLaneCandidate>();

  for (const hit of vectorHits) {
    merged.set(hit.id, {
      base: hit,
      vectorScore: finiteOrNull(hit.score),
      lexicalScore: null,
      lanes: new Set(["vector"]),
    });
  }

  for (const hit of lexicalHits) {
    const existing = merged.get(hit.id);
    if (existing) {
      existing.lexicalScore = finiteOrNull(hit.score);
      existing.lanes.add("lexical");
      existing.base = mergeBase(existing.base, hit);
      continue;
    }
    merged.set(hit.id, {
      base: hit,
      vectorScore: null,
      lexicalScore: finiteOrNull(hit.score),
      lanes: new Set(["lexical"]),
    });
  }

  return merged;
}

function mergeBase(
  vector: OracleHybridShadowLaneHit,
  lexical: OracleHybridShadowLaneHit,
): OracleHybridShadowLaneHit {
  return {
    ...vector,
    text_id: vector.text_id ?? lexical.text_id ?? null,
    title: vector.title || lexical.title,
    excerpt: vector.excerpt || lexical.excerpt || null,
    source_name: vector.source_name ?? lexical.source_name ?? null,
    source_url: vector.source_url ?? lexical.source_url ?? null,
    content_tier: vector.content_tier ?? lexical.content_tier ?? null,
    rights_status: vector.rights_status ?? lexical.rights_status ?? null,
  };
}

function termCoverage(question: string, evidence: string) {
  const queryTerms = significantTerms(question);
  if (!queryTerms.length) return 0;
  const evidenceTerms = new Set(tokenize(evidence));
  const matched = queryTerms.filter((term) => evidenceTerms.has(term));
  return matched.length / queryTerms.length;
}

const STOP_WORDS = new Set([
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
  "why",
  "how",
  "does",
  "did",
  "are",
  "was",
  "were",
  "about",
  "into",
  "your",
  "their",
  "our",
]);

function significantTerms(value: string) {
  return uniqueStrings(
    tokenize(value).filter((term) => term.length > 2 && !STOP_WORDS.has(term)),
  );
}

function tokenize(value: string) {
  return value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

function finiteOrNull(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rowTitle(value: string) {
  return value.trim() || "Ancient source";
}
