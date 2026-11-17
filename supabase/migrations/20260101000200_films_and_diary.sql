-- Reelo: TMDB cache, film stats, diary, watchlist, lists.

------------------------------------------------------------------------------
-- films_cache: written only by the tmdb edge function (service role). Readable by users.
------------------------------------------------------------------------------
create table public.films_cache (
  tmdb_id integer primary key,
  title text not null,
  original_title text,
  year integer,
  release_date date,
  overview text,
  tagline text,
  poster_path text,
  backdrop_path text,
  genres jsonb not null default '[]',          -- [{id, name}]
  genre_ids integer[] not null default '{}',
  runtime integer,
  directors jsonb not null default '[]',       -- [{id, name, profile_path}]
  "cast" jsonb not null default '[]',          -- [{id, name, character, profile_path}] (top 15)
  providers jsonb not null default '{}',       -- {region, link, flatrate:[{id,name,logo_path}], rent:[], buy:[]}
  trailer_key text,                            -- YouTube key
  popularity numeric,
  vote_average numeric,
  palette jsonb,                               -- {primary, dark, light} derived from the poster
  is_partial boolean not null default false,   -- true when only list-level fields are known
  fetched_at timestamptz not null default now(),
  search tsvector generated always as (
    to_tsvector('simple'::regconfig, coalesce(title, '') || ' ' || coalesce(original_title, ''))
  ) stored
);

create index films_cache_search_idx on public.films_cache using gin (search);
create index films_cache_popularity_idx on public.films_cache (popularity desc nulls last);

alter table public.films_cache enable row level security;
create policy films_cache_select on public.films_cache
  for select to authenticated using (true);
-- No insert/update/delete policies: only the service role (edge function) writes.

-- Generic response cache for TMDB list endpoints (trending, search...). Service role only.
create table public.api_cache (
  key text primary key,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);
alter table public.api_cache enable row level security;
-- Intentionally no policies: invisible to anon/authenticated clients.

------------------------------------------------------------------------------
-- film_stats: Reelo average rating + histogram, maintained by diary triggers
------------------------------------------------------------------------------
create table public.film_stats (
  tmdb_id integer primary key,
  rating_count integer not null default 0,
  avg_rating numeric(3, 2),
  histogram integer[] not null default '{0,0,0,0,0,0,0,0,0,0}', -- counts for 0.5 .. 5.0
  log_count integer not null default 0,
  like_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.film_stats enable row level security;
create policy film_stats_select on public.film_stats
  for select to authenticated using (true);

------------------------------------------------------------------------------
-- diary_entries
------------------------------------------------------------------------------
create table public.diary_entries (
  id uuid primary key default gen_random_uuid(),   -- client may supply (offline queue idempotency)
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  tmdb_id integer not null,
  watched_on date not null default current_date,
  rating numeric(2, 1) check (rating is null or (rating between 0.5 and 5 and rating * 2 = floor(rating * 2))),
  review text check (char_length(review) <= 5000),
  spoiler boolean not null default false,
  tags text[] not null default '{}' check (cardinality(tags) <= 10),
  is_rewatch boolean not null default false,
  liked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()   -- set by client for last-write-wins
);

create index diary_user_watched_idx on public.diary_entries (user_id, watched_on desc);
create index diary_tmdb_idx on public.diary_entries (tmdb_id);

alter table public.diary_entries enable row level security;

-- Owner full access; others read only if the owner's profile is public or they follow the owner.
create policy diary_select on public.diary_entries
  for select to authenticated using (user_id = auth.uid() or public.can_view_user(user_id));
create policy diary_insert_own on public.diary_entries
  for insert to authenticated with check (user_id = auth.uid());
create policy diary_update_own on public.diary_entries
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy diary_delete_own on public.diary_entries
  for delete to authenticated using (user_id = auth.uid());

-- Rate limit: max 30 diary inserts per minute per end user (service role is exempt).
create or replace function public.diary_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and (
    select count(*) from public.diary_entries
    where user_id = auth.uid() and created_at > now() - interval '1 minute'
  ) >= 30 then
    raise exception 'rate_limited: too many diary entries, try again in a minute' using errcode = 'P0001';
  end if;
  if auth.uid() is not null then
    -- Clients cannot back/forward-date creation (feed ordering); updated_at may not be in the future.
    new.created_at := now();
    new.updated_at := least(coalesce(new.updated_at, now()), now());
  end if;
  return new;
end;
$$;

create trigger diary_before_insert before insert on public.diary_entries
  for each row execute function public.diary_rate_limit();

-- Recompute a film's Reelo stats from scratch (simple and always correct).
-- Uses each user's most recent rating so rewatches are not double counted.
create or replace function public.refresh_film_stats(p_tmdb_id integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with latest as (
    select distinct on (user_id) rating
    from public.diary_entries
    where tmdb_id = p_tmdb_id and rating is not null
    order by user_id, watched_on desc, created_at desc
  )
  insert into public.film_stats as fs (tmdb_id, rating_count, avg_rating, histogram, log_count, like_count, updated_at)
  select
    p_tmdb_id,
    (select count(*) from latest),
    (select round(avg(rating), 2) from latest),
    (select array_agg((select count(*) from latest l where l.rating = g / 2.0)::integer order by g)
       from generate_series(1, 10) g),
    (select count(*) from public.diary_entries where tmdb_id = p_tmdb_id),
    (select count(distinct user_id) from public.diary_entries where tmdb_id = p_tmdb_id and liked),
    now()
  on conflict (tmdb_id) do update set
    rating_count = excluded.rating_count,
    avg_rating = excluded.avg_rating,
    histogram = excluded.histogram,
    log_count = excluded.log_count,
    like_count = excluded.like_count,
    updated_at = excluded.updated_at;
end;
$$;

------------------------------------------------------------------------------
-- Last-write-wins upsert used by the offline queue (idempotent on the client UUID).
------------------------------------------------------------------------------
create or replace function public.upsert_diary_entry(
  p_id uuid,
  p_tmdb_id integer,
  p_watched_on date,
  p_rating numeric,
  p_review text,
  p_spoiler boolean,
  p_tags text[],
  p_is_rewatch boolean,
  p_liked boolean,
  p_updated_at timestamptz
)
returns setof public.diary_entries
language sql
security invoker
set search_path = public
as $$
  insert into public.diary_entries as d
    (id, user_id, tmdb_id, watched_on, rating, review, spoiler, tags, is_rewatch, liked, updated_at)
  values (
    p_id, auth.uid(), p_tmdb_id, p_watched_on, p_rating, nullif(trim(p_review), ''),
    coalesce(p_spoiler, false), coalesce(p_tags, '{}'), coalesce(p_is_rewatch, false),
    coalesce(p_liked, false), least(coalesce(p_updated_at, now()), now())
  )
  on conflict (id) do update set
    tmdb_id = excluded.tmdb_id,
    watched_on = excluded.watched_on,
    rating = excluded.rating,
    review = excluded.review,
    spoiler = excluded.spoiler,
    tags = excluded.tags,
    is_rewatch = excluded.is_rewatch,
    liked = excluded.liked,
    updated_at = excluded.updated_at
  where d.updated_at <= excluded.updated_at   -- last write wins; stale replays are ignored
  returning *;
$$;

------------------------------------------------------------------------------
-- watchlist
------------------------------------------------------------------------------
create table public.watchlist (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  tmdb_id integer not null,
  added_at timestamptz not null default now(),
  primary key (user_id, tmdb_id)
);

alter table public.watchlist enable row level security;

create policy watchlist_select on public.watchlist
  for select to authenticated using (user_id = auth.uid() or public.can_view_user(user_id));
create policy watchlist_insert_own on public.watchlist
  for insert to authenticated with check (user_id = auth.uid());
create policy watchlist_delete_own on public.watchlist
  for delete to authenticated using (user_id = auth.uid());

------------------------------------------------------------------------------
-- lists and list_items
------------------------------------------------------------------------------
create table public.lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  description text check (char_length(description) <= 1000),
  is_public boolean not null default true,
  is_ranked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lists_owner_idx on public.lists (owner_id, updated_at desc);

create trigger lists_updated_at before update on public.lists
  for each row execute function public.set_updated_at();

alter table public.lists enable row level security;

-- Public lists readable by all; private only by the owner.
create policy lists_select on public.lists
  for select to authenticated using (is_public or owner_id = auth.uid());
create policy lists_insert_own on public.lists
  for insert to authenticated with check (owner_id = auth.uid());
create policy lists_update_own on public.lists
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy lists_delete_own on public.lists
  for delete to authenticated using (owner_id = auth.uid());

create table public.list_items (
  list_id uuid not null references public.lists (id) on delete cascade,
  tmdb_id integer not null,
  position integer not null default 0,
  note text check (char_length(note) <= 500),
  added_at timestamptz not null default now(),
  primary key (list_id, tmdb_id)
);

create index list_items_order_idx on public.list_items (list_id, position);

alter table public.list_items enable row level security;

create or replace function public.can_view_list(p_list uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.lists where id = p_list and (is_public or owner_id = auth.uid()));
$$;

create or replace function public.owns_list(p_list uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.lists where id = p_list and owner_id = auth.uid());
$$;

create policy list_items_select on public.list_items
  for select to authenticated using (public.can_view_list(list_id));
create policy list_items_insert_owner on public.list_items
  for insert to authenticated with check (public.owns_list(list_id));
create policy list_items_update_owner on public.list_items
  for update to authenticated using (public.owns_list(list_id)) with check (public.owns_list(list_id));
create policy list_items_delete_owner on public.list_items
  for delete to authenticated using (public.owns_list(list_id));

-- Reorder a list in one call: positions follow the order of p_tmdb_ids.
create or replace function public.reorder_list(p_list uuid, p_tmdb_ids integer[])
returns void
language sql
security invoker
set search_path = public
as $$
  update public.list_items li
  set position = o.ord
  from unnest(p_tmdb_ids) with ordinality as o(tmdb_id, ord)
  where li.list_id = p_list and li.tmdb_id = o.tmdb_id;
  update public.lists set updated_at = now() where id = p_list;
$$;
