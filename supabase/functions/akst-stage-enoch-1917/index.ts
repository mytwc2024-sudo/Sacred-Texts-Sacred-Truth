import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.4";
import { Buffer } from "node:buffer";

/**
 * AKST 1 Enoch (Charles 1917): strictly private, edition-pinned acquisition.
 * This function NEVER inserts or updates akst_texts, akst_source_assets,
 * akst_text_chunks, akst_ingestion_jobs, publication privileges or Notion.
 *
 * Transport authentication matches AKST's existing protected ingest handler.
 * Deploy with verify_jwt:false ONLY because the body checks the private
 * x-oracle-transport-secret against the DB's Vault secret in constant time.
 */
const DB = Deno.env.get("SUPABASE_DB_URL") || "";
const INDEX = "https://archive.sacred-texts.com/bib/boe/index.htm";
const ORIGIN = "https://archive.sacred-texts.com";
const EDITION = "charles_1917_1enoch";
const HTTP = Deno.createHttpClient({ http1: true, http2: false });

function respond(value: unknown, code = 200) {
  return Response.json(value, { status: code,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
function equalConstantTime(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, "0")).join("");
}
function exactWitnessUrl(candidate: string): string {
  const u = new URL(candidate, INDEX);
  if (u.protocol !== "https:" || u.origin !== ORIGIN || u.username || u.password ||
    u.hash || u.search || !/^\/bib\/boe\/(?:index|boe[0-9]{3})\.htm$/.test(u.pathname)) {
    throw Error("Source outside Charles 1917 pinned archive");
  }
  return u.href;
}
function labelText(raw: string) {
  return raw.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim().slice(0, 300);
}
function romanNumber(value: string): number | null {
  const s = value.toUpperCase();
  if (!/^(?=[MDCLXVI]+$)M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(s)) return null;
  const digits: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const current = digits[s[i]] || 0, next = digits[s[i + 1]] || 0;
    total += next > current ? -current : current;
  }
  return total > 0 && total <= 108 ? total : null;
}
function indexPages(html: string) {
  const seen = new Set<string>();
  const found: { url: string; label: string; chapter: number | null }[] = [];
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(re)) {
    let href: string;
    try { href = exactWitnessUrl(match[1] || ""); } catch { continue; }
    if (!/\/boe[0-9]{3}\.htm$/.test(href) || seen.has(href)) continue;
    seen.add(href);
    const label = labelText(match[2] || "");
    const cap = label.match(/\bchapter\s+([IVXLCDM]+)\b/i);
    found.push({ url: href, label, chapter: cap ? romanNumber(cap[1]) : null });
  }
  if (found.length < 105 || found.length > 150 ||
    !found.some(p => /\/boe023\.htm$/.test(p.url)) ||
    !found.some(p => /\/boe112\.htm$/.test(p.url))) {
    throw Error("Source index missing expected 1917 witness page coverage");
  }
  return found;
}
async function readPinned(url: string) {
  const exact = exactWitnessUrl(url);
  const res = await fetch(exact, {
    client: HTTP, redirect: "manual",
    signal: AbortSignal.timeout(18_000),
    headers: { accept: "text/html", "user-agent": "AKST-Witness/1917 (archival verification)" }
  });
  if (!res.ok || res.url !== exact) throw Error("source fetch HTTP " + res.status + " for pinned archive page");
  const type = res.headers.get("content-type") || "";
  if (!/text\/html|application\/xhtml\+xml/i.test(type)) throw Error("Expected source HTML, received different content type");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength < 100 || bytes.byteLength > 600_000) throw Error("Source page size outside conservative bounds");
  const charset = /charset\s*=\s*(?:iso-8859-1|windows-1252)/i.test(type) ? "windows-1252" : "utf-8";
  const html = new TextDecoder(charset).decode(bytes);
  if (!/<(?:html|body|head|title|p|h[1-6])\b/i.test(html)) throw Error("Not a recognizable source document");
  return { html, rawSha256: await sha256(bytes), rawBase64: Buffer.from(bytes).toString("base64"),
    byteCount: bytes.byteLength, contentType: type };
}
async function verifyRegistry(sql: ReturnType<typeof postgres>) {
  const rows = await sql.unsafe(
    "SELECT id,title,translator,edition_year,rights_status,rights_verified_on,ingest_status,akst_text_id FROM public.akst_source_registry WHERE title=$1 AND edition_year=1917 LIMIT 1",
    ["The Book of Enoch"]
  );
  const row = rows[0];
  if (!row || row.rights_status !== "public_domain" || !row.rights_verified_on ||
    !/Charles/i.test(row.translator || "") || row.akst_text_id ||
    !["cleared", "candidate"].includes(row.ingest_status)) {
    throw Error("Enoch source registry edition/rights/ingestion guard failed");
  }
  return row;
}
async function findRun(sql: ReturnType<typeof postgres>, registryId: string) {
  const found = await sql.unsafe(
    "SELECT * FROM akst_reconciliation.enoch_witness_stage_runs WHERE source_registry_id=$1 AND edition_key=$2 LIMIT 1",
    [registryId, EDITION]
  );
  return found[0] || null;
}
async function stageStatus(sql: ReturnType<typeof postgres>, registryId: string) {
  const run = await findRun(sql, registryId);
  if (!run) return { discovered: false, pending: 0, fetched: 0, failed: 0 };
  const aggregates = await sql.unsafe(
    "SELECT count(*)::int AS total, count(*) FILTER (WHERE acquisition_status='pending')::int AS pending, count(*) FILTER (WHERE acquisition_status='fetched')::int AS fetched, count(*) FILTER (WHERE acquisition_status='fetch_failed')::int AS failed FROM akst_reconciliation.enoch_witness_stage_pages WHERE run_id=$1",
    [run.id]
  );
  return { discovered: true, runId: run.id, state: run.state, indexPages: run.index_page_count,
    publication: run.publication_status, ...aggregates[0] };
}
Deno.serve(async req => {
  if (req.method !== "POST") return respond({ error: "POST required" }, 405);
  if (!DB) return respond({ error: "Private database is not configured" }, 503);
  const sql = postgres(DB, { max: 2, prepare: false, idle_timeout: 10, connect_timeout: 10 });
  try {
    // Never log, return or reflect the Vault secret.
    const secret = await sql.unsafe(
      "SELECT decrypted_secret AS secret FROM vault.decrypted_secrets WHERE name=$1 LIMIT 1",
      ["oracle_transport_token"]
    );
    if (!equalConstantTime(req.headers.get("x-oracle-transport-secret") || "", secret[0]?.secret || "")) {
      return respond({ error: "Unauthorized transport" }, 401);
    }
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "status";
    const registry = await verifyRegistry(sql);
    if (action === "status") return respond(await stageStatus(sql, registry.id));

    if (action === "discover") {
      const idx = await readPinned(INDEX);
      const pages = indexPages(idx.html);
      await sql.begin(async tx => {
        await tx.unsafe(
          "INSERT INTO akst_reconciliation.enoch_witness_stage_runs(source_registry_id,edition_key,index_url,index_sha256,index_raw_html,index_page_count) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(source_registry_id,edition_key) DO NOTHING",
          [registry.id, EDITION, INDEX, idx.rawSha256, idx.html, pages.length]
        );
        const run = (await tx.unsafe(
          "SELECT id,index_sha256,index_page_count FROM akst_reconciliation.enoch_witness_stage_runs WHERE source_registry_id=$1 AND edition_key=$2",
          [registry.id, EDITION]
        ))[0];
        if (run.index_sha256 !== idx.rawSha256 || run.index_page_count !== pages.length) {
          throw Error("Source index changed; human reconciliation required");
        }
        for (let i = 0; i < pages.length; i++) {
          const p = pages[i];
          await tx.unsafe(
            "INSERT INTO akst_reconciliation.enoch_witness_stage_pages(run_id,source_sequence,source_url,index_label,chapter_number) VALUES($1,$2,$3,$4,$5) ON CONFLICT(run_id,source_sequence) DO NOTHING",
            [run.id, i + 1, p.url, p.label, p.chapter]
          );
        }
      });
      return respond({ acquiredIndex: true, pagesDetected: pages.length, sha256: idx.rawSha256,
        stage: await stageStatus(sql, registry.id), PUBLICATION: "NOT_AUTHORIZED" });
    }
    if (action === "collect") {
      const run = await findRun(sql, registry.id);
      if (!run || run.state !== "collecting") return respond({ error: "No editable, initialized private acquisition run" }, 409);
      const limit = Number.isInteger(body.limit) ? Math.min(Math.max(body.limit, 1), 6) : 4;
      const candidates = await sql.unsafe(
        "SELECT id,source_url,source_sequence FROM akst_reconciliation.enoch_witness_stage_pages WHERE run_id=$1 AND acquisition_status='pending' ORDER BY source_sequence LIMIT $2",
        [run.id, limit]
      );
      let fetched = 0, failed = 0;
      for (const p of candidates) {
        try {
          const page = await readPinned(p.source_url);
          await sql.unsafe(
            "UPDATE akst_reconciliation.enoch_witness_stage_pages SET raw_html=$1,raw_content_base64=$2,raw_sha256=$3,raw_byte_count=$4,content_type=$5,acquisition_status='fetched',retrieved_at=now(),last_error=null WHERE id=$6 AND acquisition_status='pending'",
            [page.html, page.rawBase64, page.rawSha256, page.byteCount, page.contentType, p.id]
          );
          fetched++;
        } catch (error) {
          failed++;
          await sql.unsafe(
            "UPDATE akst_reconciliation.enoch_witness_stage_pages SET acquisition_status='fetch_failed',last_error=$1 WHERE id=$2 AND acquisition_status='pending'",
            [String(error instanceof Error ? error.message : error).slice(0,240),p.id]
          );
        }
      }
      const summary = await stageStatus(sql,registry.id);
      if (summary.discovered && summary.pending === 0 && summary.failed === 0 &&
        summary.fetched >= 105 && summary.fetched === summary.total) {
        await sql.unsafe(
          "UPDATE akst_reconciliation.enoch_witness_stage_runs SET state='acquired_pending_review',updated_at=now() WHERE id=$1 AND state='collecting'",
          [run.id]
        );
        return respond({ fetched, failed, stage: await stageStatus(sql,registry.id) });
      }
      return respond({ fetched, failed, stage:summary });
    }
    return respond({ error: "Unknown action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return respond({ ok: false, error: message.slice(0,260) }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});