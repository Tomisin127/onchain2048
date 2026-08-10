CREATE TABLE public.high_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text NOT NULL UNIQUE,
  score integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.high_scores TO anon, authenticated;
GRANT ALL ON public.high_scores TO service_role;
ALTER TABLE public.high_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read high scores" ON public.high_scores FOR SELECT USING (true);
CREATE POLICY "Anyone can submit a high score" ON public.high_scores FOR INSERT WITH CHECK (address ~* '^0x[0-9a-f]{40}$' AND score >= 0 AND score < 100000000);
CREATE POLICY "Anyone can improve a high score" ON public.high_scores FOR UPDATE USING (true) WITH CHECK (score >= 0 AND score < 100000000);

CREATE TABLE public.b20_holders (
  address text PRIMARY KEY,
  balance_wei numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.b20_holders TO anon, authenticated;
GRANT ALL ON public.b20_holders TO service_role;
ALTER TABLE public.b20_holders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read B20 holders" ON public.b20_holders FOR SELECT USING (true);

CREATE TABLE public.indexer_state (
  key text PRIMARY KEY,
  last_run_at timestamptz,
  last_block bigint
);
GRANT SELECT ON public.indexer_state TO anon, authenticated;
GRANT ALL ON public.indexer_state TO service_role;
ALTER TABLE public.indexer_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read indexer state" ON public.indexer_state FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER high_scores_touch BEFORE UPDATE ON public.high_scores FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.high_scores REPLICA IDENTITY FULL;
ALTER TABLE public.b20_holders REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.high_scores;
ALTER PUBLICATION supabase_realtime ADD TABLE public.b20_holders;