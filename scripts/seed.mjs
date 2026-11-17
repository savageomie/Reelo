#!/usr/bin/env node
/**
 * Reelo demo data seeder (blueprint section 13).
 *
 *   npm run seed
 *
 * Needs in .env (never commit it):
 *   EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   TMDB_API_KEY (optional) — enrich films_cache with real posters, cast and streaming providers
 *
 * Creates ~30 users with realistic, taste-driven ratings of popular films, follows (incl. a private profile
 * with a pending request), reviews, likes, comments, lists, watchlists, one Watch Together group mid-vote and
 * one finished group, then refreshes the taste-similarity and film-similarity tables.
 *
 * Re-runnable: seed users are found by email and their data is wiped and recreated (deterministic PRNG).
 * Every seed user's password is printed at the end.
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ARCHETYPES, COMMENTS, FILMS, GENRE_NAMES, INDIAN, LISTS, REVIEWS, USERS } from './seedData.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- tiny .env loader (no dependency) -------------------------------------------------------
const envPath = join(root, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TMDB_KEY = process.env.TMDB_API_KEY && !process.env.TMDB_API_KEY.startsWith('YOUR_') ? process.env.TMDB_API_KEY : null;
const REGION = process.env.TMDB_REGION ?? 'IN';
export const PASSWORD = process.env.SEED_PASSWORD ?? 'reelo-demo-2026';
const EMAIL_DOMAIN = 'example.com';

const DRY_RUN = process.argv.includes('--dry-run');

if (!DRY_RUN && (!URL || !SERVICE || URL.includes('YOUR_') || SERVICE.includes('YOUR_'))) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env — see docs/HANDOFF.md');
  process.exit(1);
}

const admin = DRY_RUN ? null : createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

// --- deterministic PRNG ---------------------------------------------------------------------
let seed = 20261117;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5; // ~N(0, 0.33)
const halfStar = (x) => Math.min(5, Math.max(0.5, Math.round(x * 2) / 2));
const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(rand() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

function must(res, what) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

async function inBatches(rows, size, fn) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

// --- 1. films_cache -------------------------------------------------------------------------
async function tmdbDetails(id) {
  const url = new globalThis.URL(`https://api.themoviedb.org/3/movie/${id}`);
  url.searchParams.set('append_to_response', 'credits,videos,watch/providers');
  const headers = { accept: 'application/json' };
  if (TMDB_KEY.startsWith('ey')) headers.Authorization = `Bearer ${TMDB_KEY}`;
  else url.searchParams.set('api_key', TMDB_KEY);
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`TMDB ${res.status} for ${id}`);
  const m = await res.json();
  const providers = m['watch/providers']?.results?.[REGION] ?? {};
  const mapP = (a) => (a ?? []).map((p) => ({ id: p.provider_id, name: p.provider_name, logo_path: p.logo_path }));
  const trailer = (m.videos?.results ?? []).find((v) => v.site === 'YouTube' && v.type === 'Trailer');
  return {
    tmdb_id: m.id,
    title: m.title,
    original_title: m.original_title,
    year: m.release_date ? Number(m.release_date.slice(0, 4)) : null,
    release_date: m.release_date || null,
    overview: m.overview || null,
    tagline: m.tagline || null,
    poster_path: m.poster_path,
    backdrop_path: m.backdrop_path,
    genres: m.genres ?? [],
    genre_ids: (m.genres ?? []).map((g) => g.id),
    runtime: m.runtime || null,
    directors: (m.credits?.crew ?? []).filter((c) => c.job === 'Director').map((c) => ({ id: c.id, name: c.name, job: 'Director', profile_path: c.profile_path })),
    cast: (m.credits?.cast ?? []).slice(0, 15).map((c) => ({ id: c.id, name: c.name, character: c.character, profile_path: c.profile_path })),
    providers: { region: REGION, link: providers.link ?? null, flatrate: mapP(providers.flatrate), rent: mapP(providers.rent), buy: mapP(providers.buy) },
    trailer_key: trailer?.key ?? null,
    popularity: m.popularity ?? null,
    vote_average: m.vote_average ?? null,
    is_partial: false,
    fetched_at: new Date().toISOString(),
  };
}

function curatedRow([id, title, year, runtime, genreIds, director, directorId, quality]) {
  return {
    tmdb_id: id,
    title,
    year,
    release_date: `${year}-01-01`,
    runtime,
    genres: genreIds.map((g) => ({ id: g, name: GENRE_NAMES[g] })),
    genre_ids: genreIds,
    directors: [{ id: directorId, name: director, job: 'Director', profile_path: null }],
    cast: [],
    popularity: Math.round(quality * 20),
    vote_average: Math.round(quality * 20) / 10,
    // Partial: the app's tmdb edge function will fetch posters/cast the first time someone views it.
    is_partial: true,
    fetched_at: new Date(0).toISOString(),
  };
}

async function seedFilms() {
  console.log(`Films: ${FILMS.length} (${TMDB_KEY ? 'enriching from TMDB' : 'curated metadata only — set TMDB_API_KEY for posters'})`);
  const rows = [];
  for (const f of FILMS) {
    let row = curatedRow(f);
    if (TMDB_KEY) {
      try {
        row = await tmdbDetails(f[0]);
      } catch (e) {
        console.warn(`  ! ${f[1]}: ${e.message} — using curated data`);
      }
    }
    rows.push(row);
  }
  await inBatches(rows, 50, async (b) => must(await admin.from('films_cache').upsert(b, { onConflict: 'tmdb_id' }), 'films_cache'));
}

// --- 2. users ---------------------------------------------------------------------------------
async function seedUsers() {
  const existing = new Map();
  for (let page = 1; page < 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) existing.set(u.email, u.id);
    if (data.users.length < 200) break;
  }
  const ids = {};
  for (const [username, displayName] of USERS) {
    const email = `${username}@${EMAIL_DOMAIN}`;
    let id = existing.get(email);
    if (!id) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { username, full_name: displayName },
      });
      if (error) throw new Error(`createUser ${email}: ${error.message}`);
      id = data.user.id;
    } else {
      await admin.auth.admin.updateUserById(id, { password: PASSWORD });
    }
    ids[username] = id;
  }
  console.log(`Users: ${USERS.length} (password: ${PASSWORD})`);
  return ids;
}

async function wipe(ids) {
  const all = Object.values(ids);
  // Groups owned by seed users (cascade picks/votes/members), then per-user rows.
  must(await admin.from('groups').delete().in('owner_id', all), 'wipe groups');
  for (const t of ['diary_entries', 'watchlist', 'likes', 'comments', 'notifications', 'user_stats']) {
    must(await admin.from(t).delete().in('user_id', all), `wipe ${t}`);
  }
  must(await admin.from('lists').delete().in('owner_id', all), 'wipe lists');
  must(await admin.from('follows').delete().in('follower_id', all), 'wipe follows');
  must(await admin.from('activity_events').delete().in('actor_id', all), 'wipe events');
}

// --- 3. diary ---------------------------------------------------------------------------------
function affinity(archetype, film) {
  const [id, , year, , genreIds] = film;
  const a = ARCHETYPES[archetype];
  let s = 0;
  for (const g of genreIds) s += a[g] ?? 0;
  s /= Math.max(1, Math.sqrt(genreIds.length));
  if (a.indian && INDIAN.has(id)) s += a.indian;
  if (a.classic && year < 1985) s += a.classic;
  return s;
}

const START = Date.UTC(2025, 5, 1);
const END = Date.UTC(2026, 10, 15);
const randomDate = () => new Date(START + rand() * (END - START));
const iso = (d) => d.toISOString().slice(0, 10);

function diaryFor(username, archetype, bias, userId) {
  const scored = FILMS.map((f) => ({ f, a: affinity(archetype, f) + gauss() * 0.6 }));
  scored.sort((x, y) => y.a - x.a);
  const count = 24 + Math.floor(rand() * 22);
  // Mostly films that suit the archetype, plus a few random ones.
  const chosen = new Set(scored.slice(0, Math.floor(count * 0.75)).map((s) => s.f));
  for (const f of shuffle(FILMS)) {
    if (chosen.size >= count) break;
    chosen.add(f);
  }
  const entries = [];
  for (const f of chosen) {
    const [id, , , , , , , quality] = f;
    const rating = halfStar(3.3 + (quality - 4.1) * 1.4 + affinity(archetype, f) * 0.9 + bias + gauss() * 1.6);
    const watched = randomDate();
    const hasReview = rand() < 0.32;
    const spoiler = hasReview && rand() < 0.12;
    const band = rating >= 4 ? 'high' : rating >= 3 ? 'mid' : 'low';
    const review = hasReview ? (spoiler ? pick(REVIEWS.spoiler) : pick(REVIEWS[band])) : null;
    const base = {
      user_id: userId,
      tmdb_id: id,
      rating: rand() < 0.93 ? rating : null,
      review,
      spoiler,
      liked: rating >= 4.5 ? rand() < 0.8 : rating >= 4 ? rand() < 0.3 : false,
      tags: rand() < 0.15 ? [pick(['cinema', 'with-friends', 'imax', 'date-night', 'rainy-day', 'flight'])] : [],
    };
    entries.push({
      ...base,
      id: uuid(),
      watched_on: iso(watched),
      is_rewatch: false,
      created_at: new Date(watched.getTime() + 20 * 3600 * 1000).toISOString(),
      updated_at: new Date(watched.getTime() + 20 * 3600 * 1000).toISOString(),
    });
    if (rand() < 0.08) {
      const again = new Date(Math.min(END, watched.getTime() + (30 + rand() * 200) * 86400000));
      entries.push({
        ...base,
        review: null,
        spoiler: false,
        id: uuid(),
        watched_on: iso(again),
        is_rewatch: true,
        rating: base.rating == null ? null : halfStar(base.rating + (rand() < 0.5 ? 0.5 : 0)),
        created_at: new Date(again.getTime() + 21 * 3600 * 1000).toISOString(),
        updated_at: new Date(again.getTime() + 21 * 3600 * 1000).toISOString(),
      });
    }
  }
  return entries;
}

// --- main -------------------------------------------------------------------------------------
async function main() {
  console.log(`Seeding ${URL}`);
  await seedFilms();
  const ids = await seedUsers();
  await wipe(ids);
  const byUser = Object.fromEntries(USERS.map((u) => [u[0], u]));

  // Profiles
  for (const [username, displayName, archetype, , bio, isPrivate] of USERS) {
    const genres = Object.entries(ARCHETYPES[archetype])
      .filter(([k, v]) => /^\d+$/.test(k) && v > 0.4)
      .map(([k]) => Number(k));
    must(
      await admin
        .from('profiles')
        .update({
          display_name: displayName,
          bio,
          is_private: isPrivate,
          onboarded: true,
          favourite_genres: genres,
          avatar_url: `https://api.dicebear.com/9.x/notionists/png?seed=${encodeURIComponent(username)}&size=256`,
        })
        .eq('id', ids[username]),
      `profile ${username}`,
    );
  }

  // Diary
  const diary = {};
  const allEntries = [];
  for (const [username, , archetype, bias] of USERS) {
    const entries = diaryFor(username, archetype, bias, ids[username]);
    diary[username] = entries;
    allEntries.push(...entries);
  }
  await inBatches(allEntries, 200, async (b) => must(await admin.from('diary_entries').insert(b), 'diary'));
  console.log(`Diary entries: ${allEntries.length}`);

  // Favourite four = top-rated films
  for (const [username] of USERS) {
    const top = [...diary[username]]
      .filter((e) => e.rating != null && !e.is_rewatch)
      .sort((a, b) => b.rating - a.rating || a.tmdb_id - b.tmdb_id)
      .slice(0, 4)
      .map((e) => e.tmdb_id);
    must(await admin.from('profiles').update({ favourites: top }).eq('id', ids[username]), 'favourites');
  }

  // Follows: same-archetype friends + random; demo accounts are well connected.
  const follows = new Set();
  const addFollow = (a, b) => a !== b && follows.add(`${a}|${b}`);
  for (const [u, , arch] of USERS) {
    const same = shuffle(USERS.filter((x) => x[2] === arch && x[0] !== u)).slice(0, 3);
    const random = shuffle(USERS.filter((x) => x[0] !== u)).slice(0, 4 + Math.floor(rand() * 5));
    for (const x of [...same, ...random]) addFollow(u, x[0]);
  }
  for (const [u] of USERS.slice(2, 22)) {
    addFollow('demo', u);
    addFollow(u, 'demo');
  }
  addFollow('demo', 'demo2');
  addFollow('demo2', 'demo');
  for (const [u] of USERS.slice(3, 15)) addFollow('demo2', u);
  const followRows = [...follows].map((k) => {
    const [a, b] = k.split('|');
    return { follower_id: ids[a], following_id: ids[b] };
  });
  await inBatches(followRows, 200, async (b) => must(await admin.from('follows').insert(b), 'follows'));
  // Followers of private users: accept most requests, leave a couple pending (demo: request to ishita stays pending).
  const privateIds = USERS.filter((u) => u[5]).map((u) => ids[u[0]]);
  must(
    await admin.from('follows').update({ status: 'accepted' }).in('following_id', privateIds).neq('follower_id', ids.demo),
    'accept follows',
  );
  console.log(`Follows: ${followRows.length}`);

  // Watchlists: unseen films that suit the user's taste.
  const wl = [];
  for (const [u, , arch] of USERS) {
    const seen = new Set(diary[u].map((e) => e.tmdb_id));
    const unseen = FILMS.filter((f) => !seen.has(f[0])).sort((x, y) => affinity(arch, y) - affinity(arch, x));
    for (const f of unseen.slice(0, 4 + Math.floor(rand() * 8))) wl.push({ user_id: ids[u], tmdb_id: f[0] });
  }
  await inBatches(wl, 200, async (b) => must(await admin.from('watchlist').insert(b), 'watchlist'));

  // Lists
  for (const [u, title, description, films, ranked = false, isPublic = true] of LISTS) {
    const list = must(
      await admin.from('lists').insert({ owner_id: ids[u], title, description, is_ranked: ranked, is_public: isPublic }).select().single(),
      'list',
    );
    must(await admin.from('list_items').insert(films.map((tmdb_id, i) => ({ list_id: list.id, tmdb_id, position: i + 1 }))), 'list items');
  }
  console.log(`Lists: ${LISTS.length}`);

  // Likes and comments on reviews (only by users who can see them: public authors here).
  const reviewed = allEntries.filter((e) => e.review);
  const publicIds = new Set(USERS.filter((u) => !u[5]).map((u) => ids[u[0]]));
  const likeRows = [];
  const commentRows = [];
  for (const e of reviewed) {
    if (!publicIds.has(e.user_id)) continue;
    for (const [u] of shuffle(USERS).slice(0, Math.floor(rand() * 6))) {
      if (ids[u] !== e.user_id) likeRows.push({ user_id: ids[u], target_type: 'review', target_id: e.id });
    }
    if (rand() < 0.25) {
      const [u] = pick(USERS);
      if (ids[u] !== e.user_id)
        commentRows.push({ user_id: ids[u], target_type: 'review', target_id: e.id, body: pick(COMMENTS), spoiler: false });
    }
  }
  await inBatches(likeRows, 300, async (b) => must(await admin.from('likes').upsert(b, { ignoreDuplicates: true }), 'likes'));
  await inBatches(commentRows, 100, async (b) => must(await admin.from('comments').insert(b), 'comments'));
  console.log(`Likes: ${likeRows.length}, comments: ${commentRows.length}`);

  // Watch Together: group RPCs check auth.uid(), so act as the owner with a real session.
  const owner = createClient(URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY && !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY.includes('YOUR_') ? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY : SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  must(await owner.auth.signInWithPassword({ email: `demo@${EMAIL_DOMAIN}`, password: PASSWORD }), 'sign in demo');

  async function makeGroup(name, mode, memberNames, pickIds) {
    const g = must(await owner.from('groups').insert({ name, voting_mode: mode, owner_id: ids.demo }).select().single(), 'group');
    must(await admin.from('group_members').insert(memberNames.map((u) => ({ group_id: g.id, user_id: ids[u] }))), 'members');
    const picks = [];
    for (let i = 0; i < pickIds.length; i++) {
      const adder = [ 'demo', ...memberNames ][i % (memberNames.length + 1)];
      const p = must(
        await admin
          .from('group_picks')
          .insert({ group_id: g.id, tmdb_id: pickIds[i], added_by: ids[adder], created_at: new Date(Date.now() - (pickIds.length - i) * 60000).toISOString() })
          .select()
          .single(),
        'pick',
      );
      picks.push(p);
    }
    must(await owner.rpc('start_voting', { p_group: g.id, p_mode: mode }), 'start voting');
    return { g, picks };
  }

  const ballot = (user, picks) => {
    const arch = byUser[user][2];
    return [...picks].sort((a, b) => affinity(arch, FILMS.find((f) => f[0] === b.tmdb_id)) - affinity(arch, FILMS.find((f) => f[0] === a.tmdb_id)) + gauss());
  };

  // Group 1: mid-vote (ranked). 3 of 6 members have voted; demo + demo2 can vote live in the demo.
  const g1 = await makeGroup('Friday Movie Night', 'ranked', ['demo2', 'asha_films', 'rohan_watches', 'nina_ghibli', 'kabir_k'], [438631, 354912, 680, 129, 76341]);
  const votes1 = [];
  for (const u of ['asha_films', 'rohan_watches', 'nina_ghibli']) {
    ballot(u, g1.picks).slice(0, 4).forEach((p, i) => votes1.push({ group_id: g1.g.id, pick_id: p.id, user_id: ids[u], rank: i + 1 }));
  }
  must(await admin.from('group_votes').insert(votes1), 'votes');

  // Group 2: finished (swipe) so the Result screen has something to show.
  const g2 = await makeGroup('Sunday Anime Club', 'swipe', ['kenji_anime', 'nina_ghibli', 'fatima_feels'], [372058, 4935, 324857, 129]);
  const votes2 = [];
  for (const u of ['demo', 'kenji_anime', 'nina_ghibli', 'fatima_feels']) {
    for (const p of g2.picks) votes2.push({ group_id: g2.g.id, pick_id: p.id, user_id: ids[u], value: rand() < 0.55 ? 1 : 0 });
  }
  must(await admin.from('group_votes').insert(votes2), 'swipe votes');
  must(await owner.rpc('close_voting', { p_group: g2.g.id }), 'close voting');
  await owner.auth.signOut();
  console.log('Groups: "Friday Movie Night" (voting, 3/6 voted), "Sunday Anime Club" (closed)');

  // Precompute taste engine tables.
  const t = must(await admin.rpc('refresh_taste_similarity'), 'refresh_taste_similarity');
  const f = must(await admin.rpc('refresh_film_similarity'), 'refresh_film_similarity');
  console.log(`taste_similarity rows: ${t}, film_similarity rows: ${f}`);

  console.log('\nDone. Log in with:');
  console.log(`  demo@${EMAIL_DOMAIN} / ${PASSWORD}   (phone 1)`);
  console.log(`  demo2@${EMAIL_DOMAIN} / ${PASSWORD}  (phone 2)`);
  console.log(`  any other seed user: <username>@${EMAIL_DOMAIN} / ${PASSWORD}`);
}

function dryRun() {
  let total = 0;
  const dist = new Array(10).fill(0);
  for (const [username, , archetype, bias] of USERS) {
    const entries = diaryFor(username, archetype, bias, username);
    total += entries.length;
    for (const e of entries) if (e.rating != null) dist[e.rating * 2 - 1] += 1;
  }
  console.log(`Dry run: ${USERS.length} users, ${FILMS.length} films, ${total} diary entries`);
  console.log('Rating distribution 0.5..5:', dist.join(' '));
}

(DRY_RUN ? Promise.resolve(dryRun()) : main()).catch((e) => {
  console.error('\nSeed failed:', e.message);
  process.exit(1);
});
