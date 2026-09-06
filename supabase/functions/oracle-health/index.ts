import postgres from "npm:postgres@3.4.4";

const SUPABASE_DB_URL = Deno.env.get("SUPABASE_DB_URL")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
const ELEVENLABS_VOICE_ID_ANDY = Deno.env.get("ELEVENLABS_VOICE_ID_ANDY");
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-oracle-transport-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Counts = {
  grimoire: number;
  ancient_publishable: number;
  ancient_native_embedded: number;
  sacred_pages: number;
  sacred_chunks: number;
  sacred_native_embedded: number;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return out({ error: "POST required" }, 405);

  const sql = postgres(SUPABASE_DB_URL, { prepare: true, max: 2, idle_timeout: 5, connect_timeout: 10 });
  try {
    if (!(await authenticateTransport(sql, req))) return out({ error: "Unauthorized Oracle transport" }, 401);

    const [counts] = await sql<Counts[]>`
      select
        (select count(*)::int from public.akst_correspondences) as grimoire,
        (select count(*)::int from public.akst_publishable_chunks where content_tier='A') as ancient_publishable,
        (select count(*)::int
           from public.akst_text_chunks c
           join public.akst_publishable_chunks p on p.chunk_id=c.id
          where p.content_tier='A' and c.embedding_gte is not null) as ancient_native_embedded,
        (select count(distinct page_id)::int from public.sacred_writings_chunks) as sacred_pages,
        (select count(*)::int from public.sacred_writings_chunks) as sacred_chunks,
        (select count(*)::int from public.sacred_writings_chunks where embedding_gte is not null) as sacred_native_embedded
    `;

    const voice = Boolean(ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID_ANDY);
    const synth = Boolean(LOVABLE_API_KEY || OPENAI_API_KEY);
    const blockers: string[] = [];
    const degradations: string[] = [];

    if (!counts || counts.grimoire === 0) blockers.push("Grimoire runtime projection is empty");
    if (!counts || counts.ancient_publishable === 0) blockers.push("Ancient Tier A runtime corpus is empty");
    if (!counts || counts.sacred_chunks === 0) blockers.push("Sacred Writings runtime store is empty");
    if (!synth) degradations.push("No synthesis model configured; evidence-only Oracle fallback is active");
    if ((counts?.ancient_native_embedded ?? 0) < (counts?.ancient_publishable ?? 0)) {
      degradations.push(`Ancient native embedding backfill incomplete: ${counts?.ancient_native_embedded ?? 0}/${counts?.ancient_publishable ?? 0}`);
    }
    if ((counts?.sacred_native_embedded ?? 0) < (counts?.sacred_chunks ?? 0)) {
      degradations.push(`Sacred Writings native embedding backfill incomplete: ${counts?.sacred_native_embedded ?? 0}/${counts?.sacred_chunks ?? 0}`);
    }
    if (!voice) degradations.push("Andy voice runtime is not fully configured");

    const status = blockers.length ? "blocked" : degradations.length ? "degraded" : "ready";
    const luminariaClientStatus = blockers.length || !voice ? "blocked" : degradations.length ? "degraded" : "ready";

    return out({
      status,
      luminaria_client_status: luminariaClientStatus,
      checked_at: new Date().toISOString(),
      transport: { authenticated: true, credential_source: "Supabase Vault" },
      blockers,
      degradations,
      wells: {
        well_1_grimoire: {
          status: counts.grimoire > 0 ? "connected" : "empty",
          runtime_correspondences: counts.grimoire,
          safety_projection: "Oracle RPC",
        },
        well_2_akst: {
          status: counts.ancient_publishable > 0 ? "connected" : "empty",
          tier_a_publishable_chunks: counts.ancient_publishable,
          native_embedded_chunks: counts.ancient_native_embedded,
          native_embedding_coverage: counts.ancient_publishable > 0 ? counts.ancient_native_embedded / counts.ancient_publishable : 0,
          embedding_model: "gte-small",
          embedding_dimensions: 384,
          retrieval_mode: counts.ancient_native_embedded > 0 ? "native_vector_with_lexical_fallback" : "lexical",
        },
        well_3_sacred_writings: {
          status: counts.sacred_chunks > 0 ? "connected" : "empty",
          registered_pages_synced: counts.sacred_pages,
          standpoint_gated_chunks: counts.sacred_chunks,
          native_embedded_chunks: counts.sacred_native_embedded,
          native_embedding_coverage: counts.sacred_chunks > 0 ? counts.sacred_native_embedded / counts.sacred_chunks : 0,
          embedding_model: "gte-small",
          embedding_dimensions: 384,
          retrieval_mode: counts.sacred_native_embedded > 0 ? "native_vector_with_lexical_fallback" : "lexical",
          access: "standpoint-gated; Tier B excluded from Luminaria client surface",
        },
      },
      synthesis: {
        configured: synth,
        providers: {
          lovable: Boolean(LOVABLE_API_KEY),
          openai: Boolean(OPENAI_API_KEY),
        },
        required_for_evidence_retrieval: false,
      },
      voice: { configured: voice, provider: "elevenlabs", profile: "Andy" },
      canonical_editorial_authority: "Notion",
      runtime_authority: "AKST Supabase",
      laws: ["Non-Imposition", "The Mirror", "Return to Wholeness", "Lineage-first", "No fabrication", "Source engine, not diagnostician"],
    });
  } catch (error) {
    console.error("oracle-health", error);
    return out({ error: "Oracle health check failed" }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});

async function authenticateTransport(sql: ReturnType<typeof postgres>, req: Request) {
  const incoming = req.headers.get("x-oracle-transport-secret") || "";
  if (!incoming) return false;
  const rows = await sql<{ secret: string }[]>`
    select decrypted_secret as secret
    from vault.decrypted_secrets
    where name = 'oracle_transport_token'
    limit 1
  `;
  return safeEqual(incoming, rows[0]?.secret || "");
}

function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index++) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}

function out(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
