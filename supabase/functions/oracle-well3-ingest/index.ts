import postgres from "npm:postgres@3.4.4";

const DB = Deno.env.get("SUPABASE_DB_URL")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-oracle-transport-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SOURCE_TIERS: Record<string, "A" | "B" | "C"> = {
  "3bc7d9c1-66ab-810e-b7c0-fdded4c2d1c9": "A",
  "3bc7d9c1-66ab-8187-bc90-cb1f29ded786": "A",
  "3bc7d9c1-66ab-81e3-96b0-fe4b5fd8710f": "A",
  "3b97d9c1-66ab-8142-b487-c59503972939": "A",
  "3b37d9c1-66ab-81fd-adb4-e76d725ea3ea": "A",
  "3bc7d9c1-66ab-81a6-abb0-d73061d86053": "B",
  "3bd7d9c1-66ab-814a-abe0-d8caaab6f5e0": "B",
  "3bd7d9c1-66ab-8123-b487-fc00709040f3": "B",
  "3b37d9c1-66ab-81a9-b78a-d0f18d896ac1": "B",
  "3bc7d9c1-66ab-811a-bd93-e13bbd73156e": "C",
  "3bd7d9c1-66ab-81ba-8f2a-fa3c23487cae": "C",
};
const STANDPOINTS = new Set(["sourced_record", "labeled_inference", "andre_standpoint", "rite_text"]);

type Section = {
  section_heading: string;
  content: string;
  standpoint: string;
  figure?: string | null;
  era?: string | null;
  element?: string | null;
  phase?: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const sql = postgres(DB, { prepare: true, max: 2, idle_timeout: 5, connect_timeout: 10 });
  try {
    if (!(await auth(sql, req))) return json({ error: "Unauthorized Oracle transport" }, 401);
    const body = await req.json().catch(() => ({}));
    const pageId = normalizeId(String(body?.page_id || ""));
    const pageTitle = String(body?.page_title || "").trim();
    const requestedTier = String(body?.tier || "").toUpperCase();
    const tier = SOURCE_TIERS[pageId];
    if (!tier || requestedTier !== tier) return json({ error: "Page is not in the canonical Well 3 registry or tier mismatch" }, 400);
    if (!pageTitle) return json({ error: "page_title is required" }, 400);
    const rawSections: Section[] = Array.isArray(body?.sections) ? body.sections : [];

    const accepted: Section[] = [];
    const rejected: Array<{ heading: string; reason: string }> = [];
    for (const raw of rawSections) {
      const section = {
        section_heading: String(raw?.section_heading || "").trim(),
        content: String(raw?.content || "").trim(),
        standpoint: String(raw?.standpoint || "").trim(),
        figure: raw?.figure ? String(raw.figure).trim() : null,
        era: raw?.era ? String(raw.era).trim() : null,
        element: raw?.element ? String(raw.element).trim() : null,
        phase: raw?.phase ? String(raw.phase).trim() : null,
      };
      if (!section.section_heading || !section.content) {
        rejected.push({ heading: section.section_heading || "(missing)", reason: "missing heading/content" });
        continue;
      }
      if (!STANDPOINTS.has(section.standpoint)) {
        rejected.push({ heading: section.section_heading, reason: "standpoint undetermined or invalid" });
        continue;
      }
      accepted.push(section);
    }

    const vectors: Array<number[] | null> = [];
    let embeddingStatus = OPENAI_API_KEY ? "attempted" : "provider_unconfigured";
    for (const section of accepted) {
      if (!OPENAI_API_KEY) { vectors.push(null); continue; }
      try { vectors.push(await embed(`${pageTitle}\n${section.section_heading}\n${section.content}`)); }
      catch (e) {
        console.error("Well 3 embedding", pageId, section.section_heading, e);
        vectors.push(null);
        embeddingStatus = "partial_or_failed";
      }
    }

    await sql.begin(async (tx) => {
      await tx`delete from public.sacred_writings_chunks where page_id = ${pageId}`;
      for (let i = 0; i < accepted.length; i++) {
        const s = accepted[i];
        const vector = vectors[i];
        await tx`
          insert into public.sacred_writings_chunks(
            page_id,page_title,tier,section_heading,content,standpoint,figure,era,element,phase,byline,embedding,updated_at
          ) values (
            ${pageId},${pageTitle},${tier}::public.sacred_writing_tier,${s.section_heading},${s.content},
            ${s.standpoint}::public.sacred_writing_standpoint,${s.figure},${s.era},${s.element},${s.phase},'Eleara Voss',
            ${vector ? `[${vector.join(",")}]` : null}::vector,now()
          )
        `;
      }
    });

    return json({
      ok: true,
      page_id: pageId,
      page_title: pageTitle,
      tier,
      accepted_chunks: accepted.length,
      rejected_chunks: rejected.length,
      embedded_chunks: vectors.filter(Boolean).length,
      embedding_status: embeddingStatus,
      rejected,
    });
  } catch (e) {
    console.error("oracle-well3-ingest", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  } finally { await sql.end({ timeout: 5 }); }
});

async function auth(sql: ReturnType<typeof postgres>, req: Request) {
  const incoming = req.headers.get("x-oracle-transport-secret") || "";
  if (!incoming) return false;
  const rows = await sql<{secret:string}[]>`select decrypted_secret as secret from vault.decrypted_secrets where name='oracle_transport_token' limit 1`;
  return safeEqual(incoming, rows[0]?.secret || "");
}
function safeEqual(a:string,b:string){if(!a||!b||a.length!==b.length)return false;let m=0;for(let i=0;i<a.length;i++)m|=a.charCodeAt(i)^b.charCodeAt(i);return m===0;}
function normalizeId(id:string){const x=id.replace(/-/g,"").toLowerCase();return x.length===32?`${x.slice(0,8)}-${x.slice(8,12)}-${x.slice(12,16)}-${x.slice(16,20)}-${x.slice(20)}`:id.toLowerCase();}
async function embed(input:string){
  const r=await fetch("https://api.openai.com/v1/embeddings",{method:"POST",headers:{Authorization:`Bearer ${OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:"text-embedding-3-small",input})});
  if(!r.ok) throw new Error(`embedding provider failed (${r.status})`);
  const v=(await r.json())?.data?.[0]?.embedding;
  if(!Array.isArray(v)||v.length!==1536) throw new Error("embedding dimension mismatch");
  return v as number[];
}
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});}
