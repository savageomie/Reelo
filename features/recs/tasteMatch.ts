/**
 * Taste match between two users (blueprint 6.1). Pure, framework-free; mirrored in SQL by
 * public.compute_taste_match and public.refresh_taste_similarity.
 *
 *  1. Take each user's latest rating per film.
 *  2. Mean-centre: subtract the user's own average rating (over ALL films they rated), so a harsh
 *     rater (avg 2.8) and a generous rater (avg 4.1) who agree on *relative* preferences still match.
 *  3. Cosine similarity of the centred ratings over the films both users rated.
 *  4. Shrinkage n / (n + k), k = 5: with only one shared film the similarity is at most 1/6,
 *     so two strangers who both loved one film don't show "100%".
 *  5. Map [-1, 1] -> [0, 100]%. 50% = no evidence either way.
 */

export const SHRINKAGE_K = 5;

export interface RatedEntry {
  tmdbId: number;
  rating: number | null;
  watchedOn?: string; // YYYY-MM-DD
  createdAt?: string;
}

export interface TasteMatchResult {
  /** 0..100 percentage, or null when the users share no rated films. */
  score: number | null;
  /** Shrunk similarity in [-1, 1], or null when no overlap. */
  similarity: number | null;
  /** Raw (unshrunk) cosine similarity of the centred vectors. */
  cosine: number | null;
  /** Number of films both users rated. */
  overlap: number;
}

/** Latest rating per film (rewatches: most recent watched_on, then created_at). */
export function latestRatings(entries: RatedEntry[]): Map<number, number> {
  const best = new Map<number, RatedEntry>();
  for (const e of entries) {
    if (e.rating == null) continue;
    const prev = best.get(e.tmdbId);
    if (!prev || compareRecency(e, prev) > 0) best.set(e.tmdbId, e);
  }
  const out = new Map<number, number>();
  best.forEach((e, id) => out.set(id, e.rating as number));
  return out;
}

function compareRecency(a: RatedEntry, b: RatedEntry): number {
  const wa = a.watchedOn ?? '';
  const wb = b.watchedOn ?? '';
  if (wa !== wb) return wa > wb ? 1 : -1;
  const ca = a.createdAt ?? '';
  const cb = b.createdAt ?? '';
  if (ca !== cb) return ca > cb ? 1 : -1;
  return 0;
}

export function mean(values: Iterable<number>): number {
  let sum = 0;
  let n = 0;
  for (const v of values) {
    sum += v;
    n += 1;
  }
  return n === 0 ? 0 : sum / n;
}

export function tasteMatch(
  a: Map<number, number>,
  b: Map<number, number>,
  k: number = SHRINKAGE_K,
): TasteMatchResult {
  const meanA = mean(a.values());
  const meanB = mean(b.values());
  let dot = 0;
  let normA = 0;
  let normB = 0;
  let n = 0;
  a.forEach((ra, film) => {
    const rb = b.get(film);
    if (rb === undefined) return;
    const ca = ra - meanA;
    const cb = rb - meanB;
    dot += ca * cb;
    normA += ca * ca;
    normB += cb * cb;
    n += 1;
  });
  if (n === 0) return { score: null, similarity: null, cosine: null, overlap: 0 };
  const cosine = normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
  const similarity = cosine * (n / (n + k));
  const score = Math.round(((similarity + 1) / 2) * 100);
  return { score, similarity, cosine, overlap: n };
}

/** Convenience: compute directly from two users' diary entries. */
export function tasteMatchFromEntries(a: RatedEntry[], b: RatedEntry[], k = SHRINKAGE_K) {
  return tasteMatch(latestRatings(a), latestRatings(b), k);
}

/** Human label for the UI. */
export function tasteLabel(result: Pick<TasteMatchResult, 'score' | 'overlap'>): string {
  if (result.score == null || result.overlap === 0) return 'No films in common yet';
  if (result.overlap < 3) return 'Early guess';
  if (result.score >= 80) return 'Kindred spirits';
  if (result.score >= 65) return 'Very similar taste';
  if (result.score >= 50) return 'Some overlap';
  if (result.score >= 35) return 'Different tastes';
  return 'Opposites';
}
