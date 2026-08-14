create table public.card_mastery_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null references public.cards(id) on update cascade on delete restrict,
  max_mastered_ascension integer not null default 0 check (max_mastered_ascension between 0 and 10),
  first_mastered_at timestamptz,
  last_mastered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

create table public.card_mastery_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_ascension integer not null default 1 check (current_ascension between 1 and 10),
  active_card_id text references public.cards(id) on update cascade on delete restrict,
  selected_character_id text references public.characters(id) on update cascade on delete restrict,
  active_attempt_started_at timestamptz,
  completed boolean not null default false,
  first_completed_at timestamptz,
  last_completed_at timestamptz,
  additional_cards_count integer not null default 0 check (additional_cards_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint card_mastery_active_attempt_complete check (
    (active_card_id is null and selected_character_id is null and active_attempt_started_at is null)
    or (active_card_id is not null and selected_character_id is not null and active_attempt_started_at is not null)
  ),
  constraint card_mastery_completed_has_no_attempt check (not completed or active_card_id is null)
);

create table public.card_mastery_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null references public.cards(id) on update cascade on delete restrict,
  ascension integer not null check (ascension between 1 and 10),
  character_id text not null references public.characters(id) on update cascade on delete restrict,
  result text not null check (result in ('mastered', 'won_not_found', 'lost')),
  card_found boolean not null,
  mastered boolean not null,
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  constraint card_mastery_attempt_result_consistent check (
    (result = 'mastered' and card_found and mastered)
    or (result = 'won_not_found' and not card_found and not mastered)
    or (result = 'lost' and not mastered)
  )
);

create index card_mastery_progress_card_idx on public.card_mastery_progress (card_id);
create index card_mastery_attempts_user_finished_idx on public.card_mastery_attempts (user_id, finished_at desc);
create index card_mastery_attempts_card_idx on public.card_mastery_attempts (user_id, card_id);

alter table public.card_mastery_progress enable row level security;
alter table public.card_mastery_state enable row level security;
alter table public.card_mastery_attempts enable row level security;

create policy "Players read own Card Mastery progress" on public.card_mastery_progress
  for select using (auth.uid() = user_id);
create policy "Players read own Card Mastery state" on public.card_mastery_state
  for select using (auth.uid() = user_id);
create policy "Players read own Card Mastery attempts" on public.card_mastery_attempts
  for select using (auth.uid() = user_id);

grant select on public.card_mastery_progress, public.card_mastery_state, public.card_mastery_attempts to authenticated;

create function public.card_mastery_card_is_eligible(target_card_id text)
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
      and coalesce((
        select s.eligible
        from public.card_challenge_settings s
        where s.card_id = c.id and s.challenge_id = 'card_mastery'
      ), true)
  )
$$;

revoke all on function public.card_mastery_card_is_eligible(text) from public;

create function public.initialize_card_mastery()
returns public.card_mastery_state
language plpgsql
security definer
set search_path = ''
as $$
declare result public.card_mastery_state;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.card_mastery_state (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select * into result from public.card_mastery_state where user_id = auth.uid();
  return result;
end
$$;

create function public.start_card_mastery_attempt(target_card_id text, chosen_character_id text)
returns public.card_mastery_state
language plpgsql
security definer
set search_path = ''
as $$
declare state public.card_mastery_state; owner_id text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform public.initialize_card_mastery();
  select * into state from public.card_mastery_state where user_id = auth.uid() for update;
  if state.completed then raise exception 'Card Mastery is completed'; end if;
  if state.active_card_id is not null then raise exception 'An attempt is already active'; end if;
  if not public.card_mastery_card_is_eligible(target_card_id) then raise exception 'Card is not eligible'; end if;
  if coalesce((select max_mastered_ascension from public.card_mastery_progress where user_id = auth.uid() and card_id = target_card_id), 0) >= state.current_ascension then
    raise exception 'Card is already mastered at this Ascension';
  end if;

  select character_id into owner_id from public.cards where id = target_card_id;
  if owner_id is not null and chosen_character_id is distinct from owner_id then
    raise exception 'Character card requires its owner';
  end if;
  if owner_id is null and not exists (select 1 from public.characters where id = chosen_character_id and active) then
    raise exception 'Colorless card requires an active character';
  end if;

  update public.card_mastery_state set
    active_card_id = target_card_id,
    selected_character_id = chosen_character_id,
    active_attempt_started_at = now(),
    updated_at = now()
  where user_id = auth.uid()
  returning * into state;
  return state;
end
$$;

create function public.finish_card_mastery_attempt(attempt_result text)
returns public.card_mastery_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  state public.card_mastery_state;
  candidate_ascension integer;
  available_ascension integer;
  eligible_count integer;
  mastered_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if attempt_result not in ('mastered', 'won_not_found', 'lost') then raise exception 'Invalid result'; end if;
  select * into state from public.card_mastery_state where user_id = auth.uid() for update;
  if state.active_card_id is null then raise exception 'No active attempt'; end if;

  insert into public.card_mastery_attempts (
    user_id, card_id, ascension, character_id, result, card_found, mastered, started_at
  ) values (
    auth.uid(), state.active_card_id, state.current_ascension, state.selected_character_id,
    attempt_result, attempt_result = 'mastered', attempt_result = 'mastered', state.active_attempt_started_at
  );

  if attempt_result = 'mastered' then
    insert into public.card_mastery_progress (
      user_id, card_id, max_mastered_ascension, first_mastered_at, last_mastered_at
    ) values (
      auth.uid(), state.active_card_id, state.current_ascension, now(), now()
    ) on conflict (user_id, card_id) do update set
      max_mastered_ascension = greatest(public.card_mastery_progress.max_mastered_ascension, excluded.max_mastered_ascension),
      first_mastered_at = coalesce(public.card_mastery_progress.first_mastered_at, excluded.first_mastered_at),
      last_mastered_at = case
        when excluded.max_mastered_ascension > public.card_mastery_progress.max_mastered_ascension then excluded.last_mastered_at
        else public.card_mastery_progress.last_mastered_at
      end,
      updated_at = now();
    candidate_ascension := least(10, state.current_ascension + 1);
  elsif attempt_result = 'lost' then
    candidate_ascension := greatest(1, state.current_ascension - 1);
  else
    candidate_ascension := state.current_ascension;
  end if;

  select count(*) into eligible_count from public.cards c where public.card_mastery_card_is_eligible(c.id);
  select count(*) into mastered_count
  from public.cards c
  where public.card_mastery_card_is_eligible(c.id)
    and coalesce((select p.max_mastered_ascension from public.card_mastery_progress p where p.user_id = auth.uid() and p.card_id = c.id), 0) >= 10;

  if eligible_count > 0 and mastered_count = eligible_count then
    update public.card_mastery_state set
      active_card_id = null, selected_character_id = null, active_attempt_started_at = null,
      current_ascension = 10, completed = true,
      first_completed_at = coalesce(first_completed_at, now()), last_completed_at = now(),
      additional_cards_count = 0, updated_at = now()
    where user_id = auth.uid() returning * into state;
    return state;
  end if;

  select level into available_ascension
  from generate_series(candidate_ascension, 10) level
  where exists (
    select 1 from public.cards c
    where public.card_mastery_card_is_eligible(c.id)
      and coalesce((select p.max_mastered_ascension from public.card_mastery_progress p where p.user_id = auth.uid() and p.card_id = c.id), 0) < level
  )
  order by level limit 1;

  update public.card_mastery_state set
    active_card_id = null, selected_character_id = null, active_attempt_started_at = null,
    current_ascension = coalesce(available_ascension, candidate_ascension),
    completed = false,
    additional_cards_count = case when first_completed_at is not null then eligible_count - mastered_count else 0 end,
    updated_at = now()
  where user_id = auth.uid() returning * into state;
  return state;
end
$$;

create function public.cancel_invalid_card_mastery_attempt()
returns public.card_mastery_state
language plpgsql
security definer
set search_path = ''
as $$
declare state public.card_mastery_state;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into state from public.card_mastery_state where user_id = auth.uid() for update;
  if state.active_card_id is not null and not public.card_mastery_card_is_eligible(state.active_card_id) then
    update public.card_mastery_state set
      active_card_id = null, selected_character_id = null, active_attempt_started_at = null, updated_at = now()
    where user_id = auth.uid() returning * into state;
  end if;
  return state;
end
$$;

revoke all on function public.initialize_card_mastery() from public;
revoke all on function public.start_card_mastery_attempt(text, text) from public;
revoke all on function public.finish_card_mastery_attempt(text) from public;
revoke all on function public.cancel_invalid_card_mastery_attempt() from public;
grant execute on function public.initialize_card_mastery() to authenticated;
grant execute on function public.start_card_mastery_attempt(text, text) to authenticated;
grant execute on function public.finish_card_mastery_attempt(text) to authenticated;
grant execute on function public.cancel_invalid_card_mastery_attempt() to authenticated;

create function public.reconcile_card_mastery_catalog()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare affected integer;
begin
  with requirements as (
    select s.user_id,
      count(*) filter (
        where coalesce((select p.max_mastered_ascension from public.card_mastery_progress p where p.user_id = s.user_id and p.card_id = c.id), 0) < 10
      )::integer as missing,
      count(*)::integer as total
    from public.card_mastery_state s
    cross join public.cards c
    where public.card_mastery_card_is_eligible(c.id)
    group by s.user_id
  ), next_levels as (
    select r.user_id, min(level)::integer as next_level
    from requirements r
    cross join generate_series(1, 10) level
    where exists (
      select 1 from public.cards c
      where public.card_mastery_card_is_eligible(c.id)
        and coalesce((select p.max_mastered_ascension from public.card_mastery_progress p where p.user_id = r.user_id and p.card_id = c.id), 0) < level
    )
    group by r.user_id
  )
  update public.card_mastery_state s set
    completed = r.total > 0 and r.missing = 0,
    current_ascension = case when r.missing = 0 then 10 else coalesce(n.next_level, s.current_ascension) end,
    active_card_id = case when s.active_card_id is not null and not public.card_mastery_card_is_eligible(s.active_card_id) then null else s.active_card_id end,
    selected_character_id = case when s.active_card_id is not null and not public.card_mastery_card_is_eligible(s.active_card_id) then null else s.selected_character_id end,
    active_attempt_started_at = case when s.active_card_id is not null and not public.card_mastery_card_is_eligible(s.active_card_id) then null else s.active_attempt_started_at end,
    additional_cards_count = case when s.first_completed_at is not null then r.missing else 0 end,
    first_completed_at = case when r.total > 0 and r.missing = 0 then coalesce(s.first_completed_at, now()) else s.first_completed_at end,
    last_completed_at = case when r.total > 0 and r.missing = 0 and not s.completed then now() else s.last_completed_at end,
    updated_at = now()
  from requirements r left join next_levels n on n.user_id = r.user_id
  where s.user_id = r.user_id;
  get diagnostics affected = row_count;
  return affected;
end
$$;

revoke all on function public.reconcile_card_mastery_catalog() from public;
grant execute on function public.reconcile_card_mastery_catalog() to service_role;
