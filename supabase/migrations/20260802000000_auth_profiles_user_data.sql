create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[A-Za-z0-9_-]{3,24}$')
);

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username));

alter table public.profiles enable row level security;

create policy "Profiles are publicly readable"
  on public.profiles for select
  using (true);

create or replace function public.prevent_username_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.username is distinct from old.username then
    raise exception 'username cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_username_immutable on public.profiles;
create trigger profiles_username_immutable
before update on public.profiles
for each row execute function public.prevent_username_change();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  requested_username text := new.raw_user_meta_data ->> 'username';
begin
  if requested_username is null or requested_username !~ '^[A-Za-z0-9_-]{3,24}$' then
    raise exception 'invalid username';
  end if;

  insert into public.profiles (id, username)
  values (new.id, requested_username);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_username_available(candidate text)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select candidate ~ '^[A-Za-z0-9_-]{3,24}$'
    and not exists (
      select 1 from public.profiles where lower(username) = lower(candidate)
    );
$$;

revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;

create table if not exists public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

create policy "Users can read own game data"
  on public.user_data for select
  using ((select auth.uid()) = user_id);

create policy "Users can insert own game data"
  on public.user_data for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can update own game data"
  on public.user_data for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete own game data"
  on public.user_data for delete
  using ((select auth.uid()) = user_id);
