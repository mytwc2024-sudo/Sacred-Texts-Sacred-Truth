import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-akst-editorial-secret, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EDITORIAL_SECRET = Deno.env.get("AKST_EDITORIAL_SYNC_SECRET");

type WisdomStepInput = {
  position: number;
  stage: "encounter" | "explore" | "reflect" | "integrate" | "practice" | "share";
  title: string;
  summary?: string;
  source_refs?: unknown[];
  concept_refs?: unknown[];
  tradition_refs?: unknown[];
  ai_context?: Record<string, unknown>;
  narration_text?: string;
  reflection_prompt?: string;
  check_understanding?: unknown[];
};

type WisdomPathInput = {
  notion_page_id: string;
  notion_url?: string;
  editorial_version?: string;
  editorial_status: "draft" | "review" | "approved" | "retired";
  slug: string;
  title: string;
  summary?: string;
  domain_slug: string;
  learning_objectives?: unknown[];
  tags?: unknown[];
  steps?: WisdomStepInput[];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  try {
    if (!EDITORIAL_SECRET) return json({ error: "editorial sync is not configured" }, 503);
    const presented = req.headers.get("x-akst-editorial-secret");
    if (!presented || presented !== EDITORIAL_SECRET) return json({ error: "unauthorized" }, 401);

    const input = (await req.json()) as WisdomPathInput;
    validate(input);

    const publishable = input.editorial_status === "approved";
    const hash = await sha256(JSON.stringify(input));
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const { data: sourceRow, error: sourceError } = await db
      .from("akst_editorial_sources")
      .upsert({
        notion_page_id: input.notion_page_id,
        notion_url: input.notion_url ?? null,
        entity_type: "wisdom_path",
        entity_key: input.slug,
        content_hash: hash,
        sync_status: "synced",
        editorial_status: input.editorial_status,
        metadata: { editorial_version: input.editorial_version ?? null },
        last_synced_at: new Date().toISOString(),
      }, { onConflict: "notion_page_id" })
      .select("id")
      .single();
    if (sourceError) throw sourceError;

    const { data: path, error: pathError } = await db
      .from("akst_wisdom_paths")
      .upsert({
        slug: input.slug,
        title: input.title,
        summary: input.summary ?? null,
        domain_slug: input.domain_slug,
        status: input.editorial_status === "approved" ? "published" : input.editorial_status === "review" ? "review" : input.editorial_status === "retired" ? "archived" : "draft",
        is_public: publishable,
        notion_page_id: input.notion_page_id,
        notion_url: input.notion_url ?? null,
        editorial_version: input.editorial_version ?? null,
        learning_objectives: input.learning_objectives ?? [],
        tags: input.tags ?? [],
      }, { onConflict: "slug" })
      .select("id,slug,status,is_public")
      .single();
    if (pathError) throw pathError;

    if (Array.isArray(input.steps)) {
      const positions = new Set<number>();
      for (const step of input.steps) {
        if (positions.has(step.position)) throw new Error(`duplicate step position: ${step.position}`);
        positions.add(step.position);
      }
      const { error: deleteError } = await db.from("akst_wisdom_steps").delete().eq("path_id", path.id);
      if (deleteError) throw deleteError;
      if (input.steps.length) {
        const { error: stepsError } = await db.from("akst_wisdom_steps").insert(input.steps.map((step) => ({
          path_id: path.id,
          position: step.position,
          stage: step.stage,
          title: step.title,
          summary: step.summary ?? null,
          source_refs: step.source_refs ?? [],
          concept_refs: step.concept_refs ?? [],
          tradition_refs: step.tradition_refs ?? [],
          ai_context: step.ai_context ?? {},
          narration_text: step.narration_text ?? null,
          reflection_prompt: step.reflection_prompt ?? null,
          check_understanding: step.check_understanding ?? [],
        })));
        if (stepsError) throw stepsError;
      }
    }

    return json({
      synced: true,
      editorial_source_id: sourceRow.id,
      path,
      source_boundary: "Curriculum sync does not grant source publication rights. AI retrieval remains separately rights-gated.",
    });
  } catch (error) {
    console.error("akst-editorial-sync", error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});

function validate(input: WisdomPathInput) {
  if (!input?.notion_page_id) throw new Error("notion_page_id is required");
  if (!input.slug || !/^[a-z0-9-]+$/.test(input.slug)) throw new Error("valid slug is required");
  if (!input.title?.trim()) throw new Error("title is required");
  if (!input.domain_slug?.trim()) throw new Error("domain_slug is required");
  if (!["draft", "review", "approved", "retired"].includes(input.editorial_status)) throw new Error("invalid editorial_status");
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
