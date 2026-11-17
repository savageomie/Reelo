// Reelo Letterboxd CSV import (Supabase Edge Function, Deno).
//
// POST { csv: string, hint?: 'watchlist' } with the user's JWT (verify_jwt = true).
// 1. Parses the CSV (diary / reviews / ratings / watched / watchlist exports).
// 2. Matches each unique (title, year) to a TMDB id via /search/movie (cached in api_cache).
// 3. Inserts diary entries (or watchlist rows) for the *calling user only*, skipping duplicates
//    (same film + same watched date), so re-importing the same file is idempotent.
//
// The TMDB key is read from the TMDB_API_KEY secret, never from the app.
// Deploy: npx supabase functions deploy import-letterboxd

import { createClient } from 'npm:@supabase/supabase-js@2';

import { corsHeaders, json } from '../_shared/cors.ts';
import { bestMatch, parseLetterboxd, uniqueTitles } from '../_shared/letterboxd.ts';

const TMDB_KEY = Deno.env.get('TMDB_API_KEY') ?? '';
const MAX_ROWS = 3000;
const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false },
});

async function searchTmdb(title: string, year: number | null) {
  const key = `lbmatch?t=${title.toLowerCase()}&y=${year ?? ''}`;
  const { data: hit } = await admin.from('api_cache').select('payload').eq('key', key).maybeSingle();
  if (hit) return (hit.payload as { id: number | null }).id;
  const url = new URL('https://api.themoviedb.org/3/search/movie');
  url.searchParams.set('query', title);
  url.searchParams.set('include_adult', 'false');
  const headers: Record<string, string> = { accept: 'application/json' };
  if (TMDB_KEY.startsWith('ey')) headers.Authorization = `Bearer ${TMDB_KEY}`;
  else url.searchParams.set('api_key', TMDB_KEY);
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const body = await res.json();
  const results = body.results ?? [];
  const id = bestMatch(results, title, year);
  await admin.from('api_cache').upsert({ key, payload: { id }, fetched_at: new Date().toISOString() });
  const m = results.find((r: { id: number }) => r.id === id);
  if (m) {
    await admin.from('films_cache').upsert(
      {
        tmdb_id: m.id,
        title: m.title,
        year: Number((m.release_date ?? '').slice(0, 4)) || null,
        poster_path: m.poster_path ?? null,
        backdrop_path: m.backdrop_path ?? null,
        genre_ids: m.genre_ids ?? [],
        popularity: m.popularity ?? null,
        vote_average: m.vote_average ?? null,
        overview: m.overview || null,
        is_partial: true,
      },
      { onConflict: 'tmdb_id', ignoreDuplicates: true },
    );
  }
  return id;
}

/** Run promises with limited concurrency (stay well under TMDB's rate limit). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (!TMDB_KEY) return json({ error: 'TMDB_API_KEY secret is not set' }, 500);
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: auth, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !auth.user) return json({ error: 'Not signed in' }, 401);
    const userId = auth.user.id;

    const { csv, hint } = (await req.json()) as { csv?: string; hint?: 'watchlist' };
    if (!csv || csv.length > 5_000_000) return json({ error: 'Send the CSV text (max 5 MB)' }, 400);
    const parsed = parseLetterboxd(csv, hint);
    const rows = parsed.rows.slice(0, MAX_ROWS);

    const titles = uniqueTitles(rows);
    const ids = await mapLimit(titles, 6, (t) => searchTmdb(t.title, t.year).catch(() => null));
    const idByKey = new Map(titles.map((t, i) => [t.key, ids[i]]));
    const unmatched = titles.filter((_, i) => ids[i] == null).map((t) => (t.year ? `${t.title} (${t.year})` : t.title));

    if (parsed.kind === 'watchlist') {
      const wl = rows
        .map((r) => idByKey.get(`${r.title.toLowerCase()}|${r.year ?? ''}`))
        .filter((id): id is number => id != null)
        .map((tmdb_id) => ({ user_id: userId, tmdb_id }));
      const { error } = await admin.from('watchlist').upsert(wl, { onConflict: 'user_id,tmdb_id', ignoreDuplicates: true });
      if (error) throw error;
      return json({ kind: parsed.kind, imported: wl.length, skipped: parsed.skipped, unmatched });
    }

    // Existing entries -> skip duplicates (idempotent re-import).
    const { data: existing } = await admin.from('diary_entries').select('tmdb_id, watched_on').eq('user_id', userId);
    const have = new Set((existing ?? []).map((e) => `${e.tmdb_id}|${e.watched_on}`));
    const today = new Date().toISOString().slice(0, 10);
    const inserts = [];
    let duplicates = 0;
    for (const r of rows) {
      const tmdb_id = idByKey.get(`${r.title.toLowerCase()}|${r.year ?? ''}`);
      if (tmdb_id == null) continue;
      const watched_on = r.watchedOn && r.watchedOn <= today ? r.watchedOn : today;
      const k = `${tmdb_id}|${watched_on}`;
      if (have.has(k)) {
        duplicates++;
        continue;
      }
      have.add(k);
      inserts.push({
        user_id: userId,
        tmdb_id,
        watched_on,
        rating: r.rating,
        review: r.review,
        is_rewatch: r.rewatch,
        tags: [...r.tags, 'letterboxd'].slice(0, 10),
        liked: false,
        spoiler: false,
        created_at: `${watched_on}T20:00:00Z`,
        updated_at: new Date().toISOString(),
      });
    }
    for (let i = 0; i < inserts.length; i += 500) {
      const { error } = await admin.from('diary_entries').insert(inserts.slice(i, i + 500));
      if (error) throw error;
    }
    return json({ kind: parsed.kind, imported: inserts.length, duplicates, skipped: parsed.skipped, unmatched });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : 'Import failed' }, 400);
  }
});
