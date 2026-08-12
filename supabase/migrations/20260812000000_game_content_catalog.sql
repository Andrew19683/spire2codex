create table public.characters (
  id text primary key,
  display_order integer not null check (display_order >= 0),
  active boolean not null default true,
  constraint characters_stable_id check (id ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$')
);

create table public.character_translations (
  character_id text not null references public.characters(id) on update cascade on delete restrict,
  locale text not null,
  name text not null check (char_length(trim(name)) > 0),
  primary key (character_id, locale),
  constraint character_translations_locale check (locale ~ '^[a-z]{2}(?:-[A-Z]{2})?$')
);

create table public.cards (
  id text primary key,
  character_id text references public.characters(id) on update cascade on delete restrict,
  card_color text not null,
  type text not null check (type in ('Attack', 'Skill', 'Power')),
  rarity text not null check (rarity in ('common', 'uncommon', 'rare')),
  active boolean not null default true,
  catalog_version text not null check (char_length(trim(catalog_version)) > 0),
  constraint cards_stable_id check (id ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  constraint cards_color_owner check (
    (card_color = 'colorless' and character_id is null)
    or (card_color <> 'colorless' and character_id is not null)
  )
);

create index cards_character_id_idx on public.cards (character_id);
create index cards_active_idx on public.cards (active) where active;

create table public.card_translations (
  card_id text not null references public.cards(id) on update cascade on delete restrict,
  locale text not null,
  name text not null check (char_length(trim(name)) > 0),
  description text not null,
  primary key (card_id, locale),
  constraint card_translations_locale check (locale ~ '^[a-z]{2}(?:-[A-Z]{2})?$')
);

create table public.card_challenge_settings (
  card_id text not null references public.cards(id) on update cascade on delete restrict,
  challenge_id text not null,
  eligible boolean not null default true,
  primary key (card_id, challenge_id),
  constraint card_challenge_settings_stable_id check (challenge_id ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$')
);

alter table public.characters enable row level security;
alter table public.character_translations enable row level security;
alter table public.cards enable row level security;
alter table public.card_translations enable row level security;
alter table public.card_challenge_settings enable row level security;

create policy "Game characters are publicly readable" on public.characters for select using (true);
create policy "Character translations are publicly readable" on public.character_translations for select using (true);
create policy "Game cards are publicly readable" on public.cards for select using (true);
create policy "Card translations are publicly readable" on public.card_translations for select using (true);
create policy "Card challenge settings are publicly readable" on public.card_challenge_settings for select using (true);

grant select on public.characters, public.character_translations, public.cards, public.card_translations, public.card_challenge_settings to anon, authenticated;

create function public.prevent_game_entity_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Game content must be deactivated instead of deleted';
end
$$;

create function public.prevent_game_entity_id_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id then
    raise exception 'Stable game content IDs cannot be changed';
  end if;
  return new;
end
$$;

create trigger characters_prevent_delete before delete on public.characters
for each row execute function public.prevent_game_entity_delete();
create trigger cards_prevent_delete before delete on public.cards
for each row execute function public.prevent_game_entity_delete();
create trigger characters_stable_id before update on public.characters
for each row execute function public.prevent_game_entity_id_change();
create trigger cards_stable_id before update on public.cards
for each row execute function public.prevent_game_entity_id_change();

insert into public.characters (id, display_order, active) values
  ('ironclad', 1, true),
  ('silent', 2, true),
  ('regent', 3, true),
  ('necrobinder', 4, true),
  ('defect', 5, true);

insert into public.character_translations (character_id, locale, name) values
  ('ironclad', 'en', 'Ironclad'),
  ('silent', 'en', 'Silent'),
  ('regent', 'en', 'Regent'),
  ('necrobinder', 'en', 'Necrobinder'),
  ('defect', 'en', 'Defect');

-- Existing RPCs used a hard-coded character enum. Validate against the catalog instead.
create or replace function public.start_coop_run(target_group_id uuid, chosen_assignments jsonb, expected_updated_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare member_count int; valid_count int;
begin
  if not public.is_coop_member(target_group_id) then raise exception 'Not a member'; end if;
  select count(*), count(*) filter (where status = 'accepted') into member_count, valid_count from public.coop_group_members where group_id = target_group_id and status <> 'declined';
  if member_count <> valid_count then raise exception 'All invitations must be accepted'; end if;
  if (select count(*) from jsonb_object_keys(chosen_assignments)) <> member_count then raise exception 'Every player needs a character'; end if;
  if exists (
    select 1 from jsonb_each_text(chosen_assignments) a
    where not exists (select 1 from public.characters c where c.id = a.value and c.active)
       or not exists (select 1 from public.coop_group_members m where m.group_id = target_group_id and m.user_id::text = a.key and m.status = 'accepted')
  ) then raise exception 'Invalid assignments'; end if;
  update public.coop_groups set updated_at = clock_timestamp() where id = target_group_id and updated_at = expected_updated_at;
  if not found then raise exception 'STALE_GROUP'; end if;
  insert into public.coop_runs(group_id, assignments) values (target_group_id, chosen_assignments);
end $$;

create or replace function public.start_coop_master_run(target_group_id uuid,chosen_assignments jsonb,expected_updated_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare g public.coop_master_groups%rowtype;member_count int;completed jsonb;
begin
  g:=public.lock_coop_master(target_group_id,expected_updated_at);
  if not g.initialized then raise exception 'Challenge is not initialized';end if;
  select count(*) into member_count from public.coop_master_group_members where group_id=target_group_id and status='accepted';
  if member_count<>(select count(*) from public.coop_master_group_members where group_id=target_group_id and status<>'declined') or (select count(*) from jsonb_object_keys(chosen_assignments))<>member_count then raise exception 'Every accepted player needs a character';end if;
  completed:=coalesce(g.active_attempt->'completed','{}'::jsonb);
  if exists(
    select 1 from jsonb_each_text(chosen_assignments) a
    where not exists(select 1 from public.characters c where c.id=a.value and c.active)
       or not exists(select 1 from public.coop_master_group_members m where m.group_id=target_group_id and m.user_id::text=a.key and m.status='accepted')
       or coalesce(completed->a.key,'[]'::jsonb)?a.value
  ) then raise exception 'Invalid assignments';end if;
  if g.active_attempt is null then
    g.active_attempt:=jsonb_build_object('id',gen_random_uuid(),'ascension',g.current_ascension,'completed','{}'::jsonb,'assignments',chosen_assignments,'startedAt',now());
  else g.active_attempt:=jsonb_set(g.active_attempt,'{assignments}',chosen_assignments);end if;
  update public.coop_master_groups set active_attempt=g.active_attempt where id=target_group_id;
end $$;

-- Rotation completion must follow the current catalog size, not a baked-in value.
create or replace function public.active_character_count()
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.characters where active
$$;

revoke all on function public.active_character_count() from public;

create or replace function public.advance_coop_master_run(target_group_id uuid,run_result text,use_fairy boolean,expected_updated_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare g public.coop_master_groups%rowtype;completed jsonb;member record;all_done boolean:=true;fairy_used boolean;record jsonb;character_count integer;
begin
  g:=public.lock_coop_master(target_group_id,expected_updated_at);
  if g.active_attempt is null or g.active_attempt->'assignments' is null then raise exception 'STALE_RUN';end if;
  completed:=coalesce(g.active_attempt->'completed','{}'::jsonb);
  character_count:=public.active_character_count();
  if character_count=0 then raise exception 'No active characters';end if;
  if run_result='win' then
    for member in select user_id from public.coop_master_group_members where group_id=target_group_id and status='accepted' loop
      completed:=jsonb_set(completed,array[member.user_id::text],coalesce(completed->member.user_id::text,'[]'::jsonb)||jsonb_build_array(g.active_attempt->'assignments'->>member.user_id::text),true);
      if jsonb_array_length(completed->member.user_id::text)<character_count then all_done:=false;end if;
    end loop;
    if not all_done then update public.coop_master_groups set active_attempt=jsonb_set(jsonb_set(g.active_attempt,'{completed}',completed),'{assignments}','null'::jsonb) where id=target_group_id;return;end if;
    record:=jsonb_build_object('id',g.active_attempt->>'id','ascension',g.current_ascension,'completed',completed,'lostAssignments',null,'fairyUsed',false,'successful',true,'startedAt',g.active_attempt->>'startedAt','finishedAt',now());
    update public.coop_master_groups set active_attempt=null,history=jsonb_build_array(record)||history,current_ascension=case when mode='master' then 10 else least(10,current_ascension+1) end,max_ascension=greatest(max_ascension,case when mode='master' then 10 else least(10,current_ascension+1) end),fairies=fairies+1,completed_a10_once=completed_a10_once or current_ascension=10 where id=target_group_id;
  elsif run_result='lose' then
    fairy_used:=use_fairy and g.fairies>0;
    record:=jsonb_build_object('id',g.active_attempt->>'id','ascension',g.current_ascension,'completed',completed,'lostAssignments',g.active_attempt->'assignments','fairyUsed',fairy_used,'successful',false,'startedAt',g.active_attempt->>'startedAt','finishedAt',now());
    update public.coop_master_groups set active_attempt=null,history=jsonb_build_array(record)||history,fairies=fairies-case when fairy_used then 1 else 0 end,current_ascension=case when mode='master' or fairy_used then current_ascension else greatest(1,current_ascension-1) end where id=target_group_id;
  else raise exception 'Invalid result';end if;
end$$;
