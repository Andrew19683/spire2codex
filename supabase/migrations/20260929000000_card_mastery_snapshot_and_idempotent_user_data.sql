-- Keep the Card Mastery screen to one bounded round trip. The previous client
-- implementation fetched six tables independently and downloaded the complete
-- attempt history after every action.
create or replace function public.get_card_mastery_snapshot(content_locale text default 'en')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_locale text := case when content_locale in ('en', 'ru') then content_locale else 'en' end;
  result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform public.initialize_card_mastery();

  select jsonb_build_object(
    'state', to_jsonb(state_row),
    'cards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', coalesce(translation.name, c.id),
        'description', coalesce(translation.description, ''),
        'type', c.type,
        'rarity', c.rarity,
        'character_id', c.character_id,
        'pool_id', coalesce(c.character_id, pool.pool_id, 'other'),
        'active', c.active,
        'coop_only', c.coop_only,
        'solo_only', c.solo_only,
        'eligible', true
      ) order by c.id)
      from public.cards c
      left join lateral (
        select t.name, t.description
        from public.card_translations t
        where t.card_id = c.id and t.locale in (requested_locale, 'en')
        order by (t.locale = requested_locale) desc
        limit 1
      ) translation on true
      left join lateral (
        select membership.pool_id
        from public.card_pool_memberships membership
        where membership.card_id = c.id
        order by (membership.pool_id = 'colorless') desc, membership.pool_id
        limit 1
      ) pool on true
      where public.card_mastery_card_is_eligible(c.id)
    ), '[]'::jsonb),
    'progress', coalesce((
      select jsonb_agg(jsonb_build_object(
        'card_id', p.card_id,
        'max_mastered_ascension', p.max_mastered_ascension,
        'first_mastered_at', p.first_mastered_at,
        'last_mastered_at', p.last_mastered_at
      ))
      from public.card_mastery_progress p
      where p.user_id = auth.uid()
    ), '[]'::jsonb),
    'attempts', coalesce((
      select jsonb_agg(to_jsonb(recent_attempt) order by recent_attempt.finished_at desc)
      from (
        select a.id, a.card_id, a.ascension, a.character_id, a.result,
          a.card_found, a.mastered, a.started_at, a.finished_at
        from public.card_mastery_attempts a
        where a.user_id = auth.uid()
        order by a.finished_at desc
        limit 20
      ) recent_attempt
    ), '[]'::jsonb),
    'attempt_stats', coalesce((
      select jsonb_agg(jsonb_build_object(
        'card_id', totals.card_id,
        'attempts', totals.attempts,
        'mastered', totals.mastered,
        'lost', totals.lost,
        'not_found', totals.not_found
      ))
      from (
        select a.card_id,
          count(*)::integer as attempts,
          count(*) filter (where a.result = 'mastered')::integer as mastered,
          count(*) filter (where a.result = 'lost')::integer as lost,
          count(*) filter (where a.result = 'won_not_found')::integer as not_found
        from public.card_mastery_attempts a
        where a.user_id = auth.uid()
        group by a.card_id
      ) totals
    ), '[]'::jsonb)
  ) into result
  from public.card_mastery_state state_row
  where state_row.user_id = auth.uid();

  return result;
end
$$;

revoke all on function public.get_card_mastery_snapshot(text) from public;
grant execute on function public.get_card_mastery_snapshot(text) to authenticated;

-- Avoid a new MVCC/TOAST version when the client re-sends unchanged data on
-- session restoration. This is also safe for older clients that still save on load.
create or replace function public.save_user_data_if_changed(next_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  insert into public.user_data (user_id, data, updated_at)
  values (auth.uid(), next_data, now())
  on conflict (user_id) do update
    set data = excluded.data, updated_at = excluded.updated_at
    where public.user_data.data is distinct from excluded.data;
end
$$;

revoke all on function public.save_user_data_if_changed(jsonb) from public;
grant execute on function public.save_user_data_if_changed(jsonb) to authenticated;
