-- Ensure all foreign key columns in Winamax tables are nullable
ALTER TABLE public.winamax_categories ALTER COLUMN sport_id DROP NOT NULL;
ALTER TABLE public.winamax_tournaments ALTER COLUMN category_id DROP NOT NULL;
ALTER TABLE public.winamax_matches ALTER COLUMN sport_id DROP NOT NULL;
ALTER TABLE public.winamax_matches ALTER COLUMN category_id DROP NOT NULL;
ALTER TABLE public.winamax_matches ALTER COLUMN tournament_id DROP NOT NULL;
ALTER TABLE public.winamax_matches ALTER COLUMN main_bet_id DROP NOT NULL;
ALTER TABLE public.winamax_bets ALTER COLUMN match_id DROP NOT NULL;
ALTER TABLE public.winamax_bets ALTER COLUMN bet_type_category_id DROP NOT NULL;
ALTER TABLE public.winamax_outcomes ALTER COLUMN bet_id DROP NOT NULL;
ALTER TABLE public.winamax_bet_filters ALTER COLUMN parent_id DROP NOT NULL;
