import postgres from "npm:postgres@3.4.4";

const DB = Deno.env.get("SUPABASE_DB_URL")!;
const WORKER_URL = "https://xhzyavyftgyqzftlqdlz.supabase.co/functions/v1/native-embedding-worker";

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

async function transportSecret(sql: ReturnType<typeof postgres>) {
  const rows = await sql<{ secret: string }[]>`
    select decrypted_secret as secret from vault.decrypted_secrets
    where name='oracle_transport_token' limit 1
  `;
  return rows[0]?.secret ?? "";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const sql = postgres(DB, { prepare: true, max: 1, idle_timeout: 5, connect_timeout: 10 });
  try {
    const incoming = req.headers.get("x-oracle-transport-secret") ?? "";
    const secret = await transportSecret(sql);
    if (!safeEqual(incoming, secret)) return json({ error: "Unauthorized Oracle transport" }, 401);

    const body = await req.json().catch(() => ({}));
    const requested = Number(body?.max_batches ?? 8);
    const maxBatches = Math.min(20, Math.max(1, Number.isFinite(requested) ? Math.floor(requested) : 8));
    const results: unknown[] = [];
    let complete = false;
    let embedded = 0;

    for (let i = 0; i < maxBatches; i++) {
      const response = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-oracle-transport-secret": secret },
        body: JSON.stringify({ batch_size: 4 }),
      });
      const payload = await response.json().catch(() => ({}));
      results.push({ status: response.status, ...payload });
      if (!response.ok || payload?.ok === false) {
        return json({ ok: false, complete: false, batches: i + 1, embedded, results }, 502);
      }
      embedded += Number(payload?.embedded ?? 0);
      if (payload?.complete === true || Number(payload?.attempted ?? 0) === 0) {
        complete = true;
        break;
      }
    }

    return json({ ok: true, complete, batches: results.length, embedded, results });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
