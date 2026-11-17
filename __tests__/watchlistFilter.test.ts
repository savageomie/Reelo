import { matchesFilters, sortAndFilter, type FilterableFilm } from '@/features/lists/watchlistFilter';

const f = (tmdbId: number, title: string, extra: Partial<FilterableFilm> = {}): FilterableFilm => ({
  tmdbId,
  title,
  year: 2000,
  runtime: 120,
  genreIds: [18],
  providerIds: [],
  popularity: 10,
  ...extra,
});

const films = [
  f(1, 'Up', { runtime: 96, genreIds: [16, 10751], providerIds: [337], year: 2009, addedAt: '2026-01-03' }),
  f(2, 'Dune', { runtime: 155, genreIds: [878, 12], providerIds: [8], year: 2021, addedAt: '2026-01-01' }),
  f(3, 'Coco', { runtime: 105, genreIds: [16, 10402], providerIds: [337, 8], year: 2017, addedAt: '2026-01-02' }),
  f(4, 'Unknown runtime', { runtime: null, addedAt: '2026-01-04' }),
];

describe('watchlist sort & filter', () => {
  it('filters by max runtime (unknown runtimes excluded)', () => {
    expect(sortAndFilter(films, 'title', { maxRuntime: 110 }).map((x) => x.title)).toEqual(['Coco', 'Up']);
  });

  it('filters by any-of genres and providers', () => {
    expect(sortAndFilter(films, 'added_asc', { genreIds: [16] }).map((x) => x.tmdbId)).toEqual([3, 1]);
    expect(sortAndFilter(films, 'added_desc', { providerIds: [8] }).map((x) => x.tmdbId)).toEqual([3, 2]);
  });

  it('combines filters (Watch Together: Netflix, under 2h, animation)', () => {
    expect(matchesFilters(films[2], { providerIds: [8], maxRuntime: 120, genreIds: [16] })).toBe(true);
    expect(matchesFilters(films[0], { providerIds: [8], maxRuntime: 120, genreIds: [16] })).toBe(false);
  });

  it('sorts', () => {
    expect(sortAndFilter(films, 'added_desc', {}).map((x) => x.tmdbId)).toEqual([4, 1, 3, 2]);
    expect(sortAndFilter(films, 'year_desc', {}).map((x) => x.tmdbId)[0]).toBe(2);
    expect(sortAndFilter(films, 'runtime_asc', {}).map((x) => x.tmdbId)).toEqual([1, 3, 2, 4]);
  });
});
