import type { FilterableFilm } from '@/features/lists/watchlistFilter';
import type { Film } from './types';

export function toFilterable(f: Film | undefined, tmdbId: number): FilterableFilm {
  return {
    tmdbId,
    title: f?.title ?? '…',
    year: f?.year ?? null,
    runtime: f?.runtime ?? null,
    genreIds: f?.genre_ids ?? [],
    providerIds: (f?.providers?.flatrate ?? []).map((p) => p.id),
    popularity: f?.popularity ?? null,
  };
}
