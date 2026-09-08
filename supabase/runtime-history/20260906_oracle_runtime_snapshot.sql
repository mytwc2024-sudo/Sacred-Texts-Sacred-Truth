-- AKST ORACLE LIVE RUNTIME SNAPSHOT — 2026-09-06
-- HISTORICAL / RECONCILIATION EVIDENCE ONLY. DO NOT AUTO-APPLY.
-- Definitions below were read from the governed Supabase runtime during Stage 2.0.
-- This file captures live definitions not completely represented by the preserved 2026-08 historical migration files.

-- -----------------------------------------------------------------------------
-- Live lexical retrieval: ancient Tier A
-- -----------------------------------------------------------------------------
create or replace function public.search_oracle_ancient_lexical(query_text text, match_count integer default 8)
returns table(chunk_id uuid, text_id uuid, content text, text_title text, author text, translator text, source_name text, source_url text, content_tier text, rights_status text, score integer)
language sql
stable
set search_path = public
as $$
  with terms as (
    select distinct t as term
    from unnest(regexp_split_to_array(lower(coalesce(query_text,'')), '[^a-z0-9]+')) t
    where length(t) > 2
      and t not in ('the','and','for','with','from','that','this','does','how','what','today','into','your','their','our','are','was','were','relate','relates','knowledge','ancient')
  ), ranked as (
    select p.*,
      count(*) filter (where lower(concat_ws(' ',p.text_title,p.author,p.content,p.chapter_title,p.section_title)) like '%' || terms.term || '%')::integer as score
    from public.akst_publishable_chunks p
    cross join terms
    where p.content_tier = 'A'
    group by p.chunk_id,p.text_id,p.chunk_index,p.content,p.chapter_title,p.section_title,p.verse_number,p.word_count,p.text_title,p.author,p.translator,p.content_tier,p.rights_status,p.source_name,p.source_url
  )
  select chunk_id,text_id,content,text_title,author,translator,source_name,source_url,content_tier,rights_status,score
  from ranked
  where score > 0
  order by score desc, text_title, chunk_id
  limit greatest(1, least(coalesce(match_count,8),50));
$$;

-- Observed 2026-09-06: anon=true, authenticated=true, service_role=true.

-- -----------------------------------------------------------------------------
-- Live correspondence retrieval / Grimoire safety projection
-- -----------------------------------------------------------------------------
create or replace function public.search_oracle_correspondences(query_text text, client_safe boolean default false, match_count integer default 8)
returns table(correspondence_id uuid, name text, properties_text text, spiritual_connotations text, planet text, element text, best_moon_phase text, tradition text[], safety_class text, ritual_use_only boolean, notion_url text, score integer)
language sql
stable
set search_path = public
as $$
  with terms as (
    select distinct t as term
    from unnest(regexp_split_to_array(lower(coalesce(query_text,'')), '[^a-z0-9]+')) t
    where length(t) > 2
      and t not in ('the','and','for','with','from','that','this','does','how','what','today','into','your','their','our','are','was','were','relate','relates','knowledge','ancient')
  ), safe as (
    select c.*
    from public.akst_correspondences c
    where not client_safe
       or (
         coalesce(c.toxic,false) = false
         and coalesce(c.condition,'') not ilike 'Discard%'
         and coalesce(c.safety_class,'') not in ('Deadly — Do Not Handle Casually','Do Not Ingest','Do Not Burn Indoors','Medication Interaction')
       )
  ), ranked as (
    select c.id,c.name,c.properties_text,c.spiritual_connotations,c.planet,c.element,c.best_moon_phase,c.tradition,c.safety_class,c.ritual_use_only,c.notion_url,
      count(*) filter (where lower(concat_ws(' ',c.name,c.properties_text,c.spiritual_connotations,c.planet,c.element,c.best_moon_phase,array_to_string(c.tradition,' '))) like '%' || terms.term || '%')::integer as score
    from safe c
    cross join terms
    group by c.id,c.name,c.properties_text,c.spiritual_connotations,c.planet,c.element,c.best_moon_phase,c.tradition,c.safety_class,c.ritual_use_only,c.notion_url
  )
  select id,name,properties_text,spiritual_connotations,planet,element,best_moon_phase,tradition,safety_class,ritual_use_only,notion_url,score
  from ranked where score > 0
  order by score desc,name
  limit greatest(1, least(coalesce(match_count,8),50));
$$;

-- Observed 2026-09-06: anon=true, authenticated=true, service_role=true.

-- -----------------------------------------------------------------------------
-- Legacy Sacred Writings own-IP lexical lane
-- -----------------------------------------------------------------------------
create or replace function public.search_oracle_sacred_writings(query_text text, match_count integer default 6)
returns table(chunk_id uuid, text_id uuid, title text, author text, content text, source_url text, score integer)
language sql
stable
set search_path = public
as $$
  with allowed_urls(url) as (
    values
      ('https://app.notion.com/p/3b37d9c166ab81fdadb4e76d725ea3ea?pvs=204'::text),
      ('https://app.notion.com/p/3b97d9c166ab8142b487c59503972939?pvs=204'::text),
      ('https://app.notion.com/p/3b17d9c166ab81d09fe8dd9f76c3d4cc?pvs=204'::text)
  ), terms as (
    select distinct t as term
    from unnest(regexp_split_to_array(lower(coalesce(query_text,'')), '[^a-z0-9]+')) t
    where length(t) > 2
      and t not in ('the','and','for','with','from','that','this','does','how','what','today','into','your','their','our','are','was','were','relate','relates','knowledge','ancient')
  ), ranked as (
    select c.id as chunk_id,t.id as text_id,t.title,t.author,c.content,t.source_url,
      count(*) filter (where lower(concat_ws(' ',t.title,t.author,c.content)) like '%' || terms.term || '%')::integer as score
    from public.akst_texts t
    join allowed_urls a on a.url=t.source_url
    join public.akst_text_chunks c on c.text_id=t.id
    cross join terms
    where t.content_tier='C' and t.rights_status='own_ip'
    group by c.id,t.id,t.title,t.author,c.content,t.source_url
  )
  select chunk_id,text_id,title,author,content,source_url,score
  from ranked where score > 0
  order by score desc,title,chunk_id
  limit greatest(1, least(coalesce(match_count,6),30));
$$;

-- Observed 2026-09-06: anon=true, authenticated=true, service_role=true.

-- -----------------------------------------------------------------------------
-- Standpoint-gated Sacred Writings lexical fallback used by oracle-query v6
-- -----------------------------------------------------------------------------
create or replace function public.search_sacred_writings_lexical(query_text text, match_count integer default 8)
returns table(chunk_id uuid, page_id text, page_title text, tier public.sacred_writing_tier, section_heading text, content text, standpoint public.sacred_writing_standpoint, figure text, era text, element text, phase text, byline text, score double precision)
language sql
stable
set search_path = public
as $$
  select c.id, c.page_id, c.page_title, c.tier, c.section_heading, c.content,
         c.standpoint, c.figure, c.era, c.element, c.phase, c.byline,
         greatest(
           word_similarity(lower(query_text), lower(c.page_title)),
           word_similarity(lower(query_text), lower(c.section_heading)),
           word_similarity(lower(query_text), lower(c.content))
         )::double precision as score
  from public.sacred_writings_chunks c
  where greatest(
           word_similarity(lower(query_text), lower(c.page_title)),
           word_similarity(lower(query_text), lower(c.section_heading)),
           word_similarity(lower(query_text), lower(c.content))
        ) >= 0.12
  order by score desc, c.tier asc, c.page_title asc, c.section_heading asc
  limit greatest(1, least(coalesce(match_count,8),50));
$$;

-- Observed 2026-09-06: anon=false, authenticated=false, service_role=true.

-- -----------------------------------------------------------------------------
-- Voice quota state mutation used by Oracle client voice layer
-- -----------------------------------------------------------------------------
create or replace function public.consume_oracle_voice_quota(p_scope text, p_key_hash text, p_limit integer)
returns table(allowed boolean, current_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket timestamptz := date_trunc('hour', now());
  v_count integer;
begin
  if p_scope not in ('ip','client','global') or coalesce(p_key_hash,'')='' or p_limit < 1 then
    raise exception 'invalid quota request';
  end if;
  insert into public.oracle_voice_usage(scope,key_hash,bucket_start,request_count,updated_at)
  values(p_scope,p_key_hash,v_bucket,1,now())
  on conflict(scope,key_hash,bucket_start)
  do update set request_count=public.oracle_voice_usage.request_count+1, updated_at=now()
  returning request_count into v_count;
  return query select (v_count <= p_limit), v_count;
end;
$$;

-- Observed 2026-09-06: anon=false, authenticated=false, service_role=true.

-- -----------------------------------------------------------------------------
-- Current governed views
-- -----------------------------------------------------------------------------
create or replace view public.akst_publishable_chunks
with (security_invoker = true)
as
select
  c.id as chunk_id,
  c.text_id,
  c.chunk_index,
  c.content,
  c.chapter_title,
  c.section_title,
  c.verse_number,
  c.word_count,
  t.title as text_title,
  t.author,
  t.translator,
  t.content_tier,
  t.rights_status,
  t.source_name,
  t.source_url,
  c.unit_path,
  c.source_sequence,
  t.work_key,
  t.witness_key,
  t.source_checksum_sha256,
  t.verification_status
from public.akst_text_chunks c
join public.akst_texts t on t.id = c.text_id
where t.content_tier = any (array['A'::text,'B'::text,'C'::text])
  and t.rights_status = any (array['public_domain'::text,'own_ip'::text,'licensed'::text])
  and coalesce(t.is_public,false) = true
  and t.access_scope = 'public'
  and t.verification_status = 'accepted';

create or replace view public.sacred_writings_publishable
with (security_invoker = true)
as
select id as chunk_id,page_id,page_title,tier,section_heading,content,standpoint,figure,era,element,phase,byline
from public.sacred_writings_chunks
where embedding is not null or embedding_gte is not null;

create or replace view public.akst_continuous_ingestion_status
with (security_invoker = true)
as
select j.id,j.work_key,j.witness_key,s.title,s.source_url,s.rights_status,s.rights_verified_on,
       j.handler_key,j.state,j.current_phase,j.priority,j.attempt_count,j.next_attempt_at,j.last_error,
       j.requires_human_adjudication,j.updated_at
from public.akst_ingestion_jobs j
join public.akst_source_registry s on s.id=j.source_registry_id;

-- -----------------------------------------------------------------------------
-- Observed native indexes
-- -----------------------------------------------------------------------------
-- CREATE INDEX akst_text_chunks_embedding_gte_hnsw ON public.akst_text_chunks USING hnsw (embedding_gte vector_ip_ops);
-- CREATE INDEX sacred_writings_chunks_embedding_gte_hnsw ON public.sacred_writings_chunks USING hnsw (embedding_gte vector_ip_ops);

-- -----------------------------------------------------------------------------
-- Auth posture observation — NOT a migration instruction
-- -----------------------------------------------------------------------------
-- service-role only:
--   match_chunks
--   match_ancient_chunks_gte
--   match_sacred_writings_gte
--   search_sacred_writings_lexical
--   consume_oracle_voice_quota
--   oracle_internal.kick_native_embedding_worker
--   oracle_internal.kick_native_embedding_drain
--
-- currently executable by anon/authenticated/service_role:
--   search_oracle_ancient_lexical
--   search_oracle_correspondences
--   search_oracle_sacred_writings
--
-- Stage 2.0 records this split but does not alter privileges.
