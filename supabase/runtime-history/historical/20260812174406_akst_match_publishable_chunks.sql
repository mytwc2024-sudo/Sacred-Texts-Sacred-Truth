-- HISTORICAL RUNTIME EVIDENCE — DO NOT AUTO-APPLY
-- Recovered from app-forge-studio-78/agent/oracle-nervous-system.
-- Stage 2.0 verification: logic matches live public.match_chunks as of 2026-09-06.

create or replace function public.match_chunks(
  query_embedding vector(1536),
  match_threshold double precision default 0.35,
  match_count integer default 8
)
returns table (
  chunk_id uuid,
  text_id uuid,
  chunk_index integer,
  content text,
  chapter_title text,
  section_title text,
  verse_number text,
  word_count integer,
  text_title text,
  author text,
  translator text,
  content_tier text,
  rights_status text,
  source_name text,
  source_url text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.chunk_id,
    p.text_id,
    p.chunk_index,
    p.content,
    p.chapter_title,
    p.section_title,
    p.verse_number,
    p.word_count,
    p.text_title,
    p.author,
    p.translator,
    p.content_tier,
    p.rights_status,
    p.source_name,
    p.source_url,
    (1 - (c.embedding <=> query_embedding))::double precision as similarity
  from public.akst_publishable_chunks p
  join public.akst_text_chunks c on c.id = p.chunk_id
  where c.embedding is not null
    and (1 - (c.embedding <=> query_embedding)) >= match_threshold
  order by c.embedding <=> query_embedding
  limit greatest(1, least(coalesce(match_count, 8), 50));
$$;

comment on function public.match_chunks(vector, double precision, integer) is
'Rights-gated semantic retrieval for AKST. Returned content comes only from akst_publishable_chunks; raw chunk content is never returned outside the publishable boundary.';

revoke all on function public.match_chunks(vector, double precision, integer) from public;
revoke all on function public.match_chunks(vector, double precision, integer) from anon;
revoke all on function public.match_chunks(vector, double precision, integer) from authenticated;
grant execute on function public.match_chunks(vector, double precision, integer) to service_role;
