import { computeStats, heatLevel, heatmapGrid, longestStreak, type StatsFilm } from '@/features/stats/computeStats';

const films: Record<number, StatsFilm> = {
  1: {
    title: 'Inception',
    year: 2010,
    runtime: 148,
    genres: [
      { id: 878, name: 'Science Fiction' },
      { id: 28, name: 'Action' },
    ],
    directors: [{ id: 525, name: 'Christopher Nolan' }],
    cast: [{ id: 6193, name: 'Leonardo DiCaprio' }],
  },
  2: {
    title: 'Interstellar',
    year: 2014,
    runtime: 169,
    genres: [{ id: 878, name: 'Science Fiction' }],
    directors: [{ id: 525, name: 'Christopher Nolan' }],
    cast: [{ id: 10297, name: 'Matthew McConaughey' }],
  },
  3: {
    title: 'Titanic',
    year: 1997,
    runtime: 194,
    genres: [{ id: 10749, name: 'Romance' }],
    directors: [{ id: 2710, name: 'James Cameron' }],
    cast: [{ id: 6193, name: 'Leonardo DiCaprio' }],
  },
};

const entries = [
  { tmdbId: 1, watchedOn: '2026-03-01', rating: 5, liked: true, hasReview: true },
  { tmdbId: 2, watchedOn: '2026-03-02', rating: 4.5 },
  { tmdbId: 3, watchedOn: '2026-03-03', rating: 3 },
  { tmdbId: 1, watchedOn: '2026-07-10', rating: 4, isRewatch: true },
  { tmdbId: 3, watchedOn: '2025-12-31', rating: 2 },
];

describe('computeStats (year 2026)', () => {
  const s = computeStats(entries, films, 2026);

  it('counts logs, unique films, rewatches and hours', () => {
    expect(s.totalLogs).toBe(4);
    expect(s.uniqueFilms).toBe(3);
    expect(s.rewatches).toBe(1);
    expect(s.totalMinutes).toBe(148 + 169 + 194 + 148);
    expect(s.hours).toBe(11);
  });

  it('builds per-month and rating distributions', () => {
    expect(s.perMonth[2]).toBe(3);
    expect(s.perMonth[6]).toBe(1);
    expect(s.busiestMonth).toBe(2);
    expect(s.ratingDistribution[9]).toBe(1); // one 5★
    expect(s.averageRating).toBe(4.13);
  });

  it('ranks genres, decades, directors and actors', () => {
    expect(s.genres[0]).toEqual({ key: '878', name: 'Science Fiction', count: 3 });
    expect(s.decades.map((d) => d.name)).toEqual(['1990s', '2010s']);
    expect(s.topDirectors[0]).toEqual({ key: '525', name: 'Christopher Nolan', count: 3 });
    expect(s.topActors[0].name).toBe('Leonardo DiCaprio');
  });

  it('computes heatmap, streak and top rated', () => {
    expect(s.heatmap['2026-03-02']).toBe(1);
    expect(s.longestStreak).toBe(3);
    expect(s.topRated[0]).toEqual({ tmdbId: 1, rating: 5 });
  });

  it('all-time includes other years', () => {
    expect(computeStats(entries, films, null).totalLogs).toBe(5);
  });
});

describe('heatmap helpers', () => {
  it('lays out a full year in week columns', () => {
    const grid = heatmapGrid(2026, { '2026-01-01': 2 });
    expect(grid.every((w) => w.length === 7)).toBe(true);
    const days = grid.flat().filter((c) => c.date);
    expect(days).toHaveLength(365);
    // 1 Jan 2026 is a Thursday -> 4 padding cells before it
    expect(grid[0].slice(0, 4).every((c) => c.date === null)).toBe(true);
    expect(grid[0][4]).toEqual({ date: '2026-01-01', count: 2 });
  });

  it('buckets intensity', () => {
    expect([0, 1, 2, 3, 4].map((c) => heatLevel(c, 4))).toEqual([0, 1, 2, 3, 4]);
  });

  it('longest streak ignores duplicate days', () => {
    expect(longestStreak(['2026-01-01', '2026-01-01', '2026-01-02', '2026-01-04'])).toBe(2);
    expect(longestStreak([])).toBe(0);
  });
});
