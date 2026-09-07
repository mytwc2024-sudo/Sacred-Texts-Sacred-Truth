import postgres from "npm:postgres@3.4.4";

const DB = Deno.env.get("SUPABASE_DB_URL")!;
const DEFAULT_BATCH = 4;
const MAX_INPUT_CHARS = 4200;

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

type WorkRow = { source: "ancient" | "sacred"; id: string; content: string };

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const sql = postgres(DB, { prepare: true, max: 2, idle_timeout: 5, connect_timeout: 10 });
  try {
    if (!(await authenticateTransport(sql, req))) return json({ error: "Unauthorized Oracle transport" }, 401);
    const body = await req.json().catch(() => ({}));
    const requested = Number(body?.batch_size ?? DEFAULT_BATCH);
    const batchSize = Math.min(6, Math.max(1, Number.isFinite(requested) ? Math.floor(requested) : DEFAULT_BATCH));

    const [before] = await sql<{ ancient_missing: number; sacred_missing: number }[]>`
      select
        (select count(*)::int from public.akst_text_chunks c join public.akst_publishable_chunks p on p.chunk_id=c.id where p.content_tier='A' and c.embedding_gte is null) as ancient_missing,
        (select count(*)::int from public.sacred_writings_chunks where embedding_gte is null) as sacred_missing
    `;

    const rows = await sql<WorkRow[]>`
      select source, id, content
      from (
        select 'ancient'::text as source, c.id::text as id, c.content, 0 as source_rank, c.created_at
        from public.akst_text_chunks c
        join public.akst_publishable_chunks p on p.chunk_id = c.id
        where p.content_tier='A' and c.embedding_gte is null
        union all
        select 'sacred'::text as source, id::text, content, 1 as source_rank, created_at
        from public.sacred_writings_chunks
        where embedding_gte is null
      ) work
      order by source_rank, created_at, id
      limit ${batchSize}
    ` as WorkRow[];

    const model = new Supabase.ai.Session("gte-small");
    let embedded = 0;
    const failures: Array<{ source: string; id: string; error: string }> = [];

    for (const row of rows) {
      try {
        const input = row.content.slice(0, MAX_INPUT_CHARS);
        const raw = await model.run(input, { mean_pool: true, normalize: true });
        const vector = Array.from(raw as ArrayLike<number>);
        if (vector.length !== 384 || !vector.every(Number.isFinite)) throw new Error(`invalid embedding (${vector.length})`);
        const literal = `[${vector.join(",")}]`;
        if (row.source === "ancient") {
          await sql`update public.akst_text_chunks set embedding_gte=${literal}::public.vector where id=${row.id}::uuid`;
        } else {
          await sql`update public.sacred_writings_chunks set embedding_gte=${literal}::public.vector, updated_at=now() where id=${row.id}::uuid`;
        }
        embedded += 1;
      } catch (error) {
        failures.push({ source: row.source, id: row.id, error: error instanceof Error ? error.message : String(error) });
      }
    }

    const [after] = await sql<{ ancient_missing: number; sacred_missing: number; ancient_ready: number; sacred_ready: number }[]>`
      select
        (select count(*)::int from public.akst_text_chunks c join public.akst_publishable_chunks p on p.chunk_id=c.id where p.content_tier='A' and c.embedding_gte is null) as ancient_missing,
        (select count(*)::int from public.sacred_writings_chunks where embedding_gte is null) as sacred_missing,
        (select count(*)::int from public.akst_text_chunks c join public.akst_publishable_chunks p on p.chunk_id=c.id where p.content_tier='A' and c.embedding_gte is not null) as ancient_ready,
        (select count(*)::int from public.sacred_writings_chunks where embedding_gte is not null) as sacred_ready
    `;

    return json({
      ok: failures.length === 0,
      model: "gte-small",
      dimensions: 384,
      batch_size: batchSize,
      attempted: rows.length,
      embedded,
      failures,
      before,
      after,
      complete: (after?.ancient_missing ?? 0) === 0 && (after?.sacred_missing ?? 0) === 0,
    });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
