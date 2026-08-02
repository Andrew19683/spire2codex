create table public.coop_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 60),
  owner_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coop_group_members (
  group_id uuid not null references public.coop_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  status text not null check (status in ('pending', 'accepted', 'declined')),
  responded_at timestamptz,
  primary key (group_id, user_id)
);

create table public.coop_runs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.coop_groups(id) on delete cascade,
  assignments jsonb not null,
  status text not null default 'active' check (status in ('active', 'lost', 'completed')),
  current_ascension integer not null default 1 check (current_ascension between 1 and 10),
  completed_ascensions integer not null default 0 check (completed_ascensions between 0 and 10),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index coop_one_active_run on public.coop_runs(group_id) where status = 'active';

alter table public.coop_groups enable row level security;
alter table public.coop_group_members enable row level security;
alter table public.coop_runs enable row level security;

create or replace function public.is_coop_member(target_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.coop_group_members where group_id = target_group_id and user_id = auth.uid() and status <> 'declined')
$$;

create policy "Members read coop groups" on public.coop_groups for select using (public.is_coop_member(id));
create policy "Members delete coop groups" on public.coop_groups for delete using (public.is_coop_member(id));
create policy "Members read coop membership" on public.coop_group_members for select using (public.is_coop_member(group_id));
create policy "Invitees answer invitations" on public.coop_group_members for update using (user_id = auth.uid() and status = 'pending') with check (user_id = auth.uid());
create policy "Members read coop runs" on public.coop_runs for select using (public.is_coop_member(group_id));

create or replace function public.create_coop_group(group_name text, invited_user_ids uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if cardinality(invited_user_ids) < 1 or cardinality(invited_user_ids) > 3 then raise exception 'A group requires 2 to 4 players'; end if;
  if auth.uid() = any(invited_user_ids) or cardinality(invited_user_ids) <> (select count(distinct id) from unnest(invited_user_ids) id) then raise exception 'Players must be unique'; end if;
  insert into public.coop_groups(name, owner_id) values (trim(group_name), auth.uid()) returning id into new_id;
  insert into public.coop_group_members(group_id, user_id, status) values (new_id, auth.uid(), 'accepted');
  insert into public.coop_group_members(group_id, user_id, status) select new_id, id, 'pending' from unnest(invited_user_ids) id;
  return new_id;
end $$;

create or replace function public.start_coop_run(target_group_id uuid, chosen_assignments jsonb, expected_updated_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare member_count int; valid_count int;
begin
  if not public.is_coop_member(target_group_id) then raise exception 'Not a member'; end if;
  select count(*), count(*) filter (where status = 'accepted') into member_count, valid_count from public.coop_group_members where group_id = target_group_id and status <> 'declined';
  if member_count <> valid_count then raise exception 'All invitations must be accepted'; end if;
  if (select count(*) from jsonb_object_keys(chosen_assignments)) <> member_count then raise exception 'Every player needs a character'; end if;
  if exists (select 1 from jsonb_each_text(chosen_assignments) a where a.value not in ('ironclad','silent','regent','necrobinder','defect') or not exists (select 1 from public.coop_group_members m where m.group_id = target_group_id and m.user_id::text = a.key and m.status = 'accepted')) then raise exception 'Invalid assignments'; end if;
  update public.coop_groups set updated_at = clock_timestamp() where id = target_group_id and updated_at = expected_updated_at;
  if not found then raise exception 'STALE_GROUP'; end if;
  insert into public.coop_runs(group_id, assignments) values (target_group_id, chosen_assignments);
end $$;

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
    update public.coop_runs set status = 'lost', finished_at = now() where id = target_run_id;
  elsif run_result = 'win' and run_row.current_ascension = 10 then
    update public.coop_runs set status = 'completed', completed_ascensions = 10, finished_at = now() where id = target_run_id;
  elsif run_result = 'win' then
    update public.coop_runs set completed_ascensions = current_ascension, current_ascension = current_ascension + 1 where id = target_run_id;
  else raise exception 'Invalid result';
  end if;
end $$;

revoke all on function public.create_coop_group(text, uuid[]) from public;
revoke all on function public.start_coop_run(uuid, jsonb, timestamptz) from public;
revoke all on function public.advance_coop_run(uuid, uuid, text, timestamptz) from public;
grant execute on function public.create_coop_group(text, uuid[]) to authenticated;
grant execute on function public.start_coop_run(uuid, jsonb, timestamptz) to authenticated;
grant execute on function public.advance_coop_run(uuid, uuid, text, timestamptz) to authenticated;
