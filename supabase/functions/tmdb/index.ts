// Reelo TMDB proxy (Supabase Edge Function, Deno).
//
// - The TMDB key is read ONLY from the edge-function secret TMDB_API_KEY (v3 key or v4 read token).
//   It never reaches the app.
// - Film details are served from public.films_cache and only fetched from TMDB on a miss, a partial
//   row, or a row older than 7 days. List/search responses are cached in public.api_cache.
// - Only whitelisted actions are allowed (this is not an open proxy).
// - Requires a signed-in user (verify_jwt = true, the default).
//
// Deploy: npx supabase functions deploy tmdb
// Secret: npx supabase secrets set TMDB_API_KEY=xxxx [TMDB_REGION=IN]

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import jpeg from 'npm:jpeg-js@0.4.4';

import { corsHeaders, json } from '../_shared/cors.ts';
import { paletteFromPixels } from '../_shared/palette.ts';
import {
  cacheKey,
  type FilmRow,
  isStale,
  LIST_ENDPOINTS,
  normaliseDetails,
  normaliseSummary,
  summaryToPartialRow,
} from '../_shared/tmdbNormalize.ts';

const TMDB = 'https://api.themoviedb.org/3';
const TMDB_KEY = Deno.env.get('TMDB_API_KEY') ?? '';
const REGION = Deno.env.get('TMDB_REGION') ?? 'IN';
const SEARCH_TTL = 24 * 3600 * 1000;
const LONG_TTL = 7 * 24 * 3600 * 1000;

const admin: SupabaseClient = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
);

async function tmdbGet(path: string, params: Record<string, string | number | undefined> = {}) {
  if (!TMDB_KEY) throw new HttpError(500, 'TMDB_API_KEY secret is not set on the edge function');
  const url = new URL(TMDB + path);
  const headers: Record<string, string> = { accept: 'application/json' };
  // v4 "API Read Access Token" is a JWT; a v3 key is a 32-char hex string.
  if (TMDB_KEY.startsWith('ey')) headers.Authorization = `Bearer ${TMDB_KEY}`;
  else url.searchParams.set('api_key', TMDB_KEY);
  url.searchParams.set('language', 'en-US');
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers });
  if (res.status === 404) throw new HttpError(404, 'Not found on TMDB');
  if (res.status === 429) throw new HttpError(503, 'TMDB rate limit, try again shortly');
  if (!res.ok) throw new HttpError(502, `TMDB error ${res.status}`);
  return res.json();
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const { data } = await admin.from('api_cache').select('payload, fetched_at').eq('key', key).maybeSingle();
  if (data && Date.now() - Date.parse(data.fetched_at) < ttl) return data.payload as T;
  try {
    const fresh = await load();
    await admin.from('api_cache').upsert({ key, payload: fresh, fetched_at: new Date().toISOString() });
    return fresh;
  } catch (err) {
    if (data) return data.payload as T; // serve stale on TMDB outage
    throw err;
  }
}

/** Upsert list results as partial rows without clobbering full rows. */
async function rememberSummaries(results: ReturnType<typeof normaliseSummary>[]) {
  if (!results.length) return;
  const rows = results.map(summaryToPartialRow);
  await admin.from('films_cache').upsert(rows, { onConflict: 'tmdb_id', ignoreDuplicates: true });
}

async function posterPalette(posterPath: string | null) {
  if (!posterPath) return null;
  try {
    const res = await fetch(`https://image.tmdb.org/t/p/w92${posterPath}`);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
    return paletteFromPixels(img.data);
  } catch {
    return null;
  }
}

async function fetchDetails(id: number): Promise<FilmRow & { palette: unknown; fetched_at: string }> {
  const raw = await tmdbGet(`/movie/${id}`, { append_to_response: 'credits,videos,watch/providers' });
  const row = normaliseDetails(raw, REGION);
  const palette = await posterPalette(row.poster_path);
  const full = { ...row, palette, fetched_at: new Date().toISOString() };
  const { error } = await admin.from('films_cache').upsert(full, { onConflict: 'tmdb_id' });
  if (error) console.error('films_cache upsert failed', error.message);
  return full;
}

async function getFilm(id: number) {
  const { data } = await admin.from('films_cache').select('*').eq('tmdb_id', id).maybeSingle();
  if (data && !isStale(data)) return data;
  try {
    return await fetchDetails(id);
  } catch (err) {
    if (data) return data; // stale beats nothing
    throw err;
  }
}

async function getFilms(ids: number[]) {
  const unique = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 60);
  if (!unique.length) return [];
  const { data } = await admin.from('films_cache').select('*').in('tmdb_id', unique);
  const byId = new Map((data ?? []).map((r) => [r.tmdb_id, r]));
  // Refresh at most 12 missing/partial films per call to stay well inside TMDB rate limits.
  const toFetch = unique.filter((id) => !byId.has(id) || byId.get(id).is_partial).slice(0, 12);
  const fetched = await Promise.allSettled(toFetch.map(fetchDetails));
  fetched.forEach((r) => {
    if (r.status === 'fulfilled') byId.set(r.value.tmdb_id, r.value);
  });
  return unique.map((id) => byId.get(id)).filter(Boolean);
}

function listResponse(raw: { results?: unknown[]; page?: number; total_pages?: number }) {
  const results = (raw.results ?? []).map(normaliseSummary);
  return { results, page: raw.page ?? 1, totalPages: Math.min(raw.total_pages ?? 1, 500) };
}

type Body = {
  action?: string;
  id?: number;
  ids?: number[];
  query?: string;
  page?: number;
  kind?: string;
  genreId?: number;
};

async function handle(body: Body) {
  const page = Math.min(Math.max(Number(body.page) || 1, 1), 500);
  switch (body.action) {
    case 'film': {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'id required');
      return getFilm(id);
    }
    case 'films':
      return getFilms((body.ids ?? []).map(Number));
    case 'search': {
      const query = String(body.query ?? '').trim().slice(0, 100);
      if (!query) return { results: [], page: 1, totalPages: 0 };
      const out = await cached(cacheKey('search', { query, page }), SEARCH_TTL, async () =>
        listResponse(await tmdbGet('/search/movie', { query, page, include_adult: 'false' })),
      );
      await rememberSummaries(out.results);
      return out;
    }
    case 'list': {
      const ep = LIST_ENDPOINTS[String(body.kind)];
      if (!ep) throw new HttpError(400, 'unknown list kind');
      const out = await cached(cacheKey('list', { kind: body.kind, page, region: REGION }), ep.ttl, async () =>
        listResponse(await tmdbGet(ep.path, { page, region: body.kind === 'trending' ? undefined : REGION })),
      );
      await rememberSummaries(out.results);
      return out;
    }
    case 'genre': {
      const genreId = Number(body.genreId);
      if (!Number.isInteger(genreId)) throw new HttpError(400, 'genreId required');
      const out = await cached(cacheKey('genre', { genreId, page }), 12 * 3600 * 1000, async () =>
        listResponse(
          await tmdbGet('/discover/movie', {
            with_genres: genreId,
            sort_by: 'popularity.desc',
            'vote_count.gte': 200,
            page,
          }),
        ),
      );
      await rememberSummaries(out.results);
      return out;
    }
    case 'similar': {
      const id = Number(body.id);
      const out = await cached(cacheKey('similar', { id }), SEARCH_TTL, async () =>
        listResponse(await tmdbGet(`/movie/${id}/recommendations`, { page: 1 })),
      );
      await rememberSummaries(out.results);
      return out;
    }
    case 'genres':
      return cached('genres', LONG_TTL, async () => (await tmdbGet('/genre/movie/list')).genres ?? []);
    case 'person': {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'id required');
      return cached(cacheKey('person', { id }), LONG_TTL, async () => {
        const p = await tmdbGet(`/person/${id}`, { append_to_response: 'movie_credits' });
        const seen = new Set<number>();
        const credits = [...(p.movie_credits?.cast ?? []), ...(p.movie_credits?.crew ?? [])]
          .filter((c: { id: number; job?: string }) => !c.job || c.job === 'Director')
          .filter((c: { id: number }) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
          .map((c: Record<string, unknown>) => ({
            ...normaliseSummary(c),
            role: (c.job as string) ?? (c.character as string) ?? '',
          }))
          .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
          .slice(0, 60);
        return {
          id: p.id,
          name: p.name,
          biography: p.biography ?? '',
          birthday: p.birthday ?? null,
          place_of_birth: p.place_of_birth ?? null,
          profile_path: p.profile_path ?? null,
          known_for_department: p.known_for_department ?? null,
          credits,
        };
      });
    }
    case 'search_people': {
      const query = String(body.query ?? '').trim().slice(0, 100);
      if (!query) return { results: [] };
      return cached(cacheKey('search_people', { query }), SEARCH_TTL, async () => {
        const raw = await tmdbGet('/search/person', { query, include_adult: 'false' });
        return {
          results: (raw.results ?? []).slice(0, 20).map((p: Record<string, unknown>) => ({
            id: p.id,
            name: p.name,
            profile_path: p.profile_path ?? null,
            known_for_department: p.known_for_department ?? null,
          })),
        };
      });
    }
    default:
      throw new HttpError(400, 'unknown action');
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    return json(await handle(body));
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    console.error(err);
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, status);
  }
});
