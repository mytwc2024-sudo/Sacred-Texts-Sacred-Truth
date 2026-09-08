import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import postgres from "npm:postgres@3.4.4";
import {
  buildOracleV1,
  type OracleCitation,
  type OracleSurface,
  type OracleWell,
} from "../_shared/oracle-contract.ts";
import {
  buildShadowRuntimeFailure,
  runAkstLearningQueryPlanShadow,
} from "../_shared/oracle-query-plan-shadow-runtime.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-oracle-transport-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_DB_URL = Deno.env.get("SUPABASE_DB_URL")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

type Surface = OracleSurface;

type NativeEmbedding = {
  vector: number[] | null;
  status: "ready" | "unavailable";
  model: "gte-small";
  dimensions: 384;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const sql = postgres(SUPABASE_DB_URL, {
    prepare: true,
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
  });
  try {
    if (!(await authenticateTransport(sql, req))) {
      return json({ error: "Unauthorized Oracle transport" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const question = typeof body?.question === "string"
      ? body.question.trim()
      : "";
    const surface: Surface = body?.surface === "luminaria_client"
      ? "luminaria_client"
      : body?.surface === "akst_learning"
      ? "akst_learning"
      : body?.surface === "ankhor_internal"
      ? "ankhor_internal"
      : "internal";
    const forceEvidenceOnly = body?.evidence_only === true;
    const runShadowQueryPlan = body?.shadow_query_plan === true;

    if (!question) return json({ error: "question is required" }, 400);
    if (question.length > 4000) {
      return json({ error: "question is too long" }, 400);
    }

    const key = serviceKey();
    if (!key) return json({ error: "Oracle service access unavailable" }, 503);
    const db = createClient(SUPABASE_URL, key, {
      auth: { persistSession: false },
    });
    const searchText = expandQuestion(question);
    const embedding = await nativeEmbed(question);
    const wellsQueried: OracleWell[] = surface === "akst_learning"
      ? ["akst_ancient"]
      : ["grimoire", "akst_ancient", "sacred_writings"];

    const [grimoire, akst, sacred] = await Promise.all([
      wellsQueried.includes("grimoire")
        ? getGrimoire(db, searchText, surface)
        : Promise.resolve(skippedWell()),
      getAncient(db, searchText, embedding),
      wellsQueried.includes("sacred_writings")
        ? getSacred(db, searchText, embedding, surface)
        : Promise.resolve(skippedWell()),
    ]);

    const activeWells =
      [grimoire.hits.length, akst.hits.length, sacred.hits.length].filter((
        count,
      ) => count > 0).length;
    const evidenceState = activeWells === 3
      ? "three_well"
      : activeWells > 0
      ? "partial"
      : "insufficient";
    const citations: OracleCitation[] = [
      ...grimoire.hits.map((hit: any, index: number) => ({
        label: `G${index + 1}`,
        well: "grimoire" as const,
        title: hit.title,
        url: hit.url,
      })),
      ...akst.hits.map((hit: any, index: number) => ({
        label: `A${index + 1}`,
        well: "akst_ancient" as const,
        title: hit.title,
        url: hit.source_url || "",
      })),
      ...sacred.hits.map((hit: any, index: number) => ({
        label: `S${index + 1}`,
        well: "sacred_writings" as const,
        title: hit.title,
        section_heading: hit.section_heading,
        tier: hit.tier,
        standpoint: hit.standpoint,
      })),
    ];
    const retrieval = retrievalMetadata(embedding, akst, sacred, wellsQueried);
    const lawsApplied = laws();
    const traceId = crypto.randomUUID();

    if (evidenceState === "insufficient") {
      const answer =
        "The Oracle does not yet have enough connected evidence to answer this without inventing material. The gap is being returned explicitly.";
      const oracleV1 = buildOracleV1({
        question,
        normalizedQuery: searchText,
        surface,
        answer,
        answerMode: "evidence_only",
        generationProvider: "none",
        legacyEvidenceState: evidenceState,
        grimoire,
        ancient: akst,
        sacredWritings: sacred,
        citations,
        lawsApplied,
        legacyRetrieval: retrieval,
        traceId,
        wellsQueried,
      });
      const queryPlanShadow = runShadowQueryPlan
        ? await executeQueryPlanShadow(db, oracleV1.query_plan)
        : undefined;

      return json({
        question,
        surface,
        evidence_state: evidenceState,
        generation_provider: "none",
        grimoire,
        akst,
        sacred_writings: sacred,
        laws_applied: lawsApplied,
        ...oracleV1,
        ...(queryPlanShadow
          ? {
            diagnostics: {
              ...oracleV1.diagnostics,
              query_plan_shadow: queryPlanShadow,
            },
          }
          : {}),
      });
    }

    const grimoireContext = grimoire.hits.map((hit: any, index: number) =>
      `[G${index + 1}] ${hit.title}\n${hit.excerpt}`
    ).join("\n\n");
    const ancientContext = akst.hits.map((hit: any, index: number) =>
      `[A${index + 1}] ${hit.title}\n${hit.excerpt}`
    ).join("\n\n");
    const sacredLabeled = sacred.hits.map((hit: any, index: number) => ({
      ...hit,
      label: `S${index + 1}`,
    }));
    const sacredContext = (tier: string) =>
      sacredLabeled
        .filter((hit: any) => hit.tier === tier)
        .map((hit: any) =>
          `[${hit.label}] ${hit.title} — ${hit.section_heading} (${hit.standpoint})\n${hit.excerpt}`
        )
        .join("\n\n");

    const tierA = sacredContext("A");
    const tierB = sacredContext("B");
    const tierC = sacredContext("C");
    const clientRules = surface === "luminaria_client"
      ? `
CLIENT SURFACE:
- Reflective spiritual/educational material only; no diagnosis, treatment, legal advice, or fate prediction.
- Never give ingestion, dosing, medication, or hazardous handling instructions.
- Never expose practitioner-only notes, private inventory, client records, or forensic Tier B Sacred Writing chunks.
- Offer correspondences as possibilities for reflection, never commands.
- Keep the answer concise enough to speak aloud; text is the transcript fallback.`
      : "";

    const system = `You are The Oracle for Andre's unified retrieval system.
Laws: Non-Imposition; The Mirror; Return to Wholeness; Lineage-first only where the evidence states lineage; No fabrication; source engine, not diagnostician.
Sacred Writings are Andre/Eleara Voss's living voice layer, not ancient provenance.
Cite Grimoire as [G#], ancient Tier A evidence as [A#], and Sacred Writings as [S#]. Never use [G] or [S] to claim ancient provenance.${clientRules}

ASSEMBLY ORDER:
1) WELL 3 TIER A — METHOD / FRAMING:
${tierA || "(none)"}

2) WELL 3 TIER B — FORENSIC RECORD (internal surfaces only):
${tierB || "(none)"}

3) WELL 2 — ANCIENT TIER A EVIDENCE:
${ancientContext || "(none)"}

4) WELL 1 — GRIMOIRE WORKING LAYER:
${grimoireContext || "(none)"}

5) WELL 3 TIER C — RITE / PRACTICE:
${tierC || "(none)"}`;

    const generated = forceEvidenceOnly
      ? { text: "", provider: "none" }
      : await synthesize(system, question);
    const answer = generated.text || fallback(question, grimoire, akst, sacred);
    const answerMode = generated.text ? "generated_grounded" : "evidence_only";
    const oracleV1 = buildOracleV1({
      question,
      normalizedQuery: searchText,
      surface,
      answer,
      answerMode,
      generationProvider: generated.provider,
      legacyEvidenceState: evidenceState,
      grimoire,
      ancient: akst,
      sacredWritings: sacred,
      citations,
      lawsApplied,
      legacyRetrieval: retrieval,
      traceId,
      wellsQueried,
    });
    const queryPlanShadow = runShadowQueryPlan
      ? await executeQueryPlanShadow(db, oracleV1.query_plan)
      : undefined;

    return json({
      question,
      surface,
      generation_provider: generated.provider,
      evidence_state: evidenceState,
      grimoire,
      akst,
      sacred_writings: sacred,
      laws_applied: lawsApplied,
      ...oracleV1,
      ...(queryPlanShadow
        ? {
          diagnostics: {
            ...oracleV1.diagnostics,
            query_plan_shadow: queryPlanShadow,
          },
        }
        : {}),
    });
  } catch (error) {
    console.error("oracle-query", error);
    return json({
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});

function skippedWell() {
  return {
    status: "skipped",
    retrieval_mode: "not_queried",
    hits: [] as any[],
  };
}

function retrievalMetadata(
  embedding: NativeEmbedding,
  akst: any,
  sacred: any,
  wellsQueried: OracleWell[],
) {
  return {
    asking_point: "oracle-query",
    embedding_count: embedding.vector ? 1 : 0,
    embedding_status: embedding.status,
    embedding_model: embedding.model,
    embedding_dimensions: embedding.dimensions,
    requested_wells: wellsQueried,
    well_1: "akst_correspondences — Oracle safety projection",
    well_2: `Tier A only — ${
      akst.retrieval_mode || "lexical"
    }; lexical fallback retained`,
    well_3: `sacred_writings_chunks — ${
      sacred.retrieval_mode || "lexical"
    }; standpoint-gated; lexical fallback retained`,
    canonical_editorial_authority: "Notion",
    runtime_authority: "AKST Supabase",
  };
}

async function executeQueryPlanShadow(
  db: ReturnType<typeof createClient>,
  plan: Parameters<typeof runAkstLearningQueryPlanShadow>[0],
) {
  try {
    return await runAkstLearningQueryPlanShadow(plan, {
      retrieveAncient: async (question) => {
        const embedding = await nativeEmbed(question);
        return await getAncient(db, question, embedding);
      },
      loadSourceMetadata: async (textIds) => {
        const { data, error } = await db
          .from("akst_texts")
          .select(
            "id,title,tradition_id,estimated_date,original_language,translator,source_name,source_url,source_file_name,source_format,source_acquired_at,work_key,witness_key,verification_status,rights_status,content_tier,is_public",
          )
          .in("id", textIds)
          .eq("is_public", true)
          .eq("content_tier", "A")
          .in("rights_status", ["public_domain", "rights_cleared"]);

        if (error) {
          throw new Error("shadow source metadata lookup failed");
        }
        return data ?? [];
      },
    });
  } catch (error) {
    console.error("Oracle query-plan shadow", error);
    return buildShadowRuntimeFailure(plan);
  }
}

async function authenticateTransport(
  sql: ReturnType<typeof postgres>,
  req: Request,
) {
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
  for (let index = 0; index < a.length; index++) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

function serviceKey() {
  const direct = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_SECRET_KEY");
  if (direct) return direct;
  try {
    return Object.values(
      JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"),
    )[0] as string | undefined;
  } catch {
    return undefined;
  }
}

function laws() {
  return [
    "Non-Imposition",
    "The Mirror",
    "Return to Wholeness",
    "Lineage-first",
    "No fabrication",
    "Source engine, not diagnostician",
  ];
}

async function nativeEmbed(input: string): Promise<NativeEmbedding> {
  try {
    const model = new Supabase.ai.Session("gte-small");
    const raw = await model.run(input.slice(0, 4200), {
      mean_pool: true,
      normalize: true,
    });
    const vector = Array.from(raw as ArrayLike<number>);
    if (vector.length !== 384 || !vector.every(Number.isFinite)) {
      throw new Error(`invalid native embedding (${vector.length})`);
    }
    return { vector, status: "ready", model: "gte-small", dimensions: 384 };
  } catch (error) {
    console.error("Oracle native embedding", error);
    return {
      vector: null,
      status: "unavailable",
      model: "gte-small",
      dimensions: 384,
    };
  }
}

async function getGrimoire(
  db: ReturnType<typeof createClient>,
  query: string,
  surface: Surface,
) {
  const { data, error } = await db.rpc("search_oracle_correspondences", {
    query_text: query,
    client_safe: surface === "luminaria_client",
    match_count: 8,
  });
  if (error) {
    console.error("Grimoire RPC", error);
    return { status: "error", hits: [] };
  }
  const hits = (data || []).map((row: any) => ({
    id: row.correspondence_id,
    title: row.name,
    url: row.notion_url || "",
    score: row.score,
    excerpt: [
      row.properties_text && `Properties: ${row.properties_text}`,
      row.spiritual_connotations && `Spiritual: ${row.spiritual_connotations}`,
      row.planet && `Planet: ${row.planet}`,
      row.element && `Element: ${row.element}`,
      row.best_moon_phase && `Moon phase: ${row.best_moon_phase}`,
      Array.isArray(row.tradition) && row.tradition.length &&
      `Tradition: ${row.tradition.join(", ")}`,
      row.safety_class && `Safety: ${row.safety_class}`,
      row.ritual_use_only && "Ritual use only",
    ].filter(Boolean).join(" | "),
  }));
  return { status: hits.length ? "grounded" : "empty", hits };
}

async function getAncient(
  db: ReturnType<typeof createClient>,
  query: string,
  embedding: NativeEmbedding,
) {
  let vectorStatus = embedding.status;
  if (embedding.vector) {
    const { data, error } = await db.rpc("match_ancient_chunks_gte", {
      query_embedding: embedding.vector,
      match_threshold: 0.30,
      match_count: 8,
    });
    if (!error && data?.length) {
      return {
        status: "grounded",
        retrieval_mode: "native_vector",
        vector_status: "ready",
        hits: data.map(ancientHit),
      };
    }
    vectorStatus = error ? "vector_error" : "no_vector_matches";
    if (error) console.error("Ancient native vector RPC", error);
  }

  const { data, error } = await db.rpc("search_oracle_ancient_lexical", {
    query_text: query,
    match_count: 8,
  });
  if (error) {
    console.error("Ancient lexical RPC", error);
    return {
      status: "error",
      retrieval_mode: "lexical",
      vector_status: vectorStatus,
      hits: [],
    };
  }
  return {
    status: data?.length ? "grounded" : "empty",
    retrieval_mode: "lexical",
    vector_status: vectorStatus,
    hits: (data || []).map(ancientHit),
  };
}

function ancientHit(row: any) {
  return {
    id: row.chunk_id,
    text_id: row.text_id,
    title: row.text_title,
    author: row.author || null,
    excerpt: row.content,
    source_name: row.source_name || null,
    source_url: row.source_url || "",
    content_tier: row.content_tier,
    rights_status: row.rights_status,
    score: Number(row.score ?? row.similarity ?? 0),
  };
}

async function getSacred(
  db: ReturnType<typeof createClient>,
  query: string,
  embedding: NativeEmbedding,
  surface: Surface,
) {
  let rows: any[] = [];
  let retrievalMode = "lexical";
  let vectorStatus = embedding.status;

  if (embedding.vector) {
    const { data, error } = await db.rpc("match_sacred_writings_gte", {
      query_embedding: embedding.vector,
      match_threshold: 0.30,
      match_count: 16,
    });
    if (!error && data?.length) {
      rows = data;
      retrievalMode = "native_vector";
      vectorStatus = "ready";
    } else {
      vectorStatus = error ? "vector_error" : "no_vector_matches";
      if (error) console.error("Sacred native vector RPC", error);
    }
  }

  if (!rows.length) {
    const { data, error } = await db.rpc("search_sacred_writings_lexical", {
      query_text: query,
      match_count: 16,
    });
    if (error) {
      console.error("Sacred lexical RPC", error);
      return {
        status: "error",
        retrieval_mode: "lexical",
        vector_status: vectorStatus,
        hits: [],
      };
    }
    rows = data || [];
  }

  if (surface === "luminaria_client") {
    rows = rows.filter((row: any) => String(row.tier) !== "B");
  }
  rows = rows.slice(0, 8);

  const hits = rows.map((row: any) => ({
    id: row.chunk_id,
    page_id: row.page_id,
    title: row.page_title,
    tier: String(row.tier),
    section_heading: row.section_heading,
    standpoint: String(row.standpoint),
    figure: row.figure || null,
    era: row.era || null,
    element: row.element || null,
    phase: row.phase || null,
    byline: row.byline || "Eleara Voss",
    url: `https://app.notion.com/${String(row.page_id).replace(/-/g, "")}`,
    excerpt: row.content,
    score: Number(row.score ?? row.similarity ?? 0),
  }));

  const tierRank: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
  hits.sort((left: any, right: any) =>
    (tierRank[left.tier] ?? 9) - (tierRank[right.tier] ?? 9) ||
    right.score - left.score
  );

  return {
    status: hits.length ? "grounded" : "empty",
    retrieval_mode: retrievalMode,
    vector_status: vectorStatus,
    hits,
    evidence_class: "standpoint-gated Sacred Writings runtime",
  };
}

function expandQuestion(question: string) {
  const terms = [question];
  const lower = question.toLowerCase();
  if (/sky|celestial|astrolog|moon|lunar/.test(lower)) {
    terms.push("moon lunar sun solar planet planetary celestial sky");
  }
  if (/love|relationship|romance/.test(lower)) {
    terms.push("love venus heart relationship");
  }
  if (/money|prosper|abundance/.test(lower)) {
    terms.push("money prosperity abundance luck jupiter");
  }
  if (/protect|banish|reversal|hex/.test(lower)) {
    terms.push("protection ward banish reversal hex");
  }
  if (/mother|maternal|woman|women|womb/.test(lower)) {
    terms.push("mother womb woman women return wholeness");
  }
  return terms.join(" ");
}

async function synthesize(system: string, question: string) {
  const messages = [{ role: "system", content: system }, {
    role: "user",
    content: question,
  }];

  if (LOVABLE_API_KEY) {
    try {
      const response = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages,
          }),
        },
      );
      if (response.ok) {
        return {
          text: (await response.json()).choices?.[0]?.message?.content || "",
          provider: "lovable",
        };
      }
    } catch (error) {
      console.error("Lovable synthesis", error);
    }
  }

  if (OPENAI_API_KEY) {
    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model: "gpt-4o-mini", messages }),
        },
      );
      if (response.ok) {
        return {
          text: (await response.json()).choices?.[0]?.message?.content || "",
          provider: "openai",
        };
      }
    } catch (error) {
      console.error("OpenAI synthesis", error);
    }
  }

  return { text: "", provider: "none" };
}

function fallback(question: string, grimoire: any, ancient: any, sacred: any) {
  const parts = [
    `For “${question},” the Oracle found source evidence and is returning it without inventing a synthesis.`,
  ];
  if (sacred.hits.length) {
    const tiers = Object.entries(
      sacred.hits.reduce((acc: Record<string, number>, hit: any) => {
        acc[hit.tier] = (acc[hit.tier] || 0) + 1;
        return acc;
      }, {}),
    ).map(([tier, count]) => `${tier}:${count}`).join(", ");
    parts.push(
      `Sacred Writings returned ${sacred.hits.length} standpoint-gated sections [S]${
        tiers ? ` across tiers ${tiers}` : ""
      }.`,
    );
  }
  if (ancient.hits.length) {
    parts.push(
      `The Tier A ancient corpus returned ${ancient.hits.length} passage${
        ancient.hits.length === 1 ? "" : "s"
      } [A].`,
    );
  } else parts.push("No Tier A ancient passage matched this question.");
  if (grimoire.hits.length) {
    parts.push(
      `The Grimoire returned ${grimoire.hits.length} correspondence${
        grimoire.hits.length === 1 ? "" : "s"
      } [G].`,
    );
  }
  parts.push(
    "No fate, diagnosis, or unsupported lineage claim is being asserted; use the cited sources as a mirror for your own knowing.",
  );
  return parts.join(" ");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
