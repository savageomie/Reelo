/**
 * Recommendations (blueprint 6.2). Pure functions; the app feeds them data from Supabase.
 *
 * - Content-based: each film becomes a sparse feature vector (genres, directors, top cast, decade).
 *   A user's taste profile is the weighted sum of vectors of films they rated >= 4 (or hearted).
 *   Unseen films are ranked by cosine similarity to that profile.
 * - Collaborative (item-item): precomputed nightly in SQL (film_similarity) and fetched via
 *   get_collaborative_recs — "people who loved X also loved Y".
 * - Hybrid: min-max normalise each source and blend with weights; new users (cold start, fewer
 *   than COLD_START_MIN ratings) fall back to popularity.
 */

export interface FilmFeatures {
  tmdbId: number;
  genreIds: number[];
  directorIds: number[];
  castIds: number[];
  year: number | null;
  popularity?: number | null;
}

export type Vector = Map<string, number>;

export const FEATURE_WEIGHTS = { genre: 1, director: 1.5, cast: 0.6, decade: 0.5 } as const;
export const TOP_CAST = 5;
export const COLD_START_MIN = 5;
export const HYBRID_WEIGHTS = { collaborative: 0.5, content: 0.35, popularity: 0.15 } as const;

export function decadeOf(year: number | null): number | null {
  return year == null ? null : Math.floor(year / 10) * 10;
}

export function filmVector(f: FilmFeatures): Vector {
  const v: Vector = new Map();
  for (const g of f.genreIds) v.set(`g:${g}`, FEATURE_WEIGHTS.genre);
  for (const d of f.directorIds) v.set(`d:${d}`, FEATURE_WEIGHTS.director);
  for (const c of f.castIds.slice(0, TOP_CAST)) v.set(`c:${c}`, FEATURE_WEIGHTS.cast);
  const dec = decadeOf(f.year);
  if (dec != null) v.set(`y:${dec}`, FEATURE_WEIGHTS.decade);
  return v;
}

export function addInto(target: Vector, v: Vector, weight = 1): Vector {
  v.forEach((val, key) => target.set(key, (target.get(key) ?? 0) + val * weight));
  return target;
}

export function cosine(a: Vector, b: Vector): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  a.forEach((va, k) => {
    na += va * va;
    const vb = b.get(k);
    if (vb !== undefined) dot += va * vb;
  });
  b.forEach((vb) => (nb += vb * vb));
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface LovedFilm {
  film: FilmFeatures;
  rating: number | null;
  liked?: boolean;
}

/** Is this film a "loved" seed? rating >= 4 or hearted. */
export function isLoved(r: { rating: number | null; liked?: boolean }): boolean {
  return (r.rating ?? 0) >= 4 || !!r.liked;
}

/** Taste profile: sum of loved film vectors, weighted so 5 stars counts more than 4. */
export function buildProfile(rated: LovedFilm[]): Vector {
  const profile: Vector = new Map();
  for (const r of rated) {
    if (!isLoved(r)) continue;
    const weight = r.rating != null ? r.rating - 3 : 1; // 4★ -> 1, 5★ -> 2, heart only -> 1
    addInto(profile, filmVector(r.film), weight);
  }
  return profile;
}

export interface Scored {
  tmdbId: number;
  score: number;
}

export function contentScores(profile: Vector, candidates: FilmFeatures[], exclude: Set<number>): Scored[] {
  if (profile.size === 0) return [];
  return candidates
    .filter((c) => !exclude.has(c.tmdbId))
    .map((c) => ({ tmdbId: c.tmdbId, score: cosine(profile, filmVector(c)) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.tmdbId - b.tmdbId);
}

/** "Because you loved X": films most similar to a single seed film. */
export function becauseYouLoved(seed: FilmFeatures, candidates: FilmFeatures[], exclude: Set<number>, limit = 10) {
  const sv = filmVector(seed);
  return candidates
    .filter((c) => c.tmdbId !== seed.tmdbId && !exclude.has(c.tmdbId))
    .map((c) => ({ tmdbId: c.tmdbId, score: cosine(sv, filmVector(c)) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.tmdbId - b.tmdbId)
    .slice(0, limit);
}

/** Min-max normalise scores into [0, 1]. A single value (or all equal) maps to 1. */
export function normalise(scores: Scored[]): Map<number, number> {
  const out = new Map<number, number>();
  if (scores.length === 0) return out;
  let min = Infinity;
  let max = -Infinity;
  for (const s of scores) {
    min = Math.min(min, s.score);
    max = Math.max(max, s.score);
  }
  for (const s of scores) out.set(s.tmdbId, max === min ? 1 : (s.score - min) / (max - min));
  return out;
}

export interface HybridInput {
  content: Scored[];
  collaborative: Scored[];
  popularity: Scored[];
  ratedCount: number;
  exclude: Set<number>;
  weights?: { collaborative: number; content: number; popularity: number };
  limit?: number;
}

export interface HybridItem {
  tmdbId: number;
  score: number;
  sources: { content: number; collaborative: number; popularity: number };
}

export function hybridRank(input: HybridInput): HybridItem[] {
  const limit = input.limit ?? 20;
  const coldStart = input.ratedCount < COLD_START_MIN;
  const w = coldStart
    ? { collaborative: 0, content: input.content.length > 0 ? 0.3 : 0, popularity: 1 }
    : (input.weights ?? HYBRID_WEIGHTS);

  const c = normalise(input.content);
  const cf = normalise(input.collaborative);
  const p = normalise(input.popularity);
  const ids = new Set<number>([...c.keys(), ...cf.keys(), ...p.keys()]);

  const items: HybridItem[] = [];
  ids.forEach((id) => {
    if (input.exclude.has(id)) return;
    const sources = { content: c.get(id) ?? 0, collaborative: cf.get(id) ?? 0, popularity: p.get(id) ?? 0 };
    const score =
      w.collaborative * sources.collaborative + w.content * sources.content + w.popularity * sources.popularity;
    if (score > 0) items.push({ tmdbId: id, score, sources });
  });
  return items.sort((a, b) => b.score - a.score || a.tmdbId - b.tmdbId).slice(0, limit);
}
