import postgres from "npm:postgres@3.4.4";

const SUPABASE_DB_URL = Deno.env.get("SUPABASE_DB_URL")!;
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
const ELEVENLABS_VOICE_ID_ANDY = Deno.env.get("ELEVENLABS_VOICE_ID_ANDY");
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-oracle-transport-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const sql = postgres(SUPABASE_DB_URL, { prepare: true, max: 1, idle_timeout: 5, connect_timeout: 10 });
  try {
    if (!(await authenticateTransport(sql, req))) return json({ error: "Unauthorized Oracle transport" }, 401);
    if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID_ANDY) return json({ error: "Andy voice runtime unavailable" }, 503);

    const body = await req.json().catch(() => ({}));
    if (body?.mode === "health") {
      const r = await fetch(`https://api.elevenlabs.io/v1/voices/${ELEVENLABS_VOICE_ID_ANDY}`, {
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
      });
      if (!r.ok) return json({ status: "degraded", provider: "elevenlabs", profile: "Andy", provider_status: r.status }, 502);
      return json({ status: "ready", provider: "elevenlabs", profile: "Andy", provider_verified: true });
    }

    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) return json({ error: "text is required" }, 400);
    if (text.length > 8000) return json({ error: "text is too long for voice rendering" }, 400);

    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID_ANDY}`, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    if (!r.ok) return json({ error: "TTS provider error", provider_status: r.status }, 502);
    return new Response(await r.arrayBuffer(), {
      status: 200,
      headers: { ...CORS, "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("oracle-voice", e);
    return json({ error: "Oracle voice bridge failed" }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});

async function authenticateTransport(sql: ReturnType<typeof postgres>, req: Request) {
  const incoming = req.headers.get("x-oracle-transport-secret") || "";
  if (!incoming) return false;
  const rows = await sql<{ secret: string }[]>`
    select decrypted_secret as secret from vault.decrypted_secrets
    where name = 'oracle_transport_token' limit 1
  `;
  return safeEqual(incoming, rows[0]?.secret || "");
}
function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
