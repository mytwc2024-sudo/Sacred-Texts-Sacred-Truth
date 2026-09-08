export const ORACLE_QUERY_PLAN_VERSION = "oracle.query_plan.v1" as const;

export type OraclePlannerSurface =
  | "internal"
  | "ankhor_internal"
  | "akst_learning"
  | "luminaria_client";

export type OraclePlannerWell =
  | "grimoire"
  | "akst_ancient"
  | "sacred_writings";

export type OracleQueryIntent =
  | "textual_claim"
  | "chronology"
  | "identity_alias"
  | "cross_tradition_comparison"
  | "provenance_manuscript"
  | "interpretive_reflective";

export type OraclePlannedSubquery = {
  id: string;
  question: string;
  intent: OracleQueryIntent;
  requested_wells: OraclePlannerWell[];
  evidence_requirements: string[];
  evidence_class_rule: string;
};

export type OracleQueryPlan = {
  version: typeof ORACLE_QUERY_PLAN_VERSION;
  mode: "advisory";
  execution_status: "not_applied_to_retrieval";
  surface: OraclePlannerSurface;
  original_question: string;
  complexity: "simple" | "compound";
  decomposition_method: "deterministic_v1";
  subqueries: OraclePlannedSubquery[];
  warnings: string[];
};

const COMPARISON = /\b(compare|comparison|versus|vs\.?|difference|differ|similarit|across traditions?|parallel passages?)\b/i;
const CHRONOLOGY = /\b(chronolog|earlier|later|before|after|oldest|newest|first attested|date[ds]?|dating|composed|composition|when was|sequence|timeline)\b/i;
const IDENTITY = /\b(same (?:person|deity|figure|entity)|same as|alias|aliases|identity|identification|transliteration|another name|also called|equivalent to|who is|who was)\b/i;
const PROVENANCE = /\b(manuscript|witness|provenance|source history|textual history|edition|translator|translation|original language|recension|interpolation|variant reading|codex|papyrus|fragment)\b/i;
const INTERPRETIVE = /\b(interpret|meaning|mean spiritually|spiritual meaning|symbolic|symbolism|reflect|reflection|metaphor|mystical|practice|ritual meaning)\b/i;
const EXPLICIT_TEXTUAL = /\b(what does .* say|what do .* say|according to|passage|verse|quote|quotation|textual claim|where does .* say|teach(?:es|ing)?)\b/i;

export function planOracleQuery(
  question: string,
  surface: OraclePlannerSurface,
): OracleQueryPlan {
  const original = normalizeWhitespace(question);
  const clauses = splitExplicitClauses(original);
  const subqueries: OraclePlannedSubquery[] = [];

  for (const clause of clauses) {
    const intents = inferIntents(clause);
    for (const intent of intents) {
      subqueries.push({
        id: `q${subqueries.length + 1}`,
        question: clause,
        intent,
        requested_wells: wellsFor(intent, surface),
        evidence_requirements: requirementsFor(intent),
        evidence_class_rule: evidenceClassRule(intent),
      });
    }
  }

  if (!subqueries.length && original) {
    subqueries.push({
      id: "q1",
      question: original,
      intent: "textual_claim",
      requested_wells: wellsFor("textual_claim", surface),
      evidence_requirements: requirementsFor("textual_claim"),
      evidence_class_rule: evidenceClassRule("textual_claim"),
    });
  }

  const warnings = buildWarnings(subqueries);
  return {
    version: ORACLE_QUERY_PLAN_VERSION,
    mode: "advisory",
    execution_status: "not_applied_to_retrieval",
    surface,
    original_question: original,
    complexity: subqueries.length > 1 || clauses.length > 1 ? "compound" : "simple",
    decomposition_method: "deterministic_v1",
    subqueries,
    warnings,
  };
}

function splitExplicitClauses(question: string) {
  if (!question) return [];

  return question
    .split(/[;\n]+|\?\s+(?=\S)|\s+(?:and|then)\s+(?=(?:what|when|where|which|who|why|how|is|are|was|were|does|did|can|could|would|should)\b)/i)
    .map((part) => part.trim().replace(/[?]+$/g, ""))
    .filter(Boolean);
}

function inferIntents(clause: string): OracleQueryIntent[] {
  const intents: OracleQueryIntent[] = [];

  if (PROVENANCE.test(clause)) intents.push("provenance_manuscript");
  if (CHRONOLOGY.test(clause)) intents.push("chronology");
  if (IDENTITY.test(clause)) intents.push("identity_alias");
  if (COMPARISON.test(clause)) intents.push("cross_tradition_comparison");
  if (INTERPRETIVE.test(clause)) intents.push("interpretive_reflective");
  if (EXPLICIT_TEXTUAL.test(clause)) intents.push("textual_claim");

  return uniqueIntents(intents.length ? intents : ["textual_claim"]);
}

function wellsFor(
  intent: OracleQueryIntent,
  surface: OraclePlannerSurface,
): OraclePlannerWell[] {
  const intended: OraclePlannerWell[] = intent === "provenance_manuscript"
    ? ["akst_ancient"]
    : intent === "chronology" ||
        intent === "identity_alias" ||
        intent === "cross_tradition_comparison"
    ? ["akst_ancient", "sacred_writings"]
    : ["grimoire", "akst_ancient", "sacred_writings"];

  if (surface === "akst_learning") return ["akst_ancient"];
  return intended;
}

function requirementsFor(intent: OracleQueryIntent) {
  if (intent === "chronology") {
    return [
      "dated_or_date-ranged_source_metadata",
      "separate_composition_date_from_witness_date",
      "preserve_uncertainty_in_sequence",
    ];
  }
  if (intent === "identity_alias") {
    return [
      "explicit_name_alias_or_identification_attestation",
      "do_not_equate_entities_from_semantic_similarity_alone",
      "preserve_disputed_or_possible_identification",
    ];
  }
  if (intent === "cross_tradition_comparison") {
    return [
      "evidence_from_each_compared_source_or_tradition",
      "preserve_translation_and_witness_differences",
      "do_not_convert_similarity_into_direct_dependence",
    ];
  }
  if (intent === "provenance_manuscript") {
    return [
      "source_witness_or_edition_metadata",
      "language_translator_and_acquisition_metadata_when_available",
      "separate_source_text_from_later_interpretation",
    ];
  }
  if (intent === "interpretive_reflective") {
    return [
      "attested_textual_evidence_before_interpretation",
      "label_reflection_as_interpretive_not_historical_fact",
      "keep_working_layer_distinct_from_ancient_provenance",
    ];
  }
  return [
    "passage_or_exact_location_support",
    "rights_and_publication_eligibility",
    "source_metadata_and_citation",
  ];
}

function evidenceClassRule(intent: OracleQueryIntent) {
  if (intent === "interpretive_reflective") {
    return "attestation_may_inform_interpretation_but_interpretation_must_remain_labeled";
  }
  if (intent === "provenance_manuscript" || intent === "chronology") {
    return "metadata_claims_require_source_or_witness_metadata_not_working-layer_similarity";
  }
  if (intent === "identity_alias") {
    return "identity_claims_require_explicit_attestation_or_governed_identification_state";
  }
  if (intent === "cross_tradition_comparison") {
    return "each_side_of_comparison_requires_independent_evidence";
  }
  return "factual_textual_claims_require_governed_source_evidence";
}

function buildWarnings(subqueries: OraclePlannedSubquery[]) {
  const warnings: string[] = [];
  if (subqueries.length > 1) {
    warnings.push("preserve_subquery_evidence_classes_during_recombination");
  }
  if (subqueries.some((subquery) => subquery.intent === "interpretive_reflective")) {
    warnings.push("do_not_promote_interpretation_to_attestation");
  }
  if (subqueries.some((subquery) => subquery.intent === "identity_alias")) {
    warnings.push("do_not_collapse_identity_from_embedding_similarity");
  }
  if (subqueries.some((subquery) => subquery.intent === "cross_tradition_comparison")) {
    warnings.push("comparison_requires_evidence_on_each_side");
  }
  return warnings;
}

function uniqueIntents(intents: OracleQueryIntent[]) {
  return [...new Set(intents)];
}

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}
