/** Watchlist sort & filter (pure). Also reused by Watch Together's runtime/genre/provider filters. */

export interface FilterableFilm {
  tmdbId: number;
  title: string;
  year: number | null;
  runtime: number | null;
  genreIds: number[];
  providerIds: number[];
  popularity: number | null;
  addedAt?: string;
}

export type WatchlistSort = 'added_desc' | 'added_asc' | 'title' | 'year_desc' | 'runtime_asc' | 'popularity';

export interface FilmFilters {
  genreIds?: number[]; // any-of
  maxRuntime?: number | null;
  providerIds?: number[]; // any-of (streaming services the user/group has)
}

export function matchesFilters(f: FilterableFilm, filters: FilmFilters): boolean {
  if (filters.genreIds?.length && !f.genreIds.some((g) => filters.genreIds!.includes(g))) return false;
  if (filters.maxRuntime && (f.runtime == null || f.runtime > filters.maxRuntime)) return false;
  if (filters.providerIds?.length && !f.providerIds.some((p) => filters.providerIds!.includes(p))) return false;
  return true;
}

export function sortFilms<T extends FilterableFilm>(films: T[], sort: WatchlistSort): T[] {
  const out = [...films];
  const added = (f: T) => f.addedAt ?? '';
  switch (sort) {
    case 'added_desc':
      return out.sort((a, b) => added(b).localeCompare(added(a)));
    case 'added_asc':
      return out.sort((a, b) => added(a).localeCompare(added(b)));
    case 'title':
      return out.sort((a, b) => a.title.localeCompare(b.title));
    case 'year_desc':
      return out.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    case 'runtime_asc':
      return out.sort((a, b) => (a.runtime ?? Infinity) - (b.runtime ?? Infinity));
    case 'popularity':
      return out.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
  }
}

export function sortAndFilter<T extends FilterableFilm>(films: T[], sort: WatchlistSort, filters: FilmFilters): T[] {
  return sortFilms(
    films.filter((f) => matchesFilters(f, filters)),
    sort,
  );
}

export const SORT_LABELS: Record<WatchlistSort, string> = {
  added_desc: 'Recently added',
  added_asc: 'Oldest added',
  title: 'Title',
  year_desc: 'Newest release',
  runtime_asc: 'Shortest',
  popularity: 'Popular',
};
