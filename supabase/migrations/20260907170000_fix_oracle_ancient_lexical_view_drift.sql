-- Stage 2.2: make the ancient lexical fallback resilient to future
-- akst_publishable_chunks view-column additions.
--
-- Production finding (2026-09-07): the live function selected p.* but grouped
-- only the older publishable-view column set. New provenance columns such as
-- unit_path/work_key/witness_key caused PostgreSQL 42803 at function startup.
--
-- This replacement keeps the existing public function signature and grants.
-- It intentionally selects only the columns returned by the function contract
-- instead of p.*, so unrelated view expansion cannot break GROUP BY again.

create or replace function public.search_oracle_ancient_lexical(
  query_text text,
  match_count integer default 8
)
returns table(
  chunk_id uuid,
  text_id uuid,
  content text,
  text_title text,
  author text,
  translator text,
  source_name text,
  source_url text,
  content_tier text,
  rights_status text,
  score integer
)
language sql
stable
set search_path to 'public'
as $function$
  with terms as (
    select distinct t as term
    from unnest(
      regexp_split_to_array(lower(coalesce(query_text, '')), '[^a-z0-9]+')
    ) t
    where length(t) > 2
      and t not in (
        'the','and','for','with','from','that','this','does','how','what','today',
        'into','your','their','our','are','was','were','relate','relates',
        'knowledge','ancient'
      )
  ), ranked as (
    select
      p.chunk_id,
      p.text_id,
      p.content,
      p.text_title,
      p.author,
      p.translator,
      p.source_name,
      p.source_url,
      p.content_tier,
      p.rights_status,
      count(*) filter (
        where lower(
          concat_ws(
            ' ',
            p.text_title,
            p.author,
            p.content,
            p.chapter_title,
            p.section_title
          )
        ) like '%' || terms.term || '%'
      )::integer as score
    from public.akst_publishable_chunks p
    cross join terms
    where p.content_tier = 'A'
    group by
      p.chunk_id,
      p.text_id,
      p.content,
      p.text_title,
      p.author,
      p.translator,
      p.source_name,
      p.source_url,
      p.content_tier,
      p.rights_status
  )
  select
    chunk_id,
    text_id,
    content,
    text_title,
    author,
    translator,
    source_name,
    source_url,
    content_tier,
    rights_status,
    score
  from ranked
  where score > 0
  order by score desc, text_title, chunk_id
  limit greatest(1, least(coalesce(match_count, 8), 50));
$function$;

comment on function public.search_oracle_ancient_lexical(text, integer) is
  'Tier A rights-cleared lexical fallback for Oracle ancient retrieval. Uses an explicit projection so akst_publishable_chunks provenance-column growth cannot invalidate GROUP BY.';
