-- Ensure PostGIS is available (required for SRID checks)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Backfill SRID for any existing rows where it is missing or incorrect
UPDATE prospects
SET geometry = ST_SetSRID(geometry, 4326)
WHERE ST_SRID(geometry) IS DISTINCT FROM 4326;

-- Add an SRID check constraint to enforce WGS84 (EPSG:4326)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_prospects_geometry_srid_4326'
  ) THEN
    ALTER TABLE prospects
      ADD CONSTRAINT chk_prospects_geometry_srid_4326
      CHECK (ST_SRID(geometry) = 4326);
  END IF;
END$$;

