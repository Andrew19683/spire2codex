-- Preserve the complete game model: ordinary character cards as well as
-- colorless, status, curse, event, quest and token pools.

alter table public.cards drop constraint cards_type_check;
alter table public.cards add constraint cards_type_check
  check (type in ('Attack', 'Skill', 'Power', 'Status', 'Curse', 'Quest', 'None'));

alter table public.cards drop constraint cards_rarity_check;
alter table public.cards add constraint cards_rarity_check
  check (rarity in ('ancient', 'basic', 'common', 'curse', 'event', 'quest', 'rare', 'status', 'token', 'uncommon'));

alter table public.cards drop constraint cards_color_owner;
alter table public.cards add constraint cards_color_nonempty
  check (char_length(trim(card_color)) > 0);

alter table public.cards
  add column source_id text,
  add column in_canonical_pool boolean not null default true,
  add column show_in_card_library boolean not null default true,
  add column multiplayer_constraint text not null default 'None'
    check (multiplayer_constraint in ('None', 'MultiplayerOnly', 'SingleplayerOnly')),
  add column coop_only boolean generated always as (multiplayer_constraint = 'MultiplayerOnly') stored;

update public.cards set source_id = upper(id) where source_id is null;

alter table public.cards
  alter column source_id set not null,
  add constraint cards_source_id_nonempty check (char_length(trim(source_id)) > 0),
  add constraint cards_source_id_unique unique (source_id);

-- BCP 47 regions may be two letters (pt-BR) or three digits (es-419).
alter table public.character_translations drop constraint character_translations_locale;
alter table public.character_translations add constraint character_translations_locale
  check (locale ~ '^[a-z]{2,3}(?:-(?:[A-Z]{2}|[0-9]{3}))?$');
alter table public.card_translations drop constraint card_translations_locale;
alter table public.card_translations add constraint card_translations_locale
  check (locale ~ '^[a-z]{2,3}(?:-(?:[A-Z]{2}|[0-9]{3}))?$');

create table public.card_pools (
  id text primary key,
  character_id text references public.characters(id) on update cascade on delete restrict,
  kind text not null check (kind in ('character', 'colorless', 'status', 'curse', 'event', 'quest', 'token', 'other')),
  active boolean not null default true,
  constraint card_pools_stable_id check (id ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  constraint card_pools_character_owner check (
    (kind = 'character' and character_id is not null)
    or (kind <> 'character' and character_id is null)
  )
);

create table public.card_pool_memberships (
  card_id text not null references public.cards(id) on update cascade on delete restrict,
  pool_id text not null references public.card_pools(id) on update cascade on delete restrict,
  primary key (card_id, pool_id)
);

create index card_pool_memberships_pool_id_idx on public.card_pool_memberships (pool_id);

alter table public.card_pools enable row level security;
alter table public.card_pool_memberships enable row level security;

create policy "Game card pools are publicly readable" on public.card_pools for select using (true);
create policy "Game card pool memberships are publicly readable" on public.card_pool_memberships for select using (true);

grant select on public.card_pools, public.card_pool_memberships to anon, authenticated;

create trigger card_pools_prevent_delete before delete on public.card_pools
for each row execute function public.prevent_game_entity_delete();
create trigger card_pools_stable_id before update on public.card_pools
for each row execute function public.prevent_game_entity_id_change();

insert into public.card_pools (id, character_id, kind) values
  ('ironclad', 'ironclad', 'character'),
  ('silent', 'silent', 'character'),
  ('regent', 'regent', 'character'),
  ('necrobinder', 'necrobinder', 'character'),
  ('defect', 'defect', 'character'),
  ('colorless', null, 'colorless'),
  ('status', null, 'status'),
  ('curse', null, 'curse'),
  ('event', null, 'event'),
  ('quest', null, 'quest'),
  ('token', null, 'token'),
  ('deprecated', null, 'other')
on conflict (id) do update set
  character_id = excluded.character_id,
  kind = excluded.kind,
  active = true;

create table public.game_content_imports (
  id bigint generated always as identity primary key,
  catalog_version text not null unique,
  source_commit text not null,
  card_count integer not null check (card_count > 0),
  active_card_count integer not null check (active_card_count >= 0),
  imported_at timestamptz not null default now()
);

alter table public.game_content_imports enable row level security;

-- Intentionally no public SELECT policy: import history is operational data.

create function public.import_game_content(snapshot jsonb, allow_large_deactivation boolean default false)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  incoming_count integer;
  incoming_active_count integer;
  current_active_count integer;
  target_catalog_version text;
  target_commit text;
begin
  if snapshot is null or snapshot->>'complete' <> 'true' then
    raise exception 'A complete catalog snapshot is required';
  end if;
  if jsonb_typeof(snapshot->'cards') <> 'array' then
    raise exception 'Snapshot cards must be an array';
  end if;

  select count(*), count(*) filter (where coalesce((card->>'active')::boolean, false))
  into incoming_count, incoming_active_count
  from jsonb_array_elements(snapshot->'cards') card;

  if incoming_count = 0 then raise exception 'Snapshot contains no cards'; end if;
  if incoming_count <> (
    select count(distinct card->>'id') from jsonb_array_elements(snapshot->'cards') card
  ) then raise exception 'Snapshot contains duplicate card IDs'; end if;
  if exists (
    select 1 from jsonb_array_elements(snapshot->'cards') card
    where nullif(card->>'id', '') is null
       or nullif(card->>'sourceId', '') is null
       or nullif(card->>'type', '') is null
       or nullif(card->>'rarity', '') is null
       or nullif(card->>'cardColor', '') is null
       or not (card->'translations' ? 'en')
       or not (card->'translations' ? 'ru')
       or nullif(card->'translations'->'en'->>'name', '') is null
       or nullif(card->'translations'->'ru'->>'name', '') is null
  ) then raise exception 'Snapshot has cards with missing required fields or translations'; end if;

  select count(*) into current_active_count from public.cards where active;
  if not allow_large_deactivation
     and current_active_count > 0
     and incoming_active_count < current_active_count * 0.7 then
    raise exception 'Import would reduce active cards from % to %; explicit override required', current_active_count, incoming_active_count;
  end if;

  if nullif(snapshot->'source'->>'gameVersion', '') is null
     or nullif(snapshot->'source'->>'commit', '') is null then
    raise exception 'Snapshot source version and commit are required';
  end if;
  target_catalog_version := concat(snapshot->'source'->>'gameVersion', '+', snapshot->'source'->>'commit');
  target_commit := snapshot->'source'->>'commit';

  insert into public.cards (
    id, source_id, character_id, card_color, type, rarity, active, catalog_version,
    in_canonical_pool, show_in_card_library, multiplayer_constraint
  )
  select
    card->>'id',
    card->>'sourceId',
    nullif(card->>'characterId', ''),
    card->>'cardColor',
    card->>'type',
    card->>'rarity',
    (card->>'active')::boolean,
    target_catalog_version,
    (card->>'inCanonicalPool')::boolean,
    (card->>'showInCardLibrary')::boolean,
    card->>'multiplayerConstraint'
  from jsonb_array_elements(snapshot->'cards') card
  on conflict (id) do update set
    source_id = excluded.source_id,
    character_id = excluded.character_id,
    card_color = excluded.card_color,
    type = excluded.type,
    rarity = excluded.rarity,
    active = excluded.active,
    catalog_version = excluded.catalog_version,
    in_canonical_pool = excluded.in_canonical_pool,
    show_in_card_library = excluded.show_in_card_library,
    multiplayer_constraint = excluded.multiplayer_constraint;

  update public.cards
  set active = false, catalog_version = target_catalog_version
  where not exists (
    select 1 from jsonb_array_elements(snapshot->'cards') card where card->>'id' = cards.id
  );

  insert into public.card_translations (card_id, locale, name, description)
  select
    card->>'id',
    translation.key,
    translation.value->>'name',
    coalesce(translation.value->>'description', '')
  from jsonb_array_elements(snapshot->'cards') card
  cross join lateral jsonb_each(card->'translations') translation
  where translation.key in ('en', 'ru')
  on conflict (card_id, locale) do update set
    name = excluded.name,
    description = excluded.description;

  insert into public.card_pool_memberships (card_id, pool_id)
  select card->>'id', jsonb_array_elements_text(card->'poolIds')
  from jsonb_array_elements(snapshot->'cards') card
  on conflict (card_id, pool_id) do nothing;

  delete from public.card_pool_memberships membership
  where exists (
    select 1 from jsonb_array_elements(snapshot->'cards') card where card->>'id' = membership.card_id
  ) and not exists (
    select 1
    from jsonb_array_elements(snapshot->'cards') card
    cross join lateral jsonb_array_elements_text(card->'poolIds') pool(pool_id)
    where card->>'id' = membership.card_id and pool.pool_id = membership.pool_id
  );

  insert into public.game_content_imports (
    catalog_version, source_commit, card_count, active_card_count, imported_at
  ) values (
    target_catalog_version, target_commit, incoming_count, incoming_active_count, now()
  )
  on conflict (catalog_version) do update set
    source_commit = excluded.source_commit,
    card_count = excluded.card_count,
    active_card_count = excluded.active_card_count,
    imported_at = excluded.imported_at;

  return jsonb_build_object(
    'catalogVersion', target_catalog_version,
    'cards', incoming_count,
    'activeCards', incoming_active_count,
    'inactiveCards', incoming_count - incoming_active_count
  );
end
$$;

revoke all on function public.import_game_content(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.import_game_content(jsonb, boolean) to service_role;
