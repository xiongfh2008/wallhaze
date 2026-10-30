-- 007_cleanup_claim.sql
-- Claim-ownership protection for the expired-media cleanup.
--
-- cleanup_claim_token: UUID generated when a row is claimed as 'deleting'.
--   All later status updates (deleted/delete_failed) must match this token,
--   so a timed-out old task can never overwrite a newer task's result.
-- cleanup_claimed_at: timestamp of the claim; a claim older than the stale
--   window is re-claimable by another pass.
--
-- Compatible minimal migration: nullable columns only, no data rewrite.
-- Rollback: ALTER TABLE image_assets DROP COLUMN cleanup_claim_token,
--   DROP COLUMN cleanup_claimed_at;  (safe — values are transient)

ALTER TABLE image_assets
  ADD COLUMN IF NOT EXISTS cleanup_claim_token uuid,
  ADD COLUMN IF NOT EXISTS cleanup_claimed_at timestamptz;
