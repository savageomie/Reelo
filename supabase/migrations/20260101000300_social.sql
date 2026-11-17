-- Reelo: likes, comments, activity feed, notifications, push tokens.

------------------------------------------------------------------------------
-- Target helpers for likes/comments ('review' = diary entry with id, 'list' = list id, 'film' = tmdb id)
------------------------------------------------------------------------------
create or replace function public.target_owner(p_type text, p_id text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  owner uuid;
begin
  if p_type = 'review' then
    select user_id into owner from public.diary_entries where id::text = p_id;
  elsif p_type = 'list' then
    select owner_id into owner from public.lists where id::text = p_id;
  end if;
  return owner;
end;
$$;

-- Can the current user see the thing being liked / commented on?
create or replace function public.can_view_target(p_type text, p_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  owner uuid;
begin
  if p_type = 'film' then
    return true;
  elsif p_type = 'review' then
    select user_id into owner from public.diary_entries where id::text = p_id;
    return owner is not null and public.can_view_user(owner);
  elsif p_type = 'list' then
    return exists (select 1 from public.lists where id::text = p_id and (is_public or owner_id = auth.uid()));
  end if;
  return false;
end;
$$;

------------------------------------------------------------------------------
-- likes
------------------------------------------------------------------------------
create table public.likes (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('review', 'list', 'film')),
  target_id text not null check (char_length(target_id) <= 64),
  created_at timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);

create index likes_target_idx on public.likes (target_type, target_id);

alter table public.likes enable row level security;

create policy likes_select on public.likes
  for select to authenticated using (user_id = auth.uid() or public.can_view_target(target_type, target_id));
create policy likes_insert_own on public.likes
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_view_target(target_type, target_id));
create policy likes_delete_own on public.likes
  for delete to authenticated using (user_id = auth.uid());

------------------------------------------------------------------------------
-- comments
------------------------------------------------------------------------------
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('review', 'list')),
  target_id text not null check (char_length(target_id) <= 64),
  body text not null check (char_length(trim(body)) between 1 and 1000),
  spoiler boolean not null default false,
  created_at timestamptz not null default now()
);

create index comments_target_idx on public.comments (target_type, target_id, created_at);

alter table public.comments enable row level security;

create policy comments_select on public.comments
  for select to authenticated using (public.can_view_target(target_type, target_id));
create policy comments_insert_own on public.comments
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_view_target(target_type, target_id));
create policy comments_delete_own on public.comments
  for delete to authenticated using (user_id = auth.uid());

-- Rate limit: max 5 comments per minute per user.
create or replace function public.comments_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and (
    select count(*) from public.comments
    where user_id = auth.uid() and created_at > now() - interval '1 minute'
  ) >= 5 then
    raise exception 'rate_limited: too many comments, slow down' using errcode = 'P0001';
  end if;
  new.created_at := now();
  return new;
end;
$$;

create trigger comments_before_insert before insert on public.comments
  for each row execute function public.comments_rate_limit();

------------------------------------------------------------------------------
-- activity_events (feed source) — written only by triggers
------------------------------------------------------------------------------
create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('log', 'list', 'follow', 'like')),
  ref_id text not null,
  tmdb_id integer,
  created_at timestamptz not null default now()
);

create index activity_actor_idx on public.activity_events (actor_id, created_at desc, id desc);
create index activity_cursor_idx on public.activity_events (created_at desc, id desc);
create index activity_ref_idx on public.activity_events (type, ref_id);

alter table public.activity_events enable row level security;

-- Readable when the actor's activity is visible to you (private profiles: followers only).
create policy activity_select on public.activity_events
  for select to authenticated using (public.can_view_user(actor_id));

------------------------------------------------------------------------------
-- notifications and push tokens (owner only)
------------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete cascade,
  type text not null check (type in (
    'follow', 'follow_request', 'follow_accepted', 'like_review', 'like_list',
    'comment_review', 'comment_list', 'group_voting', 'group_closed', 'group_joined')),
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy notifications_update_own on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete_own on public.notifications
  for delete to authenticated using (user_id = auth.uid());

create table public.push_tokens (
  token text primary key check (char_length(token) <= 300),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  platform text,
  created_at timestamptz not null default now()
);

alter table public.push_tokens enable row level security;

create policy push_tokens_select_own on public.push_tokens
  for select to authenticated using (user_id = auth.uid());
create policy push_tokens_insert_own on public.push_tokens
  for insert to authenticated with check (user_id = auth.uid());
create policy push_tokens_update_own on public.push_tokens
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_tokens_delete_own on public.push_tokens
  for delete to authenticated using (user_id = auth.uid());

------------------------------------------------------------------------------
-- Triggers: diary -> film stats + feed event
------------------------------------------------------------------------------
create or replace function public.on_diary_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_film_stats(new.tmdb_id);
  end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.tmdb_id <> new.tmdb_id) then
    perform public.refresh_film_stats(old.tmdb_id);
  end if;

  if tg_op = 'INSERT' then
    insert into public.activity_events (actor_id, type, ref_id, tmdb_id, created_at)
    values (new.user_id, 'log', new.id::text, new.tmdb_id, least(new.created_at, now()));
  elsif tg_op = 'DELETE' then
    delete from public.activity_events where type = 'log' and ref_id = old.id::text;
    delete from public.likes where target_type = 'review' and target_id = old.id::text;
    delete from public.comments where target_type = 'review' and target_id = old.id::text;
  end if;
  return null;
end;
$$;

create trigger diary_after_change
  after insert or update or delete on public.diary_entries
  for each row execute function public.on_diary_change();

------------------------------------------------------------------------------
-- Triggers: lists -> feed event
------------------------------------------------------------------------------
create or replace function public.on_list_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.is_public then
    insert into public.activity_events (actor_id, type, ref_id) values (new.owner_id, 'list', new.id::text);
  elsif tg_op = 'UPDATE' and old.is_public and not new.is_public then
    delete from public.activity_events where type = 'list' and ref_id = new.id::text;
  elsif tg_op = 'DELETE' then
    delete from public.activity_events where type = 'list' and ref_id = old.id::text;
    delete from public.likes where target_type = 'list' and target_id = old.id::text;
    delete from public.comments where target_type = 'list' and target_id = old.id::text;
  end if;
  return null;
end;
$$;

create trigger lists_after_change
  after insert or update or delete on public.lists
  for each row execute function public.on_list_change();

------------------------------------------------------------------------------
-- Triggers: follows / likes / comments -> notifications (+ feed event)
------------------------------------------------------------------------------
create or replace function public.notify(p_user uuid, p_actor uuid, p_type text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null or p_user = p_actor then
    return;
  end if;
  insert into public.notifications (user_id, actor_id, type, payload)
  values (p_user, p_actor, p_type, coalesce(p_payload, '{}'));
end;
$$;

create or replace function public.on_follow_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      perform public.notify(new.following_id, new.follower_id, 'follow_request', '{}');
    else
      perform public.notify(new.following_id, new.follower_id, 'follow', '{}');
      insert into public.activity_events (actor_id, type, ref_id)
      values (new.follower_id, 'follow', new.following_id::text);
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    perform public.notify(new.follower_id, new.following_id, 'follow_accepted', '{}');
    delete from public.notifications
      where user_id = new.following_id and actor_id = new.follower_id and type = 'follow_request';
  elsif tg_op = 'DELETE' then
    delete from public.activity_events
      where type = 'follow' and actor_id = old.follower_id and ref_id = old.following_id::text;
    delete from public.notifications
      where user_id = old.following_id and actor_id = old.follower_id and type = 'follow_request';
  end if;
  return null;
end;
$$;

create trigger follows_after_change
  after insert or update or delete on public.follows
  for each row execute function public.on_follow_change();

create or replace function public.on_like_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
  film integer;
begin
  if new.target_type = 'film' then
    return null;
  end if;
  owner := public.target_owner(new.target_type, new.target_id);
  if new.target_type = 'review' then
    select tmdb_id into film from public.diary_entries where id::text = new.target_id;
  end if;
  perform public.notify(owner, new.user_id, 'like_' || new.target_type,
    jsonb_build_object('target_id', new.target_id, 'tmdb_id', film));
  return null;
end;
$$;

create trigger likes_after_insert after insert on public.likes
  for each row execute function public.on_like_insert();

create or replace function public.on_comment_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  film integer;
begin
  if new.target_type = 'review' then
    select tmdb_id into film from public.diary_entries where id::text = new.target_id;
  end if;
  perform public.notify(public.target_owner(new.target_type, new.target_id), new.user_id,
    'comment_' || new.target_type,
    jsonb_build_object('target_id', new.target_id, 'tmdb_id', film, 'excerpt', left(new.body, 80)));
  return null;
end;
$$;

create trigger comments_after_insert after insert on public.comments
  for each row execute function public.on_comment_insert();

------------------------------------------------------------------------------
-- get_feed(cursor, limit): cursor pagination on (created_at, id), newest first.
-- Cursor format: '<ISO timestamp>|<uuid>' of the last row of the previous page.
-- SECURITY INVOKER: RLS on activity_events, diary_entries and lists still applies,
-- so private diaries never leak into the feed.
------------------------------------------------------------------------------
create or replace function public.get_feed(p_cursor text default null, p_limit integer default 20)
returns table (
  id uuid,
  type text,
  ref_id text,
  tmdb_id integer,
  created_at timestamptz,
  actor_id uuid,
  actor_username text,
  actor_avatar_url text,
  rating numeric,
  review text,
  spoiler boolean,
  liked boolean,
  is_rewatch boolean,
  watched_on date,
  list_id uuid,
  list_title text,
  target_user_id uuid,
  target_username text,
  film_title text,
  film_year integer,
  poster_path text,
  like_count integer,
  comment_count integer,
  liked_by_me boolean
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  c_ts timestamptz;
  c_id uuid;
begin
  if p_cursor is not null and p_cursor <> '' then
    c_ts := split_part(p_cursor, '|', 1)::timestamptz;
    c_id := split_part(p_cursor, '|', 2)::uuid;
  end if;

  return query
  select
    e.id, e.type, e.ref_id, e.tmdb_id, e.created_at,
    e.actor_id, p.username, p.avatar_url,
    d.rating, d.review, d.spoiler, d.liked, d.is_rewatch, d.watched_on,
    l.id, l.title,
    tp.id, tp.username,
    fc.title, fc.year, fc.poster_path,
    (select count(*)::integer from public.likes lk
      where lk.target_type = case e.type when 'list' then 'list' else 'review' end and lk.target_id = e.ref_id),
    (select count(*)::integer from public.comments cm
      where cm.target_type = case e.type when 'list' then 'list' else 'review' end and cm.target_id = e.ref_id),
    exists (select 1 from public.likes lk
      where lk.user_id = auth.uid()
        and lk.target_type = case e.type when 'list' then 'list' else 'review' end
        and lk.target_id = e.ref_id)
  from public.activity_events e
  join public.profiles p on p.id = e.actor_id
  left join public.diary_entries d on e.type = 'log' and d.id::text = e.ref_id
  left join public.lists l on e.type = 'list' and l.id::text = e.ref_id
  left join public.profiles tp on e.type = 'follow' and tp.id::text = e.ref_id
  left join public.films_cache fc on fc.tmdb_id = e.tmdb_id
  where e.type in ('log', 'list', 'follow')
    and (e.actor_id = auth.uid() or public.is_following(auth.uid(), e.actor_id))
    and (e.type <> 'log' or d.id is not null)
    and (e.type <> 'list' or l.id is not null)
    and (c_ts is null or (e.created_at, e.id) < (c_ts, c_id))
  order by e.created_at desc, e.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

------------------------------------------------------------------------------
-- Account deletion: removing the auth user cascades through every table.
------------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_my_account() from anon;
