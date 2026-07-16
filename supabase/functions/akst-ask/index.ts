// AKST "Ask" Edge Function (Deno / Supabase Edge Runtime).
//
// POST { question: string } -> { answer, sources }
//
// Pipeline:
//   1. Embed the question with OpenAI (text-embedding-3-small, 1536 dims).
//   2. Call akst_search_similar_chunks() to retrieve the most relevant passages.
//   3. Ask a chat model to answer using ONLY those passages, with citations.
//
// Deploy from the pipeline repo:
//   supabase functions deploy akst-ask --project-ref xhzyavyftgyqzftlqdlz
//   supabase secrets set OPENAI_API_KEY=sk-... --project-ref xhzyavyftgyqzftlqdlz
// SUPABASE_URL and SUPABASE_ANON_KEY are injected automatically.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

async function embed(text: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.data[0].embedding as number[];
}

async function synthesize(question: string, passages: { text_title: string; content: string }[]) {
  const context = passages
    .map((p, i) => `[${i + 1}] (${p.text_title})\n${p.content}`)
    .join('\n\n');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'You are AKST, a scholarly guide to the world\'s sacred texts. Answer the ' +
            'question using ONLY the numbered passages provided. Cite sources inline as ' +
            '[1], [2]. If the passages do not contain the answer, say so plainly. Be ' +
            'respectful and comparative across traditions where relevant.',
        },
        { role: 'user', content: `Question: ${question}\n\nPassages:\n${context}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI chat ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content as string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const { question } = await req.json();
    if (!question || typeof question !== 'string') {
      return json({ error: 'Body must be { question: string }' }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const queryEmbedding = await embed(question);
    const { data: sources, error } = await supabase.rpc('akst_search_similar_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: 0.5,
      match_count: 5,
    });
    if (error) throw error;

    if (!sources || sources.length === 0) {
      return json({ answer: 'No relevant passages found yet. Try another question once more texts are ingested.', sources: [] });
    }

    const answer = await synthesize(question, sources);
    return json({ answer, sources });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
