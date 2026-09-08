import postgres from "npm:postgres@3.4.4";

const DB = Deno.env.get("SUPABASE_DB_URL")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function authenticateTransport(sql: ReturnType<typeof postgres>, req: Request) {
  const incoming = req.headers.get("x-oracle-transport-secret") ?? "";
  if (!incoming) return false;
  const rows = await sql<{ secret: string }[]>`
    select decrypted_secret as secret
    from vault.decrypted_secrets
    where name = 'oracle_transport_token'
    limit 1
  `;
  return safeEqual(incoming, rows[0]?.secret ?? "");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const sql = postgres(DB, { prepare: true, max: 1, idle_timeout: 5, connect_timeout: 10 });
  try {
    if (!(await authenticateTransport(sql, req))) return json({ error: "Unauthorized Oracle transport" }, 401);
    const body = await req.json().catch(() => ({}));
    const input = typeof body?.input === "string" && body.input.trim()
      ? body.input.trim().slice(0, 4000)
      : "The Oracle returns the seeker to their own knowing.";

    const model = new Supabase.ai.Session("gte-small");
    const embedding = await model.run(input, { mean_pool: true, normalize: true });
    const vector = Array.from(embedding as ArrayLike<number>);

    return json({
      ok: true,
      model: "gte-small",
      dimensions: vector.length,
      finite: vector.every(Number.isFinite),
      sample_norm: Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)),
    });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
