-- Card Mastery includes only non-starter, non-special cards from the five
-- playable character pools and Colorless. MultiplayerOnly is excluded by
-- the generated coop_only flag.
-- Keep this as a follow-up migration so environments that already tested the
-- initial Card Mastery migration receive the corrected eligibility predicate.

create or replace function public.card_mastery_card_is_eligible(target_card_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.cards c
    where c.id = target_card_id
      and c.active
      and not c.coop_only
      and c.rarity not in ('basic', 'curse', 'event', 'quest', 'status', 'token')
      and (
        c.character_id in ('ironclad', 'silent', 'regent', 'necrobinder', 'defect')
        or exists (
          select 1 from public.card_pool_memberships membership
          where membership.card_id = c.id and membership.pool_id = 'colorless'
        )
      )
      and coalesce((
        select s.eligible
        from public.card_challenge_settings s
        where s.card_id = c.id and s.challenge_id = 'card_mastery'
      ), true)
  )
$$;

revoke all on function public.card_mastery_card_is_eligible(text) from public;

-- Existing test environments may already have state calculated with auxiliary
-- pools. Reconcile it immediately under the corrected predicate.
select public.reconcile_card_mastery_catalog();
