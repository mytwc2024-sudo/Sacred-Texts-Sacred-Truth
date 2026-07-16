-- =====================================================
-- AKST — Ancient Knowledge Sacred Texts
-- Core schema (namespaced with the `akst_` prefix)
-- Target project: EXTRA Ankhor MasterHub (xhzyavyftgyqzftlqdlz)
-- =====================================================
--
-- This migration is ADDITIVE and namespaced. Every table, function, and
-- view is prefixed with `akst_` so it can live alongside the ~400 existing
-- tables in the shared EXTRA Ankhor MasterHub project without colliding
-- (e.g. the project already has an unrelated `traditions` table).
--
-- Everything uses IF NOT EXISTS / CREATE OR REPLACE so it is safe to run
-- more than once.
-- =====================================================

-- Required extensions (idempotent) --------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "vector";     -- pgvector: embeddings
create extension if not exists "pg_trgm";     -- fuzzy / trigram search
create extension if not exists "btree_gin";   -- array indexing

-- =====================================================
-- Taxonomy: civilizations
-- =====================================================
create table if not exists akst_civilizations (
  id          uuid primary key default gen_random_uuid(),
  name        text unique not null,
  description text,
  region      text,
  time_period text,
  created_at  timestamptz default now()
);
create index if not exists idx_akst_civilizations_name on akst_civilizations(name);

-- =====================================================
-- Taxonomy: traditions
-- =====================================================
create table if not exists akst_traditions (
  id               uuid primary key default gen_random_uuid(),
  civilization_id  uuid references akst_civilizations(id) on delete cascade,
  name             text not null,
  description      text,
  created_at       timestamptz default now(),
  unique(civilization_id, name)
);
create index if not exists idx_akst_traditions_civilization on akst_traditions(civilization_id);
create index if not exists idx_akst_traditions_name on akst_traditions(name);

-- =====================================================
-- Sacred texts (catalog + full text)
-- =====================================================
create table if not exists akst_texts (
  id                uuid primary key default gen_random_uuid(),

  title             text not null,
  subtitle          text,
  author            text,
  translator        text,

  civilization_id   uuid references akst_civilizations(id),
  tradition_id      uuid references akst_traditions(id),

  language          text not null default 'en',
  original_language text,
  estimated_date    text,

  -- Source + de-duplication. source_url is the canonical key the ingestion
  -- pipeline upserts on, so re-running never creates duplicates.
  source_url        text unique,
  source_name       text default 'Sacred-Texts.com',
  ingestion_date    date default current_date,

  full_text         text,

  word_count        integer,
  chunk_count       integer default 0,

  is_public         boolean default true,
  is_featured       boolean default false,
  processing_status text default 'pending'
                    check (processing_status in ('pending','processing','complete','error')),
  error_message     text,

  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);
create index if not exists idx_akst_texts_title        on akst_texts using gin (title gin_trgm_ops);
create index if not exists idx_akst_texts_civilization  on akst_texts(civilization_id);
create index if not exists idx_akst_texts_tradition     on akst_texts(tradition_id);
create index if not exists idx_akst_texts_public        on akst_texts(is_public);
create index if not exists idx_akst_texts_featured      on akst_texts(is_featured);
create index if not exists idx_akst_texts_status        on akst_texts(processing_status);
create index if not exists idx_akst_texts_full_text     on akst_texts using gin (to_tsvector('english', coalesce(full_text,'')));

-- =====================================================
-- Chunked content with vector embeddings
-- =====================================================
create table if not exists akst_text_chunks (
  id            uuid primary key default gen_random_uuid(),
  text_id       uuid not null references akst_texts(id) on delete cascade,

  chunk_index   integer not null,
  content       text not null,
  word_count    integer,

  chapter_title text,
  section_title text,
  verse_number  text,

  -- 1536 dims => OpenAI text-embedding-3-small
  embedding     vector(1536),

  created_at    timestamptz default now(),
  unique(text_id, chunk_index)
);
create index if not exists idx_akst_chunks_text    on akst_text_chunks(text_id);
create index if not exists idx_akst_chunks_content on akst_text_chunks using gin (to_tsvector('english', content));
-- HNSW handles incremental inserts well (no training step like ivfflat).
create index if not exists idx_akst_chunks_embedding
  on akst_text_chunks using hnsw (embedding vector_cosine_ops);

-- =====================================================
-- Knowledge graph: concepts, edges, mentions
-- =====================================================
create table if not exists akst_concepts (
  id            uuid primary key default gen_random_uuid(),
  name          text unique not null,
  description   text,
  concept_type  text not null default 'theme'
                check (concept_type in ('theme','character','place','practice','deity','philosophy')),
  aliases       text[],
  mention_count integer default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists idx_akst_concepts_name    on akst_concepts using gin (name gin_trgm_ops);
create index if not exists idx_akst_concepts_type    on akst_concepts(concept_type);
create index if not exists idx_akst_concepts_aliases on akst_concepts using gin (aliases);

create table if not exists akst_concept_edges (
  id                uuid primary key default gen_random_uuid(),
  source_concept_id uuid not null references akst_concepts(id) on delete cascade,
  target_concept_id uuid not null references akst_concepts(id) on delete cascade,
  relationship_type text not null
                    check (relationship_type in
                      ('related_to','part_of','contrasts_with','depends_on','precedes','symbolizes','practiced_by')),
  strength          numeric(3,2) default 1.0 check (strength >= 0.0 and strength <= 1.0),
  created_at        timestamptz default now(),
  unique(source_concept_id, target_concept_id, relationship_type)
);
create index if not exists idx_akst_edges_source on akst_concept_edges(source_concept_id);
create index if not exists idx_akst_edges_target on akst_concept_edges(target_concept_id);

create table if not exists akst_concept_mentions (
  id              uuid primary key default gen_random_uuid(),
  concept_id      uuid not null references akst_concepts(id) on delete cascade,
  chunk_id        uuid not null references akst_text_chunks(id) on delete cascade,
  text_id         uuid not null references akst_texts(id) on delete cascade,
  context_snippet text,
  confidence      numeric(3,2) default 1.0 check (confidence >= 0.0 and confidence <= 1.0),
  created_at      timestamptz default now(),
  unique(concept_id, chunk_id)
);
create index if not exists idx_akst_mentions_concept on akst_concept_mentions(concept_id);
create index if not exists idx_akst_mentions_chunk   on akst_concept_mentions(chunk_id);
create index if not exists idx_akst_mentions_text    on akst_concept_mentions(text_id);

-- =====================================================
-- Curated reading paths + collections
-- =====================================================
create table if not exists akst_reading_paths (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  slug             text unique,
  description      text,
  difficulty_level text check (difficulty_level in ('beginner','intermediate','advanced')),
  text_ids         uuid[],
  estimated_hours  integer,
  is_public        boolean default true,
  is_featured      boolean default false,
  created_by       uuid,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
create index if not exists idx_akst_paths_public   on akst_reading_paths(is_public);
create index if not exists idx_akst_paths_featured on akst_reading_paths(is_featured);

create table if not exists akst_collections (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  text_ids    uuid[],
  is_public   boolean default false,
  created_by  uuid,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists idx_akst_collections_public on akst_collections(is_public);

-- =====================================================
-- Row Level Security: public read, service_role writes
-- =====================================================
alter table akst_civilizations    enable row level security;
alter table akst_traditions       enable row level security;
alter table akst_texts            enable row level security;
alter table akst_text_chunks      enable row level security;
alter table akst_concepts         enable row level security;
alter table akst_concept_edges    enable row level security;
alter table akst_concept_mentions enable row level security;
alter table akst_reading_paths    enable row level security;
alter table akst_collections      enable row level security;

do $$
begin
  -- Public read (anon + authenticated) --------------------------------
  if not exists (select 1 from pg_policies where policyname = 'akst public read civilizations') then
    create policy "akst public read civilizations" on akst_civilizations for select using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'akst public read traditions') then
    create policy "akst public read traditions" on akst_traditions for select using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'akst public read texts') then
    create policy "akst public read texts" on akst_texts for select using (is_public = true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'akst public read chunks') then
    create policy "akst public read chunks" on akst_text_chunks for select
      using (exists (select 1 from akst_texts t where t.id = akst_text_chunks.text_id and t.is_public = true));
  end if;
  if not exists (select 1 from pg_policies where policyname = 'akst public read concepts') then
    create policy "akst public read concepts" on akst_concepts for select using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'akst public read edges') then
    create policy "akst public read edges" on akst_concept_edges for select using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'akst public read mentions') then
    create policy "akst public read mentions" on akst_concept_mentions for select using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'akst public read paths') then
    create policy "akst public read paths" on akst_reading_paths for select using (is_public = true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'akst public read collections') then
    create policy "akst public read collections" on akst_collections for select using (is_public = true);
  end if;

  -- service_role full write (used by the ingestion pipeline) ----------
  if not exists (select 1 from pg_policies where policyname = 'akst service writes texts') then
    create policy "akst service writes texts" on akst_texts for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'akst service writes chunks') then
    create policy "akst service writes chunks" on akst_text_chunks for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'akst service writes civilizations') then
    create policy "akst service writes civilizations" on akst_civilizations for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'akst service writes traditions') then
    create policy "akst service writes traditions" on akst_traditions for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'akst service writes concepts') then
    create policy "akst service writes concepts" on akst_concepts for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'akst service writes edges') then
    create policy "akst service writes edges" on akst_concept_edges for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'akst service writes mentions') then
    create policy "akst service writes mentions" on akst_concept_mentions for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'akst service writes paths') then
    create policy "akst service writes paths" on akst_reading_paths for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'akst service writes collections') then
    create policy "akst service writes collections" on akst_collections for all to service_role using (true) with check (true);
  end if;
end $$;

-- =====================================================
-- Search functions
-- =====================================================

-- Vector similarity search over chunks
create or replace function akst_search_similar_chunks(
  query_embedding vector(1536),
  match_threshold float default 0.7,
  match_count int default 10
)
returns table (
  chunk_id   uuid,
  text_id    uuid,
  text_title text,
  content    text,
  similarity float
) language sql stable set search_path = public as $$
  select
    c.id,
    c.text_id,
    t.title,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from akst_text_chunks c
  join akst_texts t on t.id = c.text_id
  where t.is_public = true
    and c.embedding is not null
    and 1 - (c.embedding <=> query_embedding) > match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- Full-text search over texts
create or replace function akst_search_texts(
  search_query text,
  max_results int default 20
)
returns table (
  text_id  uuid,
  title    text,
  subtitle text,
  author   text,
  rank     real
) language sql stable set search_path = public as $$
  select
    t.id,
    t.title,
    t.subtitle,
    t.author,
    ts_rank(to_tsvector('english', coalesce(t.full_text,'')), plainto_tsquery('english', search_query)) as rank
  from akst_texts t
  where t.is_public = true
    and to_tsvector('english', coalesce(t.full_text,'')) @@ plainto_tsquery('english', search_query)
  order by rank desc
  limit max_results;
$$;

-- Recursive concept-graph walk
create or replace function akst_get_concept_network(
  concept_name_param text,
  depth int default 1
)
returns table (
  concept_id        uuid,
  concept_name      text,
  relationship_type text,
  depth_level       int
) language sql stable set search_path = public as $$
  with recursive concept_tree(concept_id, concept_name, relationship_type, depth_level) as (
    select c.id, c.name, null::text, 0
    from akst_concepts c
    where c.name = concept_name_param
    union all
    select c.id, c.name, e.relationship_type, ct.depth_level + 1
    from concept_tree ct
    join akst_concept_edges e on e.source_concept_id = ct.concept_id
    join akst_concepts c on c.id = e.target_concept_id
    where ct.depth_level < depth
  )
  select distinct concept_id, concept_name, relationship_type, depth_level
  from concept_tree
  order by depth_level, concept_name;
$$;

-- =====================================================
-- Convenience view: texts joined with taxonomy
-- =====================================================
create or replace view akst_texts_with_metadata with (security_invoker = true) as
select
  t.id, t.title, t.subtitle, t.author, t.translator,
  c.name  as civilization_name,
  tr.name as tradition_name,
  t.language, t.original_language, t.estimated_date,
  t.word_count, t.chunk_count, t.is_featured, t.processing_status,
  t.source_url, t.source_name, t.created_at
from akst_texts t
left join akst_civilizations c on c.id = t.civilization_id
left join akst_traditions   tr on tr.id = t.tradition_id
where t.is_public = true
order by t.created_at desc;

-- =====================================================
-- Seed taxonomy (idempotent)
-- =====================================================
insert into akst_civilizations (name, description, region, time_period) values
  ('Ancient India',      'Vedic and Hindu traditions',      'South Asia',    '1500 BCE - Present'),
  ('Ancient China',      'Taoist and Confucian traditions', 'East Asia',     '500 BCE - Present'),
  ('Ancient Greece',     'Hellenistic philosophy',          'Mediterranean', '800 BCE - 600 CE'),
  ('Ancient Egypt',      'Egyptian mystery traditions',     'North Africa',  '3000 BCE - 300 CE'),
  ('Early Christianity', 'Gnostic and orthodox texts',      'Mediterranean', '1 CE - 400 CE'),
  ('Buddhism',           'Buddhist canon and commentaries', 'Asia',          '500 BCE - Present')
on conflict (name) do nothing;

insert into akst_traditions (civilization_id, name, description)
select c.id, t.name, t.description
from (values
  ('Ancient India',      'Hinduism',   'Vedas, Upanishads, Bhagavad Gita'),
  ('Ancient China',      'Taoism',     'Tao Te Ching, Chuang Tzu'),
  ('Buddhism',           'Theravada',  'Pali Canon, Dhammapada'),
  ('Buddhism',           'Mahayana',   'Sutras, Heart Sutra'),
  ('Early Christianity', 'Gnosticism', 'Nag Hammadi texts, Gospel of Thomas')
) as t(civ_name, name, description)
join akst_civilizations c on c.name = t.civ_name
on conflict (civilization_id, name) do nothing;
