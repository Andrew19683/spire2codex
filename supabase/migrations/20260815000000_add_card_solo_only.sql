-- Keep an explicit application-facing flag for cards unavailable in co-op.
-- The original game constraint remains the source of truth.

alter table public.cards
  add column solo_only boolean
  generated always as (multiplayer_constraint = 'SingleplayerOnly') stored;
