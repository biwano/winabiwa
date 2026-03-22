-- Create winamax_matches table
CREATE TABLE IF NOT EXISTS public.winamax_matches (
    id BIGINT PRIMARY KEY,
    sport_id BIGINT REFERENCES public.winamax_sports(id),
    category_id BIGINT REFERENCES public.winamax_categories(id),
    tournament_id BIGINT REFERENCES public.winamax_tournaments(id),
    title TEXT,
    status TEXT,
    match_start TIMESTAMPTZ,
    competitor1_id BIGINT,
    competitor1_name TEXT,
    competitor2_id BIGINT,
    competitor2_name TEXT,
    main_bet_id BIGINT, -- Can't reference winamax_bets yet as it's created after
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create winamax_bets table
CREATE TABLE IF NOT EXISTS public.winamax_bets (
    id BIGINT PRIMARY KEY,
    match_id BIGINT REFERENCES public.winamax_matches(id) ON DELETE CASCADE,
    title TEXT,
    bet_type_category_id BIGINT REFERENCES public.winamax_bet_categories(id),
    market_id BIGINT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Now add foreign key for main_bet_id in winamax_matches
ALTER TABLE public.winamax_matches 
    ADD CONSTRAINT winamax_matches_main_bet_id_fkey 
    FOREIGN KEY (main_bet_id) REFERENCES public.winamax_bets(id);

-- Create winamax_outcomes table
CREATE TABLE IF NOT EXISTS public.winamax_outcomes (
    id BIGINT PRIMARY KEY,
    bet_id BIGINT REFERENCES public.winamax_bets(id) ON DELETE CASCADE,
    label TEXT,
    code TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create winamax_odds_history table
CREATE TABLE IF NOT EXISTS public.winamax_odds_history (
    outcome_id BIGINT REFERENCES public.winamax_outcomes(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ,
    value NUMERIC NOT NULL,
    PRIMARY KEY (outcome_id, timestamp)
);

-- Enable RLS
ALTER TABLE public.winamax_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winamax_bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winamax_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winamax_odds_history ENABLE ROW LEVEL SECURITY;

-- Allow read access to all authenticated users
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow read access to authenticated users' AND tablename = 'winamax_matches') THEN
        CREATE POLICY "Allow read access to authenticated users" ON public.winamax_matches FOR SELECT USING (auth.role() = 'authenticated');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow read access to authenticated users' AND tablename = 'winamax_bets') THEN
        CREATE POLICY "Allow read access to authenticated users" ON public.winamax_bets FOR SELECT USING (auth.role() = 'authenticated');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow read access to authenticated users' AND tablename = 'winamax_outcomes') THEN
        CREATE POLICY "Allow read access to authenticated users" ON public.winamax_outcomes FOR SELECT USING (auth.role() = 'authenticated');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow read access to authenticated users' AND tablename = 'winamax_odds_history') THEN
        CREATE POLICY "Allow read access to authenticated users" ON public.winamax_odds_history FOR SELECT USING (auth.role() = 'authenticated');
    END IF;
END $$;
