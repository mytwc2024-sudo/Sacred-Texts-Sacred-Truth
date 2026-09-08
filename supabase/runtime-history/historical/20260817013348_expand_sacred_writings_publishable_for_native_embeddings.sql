-- HISTORICAL RUNTIME EVIDENCE — DO NOT AUTO-APPLY
-- Recovered from app-forge-studio-78/agent/oracle-nervous-system.
-- Stage 2.0 verification: current live view retains security_invoker=true and the either-embedding publishability rule.

create or replace view public.sacred_writings_publishable
with (security_invoker = true)
as
select
  id as chunk_id,
  page_id,
  page_title,
  tier,
  section_heading,
  content,
  standpoint,
  figure,
  era,
  element,
  phase,
  byline
from public.sacred_writings_chunks
where embedding is not null or embedding_gte is not null;

comment on view public.sacred_writings_publishable is 'Service-governed Sacred Writings projection. A row is publishable to Oracle retrieval when either the legacy 1536 embedding or native gte-small 384 embedding exists; standpoint gating remains enforced at ingestion and client Tier-B exclusion remains enforced by oracle-query.';
