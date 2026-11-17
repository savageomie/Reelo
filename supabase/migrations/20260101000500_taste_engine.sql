-- Reelo: taste match, item-item similarity, recommendations, cached stats.

------------------------------------------------------------------------------
-- compute_taste_match(a, b): mean-centred cosine similarity with shrinkage.
--   1. Each user's ratings are centred on that user's own mean (harsh vs generous raters).
--   2. Cosine similarity over the films both rated (latest rating per film).
--   3. Shrinkage n / (n + 5) so a single shared film cannot give 100%.
--   4. Mapped from [-1, 1] to 0..100%.
-- SECURITY INVOKER: you can only compare against diaries RLS lets you see.
-- Mirrors features/recs/tasteMatch.ts exactly.
------------------------------------------------------------------------------
create or replace function public.compute_taste_match(p_user_a uuid, p_user_b uuid)
returns table (score integer, similarity numeric, overlap integer)
language sql
stable
security invoker
set search_path = public
as $$
  with latest as (
    select distinct on (user_id, tmdb_id) user_id, tmdb_id, rating
    from public.diary_entries
    where user_id in (p_user_a, p_user_b) and rating is not null
    order by user_id, tmdb_id, watched_on desc, created_at desc
  ),
  means as (
    select user_id, avg(rating) as m from latest group by user_id
  ),
  centred as (
    select l.user_id, l.tmdb_id, l.rating - m.m as c
    from latest l join means m using (user_id)
  ),
  pairs as (
    select a.c as ca, b.c as cb
    from centred a
    join centred b on a.tmdb_id = b.tmdb_id
    where a.user_id = p_user_a and b.user_id = p_user_b
  ),
  agg as (
    select count(*)::integer as n,
           sum(ca * cb) as dot,
           sqrt(sum(ca * ca)) as na,
           sqrt(sum(cb * cb)) as nb
    from pairs
  )
  select
    case when n = 0 then null
         else round(((case when na = 0 or nb = 0 then 0 else dot / (na * nb) end)
                     * n / (n + 5.0) + 1) / 2 * 100)::integer
    end as score,
    case when n = 0 then null
         else round((case when na = 0 or nb = 0 then 0 else dot / (na * nb) end) * n / (n + 5.0), 4)
    end as similarity,
    n as overlap
  from agg;
$$;

------------------------------------------------------------------------------
-- Precomputed tables (refreshed by pg_cron). Readable only where relevant.
------------------------------------------------------------------------------
create table public.taste_similarity (
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  score integer not null,          -- 0..100
  similarity numeric not null,     -- shrunk similarity in [-1, 1]
  overlap integer not null,
  updated_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

create index taste_similarity_b_idx on public.taste_similarity (user_b);

alter table public.taste_similarity enable row level security;
create policy taste_similarity_select_own on public.taste_similarity
  for select to authenticated using (auth.uid() in (user_a, user_b));

create table public.film_similarity (
  tmdb_id integer not null,
  similar_tmdb_id integer not null,
  score numeric not null,
  co_count integer not null,
  primary key (tmdb_id, similar_tmdb_id)
);

create index film_similarity_score_idx on public.film_similarity (tmdb_id, score desc);

alter table public.film_similarity enable row level security;
create policy film_similarity_select on public.film_similarity
  for select to authenticated using (true);

create table public.user_stats (
  user_id uuid not null references public.profiles (id) on delete cascade,
  year integer not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, year)
);

alter table public.user_stats enable row level security;
create policy user_stats_select on public.user_stats
  for select to authenticated using (user_id = auth.uid() or public.can_view_user(user_id));
create policy user_stats_insert_own on public.user_stats
  for insert to authenticated with check (user_id = auth.uid());
create policy user_stats_update_own on public.user_stats
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

------------------------------------------------------------------------------
-- Batch refreshers (SECURITY DEFINER, not callable by clients; run by pg_cron / seed).
------------------------------------------------------------------------------
create or replace function public.refresh_taste_similarity()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  delete from public.taste_similarity;
  with latest as (
    select distinct on (user_id, tmdb_id) user_id, tmdb_id, rating
    from public.diary_entries
    where rating is not null
    order by user_id, tmdb_id, watched_on desc, created_at desc
  ),
  means as (select user_id, avg(rating) as m from latest group by user_id),
  centred as (
    select l.user_id, l.tmdb_id, l.rating - m.m as c from latest l join means m using (user_id)
  ),
  pairs as (
    select a.user_id as ua, b.user_id as ub, count(*)::integer as n,
           sum(a.c * b.c) as dot, sqrt(sum(a.c * a.c)) as na, sqrt(sum(b.c * b.c)) as nb
    from centred a
    join centred b on a.tmdb_id = b.tmdb_id and a.user_id < b.user_id
    group by a.user_id, b.user_id
  ),
  sims as (
    select ua, ub, n,
           (case when na = 0 or nb = 0 then 0 else dot / (na * nb) end) * n / (n + 5.0) as s
    from pairs
  )
  insert into public.taste_similarity (user_a, user_b, score, similarity, overlap)
  select ua, ub, round((s + 1) / 2 * 100)::integer, round(s, 4), n from sims;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- Item-item collaborative filtering: two films are similar when the same users loved both
-- (rated >= 4 or hearted). Score = cosine on binary "loved" vectors. Keep top 30 per film.
create or replace function public.refresh_film_similarity()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  delete from public.film_similarity;
  with latest as (
    select distinct on (user_id, tmdb_id) user_id, tmdb_id, rating, liked
    from public.diary_entries
    order by user_id, tmdb_id, watched_on desc, created_at desc
  ),
  loved as (select user_id, tmdb_id from latest where rating >= 4 or liked),
  cnt as (select tmdb_id, count(*) as c from loved group by tmdb_id),
  co as (
    select a.tmdb_id as x, b.tmdb_id as y, count(*)::integer as n
    from loved a join loved b on a.user_id = b.user_id and a.tmdb_id <> b.tmdb_id
    group by a.tmdb_id, b.tmdb_id
    having count(*) >= 2
  ),
  scored as (
    select x, y, n, n / sqrt(ca.c * cb.c) as s,
           row_number() over (partition by x order by n / sqrt(ca.c * cb.c) desc, y) as rn
    from co
    join cnt ca on ca.tmdb_id = co.x
    join cnt cb on cb.tmdb_id = co.y
  )
  insert into public.film_similarity (tmdb_id, similar_tmdb_id, score, co_count)
  select x, y, round(s::numeric, 4), n from scored where rn <= 30;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke execute on function public.refresh_taste_similarity() from public, anon, authenticated;
revoke execute on function public.refresh_film_similarity() from public, anon, authenticated;
grant execute on function public.refresh_taste_similarity() to service_role;
grant execute on function public.refresh_film_similarity() to service_role;

------------------------------------------------------------------------------
-- Read APIs for the app (SECURITY INVOKER)
------------------------------------------------------------------------------

-- "People with similar taste": precomputed matches for the current user.
create or replace function public.get_similar_users(p_limit integer default 10, p_min_overlap integer default 3)
returns table (user_id uuid, username text, avatar_url text, display_name text, score integer, overlap integer)
language sql
stable
security invoker
set search_path = public
as $$
  select p.id, p.username, p.avatar_url, p.display_name, t.score, t.overlap
  from public.taste_similarity t
  join public.profiles p on p.id = case when t.user_a = auth.uid() then t.user_b else t.user_a end
  where auth.uid() in (t.user_a, t.user_b)
    and t.overlap >= p_min_overlap
    and not public.is_blocked_between(auth.uid(), p.id)
  order by t.score desc, t.overlap desc
  limit least(p_limit, 50);
$$;

-- Collaborative candidates: films similar to the ones you loved, minus films you've seen.
create or replace function public.get_collaborative_recs(p_limit integer default 40)
returns table (tmdb_id integer, score numeric, because_of integer)
language sql
stable
security invoker
set search_path = public
as $$
  with mine as (
    select distinct on (d.tmdb_id) d.tmdb_id, d.rating, d.liked
    from public.diary_entries d
    where d.user_id = auth.uid()
    order by d.tmdb_id, d.watched_on desc, d.created_at desc
  ),
  seeds as (select m.tmdb_id from mine m where m.rating >= 4 or m.liked)
  select fs.similar_tmdb_id,
         round(sum(fs.score), 4),
         (array_agg(fs.tmdb_id order by fs.score desc))[1]
  from public.film_similarity fs
  join seeds s on s.tmdb_id = fs.tmdb_id
  where fs.similar_tmdb_id not in (select m.tmdb_id from mine m)
    and fs.similar_tmdb_id not in (select w.tmdb_id from public.watchlist w where w.user_id = auth.uid())
  group by fs.similar_tmdb_id
  order by 2 desc
  limit least(p_limit, 100);
$$;

------------------------------------------------------------------------------
-- pg_cron: nightly refresh. Wrapped so the migration still applies where pg_cron is absent.
------------------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('reelo-taste-similarity', '15 3 * * *', 'select public.refresh_taste_similarity()');
  perform cron.schedule('reelo-film-similarity', '30 3 * * *', 'select public.refresh_film_similarity()');
exception when others then
  raise notice 'pg_cron not available (%). Schedule the refresh functions manually.', sqlerrm;
end;
$$;
