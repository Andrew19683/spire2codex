alter table public.coop_runs
  add column last_attempt_at timestamptz;

create or replace function public.advance_coop_run(target_group_id uuid, target_run_id uuid, run_result text, expected_updated_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare run_row public.coop_runs%rowtype;
begin
  if not public.is_coop_member(target_group_id) then raise exception 'Not a member'; end if;
  update public.coop_groups set updated_at = clock_timestamp() where id = target_group_id and updated_at = expected_updated_at;
  if not found then raise exception 'STALE_GROUP'; end if;
  select * into run_row from public.coop_runs where id = target_run_id and group_id = target_group_id and status = 'active' for update;
  if not found then raise exception 'STALE_RUN'; end if;
  if run_result = 'lose' then
    update public.coop_runs set status = 'lost', finished_at = now(), last_attempt_at = now() where id = target_run_id;
  elsif run_result = 'win' and run_row.current_ascension = 10 then
    update public.coop_runs set status = 'completed', completed_ascensions = 10, finished_at = now(), last_attempt_at = now() where id = target_run_id;
  elsif run_result = 'win' then
    update public.coop_runs set completed_ascensions = current_ascension, current_ascension = current_ascension + 1, last_attempt_at = now() where id = target_run_id;
  else raise exception 'Invalid result';
  end if;
end $$;

do $$
declare
  owner_user_id uuid;
  anton_user_id uuid;
  imported_group_id uuid := md5('legacy-coop-party:1776977772153')::uuid;
begin
  select id into strict owner_user_id from public.profiles where lower(username) = lower('N-drew');
  select id into strict anton_user_id from public.profiles where lower(username) = lower('1000chertey');

  insert into public.coop_groups (id, name, owner_id, created_at, updated_at)
  values (
    imported_group_id,
    'С Антоном',
    owner_user_id,
    to_timestamp(1776977772153 / 1000.0),
    to_timestamp(1785510111200 / 1000.0)
  );

  insert into public.coop_group_members (group_id, user_id, status, responded_at)
  values
    (imported_group_id, owner_user_id, 'accepted', to_timestamp(1776977772153 / 1000.0)),
    (imported_group_id, anton_user_id, 'accepted', to_timestamp(1776977772153 / 1000.0));

  insert into public.coop_runs (
    id, group_id, assignments, status, current_ascension,
    completed_ascensions, started_at, finished_at, last_attempt_at
  )
  values
    (md5('legacy-coop-run:1784993380692')::uuid, imported_group_id, jsonb_build_object(owner_user_id::text, 'regent', anton_user_id::text, 'defect'), 'active', 5, 4, to_timestamp(1784993380692 / 1000.0), null, to_timestamp(1785510111200 / 1000.0)),
    (md5('legacy-coop-run:1784831246889')::uuid, imported_group_id, jsonb_build_object(owner_user_id::text, 'ironclad', anton_user_id::text, 'silent'), 'lost', 3, 2, to_timestamp(1784831246889 / 1000.0), to_timestamp(1784993340064 / 1000.0), to_timestamp(1784993340064 / 1000.0)),
    (md5('legacy-coop-run:1782251902455')::uuid, imported_group_id, jsonb_build_object(owner_user_id::text, 'necrobinder', anton_user_id::text, 'regent'), 'lost', 7, 6, to_timestamp(1782251902455 / 1000.0), to_timestamp(1784831180194 / 1000.0), to_timestamp(1784831180194 / 1000.0)),
    (md5('legacy-coop-run:1781982368851')::uuid, imported_group_id, jsonb_build_object(owner_user_id::text, 'silent', anton_user_id::text, 'defect'), 'lost', 6, 5, to_timestamp(1781982368851 / 1000.0), to_timestamp(1782248148591 / 1000.0), to_timestamp(1782248148591 / 1000.0)),
    (md5('legacy-coop-run:1779738426294')::uuid, imported_group_id, jsonb_build_object(owner_user_id::text, 'regent', anton_user_id::text, 'regent'), 'lost', 2, 1, to_timestamp(1779738426294 / 1000.0), to_timestamp(1779908259935 / 1000.0), to_timestamp(1779908259935 / 1000.0)),
    (md5('legacy-coop-run:1779735110380')::uuid, imported_group_id, jsonb_build_object(owner_user_id::text, 'necrobinder', anton_user_id::text, 'necrobinder'), 'lost', 1, 0, to_timestamp(1779735110380 / 1000.0), to_timestamp(1779735130775 / 1000.0), to_timestamp(1779735130775 / 1000.0)),
    (md5('legacy-coop-run:1779730251754')::uuid, imported_group_id, jsonb_build_object(owner_user_id::text, 'ironclad', anton_user_id::text, 'ironclad'), 'lost', 1, 0, to_timestamp(1779730251754 / 1000.0), to_timestamp(1779733139439 / 1000.0), to_timestamp(1779733139439 / 1000.0)),
    (md5('legacy-coop-run:1778785962706')::uuid, imported_group_id, jsonb_build_object(owner_user_id::text, 'silent', anton_user_id::text, 'regent'), 'lost', 7, 6, to_timestamp(1778785962706 / 1000.0), to_timestamp(1779307972248 / 1000.0), to_timestamp(1779307972248 / 1000.0)),
    (md5('legacy-coop-run:1778777543392')::uuid, imported_group_id, jsonb_build_object(owner_user_id::text, 'ironclad', anton_user_id::text, 'necrobinder'), 'lost', 3, 2, to_timestamp(1778777543392 / 1000.0), to_timestamp(1778785852780 / 1000.0), to_timestamp(1778785852780 / 1000.0)),
    (md5('legacy-coop-run:1778532690565')::uuid, imported_group_id, jsonb_build_object(owner_user_id::text, 'necrobinder', anton_user_id::text, 'silent'), 'lost', 3, 2, to_timestamp(1778532690565 / 1000.0), to_timestamp(1778777495330 / 1000.0), to_timestamp(1778777495330 / 1000.0)),
    (md5('legacy-coop-run:1778350997134')::uuid, imported_group_id, jsonb_build_object(owner_user_id::text, 'necrobinder', anton_user_id::text, 'defect'), 'lost', 2, 1, to_timestamp(1778350997134 / 1000.0), to_timestamp(1778359504628 / 1000.0), to_timestamp(1778359504628 / 1000.0));
exception
  when no_data_found then
    raise exception 'Co-op import requires profiles N-drew and 1000chertey';
  when too_many_rows then
    raise exception 'Co-op import usernames must identify exactly one profile each';
end $$;
