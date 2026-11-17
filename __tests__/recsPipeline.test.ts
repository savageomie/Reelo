import { runPipeline } from '@/features/recs/pipeline';
import type { FilmFeatures } from '@/features/recs/recommend';

const F = (tmdbId: number, genreIds: number[], directorIds: number[], year: number, popularity: number): FilmFeatures => ({
  tmdbId,
  genreIds,
  directorIds,
  castIds: [],
  year,
  popularity,
});

const features = new Map<number, FilmFeatures>(
  [
    F(1, [878, 53], [525], 2010, 50), // Inception (seen, loved)
    F(2, [878, 18], [525], 2014, 60), // Interstellar (seen, loved)
    F(3, [878, 53], [525], 2020, 40), // Tenet
    F(4, [878, 18], [137427], 2016, 45), // Arrival
    F(5, [35, 10749], [1], 2008, 90), // Mamma Mia (very popular, off-taste)
    F(6, [16, 10751], [608], 2001, 70), // Spirited Away (on watchlist)
  ].map((f) => [f.tmdbId, f]),
);

const base = {
  features,
  candidates: [3, 4, 5, 6],
  collaborative: [{ tmdbId: 4, score: 1.2, becauseOf: 2 }],
  watchlist: [6],
};

describe('recommendation pipeline', () => {
  it('excludes seen and watchlisted films and explains collaborative picks', () => {
    const out = runPipeline({
      ...base,
      entries: [
        { tmdbId: 1, rating: 5, liked: true, watchedOn: '2026-01-01' },
        { tmdbId: 2, rating: 4.5, liked: false, watchedOn: '2026-02-01' },
        { tmdbId: 5, rating: 1.5, liked: false, watchedOn: '2026-03-01' },
        { tmdbId: 99, rating: 3, liked: false, watchedOn: '2026-03-02' },
        { tmdbId: 98, rating: 3, liked: false, watchedOn: '2026-03-03' },
      ],
    });
    const ids = out.forYou.map((r) => r.tmdbId);
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(5); // seen
    expect(ids).not.toContain(6); // watchlist
    expect(ids.slice(0, 2).sort()).toEqual([3, 4]);
    expect(out.forYou.find((r) => r.tmdbId === 4)?.becauseOf).toBe(2);
    expect(out.coldStart).toBe(false);
  });

  it('"because you loved" uses the most recently loved film', () => {
    const out = runPipeline({
      ...base,
      entries: [
        { tmdbId: 1, rating: 5, liked: false, watchedOn: '2026-01-01' },
        { tmdbId: 2, rating: 4.5, liked: false, watchedOn: '2026-05-01' },
      ],
    });
    expect(out.becauseOf?.seed).toBe(2);
    expect(out.becauseOf?.items[0].tmdbId).toBe(3); // same director as Interstellar
  });

  it('cold start falls back to popularity', () => {
    const out = runPipeline({ ...base, collaborative: [], entries: [] });
    expect(out.coldStart).toBe(true);
    expect(out.becauseOf).toBeNull();
    expect(out.forYou[0].tmdbId).toBe(5); // most popular unseen, not on watchlist
  });
});
