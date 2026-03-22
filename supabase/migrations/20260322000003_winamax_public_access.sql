-- Update RLS policies for all Winamax tables to allow public read access
-- Tables: winamax_sports, winamax_categories, winamax_tournaments, winamax_bet_filters, winamax_bet_categories, winamax_matches, winamax_bets, winamax_outcomes, winamax_odds_history

DO $$ 
DECLARE
    t text;
    tables text[] := ARRAY[
        'winamax_sports', 
        'winamax_categories', 
        'winamax_tournaments', 
        'winamax_bet_filters', 
        'winamax_bet_categories', 
        'winamax_matches', 
        'winamax_bets', 
        'winamax_outcomes', 
        'winamax_odds_history'
    ];
BEGIN
    FOREACH t IN ARRAY tables
    LOOP
        -- Drop the existing authenticated-only policy
        EXECUTE format('DROP POLICY IF EXISTS "Allow read access to authenticated users" ON public.%I', t);
        
        -- Create a new policy for public read access (anon and authenticated)
        EXECUTE format('CREATE POLICY "Allow public read access" ON public.%I FOR SELECT USING (true)', t);
    END LOOP;
END $$;
