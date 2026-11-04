ALTER TABLE public.faqs ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT '{}'::text[];

UPDATE public.faqs
SET categories = ARRAY[category]
WHERE (categories IS NULL OR cardinality(categories) = 0)
  AND category IS NOT NULL
  AND btrim(category) <> '';