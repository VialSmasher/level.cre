DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'prospects'
      AND column_name = 'size'
  ) THEN
    ALTER TABLE public.prospects RENAME COLUMN size TO legacy_size;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'prospects'
      AND column_name = 'acres'
  ) THEN
    ALTER TABLE public.prospects RENAME COLUMN acres TO legacy_acres;
  END IF;
END $$;

ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS building_sf integer,
  ADD COLUMN IF NOT EXISTS lot_size_acres numeric(10,2),
  ADD COLUMN IF NOT EXISTS ai_metadata jsonb;
