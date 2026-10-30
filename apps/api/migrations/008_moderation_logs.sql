-- 008_moderation_logs.sql
-- Audit trail for content moderation across all three AIGC stages:
--   pre_generation  — Waffo Prompt Sift + local blocklist verdicts;
--   post_generation — output moderation of generated image/video bytes;
--   gallery_scan    — async re-scan of publicly visible gallery works.
--
-- One row per screening decision or skip. Contains NO prompts, NO
-- reference images, NO credentials and NO API keys: only ids, the stage,
-- the screening service, the verdict, official reason/category codes,
-- the provider request id (for appeals with Waffo) and the disposition.
-- user_id is stored because moderation events are account-review evidence;
-- it is the same id already present on the generation job.
--
-- Retention: rows may be pruned with the processed-webhook policy (90
-- days) by a future scheduled job; no automated deletion yet. Waffo's
-- AIGC compliance page requires retaining AI moderation outputs AND
-- human-review decisions — the reviewer/reviewed_at columns record the
-- human follow-up when a flagged item is dispositioned manually.

CREATE TABLE IF NOT EXISTS moderation_logs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id text,
  user_id text,
  asset_id text,
  stage text NOT NULL CHECK(stage IN ('pre_generation','post_generation','gallery_scan')),
  service text NOT NULL CHECK(service IN ('waffo_prompt_sift','local_blocklist','output_moderation')),
  action text NOT NULL CHECK(action IN ('allow','review','block','unavailable','skipped')),
  reason_code text,
  category text,
  request_id text,
  disposition text,
  reviewer text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (job_id IS NOT NULL OR asset_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS moderation_logs_job_idx ON moderation_logs(job_id);
CREATE INDEX IF NOT EXISTS moderation_logs_asset_idx ON moderation_logs(asset_id);
CREATE INDEX IF NOT EXISTS moderation_logs_stage_idx ON moderation_logs(stage, created_at);
CREATE INDEX IF NOT EXISTS moderation_logs_action_idx ON moderation_logs(action, created_at);
