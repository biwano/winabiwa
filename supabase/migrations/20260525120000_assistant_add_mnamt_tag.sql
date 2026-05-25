INSERT INTO public.match_tags (code, label, description)
VALUES (
    'MNAMT',
    'Match nul avant mi-temps',
    'Football 0-0: monotone draw-odd decay (minutes 15-25) with rising home/away odds and no draw plateau or rebound.'
)
ON CONFLICT (code) DO NOTHING;
