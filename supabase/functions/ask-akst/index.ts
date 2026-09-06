import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import postgres from "npm:postgres@3.4.4";
import { buildOracleV1, type OracleResponseV1 } from "../_shared/oracle-contract.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_DB_URL = Deno.env.get("SUPABASE_DB_URL");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const ORACLE_QUERY_URL = `${SUPABASE_URL}/functions/v1/oracle-query`;

function serviceKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return Object.values(keys)[0] as string | undefined;
  } catch {
    return undefined;
  }
}

type LearningContext = {
  id?: string;
  title?: string;
  description?: string;
  focus?: string;
  texts?: string[];
  traditions?: string[];
  outcomes?: string[];
};

type AskSource = {
  id: string;
  text_id?: string | null;
  title: string;
  author?: string | null;
  translator?: string | null;
  excerpt: string;
  chapter_title?: string | null;
  section_title?: string | null;
  verse_number?: string | null;
  source_name?: string | null;
  source_url?: string | null;
  rights_status?: string | null;
  content_tier?: string | null;
  similarity?: number | null;
  table: string;
};

type RetrievalResult = {
  sources: AskSource[];
  path: string;
  oracle?: OracleResponseV1;
};

const allowedModes = new Set(["explain", "discuss", "quiz"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  try {
    const body = await req.json();
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) return json({ error: "question is required" }, 400);

    const sk = serviceKey();
    if (!sk) return json({ error: "AKST service key unavailable" }, 503);
    const db = createClient(SUPABASE_URL, sk, { auth: { persistSession: false } });

    const learningContext: LearningContext | undefined = body.learning_context;
    const learningMode = allowedModes.has(body.learning_mode) ? body.learning_mode : "explain";
    const learningInstruction = typeof body.learning_instruction === "string" ? body.learning_instruction.slice(0, 1000) : "";
    const contextTerms = [
      learningContext?.title,
      learningContext?.focus,
      ...(learningContext?.texts || []),
      ...(learningContext?.traditions || []),
    ].filter(Boolean).join(" ");
    const retrievalInput = contextTerms ? `${question}\nLearning context: ${contextTerms}` : question;

    let retrieval = await retrieveViaOracle(db, retrievalInput);
    if (!retrieval) retrieval = await retrieveLegacy(db, retrievalInput);
    const sources = retrieval.sources;

    if (!sources.length) {
      const oracleV1 = retrieval.oracle ?? buildLearningOracleV1({
        question,
        retrievalInput,
        answer: "I couldn't find rights-cleared AKST passages that support an answer yet. The gap is being stated rather than filled with generated source claims.",
        sources,
        generationProvider: "none",
        evidenceState: "insufficient",
      });
      return json({
        answer: oracleV1.answer,
        sources: [],
        evidence_state: "insufficient",
        retrieval: retrieval.path,
        learning_mode: learningMode,
        learning_context: learningContext?.id || null,
        oracle_v1: withLearningQuery(oracleV1, question, retrievalInput),
      });
    }

    const sourceContext = sources.map((s: AskSource, i: number) => {
      const loc = [s.chapter_title, s.section_title, s.verse_number].filter(Boolean).join(" · ");
      return `[${i + 1}] ${s.title}${s.author ? ` — ${s.author}` : ""}${loc ? ` (${loc})` : ""}\n${s.excerpt}`;
    }).join("\n\n");

    const courseContext = learningContext ? `\nACTIVE LEARNING CONTEXT:\nModule/Path: ${learningContext.id || ""} ${learningContext.title || ""}\nFocus: ${learningContext.focus || ""}\nDescription: ${learningContext.description || ""}\nNamed texts: ${(learningContext.texts || []).join(", ")}\nTraditions: ${(learningContext.traditions || []).join(", ")}\nLearning outcomes: ${(learningContext.outcomes || []).join("; ")}\nLearning mode: ${learningMode}\n` : "";

    const pedagogy = learningMode === "quiz"
      ? "Give one comprehension question at a time. When the learner answers, explain what is supported by the sources and what needs correction."
      : learningMode === "discuss"
        ? "Teach conversationally and Socratically while separating source claims from interpretation."
        : "Teach clearly in layers: plain-language explanation, source-grounded detail, then comparison only when supported.";

    const systemPrompt = `You are the AKST Learning Guide. Use ONLY the numbered rights-cleared AKST passages below for factual or historical claims. Cite claims inline with [1], [2], etc. Never invent quotations, translations, doctrines, traditions, lineages, dates, or source content. If evidence is insufficient or sources disagree, say so. Spiritual/metaphysical claims must be framed as tradition or interpretation, not established science or medical advice. ${pedagogy} ${learningInstruction}${courseContext}\nSOURCES:\n${sourceContext}`;
    const messages = [
      { role: "system", content: systemPrompt },
      ...(Array.isArray(body.history) ? body.history.slice(-8) : []),
      { role: "user", content: question },
    ];

    let answer = "";
    let generationProvider = "none";
    if (LOVABLE_API_KEY) {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages }),
      });
      if (r.ok) {
        answer = (await r.json()).choices?.[0]?.message?.content || "";
        if (answer) generationProvider = "lovable";
      } else console.error("Lovable AI failed", r.status, await r.text());
    }
    if (!answer && OPENAI_API_KEY) {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", messages }),
      });
      if (r.ok) {
        answer = (await r.json()).choices?.[0]?.message?.content || "";
        if (answer) generationProvider = "openai";
      } else console.error("OpenAI generation failed", r.status, await r.text());
    }
    if (!answer) return json({ error: "AI provider unavailable" }, 503);

    const oracleV1 = retrieval.oracle
      ? {
        ...withLearningQuery(retrieval.oracle, question, retrievalInput),
        answer,
        answer_mode: "generated_grounded" as const,
        diagnostics: {
          ...(retrieval.oracle.diagnostics ?? {}),
          generation_provider: generationProvider,
        },
      }
      : buildLearningOracleV1({
        question,
        retrievalInput,
        answer,
        sources,
        generationProvider,
        evidenceState: "partial",
      });

    return json({
      answer,
      sources,
      evidence_state: "grounded",
      retrieval: retrieval.path,
      learning_mode: learningMode,
      learning_context: learningContext?.id || null,
      oracle_v1: oracleV1,
    });
  } catch (error) {
    console.error("ask-akst error", error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

async function retrieveViaOracle(db: ReturnType<typeof createClient>, retrievalInput: string): Promise<RetrievalResult | null> {
  if (!SUPABASE_DB_URL) return null;
  const sql = postgres(SUPABASE_DB_URL, { prepare: true, max: 1, idle_timeout: 5, connect_timeout: 10 });
  try {
    const rows = await sql<{ secret: string }[]>`
      select decrypted_secret as secret
      from vault.decrypted_secrets
      where name = 'oracle_transport_token'
      limit 1
    `;
    const secret = rows[0]?.secret || "";
    if (!secret) return null;

    const response = await fetch(ORACLE_QUERY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-oracle-transport-secret": secret },
      body: JSON.stringify({ question: retrievalInput, surface: "akst_learning", evidence_only: true }),
    });
    if (!response.ok) {
      console.error("ask-akst oracle core unavailable", response.status);
      return null;
    }
    const data = await response.json().catch(() => null);
    if (!isOracleV1(data)) return null;
    if (!data.retrieval.wells_queried.includes("akst_ancient")) return null;
    if (data.retrieval.wells_queried.some((well) => well !== "akst_ancient")) return null;

    const ancient = data.evidence_units.filter((unit) => unit.well === "akst_ancient");
    const ids = ancient.map((unit) => unit.source_id).filter((id): id is string => Boolean(id));
    let detailMap = new Map<string, any>();
    if (ids.length) {
      const { data: details, error } = await db
        .from("akst_publishable_chunks")
        .select("chunk_id,text_id,chunk_index,content,chapter_title,section_title,verse_number,word_count,text_title,author,translator,content_tier,rights_status,source_name,source_url")
        .in("chunk_id", ids);
      if (error) console.error("ask-akst Oracle source enrichment", error);
      else detailMap = new Map((details || []).map((row: any) => [String(row.chunk_id), row]));
    }

    const sources: AskSource[] = ancient
      .filter((unit) => unit.content_tier === "A" && ["public_domain", "own_ip", "licensed"].includes(unit.rights_status || ""))
      .map((unit) => {
        const detail = unit.source_id ? detailMap.get(unit.source_id) : undefined;
        return {
          id: unit.source_id || unit.id,
          text_id: detail?.text_id || unit.parent_source_id || null,
          title: detail?.text_title || unit.title,
          author: detail?.author || unit.author || null,
          translator: detail?.translator || unit.translator || null,
          excerpt: detail?.content || unit.excerpt,
          chapter_title: detail?.chapter_title || null,
          section_title: detail?.section_title || null,
          verse_number: detail?.verse_number || null,
          source_name: detail?.source_name || unit.source_name || null,
          source_url: detail?.source_url || unit.source_url || null,
          rights_status: detail?.rights_status || unit.rights_status || null,
          content_tier: detail?.content_tier || unit.content_tier || null,
          similarity: unit.score ?? null,
          table: "akst_publishable_chunks",
        };
      });

    return { sources, path: "oracle.v1/akst_ancient", oracle: data };
  } catch (error) {
    console.error("ask-akst Oracle transport", error);
    return null;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function retrieveLegacy(db: ReturnType<typeof createClient>, retrievalInput: string): Promise<RetrievalResult> {
  if (!OPENAI_API_KEY) return { sources: [], path: "legacy_unavailable" };
  const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: retrievalInput }),
  });
  if (!embeddingResponse.ok) {
    console.error("embedding failed", embeddingResponse.status, await embeddingResponse.text());
    return { sources: [], path: "legacy_embedding_unavailable" };
  }
  const embeddingPayload = await embeddingResponse.json();
  const embedding = embeddingPayload?.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length !== 1536) return { sources: [], path: "legacy_embedding_mismatch" };

  const { data: matches, error: matchError } = await db.rpc("match_chunks", {
    query_embedding: embedding,
    match_threshold: 0.35,
    match_count: 8,
  });
  if (matchError) {
    console.error("match_chunks error", matchError);
    return { sources: [], path: "legacy_retrieval_unavailable" };
  }

  const sources: AskSource[] = (matches || []).map((m: any) => ({
    id: m.chunk_id,
    text_id: m.text_id,
    title: m.text_title,
    author: m.author,
    translator: m.translator,
    excerpt: m.content,
    chapter_title: m.chapter_title,
    section_title: m.section_title,
    verse_number: m.verse_number,
    source_name: m.source_name,
    source_url: m.source_url,
    rights_status: m.rights_status,
    content_tier: m.content_tier,
    similarity: Number(m.similarity || 0),
    table: "akst_publishable_chunks",
  }));
  return { sources, path: "match_chunks/akst_publishable_chunks" };
}

function buildLearningOracleV1(args: {
  question: string;
  retrievalInput: string;
  answer: string;
  sources: AskSource[];
  generationProvider: string;
  evidenceState: "partial" | "insufficient";
}): OracleResponseV1 {
  const ancientHits = args.sources.map((source) => ({
    id: source.id,
    text_id: source.text_id,
    title: source.title,
    author: source.author,
    translator: source.translator,
    excerpt: source.excerpt,
    source_name: source.source_name,
    source_url: source.source_url,
    rights_status: source.rights_status,
    content_tier: source.content_tier,
    score: source.similarity,
  }));
  return buildOracleV1({
    question: args.question,
    normalizedQuery: args.retrievalInput,
    surface: "akst_learning",
    answer: args.answer,
    answerMode: args.sources.length ? "generated_grounded" : "evidence_only",
    generationProvider: args.generationProvider,
    legacyEvidenceState: args.evidenceState,
    grimoire: { status: "skipped", retrieval_mode: "not_queried", hits: [] },
    ancient: { status: args.sources.length ? "grounded" : "empty", retrieval_mode: "legacy_vector", hits: ancientHits },
    sacredWritings: { status: "skipped", retrieval_mode: "not_queried", hits: [] },
    citations: args.sources.map((source, index) => ({ label: `A${index + 1}`, well: "akst_ancient", title: source.title, url: source.source_url })),
    lawsApplied: ["No fabrication", "Rights-cleared source boundary"],
    legacyRetrieval: { asking_point: "ask-akst", fallback_path: "match_chunks/akst_publishable_chunks" },
    traceId: crypto.randomUUID(),
    wellsQueried: ["akst_ancient"],
  });
}

function withLearningQuery(oracle: OracleResponseV1, question: string, retrievalInput: string): OracleResponseV1 {
  return {
    ...oracle,
    query: { original: question, normalized: retrievalInput, surface: "akst_learning" },
  };
}

function isOracleV1(value: any): value is OracleResponseV1 {
  return value?.contract_version === "oracle.v1"
    && value?.query?.surface === "akst_learning"
    && Array.isArray(value?.evidence_units)
    && Array.isArray(value?.retrieval?.wells_queried);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
