import type {
  OraclePlannedSubquery,
  OracleQueryPlan,
} from "./oracle-query-plan.ts";

export const ORACLE_QUERY_PLAN_SHADOW_VERSION =
  "oracle.query_plan_shadow.v1" as const;

export type OracleShadowSatisfaction =
  | "met"
  | "partial"
  | "unmet"
  | "not_assessed";

export type OracleShadowRelationship =
  | "supported"
  | "related"
  | "insufficient"
  | "not_assessed";

export type OracleShadowHit = {
  text_id?: string | null;
  title: string;
  score?: number | null;
  content_tier?: string | null;
  rights_status?: string | null;
};

export type OracleShadowSourceMetadata = {
  id: string;
  title: string;
  tradition_id?: string | null;
  estimated_date?: string | null;
  original_language?: string | null;
  translator?: string | null;
  source_name?: string | null;
  source_url?: string | null;
  source_file_name?: string | null;
  source_format?: string | null;
  source_acquired_at?: string | null;
  work_key?: string | null;
  witness_key?: string | null;
  verification_status?: string | null;
  rights_status?: string | null;
  content_tier?: string | null;
  is_public?: boolean | null;
};

export type OracleShadowSubqueryEvidence = {
  subquery_id: string;
  retrieval_mode?: string | null;
  vector_status?: string | null;
  relationship_level?: OracleShadowRelationship;
  relationship_reasons?: string[];
  hits: OracleShadowHit[];
  source_metadata: OracleShadowSourceMetadata[];
  metadata_status?: "ready" | "error" | "not_requested";
};

export type OracleShadowSubqueryEvaluation = {
  subquery_id: string;
  intent: OraclePlannedSubquery["intent"];
  question: string;
  requested_wells: OraclePlannedSubquery["requested_wells"];
  satisfaction: OracleShadowSatisfaction;
  reasons: string[];
  evidence_count: number;
  top_score: number | null;
  source_titles: string[];
  relationship_level: OracleShadowRelationship;
  retrieval_mode: string | null;
  vector_status: string | null;
  metadata_fields_present: string[];
};

export type OracleQueryPlanShadowEvaluation = {
  version: typeof ORACLE_QUERY_PLAN_SHADOW_VERSION;
  mode: "shadow";
  status: "complete" | "partial" | "not_evaluated";
  plan_version: OracleQueryPlan["version"];
  plan_execution_status: OracleQueryPlan["execution_status"];
  surface: OracleQueryPlan["surface"];
  applied_to_primary_retrieval: false;
  applied_to_answer: false;
  evaluated_subqueries: number;
  total_subqueries: number;
  subqueries: OracleShadowSubqueryEvaluation[];
  warnings: string[];
};

export function evaluateOracleQueryPlanShadow(
  plan: OracleQueryPlan,
  evidence: OracleShadowSubqueryEvidence[],
): OracleQueryPlanShadowEvaluation {
  const byId = new Map(evidence.map((item) => [item.subquery_id, item]));
  const subqueries = plan.subqueries.map((subquery) =>
    evaluateSubquery(subquery, byId.get(subquery.id))
  );
  const evaluated = subqueries.filter((item) =>
    item.satisfaction !== "not_assessed"
  ).length;

  return {
    version: ORACLE_QUERY_PLAN_SHADOW_VERSION,
    mode: "shadow",
    status: evaluated === 0
      ? "not_evaluated"
      : evaluated === plan.subqueries.length
      ? "complete"
      : "partial",
    plan_version: plan.version,
    plan_execution_status: plan.execution_status,
    surface: plan.surface,
    applied_to_primary_retrieval: false,
    applied_to_answer: false,
    evaluated_subqueries: evaluated,
    total_subqueries: plan.subqueries.length,
    subqueries,
    warnings: [
      "shadow_results_are_diagnostic_only",
      "do_not_use_shadow_results_for_answer_recombination_yet",
      ...plan.warnings,
    ],
  };
}

function evaluateSubquery(
  subquery: OraclePlannedSubquery,
  evidence?: OracleShadowSubqueryEvidence,
): OracleShadowSubqueryEvaluation {
  if (!evidence) {
    return baseEvaluation(subquery, {
      satisfaction: "not_assessed",
      reasons: ["shadow_evidence_not_supplied"],
    });
  }

  if (subquery.intent === "textual_claim") {
    return textualEvaluation(subquery, evidence);
  }
  if (subquery.intent === "chronology") {
    return chronologyEvaluation(subquery, evidence);
  }
  if (subquery.intent === "provenance_manuscript") {
    return provenanceEvaluation(subquery, evidence);
  }
  if (subquery.intent === "identity_alias") {
    return withEvidence(subquery, evidence, {
      satisfaction: "unmet",
      reasons: ["governed_identity_attestation_not_available_in_shadow_v1"],
    });
  }
  if (subquery.intent === "cross_tradition_comparison") {
    return comparisonEvaluation(subquery, evidence);
  }
  return interpretiveEvaluation(subquery, evidence);
}

function textualEvaluation(
  subquery: OraclePlannedSubquery,
  evidence: OracleShadowSubqueryEvidence,
) {
  const relationship = evidence.relationship_level ?? "not_assessed";
  if (relationship === "supported") {
    return withEvidence(subquery, evidence, {
      satisfaction: "met",
      reasons: ["textual_relationship_supported"],
    });
  }
  if (relationship === "related") {
    return withEvidence(subquery, evidence, {
      satisfaction: "partial",
      reasons: ["textual_relationship_related_not_supported"],
    });
  }
  if (relationship === "insufficient") {
    return withEvidence(subquery, evidence, {
      satisfaction: "unmet",
      reasons: ["textual_relationship_insufficient"],
    });
  }
  return withEvidence(subquery, evidence, {
    satisfaction: evidence.hits.length ? "partial" : "unmet",
    reasons: [
      evidence.hits.length
        ? "candidate_passages_present_relationship_unassessed"
        : "no_candidate_passages",
    ],
  });
}

function chronologyEvaluation(
  subquery: OraclePlannedSubquery,
  evidence: OracleShadowSubqueryEvidence,
) {
  const dates = evidence.source_metadata
    .map((source) => source.estimated_date?.trim())
    .filter((value): value is string => Boolean(value));
  if (!dates.length) {
    return withEvidence(subquery, evidence, {
      satisfaction: "unmet",
      reasons: ["composition_date_metadata_absent"],
    });
  }

  if (dates.some(hasSpecificCompositionDate)) {
    return withEvidence(subquery, evidence, {
      satisfaction: "met",
      reasons: ["specific_composition_date_metadata_present"],
    });
  }

  return withEvidence(subquery, evidence, {
    satisfaction: "partial",
    reasons: [
      "date_metadata_present_but_composition_date_remains_vague",
      "translation_or_witness_date_must_not_substitute_for_composition_date",
    ],
  });
}

function provenanceEvaluation(
  subquery: OraclePlannedSubquery,
  evidence: OracleShadowSubqueryEvidence,
) {
  if (!evidence.source_metadata.length) {
    return withEvidence(subquery, evidence, {
      satisfaction: "unmet",
      reasons: ["source_metadata_absent"],
    });
  }

  const complete = evidence.source_metadata.some((source) =>
    Boolean(
      source.source_url &&
        source.source_file_name &&
        source.source_format &&
        source.original_language &&
        source.witness_key &&
        source.verification_status,
    )
  );
  return withEvidence(subquery, evidence, {
    satisfaction: complete ? "met" : "partial",
    reasons: [
      complete
        ? "governed_provenance_metadata_present"
        : "provenance_metadata_present_but_incomplete",
    ],
  });
}

function comparisonEvaluation(
  subquery: OraclePlannedSubquery,
  evidence: OracleShadowSubqueryEvidence,
) {
  const traditions = uniqueStrings(
    evidence.source_metadata.map((source) => source.tradition_id),
  );
  if (traditions.length >= 2) {
    return withEvidence(subquery, evidence, {
      satisfaction: "met",
      reasons: ["independent_tradition_evidence_present"],
    });
  }
  if (evidence.hits.length) {
    return withEvidence(subquery, evidence, {
      satisfaction: "partial",
      reasons: ["evidence_present_but_not_on_both_comparison_sides"],
    });
  }
  return withEvidence(subquery, evidence, {
    satisfaction: "unmet",
    reasons: ["comparison_evidence_absent"],
  });
}

function interpretiveEvaluation(
  subquery: OraclePlannedSubquery,
  evidence: OracleShadowSubqueryEvidence,
) {
  const relationship = evidence.relationship_level ?? "not_assessed";
  if (relationship === "insufficient" || !evidence.hits.length) {
    return withEvidence(subquery, evidence, {
      satisfaction: "unmet",
      reasons: ["attested_textual_basis_insufficient_for_reflection"],
    });
  }
  return withEvidence(subquery, evidence, {
    satisfaction: "partial",
    reasons: [
      "attested_textual_basis_present",
      "interpretation_remains_separate_from_attestation",
    ],
  });
}

function hasSpecificCompositionDate(value: string) {
  const compositionPart = value.split(";")[0].trim().toLowerCase();
  if (!compositionPart || /^(ancient|unknown|uncertain|undated)$/.test(compositionPart)) {
    return false;
  }
  return /\b(?:c\.?\s*)?\d{1,4}\s*(?:bce|bc|ce|ad)\b|\b\d{1,2}(?:st|nd|rd|th)?\s+centur(?:y|ies)\b/i
    .test(compositionPart);
}

function withEvidence(
  subquery: OraclePlannedSubquery,
  evidence: OracleShadowSubqueryEvidence,
  result: Pick<OracleShadowSubqueryEvaluation, "satisfaction" | "reasons">,
): OracleShadowSubqueryEvaluation {
  const scores = evidence.hits
    .map((hit) => hit.score)
    .filter((score): score is number =>
      typeof score === "number" && Number.isFinite(score)
    );
  return {
    subquery_id: subquery.id,
    intent: subquery.intent,
    question: subquery.question,
    requested_wells: subquery.requested_wells,
    satisfaction: result.satisfaction,
    reasons: result.reasons,
    evidence_count: evidence.hits.length,
    top_score: scores.length ? Math.max(...scores) : null,
    source_titles: uniqueStrings(evidence.hits.map((hit) => hit.title)),
    relationship_level: evidence.relationship_level ?? "not_assessed",
    retrieval_mode: evidence.retrieval_mode ?? null,
    vector_status: evidence.vector_status ?? null,
    metadata_fields_present: metadataFields(evidence.source_metadata),
  };
}

function baseEvaluation(
  subquery: OraclePlannedSubquery,
  result: Pick<OracleShadowSubqueryEvaluation, "satisfaction" | "reasons">,
): OracleShadowSubqueryEvaluation {
  return {
    subquery_id: subquery.id,
    intent: subquery.intent,
    question: subquery.question,
    requested_wells: subquery.requested_wells,
    satisfaction: result.satisfaction,
    reasons: result.reasons,
    evidence_count: 0,
    top_score: null,
    source_titles: [],
    relationship_level: "not_assessed",
    retrieval_mode: null,
    vector_status: null,
    metadata_fields_present: [],
  };
}

function metadataFields(metadata: OracleShadowSourceMetadata[]) {
  const fields = new Set<string>();
  for (const source of metadata) {
    for (const [key, value] of Object.entries(source)) {
      if (key === "id" || key === "title") continue;
      if (value !== null && value !== undefined && value !== "") fields.add(key);
    }
  }
  return [...fields].sort();
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
