-- Reelo: profiles, social graph (follows), blocks, reports + visibility helpers.
-- RLS is enabled on every table in the same migration that creates it.

------------------------------------------------------------------------------
-- profiles
------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text check (char_length(display_name) <= 50),
  avatar_url text check (char_length(avatar_url) <= 500),
  bio text check (char_length(bio) <= 300),
  is_private boolean not null default false,
  favourites integer[] not null default '{}' check (cardinality(favourites) <= 4),
  favourite_genres integer[] not null default '{}' check (cardinality(favourite_genres) <= 10),
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    to_tsvector('simple'::regconfig, username || ' ' || coalesce(display_name, ''))
  ) stored
);

create index profiles_search_idx on public.profiles using gin (search);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- Anyone signed in can read the public profile fields (the table holds no private columns:
-- email lives in auth.users). Only the owner can update. Rows are created by the auth trigger.
create policy profiles_select on public.profiles
  for select to authenticated using (true);
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Create a profile automatically for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  candidate text;
  n integer := 0;
begin
  base := lower(regexp_replace(
    coalesce(new.raw_user_meta_data ->> 'username', split_part(coalesce(new.email, ''), '@', 1), ''),
    '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(base) < 3 then
    base := 'user_' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  base := substr(base, 1, 16);
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    n := n + 1;
    candidate := base || n::text;
  end loop;

  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    candidate,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'display_name', ''), 50), ''),
    nullif(left(coalesce(new.raw_user_meta_data ->> 'avatar_url', ''), 500), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

------------------------------------------------------------------------------
-- follows (status: accepted, or pending when the target profile is private)
------------------------------------------------------------------------------
create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'accepted' check (status in ('accepted', 'pending')),
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create index follows_following_idx on public.follows (following_id);

alter table public.follows enable row level security;

-- The social graph (counts, follower lists) is visible to signed-in users.
create policy follows_select on public.follows
  for select to authenticated using (true);
-- Users create only their own follow rows.
create policy follows_insert_own on public.follows
  for insert to authenticated with check (follower_id = auth.uid());
-- Users delete their own follows; the followed user may also remove a follower / reject a request.
create policy follows_delete_own on public.follows
  for delete to authenticated using (follower_id = auth.uid() or following_id = auth.uid());
-- Only the followed user can accept a pending request.
create policy follows_accept on public.follows
  for update to authenticated using (following_id = auth.uid()) with check (following_id = auth.uid());

-- Server decides the status: pending if the target is private, else accepted.
create or replace function public.follows_set_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.profiles where id = new.following_id and is_private) then
    new.status := 'pending';
  else
    new.status := 'accepted';
  end if;
  new.created_at := now();
  return new;
end;
$$;

create trigger follows_before_insert before insert on public.follows
  for each row execute function public.follows_set_status();

-- On update only the status may change, and only from pending to accepted.
create or replace function public.follows_guard_update()
returns trigger
language plpgsql
as $$
begin
  if new.follower_id <> old.follower_id or new.following_id <> old.following_id then
    raise exception 'cannot change follow participants';
  end if;
  if new.status <> 'accepted' then
    raise exception 'follow requests can only be accepted';
  end if;
  return new;
end;
$$;

create trigger follows_before_update before update on public.follows
  for each row execute function public.follows_guard_update();

------------------------------------------------------------------------------
-- blocks and reports (basic moderation)
------------------------------------------------------------------------------
create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.blocks enable row level security;

create policy blocks_select_own on public.blocks
  for select to authenticated using (blocker_id = auth.uid());
create policy blocks_insert_own on public.blocks
  for insert to authenticated with check (blocker_id = auth.uid());
create policy blocks_delete_own on public.blocks
  for delete to authenticated using (blocker_id = auth.uid());

-- Blocking removes follows in both directions.
create or replace function public.blocks_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and following_id = new.blocked_id)
     or (follower_id = new.blocked_id and following_id = new.blocker_id);
  return null;
end;
$$;

create trigger blocks_after_insert after insert on public.blocks
  for each row execute function public.blocks_after_insert();

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('user', 'review', 'list', 'comment')),
  target_id text not null check (char_length(target_id) <= 64),
  reason text not null check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;

create policy reports_insert_own on public.reports
  for insert to authenticated with check (reporter_id = auth.uid());
create policy reports_select_own on public.reports
  for select to authenticated using (reporter_id = auth.uid());

------------------------------------------------------------------------------
-- Visibility helpers (SECURITY DEFINER so they can be used inside policies without
-- recursive RLS evaluation). They only ever answer yes/no for the *current* user.
------------------------------------------------------------------------------
create or replace function public.is_following(p_follower uuid, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.follows
    where follower_id = p_follower and following_id = p_target and status = 'accepted'
  );
$$;

create or replace function public.is_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = p_a and blocked_id = p_b) or (blocker_id = p_b and blocked_id = p_a)
  );
$$;

-- Can the current user see this user's diary/watchlist/activity?
-- Owner: always. Others: only if the profile is public OR they follow the owner (accepted),
-- and neither has blocked the other.
create or replace function public.can_view_user(p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_target = auth.uid()
    or (
      auth.uid() is not null
      and not public.is_blocked_between(auth.uid(), p_target)
      and (
        exists (select 1 from public.profiles p where p.id = p_target and not p.is_private)
        or public.is_following(auth.uid(), p_target)
      )
    );
$$;
