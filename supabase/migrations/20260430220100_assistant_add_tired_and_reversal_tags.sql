INSERT INTO public.match_tags (code, label, description)
VALUES
    (
        'TIRED',
        'Tired',
        'Outsider odd drops by more than 8% in less than 10 minutes.'
    ),
    (
        'REVERSAL',
        'Reversal',
        'Favorite is currently losing while favorite odd remains under 2.5.'
    )
ON CONFLICT (code) DO NOTHING;
