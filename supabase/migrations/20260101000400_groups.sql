-- Reelo: Watch Together (groups, members, picks, votes) with realtime voting.

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 60),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  invite_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  status text not null default 'picking' check (status in ('picking', 'voting', 'closed')),
  voting_mode text not null default 'ranked' check (voting_mode in ('swipe', 'ranked')),
  filters jsonb not null default '{}',   -- {max_runtime, genre_ids[], provider_ids[]}
  winner_pick_id uuid,
  result jsonb,                          -- tally snapshot (rounds) stored when voting closes
  created_at timestamptz not null default now(),
  voting_opened_at timestamptz,
  closed_at timestamptz
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index group_members_user_idx on public.group_members (user_id);

create table public.group_picks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  tmdb_id integer not null,
  added_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (group_id, tmdb_id)
);

create index group_picks_group_idx on public.group_picks (group_id, created_at);

alter table public.groups
  add constraint groups_winner_fk foreign key (winner_pick_id) references public.group_picks (id) on delete set null;

create table public.group_votes (
  group_id uuid not null references public.groups (id) on delete cascade,
  pick_id uuid not null references public.group_picks (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  value smallint check (value in (0, 1)),      -- swipe mode: 1 = yes, 0 = no
  rank smallint check (rank >= 1),             -- ranked mode: 1 = first choice
  updated_at timestamptz not null default now(),
  primary key (pick_id, user_id),
  check (value is not null or rank is not null)
);

create index group_votes_group_idx on public.group_votes (group_id);

------------------------------------------------------------------------------
-- Helpers
------------------------------------------------------------------------------
create or replace function public.is_group_member(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.group_members where group_id = p_group and user_id = auth.uid());
$$;

create or replace function public.group_status(p_group uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select status from public.groups where id = p_group;
$$;

create or replace function public.is_group_owner(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.groups where id = p_group and owner_id = auth.uid());
$$;

------------------------------------------------------------------------------
-- RLS: only members can read or write; votes only your own and only while voting.
------------------------------------------------------------------------------
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_picks enable row level security;
alter table public.group_votes enable row level security;

create policy groups_select_member on public.groups
  for select to authenticated using (owner_id = auth.uid() or public.is_group_member(id));
create policy groups_insert_owner on public.groups
  for insert to authenticated with check (owner_id = auth.uid());
create policy groups_update_owner on public.groups
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy groups_delete_owner on public.groups
  for delete to authenticated using (owner_id = auth.uid());

create policy group_members_select on public.group_members
  for select to authenticated using (public.is_group_member(group_id));
-- Joining happens through join_group(code); leaving = deleting your own row; owner may remove members.
create policy group_members_delete on public.group_members
  for delete to authenticated using (user_id = auth.uid() or public.is_group_owner(group_id));

create policy group_picks_select on public.group_picks
  for select to authenticated using (public.is_group_member(group_id));
create policy group_picks_insert on public.group_picks
  for insert to authenticated
  with check (
    added_by = auth.uid()
    and public.is_group_member(group_id)
    and public.group_status(group_id) = 'picking'
  );
create policy group_picks_delete on public.group_picks
  for delete to authenticated
  using (
    (added_by = auth.uid() or public.is_group_owner(group_id))
    and public.group_status(group_id) = 'picking'
  );

create policy group_votes_select on public.group_votes
  for select to authenticated using (public.is_group_member(group_id));
create policy group_votes_insert_own on public.group_votes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_group_member(group_id)
    and public.group_status(group_id) = 'voting'
  );
create policy group_votes_update_own on public.group_votes
  for update to authenticated
  using (user_id = auth.uid() and public.group_status(group_id) = 'voting')
  with check (user_id = auth.uid() and public.group_status(group_id) = 'voting');
create policy group_votes_delete_own on public.group_votes
  for delete to authenticated
  using (user_id = auth.uid() and public.group_status(group_id) = 'voting');

-- A vote's group_id is always derived from its pick (clients cannot vote across groups).
create or replace function public.group_votes_set_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select group_id into new.group_id from public.group_picks where id = new.pick_id;
  if new.group_id is null then
    raise exception 'unknown pick';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger group_votes_before_write before insert or update on public.group_votes
  for each row execute function public.group_votes_set_group();

-- The creator becomes the first member.
create or replace function public.groups_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_members (group_id, user_id) values (new.id, new.owner_id)
  on conflict do nothing;
  return null;
end;
$$;

create trigger groups_after_insert after insert on public.groups
  for each row execute function public.groups_after_insert();

-- Only the owner may change status via the RPCs below; direct updates may only rename / set filters.
create or replace function public.groups_guard_update()
returns trigger
language plpgsql
as $$
begin
  if current_setting('reelo.group_rpc', true) is distinct from 'on' then
    if new.status is distinct from old.status
       -- (winner may become null when the winning pick is deleted by an account-deletion cascade)
       or (new.winner_pick_id is distinct from old.winner_pick_id and new.winner_pick_id is not null)
       or new.result is distinct from old.result
       or new.invite_code is distinct from old.invite_code
       or new.owner_id is distinct from old.owner_id then
      raise exception 'use start_voting / close_voting to change the group state';
    end if;
  end if;
  return new;
end;
$$;

create trigger groups_before_update before update on public.groups
  for each row execute function public.groups_guard_update();

------------------------------------------------------------------------------
-- tally_ranked_choice(group): instant-runoff voting.
-- Each member's ballot = their ranked picks (rank asc). Each round counts every ballot's
-- highest-ranked pick still in the race. A pick with > 50% of non-exhausted ballots wins.
-- Otherwise eliminate the pick with the fewest votes; ties broken by fewest total (Borda)
-- points, then the most recently added. Mirrors features/groups/rankedChoice.ts exactly.
------------------------------------------------------------------------------
create or replace function public.tally_ranked_choice(p_group uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  active uuid[];
  n integer;
  points jsonb;
  counts jsonb;
  total integer;
  rounds jsonb := '[]'::jsonb;
  x uuid;
  v integer;
  pt integer;
  leader uuid;
  leader_votes integer;
  loser uuid;
  loser_votes integer;
  loser_points integer;
  winner uuid;
begin
  select array_agg(id order by created_at, id) into active
  from public.group_picks where group_id = p_group;

  if active is null then
    return jsonb_build_object('winner', null, 'rounds', rounds, 'points', '{}'::jsonb);
  end if;
  n := cardinality(active);

  -- Borda points over full ballots: first choice = n points, second = n - 1, ...
  select coalesce(jsonb_object_agg(s.pid, s.pts), '{}'::jsonb) into points
  from (
    select gp.id as pid, coalesce(sum(n - b.pos + 1), 0)::integer as pts
    from public.group_picks gp
    left join (
      select pick_id, row_number() over (partition by user_id order by rank, pick_id) as pos
      from public.group_votes
      where group_id = p_group and rank is not null
    ) b on b.pick_id = gp.id
    where gp.group_id = p_group
    group by gp.id
  ) s;

  loop
    with firsts as (
      select distinct on (gv.user_id) gv.pick_id
      from public.group_votes gv
      where gv.group_id = p_group and gv.rank is not null and gv.pick_id = any (active)
      order by gv.user_id, gv.rank, gv.pick_id
    ),
    tallied as (
      select pick_id, count(*)::integer as cnt from firsts group by pick_id
    )
    select coalesce(jsonb_object_agg(a.pid, coalesce(t.cnt, 0)), '{}'::jsonb),
           coalesce(sum(t.cnt), 0)::integer
      into counts, total
    from unnest(active) as a(pid)
    left join tallied t on t.pick_id = a.pid;

    leader := null;
    leader_votes := -1;
    foreach x in array active loop
      v := (counts ->> x::text)::integer;
      if v > leader_votes then
        leader := x;
        leader_votes := v;
      end if;
    end loop;

    if (total > 0 and leader_votes * 2 > total) or cardinality(active) = 1 then
      winner := leader;
      rounds := rounds || jsonb_build_array(jsonb_build_object('counts', counts, 'eliminated', null));
      exit;
    end if;

    loser := null;
    foreach x in array active loop
      v := (counts ->> x::text)::integer;
      pt := (points ->> x::text)::integer;
      if loser is null or v < loser_votes or (v = loser_votes and pt <= loser_points) then
        loser := x;
        loser_votes := v;
        loser_points := pt;
      end if;
    end loop;

    rounds := rounds || jsonb_build_array(jsonb_build_object('counts', counts, 'eliminated', loser));
    active := array_remove(active, loser);
  end loop;

  return jsonb_build_object('winner', winner, 'rounds', rounds, 'points', points);
end;
$$;

------------------------------------------------------------------------------
-- RPCs
------------------------------------------------------------------------------
create or replace function public.join_group(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.groups;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  select * into g from public.groups where invite_code = upper(trim(p_code));
  if g.id is null then
    raise exception 'No group with that invite code';
  end if;
  if g.status = 'closed' then
    raise exception 'That group has already picked its film';
  end if;
  if not exists (select 1 from public.group_members where group_id = g.id and user_id = auth.uid()) then
    insert into public.group_members (group_id, user_id) values (g.id, auth.uid());
    perform public.notify(g.owner_id, auth.uid(), 'group_joined',
      jsonb_build_object('group_id', g.id, 'group_name', g.name));
  end if;
  return g.id;
end;
$$;

create or replace function public.start_voting(p_group uuid, p_mode text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.groups;
  m record;
begin
  select * into g from public.groups where id = p_group;
  if g.owner_id is distinct from auth.uid() then
    raise exception 'Only the group owner can start voting';
  end if;
  if g.status <> 'picking' then
    raise exception 'Voting already started';
  end if;
  if (select count(*) from public.group_picks where group_id = p_group) < 2 then
    raise exception 'Add at least two picks before voting';
  end if;
  perform set_config('reelo.group_rpc', 'on', true);
  update public.groups
    set status = 'voting',
        voting_mode = coalesce(p_mode, voting_mode),
        voting_opened_at = now()
    where id = p_group;
  perform set_config('reelo.group_rpc', 'off', true);
  for m in select user_id from public.group_members where group_id = p_group loop
    perform public.notify(m.user_id, auth.uid(), 'group_voting',
      jsonb_build_object('group_id', g.id, 'group_name', g.name));
  end loop;
end;
$$;

create or replace function public.close_voting(p_group uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.groups;
  tally jsonb;
  w uuid;
  w_tmdb integer;
  m record;
begin
  select * into g from public.groups where id = p_group;
  if g.owner_id is distinct from auth.uid() then
    raise exception 'Only the group owner can close voting';
  end if;
  if g.status <> 'voting' then
    raise exception 'Voting is not open';
  end if;

  if g.voting_mode = 'ranked' then
    tally := public.tally_ranked_choice(p_group);
    w := (tally ->> 'winner')::uuid;
  else
    -- Swipe: most "yes" votes; ties -> earliest added.
    select gp.id into w
    from public.group_picks gp
    left join public.group_votes v on v.pick_id = gp.id and v.value = 1
    where gp.group_id = p_group
    group by gp.id, gp.created_at
    order by count(v.user_id) desc, gp.created_at, gp.id
    limit 1;
    select jsonb_build_object('winner', w, 'yes', coalesce(jsonb_object_agg(s.id, s.yes), '{}'::jsonb))
      into tally
    from (
      select gp.id, count(v.user_id) as yes
      from public.group_picks gp
      left join public.group_votes v on v.pick_id = gp.id and v.value = 1
      where gp.group_id = p_group
      group by gp.id
    ) s;
  end if;

  perform set_config('reelo.group_rpc', 'on', true);
  update public.groups
    set status = 'closed', winner_pick_id = w, result = tally, closed_at = now()
    where id = p_group;
  perform set_config('reelo.group_rpc', 'off', true);

  select tmdb_id into w_tmdb from public.group_picks where id = w;
  -- Add the winner to everyone's watchlist and tell them.
  for m in select user_id from public.group_members where group_id = p_group loop
    if w_tmdb is not null then
      insert into public.watchlist (user_id, tmdb_id) values (m.user_id, w_tmdb) on conflict do nothing;
    end if;
    perform public.notify(m.user_id, auth.uid(), 'group_closed',
      jsonb_build_object('group_id', g.id, 'group_name', g.name, 'tmdb_id', w_tmdb));
  end loop;
  return w;
end;
$$;

-- Owner can reopen picking (e.g. demo reset): clears votes and result.
create or replace function public.reset_group(p_group uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_group_owner(p_group) then
    raise exception 'Only the group owner can reset';
  end if;
  delete from public.group_votes where group_id = p_group;
  perform set_config('reelo.group_rpc', 'on', true);
  update public.groups
    set status = 'picking', winner_pick_id = null, result = null, closed_at = null, voting_opened_at = null
    where id = p_group;
  perform set_config('reelo.group_rpc', 'off', true);
end;
$$;
