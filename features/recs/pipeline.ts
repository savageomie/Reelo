/**
 * Recommendation pipeline (pure): turns a user's diary + candidate films + precomputed collaborative
 * scores into the Home rails. Kept separate from React so it can be unit-tested end to end.
 */
import {
  becauseYouLoved,
  buildProfile,
  contentScores,
  hybridRank,
  isLoved,
  type FilmFeatures,
  type HybridItem,
  type Scored,
} from './recommend';

export interface PipelineEntry {
  tmdbId: number;
  rating: number | null;
  liked: boolean;
  watchedOn: string;
}

export interface PipelineInput {
  entries: PipelineEntry[];
  /** Features for the user's films and for candidates (missing ones are skipped). */
  features: Map<number, FilmFeatures>;
  /** Candidate pool (e.g. films_cache by popularity + collaborative results). */
  candidates: number[];
  collaborative: { tmdbId: number; score: number; becauseOf: number | null }[];
  watchlist: number[];
  limit?: number;
}

export interface PipelineOutput {
  forYou: (HybridItem & { becauseOf: number | null })[];
  becauseOf: { seed: number; items: Scored[] } | null;
  coldStart: boolean;
}

export function runPipeline(input: PipelineInput): PipelineOutput {
  const { entries, features } = input;
  const seen = new Set(entries.map((e) => e.tmdbId));
  const exclude = new Set([...seen, ...input.watchlist]);

  // Latest entry per film
  const latest = new Map<number, PipelineEntry>();
  for (const e of entries) {
    const cur = latest.get(e.tmdbId);
    if (!cur || e.watchedOn > cur.watchedOn) latest.set(e.tmdbId, e);
  }
  const rated = [...latest.values()].filter((e) => e.rating != null || e.liked);
  const loved = rated
    .filter((e) => features.has(e.tmdbId))
    .map((e) => ({ film: features.get(e.tmdbId) as FilmFeatures, rating: e.rating, liked: e.liked }));

  const candidateFeatures = [...new Set([...input.candidates, ...input.collaborative.map((c) => c.tmdbId)])]
    .map((id) => features.get(id))
    .filter((f): f is FilmFeatures => !!f);

  const content = contentScores(buildProfile(loved), candidateFeatures, exclude);
  const popularity: Scored[] = candidateFeatures
    .filter((f) => f.popularity != null)
    .map((f) => ({ tmdbId: f.tmdbId, score: f.popularity as number }));
  const collaborative: Scored[] = input.collaborative.map((c) => ({ tmdbId: c.tmdbId, score: c.score }));

  const ranked = hybridRank({
    content,
    collaborative,
    popularity,
    ratedCount: rated.length,
    exclude,
    limit: input.limit ?? 20,
  });
  const because = new Map(input.collaborative.map((c) => [c.tmdbId, c.becauseOf]));

  // "Because you loved X": the most recently loved film that has features.
  const seedEntry = [...latest.values()]
    .filter((e) => isLoved(e) && features.has(e.tmdbId))
    .sort((a, b) => (a.watchedOn < b.watchedOn ? 1 : -1))[0];
  const becauseOf = seedEntry
    ? { seed: seedEntry.tmdbId, items: becauseYouLoved(features.get(seedEntry.tmdbId) as FilmFeatures, candidateFeatures, exclude, 12) }
    : null;

  return {
    forYou: ranked.map((r) => ({ ...r, becauseOf: because.get(r.tmdbId) ?? null })),
    becauseOf: becauseOf && becauseOf.items.length ? becauseOf : null,
    coldStart: rated.length < 5,
  };
}
