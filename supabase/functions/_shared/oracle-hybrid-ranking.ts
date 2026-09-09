import type { OracleQueryIntent } from "./oracle-query-plan.ts";

export const ORACLE_HYBRID_RANKING_VERSION =
  "oracle.hybrid_ranking.v1" as const;

const ELIGIBLE_RIGHTS = new Set(["public_domain", "rights_cleared"]);

export type OracleHybridRankingCandidate = {
  id: string;
  title: string;
  excerpt?: string | null;
  vector_similarity?: number | null;
  lexical_score?: number | null;
  lexical_term_coverage?: number | null;
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

export type OracleHybridRankingContext = {
  question: string;
  intent: OracleQueryIntent;
  requested_tradition_ids?: string[];
};

export type OracleHybridRankingSignals = {
  publication_eligible: boolean;
  tradition_filter_rank: 0 | 1 | 2;
  direct_title_match: boolean;
  lexical_term_coverage: number;
  lexical_score: number;
  intent_metadata_rank: number;
  vector_similarity: number;
  exact_location_rank: 0 | 1 | 2;
  source_metadata_completeness: number;
};

export type OracleHybridRankedCandidate = {
  candidate: OracleHybridRankingCandidate;
  rank: number;
  signals: OracleHybridRankingSignals;
  reason_codes: string[];
};

export type OracleHybridRankingResult = {
  version: typeof ORACLE_HYBRID_RANKING_VERSION;
  mode: "advisory";
  applied_to_primary_retrieval: false;
  applied_to_answer: false;
  ranked: OracleHybridRankedCandidate[];
  warnings: string[];
};

export function rankOracleHybridCandidates(
  context: OracleHybridRankingContext,
  candidates: OracleHybridRankingCandidate[],
): OracleHybridRankingResult {
  const evaluated = candidates.map((candidate) =>
    evaluateCandidate(context, candidate)
  );

  evaluated.sort((left, right) => compareRanked(context, left, right));

  return {
    version: ORACLE_HYBRID_RANKING_VERSION,
    mode: "advisory",
    applied_to_primary_retrieval: false,
    applied_to_answer: false,
    ranked: evaluated.map((item, index) => ({
      ...item,
      rank: index + 1,
    })),
    warnings: [
      "hybrid_ranking_is_advisory_only",
      "publication_eligibility_is_a_hard_precedence_rule",
      "title_match_is_literal_not_entity_resolution",
      "weights_are_not_assumed_without_calibration",
      "do_not_apply_ranking_to_primary_retrieval_yet",
    ],
  };
}

function evaluateCandidate(
  context: OracleHybridRankingContext,
  candidate: OracleHybridRankingCandidate,
): Omit<OracleHybridRankedCandidate, "rank"> {
  const publicationEligible = isPublicationEligible(candidate);
  const traditionFilterRank = traditionRank(context, candidate);
  const directTitleMatch = hasDirectTitleMatch(
    context.question,
    candidate.title,
  );
  const lexicalTermCoverage = clamp01(candidate.lexical_term_coverage);
  const lexicalScore = nonNegative(candidate.lexical_score);
  const intentMetadataRank = metadataRankForIntent(context.intent, candidate);
  const vectorSimilarity = finiteOr(candidate.vector_similarity, -1);
  const exactLocationRank = locationRank(candidate);
  const sourceMetadataCompleteness = sourceCompleteness(candidate);

  const signals: OracleHybridRankingSignals = {
    publication_eligible: publicationEligible,
    tradition_filter_rank: traditionFilterRank,
    direct_title_match: directTitleMatch,
    lexical_term_coverage: lexicalTermCoverage,
    lexical_score: lexicalScore,
    intent_metadata_rank: intentMetadataRank,
    vector_similarity: vectorSimilarity,
    exact_location_rank: exactLocationRank,
    source_metadata_completeness: sourceMetadataCompleteness,
  };

  return {
    candidate,
    signals,
    reason_codes: reasonCodes(signals, context.intent),
  };
}

function compareRanked(
  context: OracleHybridRankingContext,
  left: Omit<OracleHybridRankedCandidate, "rank">,
  right: Omit<OracleHybridRankedCandidate, "rank">,
) {
  const a = left.signals;
  const b = right.signals;

  return compareNumber(
    Number(b.publication_eligible),
    Number(a.publication_eligible),
  ) ||
    compareNumber(b.tradition_filter_rank, a.tradition_filter_rank) ||
    compareNumber(Number(b.direct_title_match), Number(a.direct_title_match)) ||
    compareNumber(b.lexical_term_coverage, a.lexical_term_coverage) ||
    compareNumber(b.lexical_score, a.lexical_score) ||
    compareIntentMetadata(context.intent, a, b) ||
    compareNumber(b.vector_similarity, a.vector_similarity) ||
    compareNumber(b.exact_location_rank, a.exact_location_rank) ||
    compareNumber(
      b.source_metadata_completeness,
      a.source_metadata_completeness,
    ) ||
    left.candidate.title.localeCompare(right.candidate.title) ||
    left.candidate.id.localeCompare(right.candidate.id);
}

function compareIntentMetadata(
  intent: OracleQueryIntent,
  left: OracleHybridRankingSignals,
  right: OracleHybridRankingSignals,
) {
  if (intent !== "chronology" && intent !== "provenance_manuscript") return 0;
  return compareNumber(right.intent_metadata_rank, left.intent_metadata_rank);
}

function isPublicationEligible(candidate: OracleHybridRankingCandidate) {
  return candidate.content_tier === "A" &&
    ELIGIBLE_RIGHTS.has(candidate.rights_status ?? "") &&
    candidate.is_public !== false;
}

function traditionRank(
  context: OracleHybridRankingContext,
  candidate: OracleHybridRankingCandidate,
): 0 | 1 | 2 {
  const requested = context.requested_tradition_ids?.filter(Boolean) ?? [];
  if (!requested.length) return 1;
  return candidate.tradition_id && requested.includes(candidate.tradition_id)
    ? 2
    : 0;
}

function hasDirectTitleMatch(question: string, title: string) {
  const normalizedQuestion = normalizeText(question);
  const normalizedTitle = normalizeText(title);
  return normalizedTitle.length >= 4 &&
    normalizedQuestion.includes(normalizedTitle);
}

function metadataRankForIntent(
  intent: OracleQueryIntent,
  candidate: OracleHybridRankingCandidate,
) {
  if (intent === "chronology") {
    return chronologyMetadataRank(candidate.estimated_date);
  }
  if (intent === "provenance_manuscript") {
    return sourceCompleteness(candidate) + locationRank(candidate);
  }
  return 0;
}

function chronologyMetadataRank(value?: string | null) {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) return 0;
  const compositionPart = normalized.split(";")[0].trim();
  if (
    /^(ancient|unknown|uncertain|undated)$/.test(compositionPart) ||
    !hasSpecificDate(compositionPart)
  ) {
    return 1;
  }
  return 2;
}

function hasSpecificDate(value: string) {
  return /\b(?:c\.?\s*)?\d{1,4}\s*(?:bce|bc|ce|ad)\b|\b\d{1,2}(?:st|nd|rd|th)?\s+centur(?:y|ies)\b/i
    .test(value);
}

function locationRank(candidate: OracleHybridRankingCandidate): 0 | 1 | 2 {
  if (candidate.unit_path?.trim()) return 2;
  if (candidate.chapter_title?.trim() || candidate.section_title?.trim()) {
    return 1;
  }
  return 0;
}

function sourceCompleteness(candidate: OracleHybridRankingCandidate) {
  return [
    candidate.source_url,
    candidate.witness_key,
    candidate.verification_status,
  ].filter((value) => typeof value === "string" && value.trim().length > 0)
    .length;
}

function reasonCodes(
  signals: OracleHybridRankingSignals,
  intent: OracleQueryIntent,
) {
  const reasons: string[] = [];
  reasons.push(
    signals.publication_eligible
      ? "publication_eligible"
      : "publication_ineligible",
  );
  if (signals.tradition_filter_rank === 2) {
    reasons.push("tradition_filter_match");
  }
  if (signals.tradition_filter_rank === 0) {
    reasons.push("tradition_filter_mismatch");
  }
  if (signals.direct_title_match) reasons.push("direct_title_match");
  if (signals.lexical_term_coverage > 0) {
    reasons.push("lexical_term_corroboration");
  }
  if (signals.lexical_score > 0) reasons.push("lexical_match_score_present");
  if (signals.vector_similarity >= 0) reasons.push("vector_similarity_present");
  if (signals.exact_location_rank > 0) {
    reasons.push("exact_location_metadata_present");
  }
  if (signals.source_metadata_completeness > 0) {
    reasons.push("source_witness_metadata_present");
  }
  if (intent === "chronology" && signals.intent_metadata_rank > 0) {
    reasons.push(
      signals.intent_metadata_rank === 2
        ? "specific_chronology_metadata_present"
        : "chronology_metadata_present_but_vague",
    );
  }
  if (intent === "provenance_manuscript" && signals.intent_metadata_rank > 0) {
    reasons.push("provenance_metadata_present");
  }
  return reasons;
}

function normalizeText(value: string) {
  return value.toLowerCase().match(/[a-z0-9]+/g)?.join(" ") ?? "";
}

function clamp01(value?: number | null) {
  const finite = finiteOr(value, 0);
  return Math.min(1, Math.max(0, finite));
}

function nonNegative(value?: number | null) {
  return Math.max(0, finiteOr(value, 0));
}

function finiteOr(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function compareNumber(left: number, right: number) {
  return left < right ? -1 : left > right ? 1 : 0;
}
