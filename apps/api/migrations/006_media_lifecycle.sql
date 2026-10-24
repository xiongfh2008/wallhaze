-- Media lifecycle: new user-generated assets are kept for 30 days.
-- Existing rows remain 'legacy' with NULL expiry so this migration can never
-- schedule an already-owned creation for deletion. Only rows explicitly
-- created by the new completion path use 'temporary_30d'.
ALTER TABLE image_assets
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN retention_policy text NOT NULL DEFAULT 'legacy'
    CHECK (retention_policy IN ('legacy','temporary_30d')),
  ADD COLUMN storage_status text NOT NULL DEFAULT 'active'
    CHECK (storage_status IN ('active','deleting','deleted','delete_failed')),
  ADD COLUMN delete_attempts integer NOT NULL DEFAULT 0
    CHECK (delete_attempts >= 0),
  ADD COLUMN last_cleanup_error text,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX image_assets_expiry
  ON image_assets(expires_at)
  WHERE retention_policy='temporary_30d'
    AND storage_status IN ('active','deleting','delete_failed');

-- One row per cleanup pass. Kept as minimal operational history; it contains
-- ids/counts only, never prompts, image bytes or signed URLs.
CREATE TABLE media_cleanup_runs(
  id text PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  dry_run boolean NOT NULL,
  scanned integer NOT NULL DEFAULT 0 CHECK (scanned >= 0),
  deleted integer NOT NULL DEFAULT 0 CHECK (deleted >= 0),
  failed integer NOT NULL DEFAULT 0 CHECK (failed >= 0),
  details jsonb
);
CREATE INDEX media_cleanup_runs_started ON media_cleanup_runs(started_at DESC);
