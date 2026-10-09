-- Preserve original HTTP entity bytes as base64 as well as decoded text, to
-- support independently reproducible byte-for-byte SHA-256 source checks.
ALTER TABLE akst_reconciliation.enoch_witness_stage_pages ADD COLUMN IF NOT EXISTS raw_content_base64 text;
ALTER TABLE akst_reconciliation.enoch_witness_stage_pages
 ADD CONSTRAINT enoch_stage_raw_bytes_required CHECK
 (acquisition_status NOT IN ('fetched','reviewed') OR raw_content_base64 IS NOT NULL);
COMMENT ON COLUMN akst_reconciliation.enoch_witness_stage_pages.raw_content_base64 IS
 'Exact HTTP entity bytes encoded as base64; verify raw_sha256 before witness acceptance.';