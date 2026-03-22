-- Create winamax_sports table
CREATE TABLE IF NOT EXISTS public.winamax_sports (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create winamax_categories table
CREATE TABLE IF NOT EXISTS public.winamax_categories (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    flag TEXT,
    sport_id BIGINT REFERENCES public.winamax_sports(id) ON DELETE CASCADE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create winamax_tournaments table
CREATE TABLE IF NOT EXISTS public.winamax_tournaments (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    category_id BIGINT REFERENCES public.winamax_categories(id) ON DELETE CASCADE,
    sr_tournament_id TEXT,
    sr_season_id TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create winamax_bet_filters table
CREATE TABLE IF NOT EXISTS public.winamax_bet_filters (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id BIGINT REFERENCES public.winamax_bet_filters(id) ON DELETE CASCADE,
    is_default BOOLEAN DEFAULT FALSE,
    display_order INTEGER,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create winamax_bet_categories table
CREATE TABLE IF NOT EXISTS public.winamax_bet_categories (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    display_order INTEGER,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.winamax_sports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winamax_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winamax_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winamax_bet_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winamax_bet_categories ENABLE ROW LEVEL SECURITY;

-- Allow read access to all authenticated users
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow read access to authenticated users' AND tablename = 'winamax_sports') THEN
        CREATE POLICY "Allow read access to authenticated users" ON public.winamax_sports FOR SELECT USING (auth.role() = 'authenticated');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow read access to authenticated users' AND tablename = 'winamax_categories') THEN
        CREATE POLICY "Allow read access to authenticated users" ON public.winamax_categories FOR SELECT USING (auth.role() = 'authenticated');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow read access to authenticated users' AND tablename = 'winamax_tournaments') THEN
        CREATE POLICY "Allow read access to authenticated users" ON public.winamax_tournaments FOR SELECT USING (auth.role() = 'authenticated');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow read access to authenticated users' AND tablename = 'winamax_bet_filters') THEN
        CREATE POLICY "Allow read access to authenticated users" ON public.winamax_bet_filters FOR SELECT USING (auth.role() = 'authenticated');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow read access to authenticated users' AND tablename = 'winamax_bet_categories') THEN
        CREATE POLICY "Allow read access to authenticated users" ON public.winamax_bet_categories FOR SELECT USING (auth.role() = 'authenticated');
    END IF;
END $$;
