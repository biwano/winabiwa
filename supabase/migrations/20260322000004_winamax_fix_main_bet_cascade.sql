-- Fix main_bet_id foreign key to allow cascade deletion of matches
-- When a match is deleted, its bets are deleted via cascade.
-- If the match's main_bet_id points to one of those bets, we need it to be SET NULL
-- so the constraint doesn't prevent the deletion.

ALTER TABLE public.winamax_matches 
    DROP CONSTRAINT IF EXISTS winamax_matches_main_bet_id_fkey,
    ADD CONSTRAINT winamax_matches_main_bet_id_fkey 
    FOREIGN KEY (main_bet_id) REFERENCES public.winamax_bets(id) ON DELETE SET NULL;
