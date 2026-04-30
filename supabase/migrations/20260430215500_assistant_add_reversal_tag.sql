INSERT INTO public.match_tags (code, label, description)
VALUES (
    'REVERSAL',
    'Reversal',
    'Favorite is currently losing while favorite odd remains under 2.5.'
)
ON CONFLICT (code) DO NOTHING;
