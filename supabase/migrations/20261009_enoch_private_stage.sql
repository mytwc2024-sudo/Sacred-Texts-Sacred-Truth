-- This migration was applied to canonical AKST Supabase on 2026-10-09.
-- New private staging objects only; NO changes to published AKST tables or existing ingestion jobs.
CREATE TABLE IF NOT EXISTS akst_reconciliation.enoch_witness_stage_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_registry_id uuid NOT NULL REFERENCES public.akst_source_registry(id) ON DELETE RESTRICT,
 edition_key text NOT NULL CHECK (edition_key = 'charles_1917_1enoch'),
 index_url text NOT NULL CHECK (index_url = 'https://archive.sacred-texts.com/bib/boe/index.htm'),
 index_sha256 text CHECK (index_sha256 ~ '^[a-f0-9]{64}$'),
 index_raw_html text,
 index_page_count integer NOT NULL DEFAULT 0 CHECK (index_page_count BETWEEN 0 AND 400),
 state text NOT NULL DEFAULT 'collecting'
  CHECK (state IN ('collecting','acquired_pending_review','quarantined','reviewed_private')),
 review_note text,
 publication_status text NOT NULL DEFAULT 'NOT_AUTHORIZED'
  CHECK (publication_status = 'NOT_AUTHORIZED'),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (source_registry_id,edition_key)
);
CREATE TABLE IF NOT EXISTS akst_reconciliation.enoch_witness_stage_pages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 run_id uuid NOT NULL REFERENCES akst_reconciliation.enoch_witness_stage_runs(id) ON DELETE RESTRICT,
 source_sequence integer NOT NULL CHECK (source_sequence BETWEEN 1 AND 400),
 source_url text NOT NULL CHECK (source_url ~ '^https://archive[.]sacred-texts[.]com/bib/boe/boe[0-9]{3}[.]htm$'),
 index_label text NOT NULL,
 chapter_number integer CHECK (chapter_number BETWEEN 1 AND 108),
 raw_html text,
 raw_sha256 text CHECK (raw_sha256 ~ '^[a-f0-9]{64}$'),
 raw_byte_count integer CHECK (raw_byte_count BETWEEN 100 AND 600000),
 content_type text,
 acquisition_status text NOT NULL DEFAULT 'pending'
  CHECK (acquisition_status IN ('pending','fetched','fetch_failed','reviewed')),
 last_error text,
 retrieved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(run_id,source_sequence),
 UNIQUE(run_id,source_url),
 CONSTRAINT witness_page_integrity CHECK (
  (acquisition_status IN ('fetched','reviewed') AND raw_html IS NOT NULL AND raw_sha256 IS NOT NULL
   AND raw_byte_count IS NOT NULL AND retrieved_at IS NOT NULL) OR
  (acquisition_status IN ('pending','fetch_failed') AND raw_html IS NULL AND raw_sha256 IS NULL)
 )
);
ALTER TABLE akst_reconciliation.enoch_witness_stage_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE akst_reconciliation.enoch_witness_stage_pages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON akst_reconciliation.enoch_witness_stage_runs FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON akst_reconciliation.enoch_witness_stage_pages FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX IF NOT EXISTS enoch_stage_pages_pending_idx ON akst_reconciliation.enoch_witness_stage_pages(run_id,acquisition_status,source_sequence);
COMMENT ON TABLE akst_reconciliation.enoch_witness_stage_runs IS 'Private 1917 edition source integrity stage; publication never authorized here.';
COMMENT ON TABLE akst_reconciliation.enoch_witness_stage_pages IS 'Private source-page witnesses; no API exposure, no automatic publication.';