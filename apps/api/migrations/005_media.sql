-- Dynamic wallpaper extension: the existing generation job + asset pipeline is
-- reused for videos. Every legacy row keeps the image/text_to_image defaults.
ALTER TABLE generation_jobs
  ADD COLUMN media_type text NOT NULL DEFAULT 'image'
    CHECK (media_type IN ('image','video')),
  ADD COLUMN generation_mode text NOT NULL DEFAULT 'text_to_image'
    CHECK (generation_mode IN ('text_to_image','image_edit','text_to_video','image_to_video')),
  ADD COLUMN duration_seconds integer
    CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 3 AND 5),
  ADD COLUMN source_creation_id text REFERENCES generation_jobs(id),
  ADD COLUMN width integer,
  ADD COLUMN height integer,
  ADD COLUMN video_metadata jsonb;

ALTER TABLE image_assets
  ADD COLUMN media_type text NOT NULL DEFAULT 'image'
    CHECK (media_type IN ('image','video')),
  ADD COLUMN duration_seconds integer
    CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 3 AND 5),
  ADD COLUMN width integer,
  ADD COLUMN height integer,
  ADD COLUMN poster_storage_key text,
  ADD COLUMN poster_mime text,
  ADD COLUMN metadata jsonb;

CREATE INDEX generation_jobs_media_created
  ON generation_jobs(media_type, created_at DESC);
