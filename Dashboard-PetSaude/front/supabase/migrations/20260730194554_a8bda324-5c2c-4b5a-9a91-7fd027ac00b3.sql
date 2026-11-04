ALTER TABLE public.faqs
  ADD COLUMN IF NOT EXISTS created_by text,
  ADD COLUMN IF NOT EXISTS updated_by text;

CREATE TABLE public.faq_activity (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_name text NOT NULL,
  action text NOT NULL,
  faq_id uuid,
  question text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.faq_activity TO anon;
GRANT SELECT ON public.faq_activity TO authenticated;
GRANT ALL ON public.faq_activity TO service_role;

ALTER TABLE public.faq_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read faq activity"
  ON public.faq_activity FOR SELECT USING (true);