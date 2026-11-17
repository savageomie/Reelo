-- Supabase enables pg_safeupdate for API/RPC requests, which rejects DELETE/UPDATE without a
-- WHERE clause ("DELETE requires a WHERE clause"). Redefine the batch refreshers so their full
-- table wipes use `where true`. Bodies are otherwise identical to 20260101000500_taste_engine.sql;
-- `create or replace` keeps the existing grants (service_role only).

create or replace function public.refresh_taste_similarity()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  delete from public.taste_similarity where true;
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

create or replace function public.refresh_film_similarity()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  delete from public.film_similarity where true;
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
