#!/usr/bin/env node
/**
 * Database tests: applies every migration in supabase/migrations to an in-process Postgres
 * (PGlite, WASM) with a minimal Supabase stub (auth schema, roles), then checks RLS policies with
 * multiple accounts, triggers, and the SQL algorithms against the TypeScript worked examples.
 *
 *   npm run test:db
 *
 * No Docker, no network, no Supabase project needed.
 */
import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'supabase', 'migrations');

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create function auth.role() returns text language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
  $$;
  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

const db = new PGlite();
const results = [];

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    results.push({ name, ok: false, err });
    console.log(`  ✗ ${name}\n      ${err.message.split('\n').join('\n      ')}`);
  } finally {
    await db.exec('reset role;');
  }
}

/** Run SQL as an authenticated user (RLS applies). */
async function as(userId, sql, params = []) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? '']);
  await db.query(`select set_config('request.jwt.claim.role', $1, false)`, [userId ? 'authenticated' : 'anon']);
  await db.exec(userId ? 'set role authenticated;' : 'set role anon;');
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role;');
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}

/** Run SQL as superuser (like the service role / migrations). */
const admin = (sql, params = []) => db.query(sql, params);

/**
 * Mimics Supabase's pg_safeupdate: returns every DELETE/UPDATE statement in `src` that has no
 * top-level WHERE clause (pg_safeupdate rejects those for API/RPC calls). Comments and string
 * literals are stripped first; `on conflict ... do update`, `for update`, `on delete/update`
 * and trigger clauses are ignored.
 */
function findUnqualifiedWrites(src) {
  const code = src
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .toLowerCase();
  const offenders = [];
  const re = /\b(delete\s+from|update)\s+(?:only\s+)?[a-z_][a-z0-9_."]*/g;
  let m;
  while ((m = re.exec(code))) {
    const before = code.slice(Math.max(0, m.index - 12), m.index);
    if (/\b(do|for|on|or|of|before|after)\s+$/.test(before)) continue;
    if (m[1] === 'update' && !/^\s*(?:as\s+)?[a-z_]*\s*set\b/.test(code.slice(re.lastIndex))) continue;
    // Walk to the end of the statement, tracking paren depth; look for a top-level WHERE.
    let depth = 0;
    let hasWhere = false;
    let i = re.lastIndex;
    for (; i < code.length; i++) {
      const ch = code[i];
      if (ch === '(') depth++;
      else if (ch === ')') {
        if (depth === 0) break; // statement ends inside an enclosing CTE / subquery
        depth--;
      } else if (ch === ';' && depth === 0) break;
      else if (
        depth === 0 &&
        code.startsWith('where', i) &&
        !/[a-z0-9_]/.test(code[i - 1]) &&
        !/[a-z0-9_]/.test(code[i + 5] ?? '')
      ) {
        hasWhere = true;
        break;
      }
    }
    if (!hasWhere) offenders.push(code.slice(m.index, Math.min(i, m.index + 80)).replace(/\s+/g, ' ').trim());
  }
  return offenders;
}

async function rejects(promise, pattern) {
  let failed = false;
  try {
    await promise;
  } catch (err) {
    failed = true;
    if (pattern) assert.match(err.message, pattern);
  }
  assert.ok(failed, 'expected the statement to be rejected');
}

const U = {
  alice: '00000000-0000-4000-8000-00000000000a',
  bob: '00000000-0000-4000-8000-00000000000b',
  carol: '00000000-0000-4000-8000-00000000000c',
  dave: '00000000-0000-4000-8000-00000000000d',
};

async function main() {
  console.log('Applying Supabase stub + migrations...');
  await db.exec(SUPABASE_STUB);
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    try {
      await db.exec(readFileSync(join(migrationsDir, f), 'utf8'));
      console.log(`  applied ${f}`);
    } catch (err) {
      console.error(`  FAILED ${f}: ${err.message}`);
      process.exit(1);
    }
  }

  // Sign-ups (the auth trigger creates profiles). Bob's diary is private.
  for (const [name, id] of Object.entries(U)) {
    await admin(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
      id,
      `${name}@example.com`,
      JSON.stringify({ username: name }),
    ]);
  }
  await admin(`update public.profiles set is_private = true where id = $1`, [U.bob]);

  console.log('\nProfiles');
  await test('auth trigger creates a profile with the requested username', async () => {
    const { rows } = await admin(`select username from public.profiles order by username`);
    assert.deepEqual(rows.map((r) => r.username), ['alice', 'bob', 'carol', 'dave']);
  });

  await test('duplicate / invalid usernames are sanitised and made unique', async () => {
    await admin(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'x@example.com', $2)`, [
      '00000000-0000-4000-8000-0000000000ee',
      JSON.stringify({ username: 'Alice!' }),
    ]);
    const { rows } = await admin(`select username from public.profiles where id = $1`, ['00000000-0000-4000-8000-0000000000ee']);
    assert.equal(rows[0].username, 'alice1');
    await admin(`delete from auth.users where id = $1`, ['00000000-0000-4000-8000-0000000000ee']);
  });

  await test('a user can update only their own profile', async () => {
    await as(U.alice, `update public.profiles set bio = 'hi' where id = $1`, [U.alice]);
    const r = await as(U.alice, `update public.profiles set bio = 'hacked' where id = $1`, [U.bob]);
    assert.equal(r.affectedRows, 0);
    const { rows } = await admin(`select bio from public.profiles where id = $1`, [U.bob]);
    assert.equal(rows[0].bio, null);
  });

  await test('username format is enforced by a CHECK constraint', async () => {
    await rejects(as(U.alice, `update public.profiles set username = 'No Spaces!' where id = $1`, [U.alice]), /check/);
  });

  console.log('\nDiary RLS (two-account checks)');
  const aliceEntry = '10000000-0000-4000-8000-000000000001';
  const bobEntry = '10000000-0000-4000-8000-000000000002';

  await test('owner can insert diary entries', async () => {
    await as(U.alice, `insert into public.diary_entries (id, tmdb_id, rating, review) values ($1, 27205, 4.5, 'Dreams!')`, [aliceEntry]);
    await as(U.bob, `insert into public.diary_entries (id, tmdb_id, rating, review) values ($1, 27205, 3, 'Secret take')`, [bobEntry]);
  });

  await test('cannot insert a diary entry for another user', async () => {
    await rejects(as(U.alice, `insert into public.diary_entries (user_id, tmdb_id) values ($1, 550)`, [U.bob]), /row-level security/);
  });

  await test('cannot update or delete another user’s entry', async () => {
    const up = await as(U.carol, `update public.diary_entries set rating = 1 where id = $1`, [aliceEntry]);
    const del = await as(U.carol, `delete from public.diary_entries where id = $1`, [aliceEntry]);
    assert.equal(up.affectedRows, 0);
    assert.equal(del.affectedRows, 0);
  });

  await test('half-star ratings only (0.5..5)', async () => {
    await rejects(as(U.alice, `insert into public.diary_entries (tmdb_id, rating) values (550, 4.3)`), /check/);
    await rejects(as(U.alice, `insert into public.diary_entries (tmdb_id, rating) values (550, 6)`), /check|numeric/);
  });

  await test('public diary is readable by others', async () => {
    const { rows } = await as(U.carol, `select id from public.diary_entries where user_id = $1`, [U.alice]);
    assert.equal(rows.length, 1);
  });

  await test('private diary is hidden from non-followers', async () => {
    const { rows } = await as(U.carol, `select id from public.diary_entries where user_id = $1`, [U.bob]);
    assert.equal(rows.length, 0);
  });

  await test('follow request to a private user is pending and still hides the diary', async () => {
    await as(U.carol, `insert into public.follows (follower_id, following_id) values ($1, $2)`, [U.carol, U.bob]);
    const { rows: f } = await admin(`select status from public.follows where follower_id = $1 and following_id = $2`, [U.carol, U.bob]);
    assert.equal(f[0].status, 'pending');
    const { rows } = await as(U.carol, `select id from public.diary_entries where user_id = $1`, [U.bob]);
    assert.equal(rows.length, 0);
    const { rows: n } = await as(U.bob, `select type from public.notifications`);
    assert.deepEqual(n.map((x) => x.type), ['follow_request']);
  });

  await test('the requester cannot accept their own request', async () => {
    const r = await as(U.carol, `update public.follows set status = 'accepted' where follower_id = $1`, [U.carol]);
    assert.equal(r.affectedRows, 0);
  });

  await test('after the owner accepts, the follower can read the private diary', async () => {
    await as(U.bob, `update public.follows set status = 'accepted' where follower_id = $1 and following_id = $2`, [U.carol, U.bob]);
    const { rows } = await as(U.carol, `select id from public.diary_entries where user_id = $1`, [U.bob]);
    assert.equal(rows.length, 1);
    // ...but a third user still cannot.
    const { rows: d } = await as(U.dave, `select id from public.diary_entries where user_id = $1`, [U.bob]);
    assert.equal(d.length, 0);
  });

  await test('cannot create a follow on behalf of someone else', async () => {
    await rejects(as(U.dave, `insert into public.follows (follower_id, following_id) values ($1, $2)`, [U.alice, U.carol]), /row-level security/);
  });

  await test('blocking hides a public diary and removes follows', async () => {
    await as(U.dave, `insert into public.follows (follower_id, following_id) values ($1, $2)`, [U.dave, U.alice]);
    await as(U.alice, `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [U.alice, U.dave]);
    const { rows } = await as(U.dave, `select id from public.diary_entries where user_id = $1`, [U.alice]);
    assert.equal(rows.length, 0);
    const { rows: f } = await admin(`select 1 from public.follows where follower_id = $1 and following_id = $2`, [U.dave, U.alice]);
    assert.equal(f.length, 0);
    await as(U.alice, `delete from public.blocks where blocked_id = $1`, [U.dave]);
  });

  await test('anonymous (signed-out) clients see nothing', async () => {
    const { rows } = await as(null, `select id from public.diary_entries`).catch(() => ({ rows: [] }));
    assert.equal(rows.length, 0);
  });

  console.log('\nTriggers: film stats, feed events, last-write-wins');
  await test('film_stats tracks average, histogram and counts (latest rating per user)', async () => {
    await as(U.carol, `insert into public.diary_entries (tmdb_id, rating, watched_on) values (27205, 2, '2025-01-01')`);
    await as(U.carol, `insert into public.diary_entries (tmdb_id, rating, watched_on, is_rewatch, liked) values (27205, 4, '2026-01-01', true, true)`);
    const { rows } = await admin(`select rating_count, avg_rating::float as avg, histogram, log_count, like_count from public.film_stats where tmdb_id = 27205`);
    // latest per user: alice 4.5, bob 3, carol 4 -> avg 3.83
    assert.equal(rows[0].rating_count, 3);
    assert.equal(rows[0].avg, 3.83);
    assert.deepEqual(rows[0].histogram, [0, 0, 0, 0, 0, 1, 0, 1, 1, 0]);
    assert.equal(rows[0].log_count, 4);
    assert.equal(rows[0].like_count, 1);
  });

  await test('logging a film writes an activity event; deleting removes it', async () => {
    const id = '10000000-0000-4000-8000-0000000000ff';
    await as(U.alice, `insert into public.diary_entries (id, tmdb_id, rating) values ($1, 550, 4)`, [id]);
    let { rows } = await admin(`select type from public.activity_events where ref_id = $1`, [id]);
    assert.deepEqual(rows.map((r) => r.type), ['log']);
    await as(U.alice, `delete from public.diary_entries where id = $1`, [id]);
    ({ rows } = await admin(`select 1 from public.activity_events where ref_id = $1`, [id]));
    assert.equal(rows.length, 0);
  });

  await test('users cannot write activity events or notifications directly', async () => {
    await rejects(as(U.alice, `insert into public.activity_events (actor_id, type, ref_id) values ($1, 'log', 'x')`, [U.alice]), /row-level security/);
    await rejects(as(U.alice, `insert into public.notifications (user_id, type) values ($1, 'follow')`, [U.bob]), /row-level security/);
  });

  await test('upsert_diary_entry is idempotent and last-write-wins', async () => {
    const id = '10000000-0000-4000-8000-0000000000aa';
    const call = (rating, ts) =>
      as(U.alice, `select * from public.upsert_diary_entry($1, 603, '2026-11-01', $2, null, false, '{}', false, false, $3)`, [id, rating, ts]);
    await call(3, '2026-11-01T10:00:00Z');
    await call(3, '2026-11-01T10:00:00Z'); // replay
    await call(4.5, '2026-11-01T12:00:00Z'); // newer edit
    const stale = await call(1, '2026-11-01T11:00:00Z'); // older edit arrives late
    assert.equal(stale.rows.length, 0);
    const { rows } = await admin(`select rating::float as r, count(*) over () as n from public.diary_entries where id = $1`, [id]);
    assert.equal(rows[0].r, 4.5);
    assert.equal(Number(rows[0].n), 1);
  });

  await test('upsert_diary_entry cannot overwrite another user’s entry', async () => {
    await rejects(
      as(U.carol, `select * from public.upsert_diary_entry($1, 603, '2026-11-01', 1, null, false, '{}', false, false, now())`, ['10000000-0000-4000-8000-0000000000aa']),
      /row-level security|violates/,
    );
  });

  console.log('\nLists');
  const pubList = '20000000-0000-4000-8000-000000000001';
  const privList = '20000000-0000-4000-8000-000000000002';
  await test('public lists readable by all, private only by owner (items too)', async () => {
    await as(U.alice, `insert into public.lists (id, title, is_public) values ($1, 'Mind benders', true), ($2, 'Guilty pleasures', false)`, [pubList, privList]);
    await as(U.alice, `insert into public.list_items (list_id, tmdb_id, position) values ($1, 27205, 1), ($2, 597, 1)`, [pubList, privList]);
    const { rows: l } = await as(U.carol, `select id from public.lists where owner_id = $1`, [U.alice]);
    assert.deepEqual(l.map((r) => r.id), [pubList]);
    const { rows: i } = await as(U.carol, `select tmdb_id from public.list_items`);
    assert.deepEqual(i.map((r) => r.tmdb_id), [27205]);
    const { rows: own } = await as(U.alice, `select id from public.lists where owner_id = $1`, [U.alice]);
    assert.equal(own.length, 2);
  });

  await test('only the owner can add items to a list', async () => {
    await rejects(as(U.carol, `insert into public.list_items (list_id, tmdb_id) values ($1, 550)`, [pubList]), /row-level security/);
  });

  await test('reorder_list sets positions in one call', async () => {
    await as(U.alice, `insert into public.list_items (list_id, tmdb_id, position) values ($1, 157336, 2)`, [pubList]);
    await as(U.alice, `select public.reorder_list($1, array[157336, 27205])`, [pubList]);
    const { rows } = await admin(`select tmdb_id from public.list_items where list_id = $1 order by position`, [pubList]);
    assert.deepEqual(rows.map((r) => r.tmdb_id), [157336, 27205]);
  });

  console.log('\nLikes, comments, notifications, feed');
  await test('liking a review notifies its author; notifications are owner-only', async () => {
    await as(U.carol, `insert into public.likes (user_id, target_type, target_id) values ($1, 'review', $2)`, [U.carol, aliceEntry]);
    const { rows } = await as(U.alice, `select type, actor_id from public.notifications where type = 'like_review'`);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].actor_id, U.carol);
    const { rows: other } = await as(U.carol, `select 1 from public.notifications where user_id = $1`, [U.alice]);
    assert.equal(other.length, 0);
  });

  await test('cannot like or comment on a private review you cannot see', async () => {
    await rejects(as(U.dave, `insert into public.likes (user_id, target_type, target_id) values ($1, 'review', $2)`, [U.dave, bobEntry]), /row-level security/);
    await rejects(as(U.dave, `insert into public.comments (target_type, target_id, body) values ('review', $1, 'hi')`, [bobEntry]), /row-level security/);
  });

  await test('comments are length-checked and rate limited (5/min)', async () => {
    await rejects(as(U.carol, `insert into public.comments (target_type, target_id, body) values ('review', $1, '   ')`, [aliceEntry]), /check/);
    for (let i = 0; i < 5; i++) {
      await as(U.carol, `insert into public.comments (target_type, target_id, body) values ('review', $1, $2)`, [aliceEntry, `c${i}`]);
    }
    await rejects(as(U.carol, `insert into public.comments (target_type, target_id, body) values ('review', $1, 'one too many')`, [aliceEntry]), /rate_limited/);
  });

  await test('get_feed shows followed users only and respects private diaries', async () => {
    // Dave follows nobody -> sees only his own activity (none).
    let { rows } = await as(U.dave, `select * from public.get_feed(null, 20)`);
    assert.equal(rows.length, 0);
    // Dave follows Alice (public) and requests Bob (private, pending).
    await as(U.dave, `insert into public.follows (follower_id, following_id) values ($1, $2), ($1, $3)`, [U.dave, U.alice, U.bob]);
    ({ rows } = await as(U.dave, `select actor_id, type from public.get_feed(null, 50)`));
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => r.actor_id === U.alice || r.actor_id === U.dave));
    // Carol (accepted follower of Bob) does see Bob's log.
    ({ rows } = await as(U.carol, `select actor_id from public.get_feed(null, 50) where type = 'log'`));
    assert.ok(rows.some((r) => r.actor_id === U.bob));
  });

  await test('get_feed cursor pagination has no duplicates or gaps', async () => {
    for (let i = 0; i < 7; i++) {
      await as(U.alice, `insert into public.diary_entries (tmdb_id, rating) values ($1, 3)`, [1000 + i]);
    }
    const { rows: all } = await as(U.dave, `select id from public.get_feed(null, 50)`);
    const seen = [];
    let cursor = null;
    for (let guard = 0; guard < 20; guard++) {
      const { rows } = await as(U.dave, `select id, created_at::text as ts from public.get_feed($1, 3)`, [cursor]);
      seen.push(...rows.map((r) => r.id));
      if (rows.length < 3) break;
      const last = rows[rows.length - 1];
      cursor = `${last.ts}|${last.id}`; // exact server timestamp (microseconds)
    }
    assert.equal(new Set(seen).size, seen.length, 'duplicates found');
    assert.deepEqual(seen, all.map((r) => r.id));
  });

  console.log('\nWatch Together');
  let groupId;
  let code;
  const picks = {};
  await test('creating a group makes the owner a member; outsiders cannot see it', async () => {
    const { rows } = await as(U.alice, `insert into public.groups (name) values ('Friday night') returning id, invite_code`);
    groupId = rows[0].id;
    code = rows[0].invite_code;
    const { rows: m } = await as(U.alice, `select user_id from public.group_members where group_id = $1`, [groupId]);
    assert.deepEqual(m.map((r) => r.user_id), [U.alice]);
    const { rows: hidden } = await as(U.carol, `select id from public.groups where id = $1`, [groupId]);
    assert.equal(hidden.length, 0);
  });

  await test('non-members cannot add picks; joining by invite code grants access', async () => {
    await rejects(as(U.carol, `insert into public.group_picks (group_id, tmdb_id) values ($1, 550)`, [groupId]), /row-level security/);
    await as(U.carol, `select public.join_group($1)`, [code.toLowerCase()]);
    await as(U.dave, `select public.join_group($1)`, [code]);
    const { rows } = await as(U.carol, `select count(*)::int as n from public.group_members where group_id = $1`, [groupId]);
    assert.equal(rows[0].n, 3);
  });

  await test('members add picks while picking; votes are rejected before voting opens', async () => {
    for (const [name, user, tmdb] of [['dune', U.alice, 438631], ['coco', U.carol, 354912], ['up', U.dave, 14160]]) {
      const { rows } = await as(user, `insert into public.group_picks (group_id, tmdb_id) values ($1, $2) returning id`, [groupId, tmdb]);
      picks[name] = rows[0].id;
      await admin(`update public.group_picks set created_at = now() + ($2 || ' seconds')::interval where id = $1`, [rows[0].id, Object.keys(picks).length]);
    }
    await rejects(as(U.carol, `insert into public.group_votes (group_id, pick_id, rank) values ($1, $2, 1)`, [groupId, picks.dune]), /row-level security/);
  });

  await test('only the owner can start voting; status cannot be changed directly', async () => {
    await rejects(as(U.carol, `select public.start_voting($1)`, [groupId]), /owner/);
    await rejects(as(U.alice, `update public.groups set status = 'closed' where id = $1`, [groupId]), /start_voting/);
    await as(U.alice, `select public.start_voting($1, 'ranked')`, [groupId]);
    await rejects(as(U.carol, `insert into public.group_picks (group_id, tmdb_id) values ($1, 550)`, [groupId]), /row-level security/);
  });

  await test('members vote only for themselves', async () => {
    await rejects(as(U.carol, `insert into public.group_votes (group_id, pick_id, user_id, rank) values ($1, $2, $3, 1)`, [groupId, picks.dune, U.dave]), /row-level security/);
  });

  await test('tally_ranked_choice matches the TypeScript worked example', async () => {
    // 3 members can't reproduce the 5-ballot example, so add two more members.
    for (const id of ['00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102']) {
      await admin(`insert into auth.users (id, email) values ($1, $2)`, [id, `${id}@example.com`]);
      await as(id, `select public.join_group($1)`, [code]);
    }
    const ballots = [
      [U.alice, ['dune', 'coco', 'up']],
      [U.bob, null],
      [U.carol, ['dune', 'up', 'coco']],
      [U.dave, ['coco', 'up', 'dune']],
      ['00000000-0000-4000-8000-000000000101', ['up', 'coco', 'dune']],
      ['00000000-0000-4000-8000-000000000102', ['up', 'coco', 'dune']],
    ];
    for (const [user, order] of ballots) {
      if (!order) continue;
      for (let r = 0; r < order.length; r++) {
        await as(user, `insert into public.group_votes (group_id, pick_id, rank) values ($1, $2, $3)`, [groupId, picks[order[r]], r + 1]);
      }
    }
    const { rows } = await as(U.alice, `select public.tally_ranked_choice($1) as t`, [groupId]);
    const t = rows[0].t;
    assert.deepEqual(t.rounds[0].counts, { [picks.dune]: 2, [picks.coco]: 1, [picks.up]: 2 });
    assert.equal(t.rounds[0].eliminated, picks.coco);
    assert.deepEqual(t.rounds[1].counts, { [picks.dune]: 2, [picks.up]: 3 });
    assert.equal(t.winner, picks.up);
    assert.deepEqual(t.points, { [picks.dune]: 9, [picks.coco]: 10, [picks.up]: 11 });
  });

  await test('close_voting picks the winner and adds it to every member’s watchlist', async () => {
    await as(U.alice, `select public.close_voting($1)`, [groupId]);
    const { rows } = await as(U.alice, `select status, winner_pick_id from public.groups where id = $1`, [groupId]);
    assert.equal(rows[0].status, 'closed');
    assert.equal(rows[0].winner_pick_id, picks.up);
    const { rows: w } = await as(U.dave, `select tmdb_id from public.watchlist where user_id = $1 and tmdb_id = 14160`, [U.dave]);
    assert.equal(w.length, 1);
    await rejects(as(U.carol, `update public.group_votes set rank = 2 where pick_id = $1`, [picks.up]).then((r) => { if (r.affectedRows === 0) throw new Error('row-level security'); }), /row-level security/);
  });

  console.log('\nTaste engine');
  await test('compute_taste_match matches the TypeScript worked example (69%)', async () => {
    const x = '00000000-0000-4000-8000-000000000201';
    const y = '00000000-0000-4000-8000-000000000202';
    await admin(`insert into auth.users (id, email) values ($1, 'x@t.com'), ($2, 'y@t.com')`, [x, y]);
    const ins = (u, film, r) => as(u, `insert into public.diary_entries (tmdb_id, rating) values ($1, $2)`, [film, r]);
    for (const [f, r] of [[27205, 5], [496243, 4.5], [597, 2], [475557, 3.5]]) await ins(x, f, r);
    for (const [f, r] of [[27205, 4], [496243, 4], [597, 1.5], [346698, 3]]) await ins(y, f, r);
    const { rows } = await as(x, `select * from public.compute_taste_match($1, $2)`, [x, y]);
    assert.equal(rows[0].overlap, 3);
    assert.equal(rows[0].score, 69);
    assert.ok(Math.abs(Number(rows[0].similarity) - 0.3703) < 0.0001);
  });

  await test('compute_taste_match cannot see a private diary you do not follow', async () => {
    const { rows } = await as(U.dave, `select * from public.compute_taste_match($1, $2)`, [U.dave, U.bob]);
    assert.equal(rows[0].overlap, 0);
  });

  await test('refresh jobs populate taste_similarity and film_similarity; clients cannot run them', async () => {
    const n = await admin(`select public.refresh_taste_similarity() as n`);
    assert.ok(n.rows[0].n > 0);
    await admin(`select public.refresh_film_similarity()`);
    await rejects(as(U.alice, `select public.refresh_taste_similarity()`), /permission denied/);
    const { rows } = await as(U.alice, `select * from public.taste_similarity`);
    assert.ok(rows.every((r) => r.user_a === U.alice || r.user_b === U.alice));
  });

  console.log('\nAccount deletion');
  await test('delete_my_account cascades every row of the user', async () => {
    await as(U.dave, `select public.delete_my_account()`);
    const tables = ['profiles', 'diary_entries', 'follows', 'group_members', 'notifications', 'watchlist'];
    for (const t of tables) {
      const col = t === 'profiles' ? 'id' : t === 'follows' ? 'follower_id' : 'user_id';
      const { rows } = await admin(`select count(*)::int as n from public.${t} where ${col} = $1`, [U.dave]);
      assert.equal(rows[0].n, 0, `${t} still has rows`);
    }
  });

  await test('every public table has RLS enabled', async () => {
    const { rows } = await admin(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    assert.deepEqual(rows, []);
  });

  console.log('\nSafe updates (pg_safeupdate)');
  await test('safe-update detector flags bare DELETE/UPDATE and accepts qualified ones', async () => {
    assert.deepEqual(findUnqualifiedWrites('delete from public.t;'), ['delete from public.t']);
    assert.deepEqual(findUnqualifiedWrites('update public.t set a = 1;'), ['update public.t set a = 1']);
    assert.equal(findUnqualifiedWrites('update t set a = (select x from y where z) ;').length, 1);
    assert.deepEqual(findUnqualifiedWrites('delete from public.t where true;'), []);
    assert.deepEqual(findUnqualifiedWrites('update t\n set a = 1\n where id = $1;'), []);
    assert.deepEqual(findUnqualifiedWrites('insert into t values (1) on conflict (id) do update set a = 1;'), []);
    assert.deepEqual(findUnqualifiedWrites("select 1 for update; -- delete from t;\n if tg_op = 'DELETE' then"), []);
    assert.deepEqual(findUnqualifiedWrites('with d as (delete from t where a returning *) select 1;'), []);
  });

  await test('no public function contains an unqualified DELETE or UPDATE', async () => {
    const { rows } = await admin(`
      select p.proname, p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')`);
    const bad = rows.flatMap((r) => findUnqualifiedWrites(r.prosrc).map((s) => `${r.proname}: ${s}`));
    assert.deepEqual(bad, [], 'pg_safeupdate rejects these on Supabase; add `where true`');
  });

  console.log('\nPostgREST embeds');
  await test('every FK hint in an embed (table!constraint(...)) names a real FK on that table pair', async () => {
    const sources = ['app', 'components', 'hooks', 'lib', 'features'].flatMap((dir) =>
      readdirSync(join(root, dir), { recursive: true })
        .filter((f) => /\.tsx?$/.test(f))
        .map((f) => readFileSync(join(root, dir, f), 'utf8')),
    );
    const hints = [...new Set(sources.flatMap((src) => [...src.matchAll(/([a-z_]+)!([a-z_]+)\(/g)].map((m) => `${m[1]}!${m[2]}`)))];
    assert.ok(hints.length > 0, 'expected at least one hinted embed');
    const missing = [];
    for (const hint of hints) {
      const [table, constraint] = hint.split('!');
      const { rows } = await admin(
        `select 1 from pg_constraint c
         where c.contype = 'f' and c.conname = $1
           and (c.conrelid = ('public.' || $2)::regclass or c.confrelid = ('public.' || $2)::regclass)`,
        [constraint, table],
      );
      if (!rows.length) missing.push(hint);
    }
    assert.deepEqual(missing, [], 'these FK names do not exist (PostgREST would reject the embed)');
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
