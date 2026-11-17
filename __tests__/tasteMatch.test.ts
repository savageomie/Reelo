import {
  latestRatings,
  SHRINKAGE_K,
  tasteLabel,
  tasteMatch,
  tasteMatchFromEntries,
} from '@/features/recs/tasteMatch';

const INCEPTION = 27205;
const PARASITE = 496243;
const TITANIC = 597;
const JOKER = 475557;
const BARBIE = 346698;

const m = (pairs: [number, number][]) => new Map(pairs);

describe('tasteMatch — worked example (viva)', () => {
  // Alice is a generous rater, Bob a harsh one, but they order films the same way.
  const alice = m([
    [INCEPTION, 5],
    [PARASITE, 4.5],
    [TITANIC, 2],
    [JOKER, 3.5],
  ]); // mean 3.75
  const bob = m([
    [INCEPTION, 4],
    [PARASITE, 4],
    [TITANIC, 1.5],
    [BARBIE, 3],
  ]); // mean 3.125

  const r = tasteMatch(alice, bob);

  it('uses only the films both rated', () => {
    expect(r.overlap).toBe(3);
  });

  it('mean-centres then takes cosine similarity', () => {
    // centred Alice: [1.25, 0.75, -1.75], centred Bob: [0.875, 0.875, -1.625]
    // dot = 4.59375, |a| = sqrt(5.1875), |b| = sqrt(4.171875) -> cos ≈ 0.98747
    expect(r.cosine).toBeCloseTo(0.98747, 4);
  });

  it('applies shrinkage n/(n+k) with k=5', () => {
    expect(SHRINKAGE_K).toBe(5);
    expect(r.similarity).toBeCloseTo(0.98747 * (3 / 8), 4); // ≈ 0.3703
  });

  it('maps [-1, 1] to a 0..100 percentage', () => {
    // (0.3703 + 1) / 2 * 100 = 68.5 -> 69%
    expect(r.score).toBe(69);
  });

  it('is symmetric', () => {
    expect(tasteMatch(bob, alice).score).toBe(r.score);
  });
});

describe('tasteMatch — edge cases', () => {
  it('returns null score with no shared films', () => {
    const r = tasteMatch(m([[1, 5]]), m([[2, 5]]));
    expect(r).toEqual({ score: null, similarity: null, cosine: null, overlap: 0 });
  });

  it('a single shared film can never show 100%', () => {
    // Both users rated other films so the shared film is centred away from 0.
    const r = tasteMatch(
      m([
        [1, 5],
        [2, 3],
      ]),
      m([
        [1, 5],
        [3, 3],
      ]),
    );
    expect(r.overlap).toBe(1);
    expect(r.cosine).toBeCloseTo(1);
    expect(r.similarity).toBeCloseTo(1 / 6);
    expect(r.score).toBe(58);
  });

  it('perfect agreement over many films approaches but stays below 100%', () => {
    const films: [number, number][] = Array.from({ length: 45 }, (_, i) => [i, (i % 10) / 2 + 0.5]);
    const r = tasteMatch(m(films), m(films));
    expect(r.cosine).toBeCloseTo(1);
    expect(r.similarity).toBeCloseTo(45 / 50);
    expect(r.score).toBe(95);
  });

  it('opposite tastes score low', () => {
    const a = m([
      [1, 5],
      [2, 1],
      [3, 5],
      [4, 1],
      [5, 4],
    ]);
    const b = m([
      [1, 1],
      [2, 5],
      [3, 1],
      [4, 5],
      [5, 2],
    ]);
    const r = tasteMatch(a, b);
    expect(r.cosine).toBeLessThan(-0.9);
    expect(r.score).toBeLessThan(30);
  });

  it('a user who rates everything the same gives 0 similarity (50%)', () => {
    const flat = m([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
    const other = m([
      [1, 5],
      [2, 1],
      [3, 4],
    ]);
    const r = tasteMatch(flat, other);
    expect(r.cosine).toBe(0);
    expect(r.score).toBe(50);
  });

  it('mean-centring makes harsh and generous raters with the same ordering match', () => {
    const generous = m([
      [1, 5],
      [2, 4.5],
      [3, 4],
      [4, 3.5],
      [5, 3],
    ]);
    const harsh = m([
      [1, 3],
      [2, 2.5],
      [3, 2],
      [4, 1.5],
      [5, 1],
    ]);
    expect(tasteMatch(generous, harsh).cosine).toBeCloseTo(1);
  });
});

describe('latestRatings', () => {
  it('keeps the most recent rating per film and ignores unrated logs', () => {
    const map = latestRatings([
      { tmdbId: 1, rating: 3, watchedOn: '2025-01-01' },
      { tmdbId: 1, rating: 4.5, watchedOn: '2026-03-01' },
      { tmdbId: 2, rating: null, watchedOn: '2026-03-01' },
      { tmdbId: 3, rating: 2, watchedOn: '2026-03-01', createdAt: '2026-03-01T10:00:00Z' },
      { tmdbId: 3, rating: 2.5, watchedOn: '2026-03-01', createdAt: '2026-03-01T11:00:00Z' },
    ]);
    expect([...map.entries()].sort()).toEqual([
      [1, 4.5],
      [3, 2.5],
    ]);
  });

  it('tasteMatchFromEntries combines both steps', () => {
    const r = tasteMatchFromEntries(
      [
        { tmdbId: 1, rating: 5, watchedOn: '2026-01-01' },
        { tmdbId: 2, rating: 1, watchedOn: '2026-01-01' },
      ],
      [
        { tmdbId: 1, rating: 4, watchedOn: '2026-01-01' },
        { tmdbId: 2, rating: 2, watchedOn: '2026-01-01' },
      ],
    );
    expect(r.overlap).toBe(2);
    expect(r.cosine).toBeCloseTo(1);
  });
});

describe('tasteLabel', () => {
  it('describes the match', () => {
    expect(tasteLabel({ score: null, overlap: 0 })).toBe('No films in common yet');
    expect(tasteLabel({ score: 90, overlap: 2 })).toBe('Early guess');
    expect(tasteLabel({ score: 85, overlap: 10 })).toBe('Kindred spirits');
    expect(tasteLabel({ score: 20, overlap: 10 })).toBe('Opposites');
  });
});
