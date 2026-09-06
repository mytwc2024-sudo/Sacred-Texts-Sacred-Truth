import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

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
    if (!OPENAI_API_KEY) return json({ error: "AKST embedding provider unavailable" }, 503);

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

    const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: retrievalInput }),
    });
    if (!embeddingResponse.ok) {
      console.error("embedding failed", embeddingResponse.status, await embeddingResponse.text());
      return json({ error: "embedding provider unavailable" }, 503);
    }
    const embeddingPayload = await embeddingResponse.json();
    const embedding = embeddingPayload?.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length !== 1536) {
      return json({ error: "embedding dimension mismatch" }, 503);
    }

    const db = createClient(SUPABASE_URL, sk, { auth: { persistSession: false } });
    const { data: matches, error: matchError } = await db.rpc("match_chunks", {
      query_embedding: embedding,
      match_threshold: 0.35,
      match_count: 8,
    });
    if (matchError) {
      console.error("match_chunks error", matchError);
      return json({ error: "AKST retrieval unavailable" }, 503);
    }

    const sources = (matches || []).map((m: any) => ({
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

    if (!sources.length) {
      return json({
        answer: "I couldn't find rights-cleared AKST passages that support an answer yet. The gap is being stated rather than filled with generated source claims.",
        sources: [],
        evidence_state: "insufficient",
        retrieval: "match_chunks/akst_publishable_chunks",
      });
    }

    const sourceContext = sources.map((s: any, i: number) => {
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
    if (LOVABLE_API_KEY) {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages }),
      });
      if (r.ok) answer = (await r.json()).choices?.[0]?.message?.content || "";
      else console.error("Lovable AI failed", r.status, await r.text());
    }
    if (!answer && OPENAI_API_KEY) {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", messages }),
      });
      if (r.ok) answer = (await r.json()).choices?.[0]?.message?.content || "";
      else console.error("OpenAI generation failed", r.status, await r.text());
    }
    if (!answer) return json({ error: "AI provider unavailable" }, 503);

    return json({
      answer,
      sources,
      evidence_state: "grounded",
      retrieval: "match_chunks/akst_publishable_chunks",
      learning_mode: learningMode,
      learning_context: learningContext?.id || null,
    });
  } catch (error) {
    console.error("ask-akst error", error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
