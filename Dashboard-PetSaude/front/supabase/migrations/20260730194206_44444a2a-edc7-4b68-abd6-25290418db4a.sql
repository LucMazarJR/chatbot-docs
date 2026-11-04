CREATE TABLE public.faqs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.faqs TO anon;
GRANT SELECT ON public.faqs TO authenticated;
GRANT ALL ON public.faqs TO service_role;

ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read faqs" ON public.faqs FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_faqs_updated_at BEFORE UPDATE ON public.faqs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.faqs (question, answer, category) VALUES
('Como faço para redefinir minha senha?', 'Acesse a tela de login, clique em "Esqueci minha senha" e siga as instruções enviadas por e-mail.', 'Conta'),
('Quais formas de pagamento vocês aceitam?', 'Aceitamos cartões de crédito, Pix e boleto bancário.', 'Pagamento'),
('Qual é o prazo de entrega?', 'O prazo médio é de 3 a 7 dias úteis, dependendo da sua região.', 'Entrega');