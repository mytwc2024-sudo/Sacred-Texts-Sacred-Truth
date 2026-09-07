import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
const ELEVENLABS_VOICE_ID_ANDY = Deno.env.get("ELEVENLABS_VOICE_ID_ANDY");
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-oracle-client-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return out({ error: "POST required" }, 405);
  try {
    const key = serviceKey();
    if (!key) return out({ error: "Oracle service access unavailable" }, 503);
    const db = createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    if (body?.mode === "health") return health(db);

    const question = typeof body?.question === "string" ? body.question.trim() : "";
    const speak = body?.speak === true;
    if (!question) return out({ error: "question is required" }, 400);
    if (question.length > 1200) return out({ error: "question is too long" }, 400);

    const query = expandQuestion(question);
    const [grimoire, ancient, sacred] = await Promise.all([
      searchGrimoire(db, query),
      searchAncient(db, query, question),
      searchSacred(db, query),
    ]);
    const active = [grimoire.hits.length, ancient.hits.length, sacred.hits.length].filter((n) => n > 0).length;
    const evidence_state = active === 3 ? "three_well" : active ? "partial" : "insufficient";
    const citations = [
      ...grimoire.hits.map((h: any, i: number) => ({ label: `G${i + 1}`, well: "grimoire", title: h.title, url: h.url })),
      ...ancient.hits.map((h: any, i: number) => ({ label: `A${i + 1}`, well: "akst_ancient", title: h.title, url: h.url })),
      ...sacred.hits.map((h: any, i: number) => ({ label: `S${i + 1}`, well: "sacred_writings", title: h.title, url: h.url })),
    ];

    let answer = "The Oracle does not yet have enough connected evidence to answer this without inventing material. The gap is being returned explicitly.";
    let answer_mode = "evidence_only";
    let generation_provider = "none";
    if (evidence_state !== "insufficient") {
      const system = prompt(grimoire.hits, ancient.hits, sacred.hits);
      const generated = await synthesize(system, question);
      generation_provider = generated.provider;
      if (generated.text) {
        answer = generated.text;
        answer_mode = "generated_grounded";
      } else {
        answer = fallback(question, grimoire, ancient, sacred);
      }
    }

    const payload: Record<string, unknown> = {
      answer,
      answer_mode,
      generation_provider,
      evidence_state,
      citations,
      wells: {
        grimoire: { status: grimoire.status, matches: grimoire.hits.length },
        ancient: { status: ancient.status, retrieval_mode: ancient.retrieval_mode, matches: ancient.hits.length },
        sacred_writings: { status: sacred.status, matches: sacred.hits.length },
      },
      laws_applied: laws(),
      voice: { requested: speak, provider: "elevenlabs", profile: "Andy", generated: false },
    };

    if (speak) {
      const voice = await speakAnswer(db, req, answer);
      payload.voice = voice.meta;
      if (voice.audio) {
        payload.audio_base64 = voice.audio;
        payload.audio_content_type = "audio/mpeg";
      }
    }
    return out(payload);
  } catch (e) {
    console.error("oracle-client", e);
    return out({ error: "Oracle client surface failed" }, 500);
  }
});

function serviceKey() {
  const direct = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY");
  if (direct) return direct;
  try { return Object.values(JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"))[0] as string | undefined; } catch { return undefined; }
}
function laws() { return ["Non-Imposition", "The Mirror", "Return to Wholeness", "Lineage-first", "No fabrication", "Source engine, not diagnostician"]; }

async function health(db: ReturnType<typeof createClient>) {
  const [g, a, s, e] = await Promise.all([
    db.from("akst_correspondences").select("id", { count: "exact", head: true }),
    db.from("akst_publishable_chunks").select("chunk_id", { count: "exact", head: true }).eq("content_tier", "A"),
    db.from("akst_texts").select("id", { count: "exact", head: true }).eq("content_tier", "C").eq("rights_status", "own_ip"),
    db.from("akst_text_chunks").select("id", { count: "exact", head: true }).not("embedding", "is", null),
  ]);
  const blockers: string[] = [];
  const degradations: string[] = [];
  if (g.error || a.error || s.error || e.error) blockers.push("One or more Oracle corpus checks failed");
  if ((g.count ?? 0) === 0) blockers.push("Grimoire runtime projection is empty");
  if ((a.count ?? 0) === 0) blockers.push("Ancient Tier A corpus is empty");
  if ((s.count ?? 0) === 0) blockers.push("Sacred Writings Tier C projection is empty");
  if (!LOVABLE_API_KEY && !OPENAI_API_KEY) degradations.push("No synthesis model configured; evidence-only fallback is active");
  if ((e.count ?? 0) === 0) degradations.push("No embeddings are present; ancient retrieval uses lexical fallback");
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID_ANDY) degradations.push("Andy voice runtime is not fully configured");
  return out({
    status: blockers.length ? "blocked" : degradations.length ? "degraded" : "ready",
    luminaria_client_status: blockers.length || !ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID_ANDY ? "blocked" : degradations.length ? "degraded" : "ready",
    blockers,
    degradations,
    wells: {
      grimoire: { status: (g.count ?? 0) ? "connected" : "empty", correspondences: g.count ?? 0 },
      ancient: { status: (a.count ?? 0) ? "connected" : "empty", tier_a_chunks: a.count ?? 0, embedded_chunks_all: e.count ?? 0, retrieval_mode: (e.count ?? 0) && OPENAI_API_KEY ? "vector_with_lexical_fallback" : "lexical" },
      sacred_writings: { status: (s.count ?? 0) ? "connected" : "empty", tier_c_own_ip_texts: s.count ?? 0 },
    },
    synthesis: { configured: Boolean(LOVABLE_API_KEY || OPENAI_API_KEY) },
    voice: { configured: Boolean(ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID_ANDY), provider: "elevenlabs", profile: "Andy" },
    canonical_editorial_authority: "Notion",
    runtime_authority: "AKST Supabase",
    laws: laws(),
  });
}

async function searchGrimoire(db: ReturnType<typeof createClient>, query: string) {
  const { data, error } = await db.rpc("search_oracle_correspondences", { query_text: query, client_safe: true, match_count: 8 });
  if (error) return { status: "error", hits: [] as any[] };
  const hits = (data || []).map((r: any) => ({
    title: r.name,
    url: r.notion_url || "",
    excerpt: [r.properties_text && `Properties: ${r.properties_text}`, r.spiritual_connotations && `Spiritual: ${r.spiritual_connotations}`, r.planet && `Planet: ${r.planet}`, r.element && `Element: ${r.element}`, r.best_moon_phase && `Moon phase: ${r.best_moon_phase}`, Array.isArray(r.tradition) && r.tradition.length && `Tradition: ${r.tradition.join(", ")}`, r.safety_class && `Safety: ${r.safety_class}`, r.ritual_use_only && "Ritual use only"].filter(Boolean).join(" | "),
  }));
  return { status: hits.length ? "grounded" : "empty", hits };
}
async function searchSacred(db: ReturnType<typeof createClient>, query: string) {
  const { data, error } = await db.rpc("search_oracle_sacred_writings", { query_text: query, match_count: 6 });
  if (error) return { status: "error", hits: [] as any[] };
  const hits = (data || []).map((r: any) => ({ title: r.title, url: r.source_url || "", excerpt: r.content }));
  return { status: hits.length ? "grounded" : "empty", hits };
}
async function searchAncient(db: ReturnType<typeof createClient>, query: string, rawQuestion: string) {
  if (OPENAI_API_KEY) {
    try {
      const vector = await embed(rawQuestion);
      const { data, error } = await db.rpc("match_ancient_chunks", { query_embedding: vector, match_threshold: 0.35, match_count: 8 });
      if (!error && data?.length) return { status: "grounded", retrieval_mode: "vector", hits: data.map((r: any) => ({ title: r.text_title, url: r.source_url || "", excerpt: r.content })) };
    } catch { /* lexical fallback */ }
  }
  const { data, error } = await db.rpc("search_oracle_ancient_lexical", { query_text: query, match_count: 8 });
  if (error) return { status: "error", retrieval_mode: "lexical", hits: [] as any[] };
  return { status: data?.length ? "grounded" : "empty", retrieval_mode: "lexical", hits: (data || []).map((r: any) => ({ title: r.text_title, url: r.source_url || "", excerpt: r.content })) };
}
async function embed(input: string) {
  const r = await fetch("https://api.openai.com/v1/embeddings", { method: "POST", headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "text-embedding-3-small", input }) });
  if (!r.ok) throw new Error("embedding unavailable");
  const vector = (await r.json())?.data?.[0]?.embedding;
  if (!Array.isArray(vector) || vector.length !== 1536) throw new Error("embedding mismatch");
  return vector;
}

function prompt(g: any[], a: any[], s: any[]) {
  const gc = g.map((h, i) => `[G${i + 1}] ${h.title}\n${h.excerpt}`).join("\n\n");
  const ac = a.map((h, i) => `[A${i + 1}] ${h.title}\n${h.excerpt}`).join("\n\n");
  const sc = s.map((h, i) => `[S${i + 1}] ${h.title}\n${h.excerpt}`).join("\n\n");
  return `You are the Luminaria-facing Oracle. Reflective spiritual/educational material only. Never diagnose, treat, give legal advice, predict fate, name an enemy, give ingestion/dosing/medication/hazardous handling instructions, expose practitioner-only notes, client records, or ritual-session details. Offer correspondences as possibilities, never commands. Cite Grimoire as [G#], ancient Tier A evidence as [A#], Sacred Writings as [S#]. Sacred Writings are Eleara Voss's living voice layer, not ancient provenance. Keep the answer under 180 spoken words and preserve uncertainty.\n\nGRIMOIRE:\n${gc || "(none)"}\n\nANCIENT TIER A:\n${ac || "(none)"}\n\nSACRED WRITINGS:\n${sc || "(none)"}`;
}
async function synthesize(system: string, question: string) {
  const messages = [{ role: "system", content: system }, { role: "user", content: question }];
  if (LOVABLE_API_KEY) {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages }) });
    if (r.ok) return { text: (await r.json()).choices?.[0]?.message?.content || "", provider: "lovable" };
  }
  if (OPENAI_API_KEY) {
    const r = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "gpt-4o-mini", messages }) });
    if (r.ok) return { text: (await r.json()).choices?.[0]?.message?.content || "", provider: "openai" };
  }
  return { text: "", provider: "none" };
}
function fallback(q: string, g: any, a: any, s: any) {
  const parts = [`For “${q},” the Oracle found source evidence and is returning it without inventing a synthesis.`];
  if (g.hits.length) parts.push(`The Grimoire returned ${g.hits.length} safe correspondence${g.hits.length === 1 ? "" : "s"} [G].`);
  if (a.hits.length) parts.push(`The Tier A ancient corpus returned ${a.hits.length} passage${a.hits.length === 1 ? "" : "s"} [A].`); else parts.push("No Tier A ancient passage matched this question.");
  if (s.hits.length) parts.push(`Sacred Writings returned ${s.hits.length} Eleara Voss source${s.hits.length === 1 ? "" : "s"} [S].`);
  parts.push("No fate, diagnosis, or unsupported lineage claim is being asserted; use the cited sources as a mirror for your own knowing.");
  return parts.join(" ");
}
function expandQuestion(q: string) {
  const x = [q]; const l = q.toLowerCase();
  if (/sky|celestial|astrolog|moon|lunar/.test(l)) x.push("moon lunar sun solar planet planetary celestial sky");
  if (/love|relationship|romance/.test(l)) x.push("love venus heart relationship");
  if (/money|prosper|abundance/.test(l)) x.push("money prosperity abundance luck jupiter");
  if (/protect|banish|reversal|hex/.test(l)) x.push("protection ward banish reversal hex");
  if (/mother|maternal|woman|women|womb/.test(l)) x.push("mother womb woman women return wholeness");
  return x.join(" ");
}

async function speakAnswer(db: ReturnType<typeof createClient>, req: Request, answer: string) {
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID_ANDY) return { meta: { requested: true, provider: "elevenlabs", profile: "Andy", generated: false, fallback: "text_transcript", reason: "voice_unconfigured" } };
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").trim();
  const client = (req.headers.get("x-oracle-client-id") || "anonymous").slice(0, 160);
  const [ipHash, clientHash] = await Promise.all([hash(ip), hash(client)]);
  const quotas = await Promise.all([
    db.rpc("consume_oracle_voice_quota", { p_scope: "global", p_key_hash: "global", p_limit: 300 }),
    db.rpc("consume_oracle_voice_quota", { p_scope: "ip", p_key_hash: ipHash, p_limit: 80 }),
    db.rpc("consume_oracle_voice_quota", { p_scope: "client", p_key_hash: clientHash, p_limit: 24 }),
  ]);
  const denied = quotas.some((q) => q.error || q.data?.[0]?.allowed === false);
  if (denied) return { meta: { requested: true, provider: "elevenlabs", profile: "Andy", generated: false, fallback: "text_transcript", reason: "rate_limited" } };
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID_ANDY}`, {
    method: "POST",
    headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text: answer, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
  });
  if (!r.ok) return { meta: { requested: true, provider: "elevenlabs", profile: "Andy", generated: false, fallback: "text_transcript", provider_status: r.status } };
  const bytes = new Uint8Array(await r.arrayBuffer());
  return { audio: toBase64(bytes), meta: { requested: true, provider: "elevenlabs", profile: "Andy", generated: true, bytes: bytes.length } };
}
async function hash(value: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function toBase64(bytes: Uint8Array) {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(binary);
}
function out(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
