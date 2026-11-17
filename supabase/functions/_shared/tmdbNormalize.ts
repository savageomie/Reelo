/**
 * Pure TMDB response normalisers shared by the edge function (Deno) and Jest tests (Node).
 * No imports, no runtime-specific APIs.
 */

export interface FilmSummary {
  tmdb_id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids: number[];
  popularity: number | null;
  vote_average: number | null;
  overview: string | null;
}

export interface Credit {
  id: number;
  name: string;
  character?: string;
  job?: string;
  profile_path: string | null;
}

export interface Provider {
  id: number;
  name: string;
  logo_path: string | null;
}

export interface Providers {
  region: string;
  link: string | null;
  flatrate: Provider[];
  rent: Provider[];
  buy: Provider[];
}

export interface FilmRow {
  tmdb_id: number;
  title: string;
  original_title: string | null;
  year: number | null;
  release_date: string | null;
  overview: string | null;
  tagline: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  genres: { id: number; name: string }[];
  genre_ids: number[];
  runtime: number | null;
  directors: Credit[];
  cast: Credit[];
  providers: Providers;
  trailer_key: string | null;
  popularity: number | null;
  vote_average: number | null;
  is_partial: boolean;
}

// deno-lint-ignore no-explicit-any
type Json = any;

export function yearOf(date: string | null | undefined): number | null {
  if (!date || date.length < 4) return null;
  const y = Number(date.slice(0, 4));
  return Number.isFinite(y) && y > 1800 ? y : null;
}

export function normaliseSummary(m: Json): FilmSummary {
  return {
    tmdb_id: Number(m.id),
    title: String(m.title ?? m.name ?? 'Untitled'),
    year: yearOf(m.release_date),
    poster_path: m.poster_path ?? null,
    backdrop_path: m.backdrop_path ?? null,
    genre_ids: Array.isArray(m.genre_ids) ? m.genre_ids.map(Number) : (m.genres ?? []).map((g: Json) => Number(g.id)),
    popularity: typeof m.popularity === 'number' ? m.popularity : null,
    vote_average: typeof m.vote_average === 'number' ? m.vote_average : null,
    overview: m.overview || null,
  };
}

/** Pick the best YouTube trailer: official trailers first, then teasers. */
export function pickTrailer(videos: Json): string | null {
  const list: Json[] = (videos?.results ?? []).filter((v: Json) => v.site === 'YouTube' && v.key);
  const score = (v: Json) => (v.type === 'Trailer' ? 2 : v.type === 'Teaser' ? 1 : 0) + (v.official ? 0.5 : 0);
  list.sort((a, b) => score(b) - score(a));
  const best = list[0];
  return best && score(best) >= 1 ? String(best.key) : null;
}

export function normaliseProviders(watch: Json, region: string): Providers {
  const r = watch?.results?.[region] ?? {};
  const map = (arr: Json[] | undefined): Provider[] =>
    (arr ?? [])
      .slice()
      .sort((a: Json, b: Json) => (a.display_priority ?? 99) - (b.display_priority ?? 99))
      .map((p: Json) => ({ id: Number(p.provider_id), name: String(p.provider_name), logo_path: p.logo_path ?? null }));
  return { region, link: r.link ?? null, flatrate: map(r.flatrate), rent: map(r.rent), buy: map(r.buy) };
}

/** /movie/{id}?append_to_response=credits,videos,watch/providers -> films_cache row. */
export function normaliseDetails(m: Json, region = 'IN'): FilmRow {
  const crew: Json[] = m.credits?.crew ?? [];
  const directors = crew
    .filter((c) => c.job === 'Director')
    .map((c) => ({ id: Number(c.id), name: String(c.name), job: 'Director', profile_path: c.profile_path ?? null }));
  const cast = (m.credits?.cast ?? [])
    .slice()
    .sort((a: Json, b: Json) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, 15)
    .map((c: Json) => ({ id: Number(c.id), name: String(c.name), character: c.character ?? '', profile_path: c.profile_path ?? null }));
  const genres = (m.genres ?? []).map((g: Json) => ({ id: Number(g.id), name: String(g.name) }));
  return {
    tmdb_id: Number(m.id),
    title: String(m.title ?? 'Untitled'),
    original_title: m.original_title ?? null,
    year: yearOf(m.release_date),
    release_date: m.release_date || null,
    overview: m.overview || null,
    tagline: m.tagline || null,
    poster_path: m.poster_path ?? null,
    backdrop_path: m.backdrop_path ?? null,
    genres,
    genre_ids: genres.map((g: { id: number }) => g.id),
    runtime: typeof m.runtime === 'number' && m.runtime > 0 ? m.runtime : null,
    directors,
    cast,
    providers: normaliseProviders(m['watch/providers'], region),
    trailer_key: pickTrailer(m.videos),
    popularity: typeof m.popularity === 'number' ? m.popularity : null,
    vote_average: typeof m.vote_average === 'number' ? m.vote_average : null,
    is_partial: false,
  };
}

/** A list/search result as a minimal films_cache row (is_partial = true). */
export function summaryToPartialRow(s: FilmSummary): Partial<FilmRow> & { tmdb_id: number; title: string } {
  return {
    tmdb_id: s.tmdb_id,
    title: s.title,
    year: s.year,
    poster_path: s.poster_path,
    backdrop_path: s.backdrop_path,
    genre_ids: s.genre_ids,
    popularity: s.popularity,
    vote_average: s.vote_average,
    overview: s.overview,
    is_partial: true,
  };
}

export const DETAILS_TTL_MS = 7 * 24 * 3600 * 1000;

/** Should a cached films_cache row be refetched from TMDB? */
export function isStale(row: { fetched_at: string; is_partial: boolean } | null | undefined, now = Date.now()): boolean {
  if (!row) return true;
  if (row.is_partial) return true;
  return now - Date.parse(row.fetched_at) > DETAILS_TTL_MS;
}

/** Whitelisted list endpoints and their cache lifetimes (ms). */
export const LIST_ENDPOINTS: Record<string, { path: string; ttl: number }> = {
  trending: { path: '/trending/movie/week', ttl: 6 * 3600 * 1000 },
  popular: { path: '/movie/popular', ttl: 12 * 3600 * 1000 },
  top_rated: { path: '/movie/top_rated', ttl: 24 * 3600 * 1000 },
  now_playing: { path: '/movie/now_playing', ttl: 12 * 3600 * 1000 },
  upcoming: { path: '/movie/upcoming', ttl: 12 * 3600 * 1000 },
};

/** Stable cache key for api_cache. */
export function cacheKey(action: string, params: Record<string, unknown>): string {
  const parts = Object.keys(params)
    .sort()
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${k}=${String(params[k]).toLowerCase().trim()}`);
  return `${action}?${parts.join('&')}`;
}
