-- HISTORICAL RUNTIME EVIDENCE — DO NOT AUTO-APPLY
-- Recovered from app-forge-studio-78/agent/oracle-nervous-system.
-- Stage 2.0 verification: GTE columns, HNSW indexes, vector RPCs, and internal worker/drain dispatchers match live runtime as of 2026-09-06.

alter table public.akst_text_chunks add column if not exists embedding_gte public.vector(384);
alter table public.sacred_writings_chunks add column if not exists embedding_gte public.vector(384);

create index if not exists akst_text_chunks_embedding_gte_hnsw
  on public.akst_text_chunks using hnsw (embedding_gte public.vector_ip_ops);
create index if not exists sacred_writings_chunks_embedding_gte_hnsw
  on public.sacred_writings_chunks using hnsw (embedding_gte public.vector_ip_ops);

create or replace function public.match_ancient_chunks_gte(
  query_embedding public.vector(384),
  match_threshold double precision default 0.30,
  match_count integer default 8
)
returns table(
  chunk_id uuid,
  text_id uuid,
  text_title text,
  author text,
  content text,
  source_name text,
  source_url text,
  content_tier text,
  rights_status text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  select p.chunk_id,p.text_id,p.text_title,p.author,p.content,p.source_name,p.source_url,p.content_tier,p.rights_status,
    (-(c.embedding_gte <#> query_embedding))::double precision as similarity
  from public.akst_text_chunks c
  join public.akst_publishable_chunks p on p.chunk_id = c.id
  where p.content_tier = 'A'
    and c.embedding_gte is not null
    and (-(c.embedding_gte <#> query_embedding)) >= match_threshold
  order by c.embedding_gte <#> query_embedding asc
  limit least(greatest(match_count,1),50);
$$;

create or replace function public.match_sacred_writings_gte(
  query_embedding public.vector(384),
  match_threshold double precision default 0.30,
  match_count integer default 8
)
returns table(
  chunk_id uuid,
  page_id text,
  page_title text,
  tier public.sacred_writing_tier,
  section_heading text,
  content text,
  standpoint public.sacred_writing_standpoint,
  figure text,
  era text,
  element text,
  phase text,
  byline text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  select p.chunk_id,p.page_id,p.page_title,p.tier,p.section_heading,p.content,p.standpoint,p.figure,p.era,p.element,p.phase,p.byline,
    (-(c.embedding_gte <#> query_embedding))::double precision as similarity
  from public.sacred_writings_chunks c
  join public.sacred_writings_publishable p on p.chunk_id = c.id
  where c.embedding_gte is not null
    and (-(c.embedding_gte <#> query_embedding)) >= match_threshold
  order by c.embedding_gte <#> query_embedding asc
  limit least(greatest(match_count,1),50);
$$;

revoke all on function public.match_ancient_chunks_gte(public.vector,double precision,integer) from public,anon,authenticated;
revoke all on function public.match_sacred_writings_gte(public.vector,double precision,integer) from public,anon,authenticated;
grant execute on function public.match_ancient_chunks_gte(public.vector,double precision,integer) to service_role;
grant execute on function public.match_sacred_writings_gte(public.vector,double precision,integer) to service_role;

create schema if not exists oracle_internal;
revoke all on schema oracle_internal from public,anon,authenticated;
grant usage on schema oracle_internal to service_role;

create or replace function oracle_internal.kick_native_embedding_worker(p_batch_size integer default 4)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog,public,vault,net
as $$
declare v_secret text; v_request_id bigint;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='oracle_transport_token' limit 1;
  if v_secret is null or length(v_secret)=0 then raise exception 'oracle transport secret unavailable'; end if;
  select net.http_post(
    url := 'https://xhzyavyftgyqzftlqdlz.supabase.co/functions/v1/native-embedding-worker',
    body := jsonb_build_object('batch_size',least(greatest(coalesce(p_batch_size,4),1),6)),
    params := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json','x-oracle-transport-secret',v_secret),
    timeout_milliseconds := 60000
  ) into v_request_id;
  return v_request_id;
end;
$$;

create or replace function oracle_internal.kick_native_embedding_drain(p_max_batches integer default 4)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog,public,vault,net
as $$
declare v_secret text; v_request_id bigint;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='oracle_transport_token' limit 1;
  if v_secret is null or length(v_secret)=0 then raise exception 'oracle transport secret unavailable'; end if;
  select net.http_post(
    url := 'https://xhzyavyftgyqzftlqdlz.supabase.co/functions/v1/native-embedding-drain',
    body := jsonb_build_object('max_batches',least(greatest(coalesce(p_max_batches,4),1),20)),
    params := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json','x-oracle-transport-secret',v_secret),
    timeout_milliseconds := 120000
  ) into v_request_id;
  return v_request_id;
end;
$$;

revoke all on function oracle_internal.kick_native_embedding_worker(integer) from public,anon,authenticated;
revoke all on function oracle_internal.kick_native_embedding_drain(integer) from public,anon,authenticated;
grant execute on function oracle_internal.kick_native_embedding_worker(integer) to service_role;
grant execute on function oracle_internal.kick_native_embedding_drain(integer) to service_role;
