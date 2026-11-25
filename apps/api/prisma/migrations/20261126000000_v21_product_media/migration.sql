-- ============================================================================
-- Migration v2.1: Real Product Media (Bike Cover Photo + Accessory Storage Key)
-- Zero-downtime, 100% additive & safe for live Neon PostgreSQL production data.
-- ============================================================================

-- 1. Additive nullable column on accessories for Cloudflare R2 object lifecycle cleanup
ALTER TABLE "accessories"
  ADD COLUMN IF NOT EXISTS "image_storage_key" VARCHAR(255);

-- 2. Defensive deduplication BEFORE creating partial unique index:
--    Ensure each bike has at most 1 active primary commercial photo (HERO/GALLERY).
--    Prioritize uploaded real photos over seeded placeholder URLs, then HERO over GALLERY,
--    then lowest sort_order and newest created_at.
WITH ranked_primary_photos AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "bike_id"
      ORDER BY
        CASE WHEN "url" NOT LIKE 'https://cdn.dirtfit.vn/%' THEN 0 ELSE 1 END,
        CASE WHEN "media_type" = 'HERO' THEN 0 ELSE 1 END,
        "sort_order" ASC,
        "created_at" DESC
    ) AS rn
  FROM "bike_media"
  WHERE "media_type" IN ('HERO', 'GALLERY')
    AND "is_primary" = true
    AND "deleted_at" IS NULL
)
UPDATE "bike_media"
SET "is_primary" = false,
    "updated_at" = NOW()
WHERE "id" IN (
  SELECT "id" FROM ranked_primary_photos WHERE rn > 1
);

-- 3. Partial Unique Index: at most 1 active primary commercial photo (HERO/GALLERY) per bike.
--    Completely orthogonal to existing uq_bike_single_primary_blueprint.
CREATE UNIQUE INDEX "uq_bike_single_primary_photo"
  ON "bike_media" ("bike_id")
  WHERE "media_type" IN ('HERO', 'GALLERY')
    AND "is_primary" = true
    AND "deleted_at" IS NULL;
