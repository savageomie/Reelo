/**
 * App-side TMDB client. It never talks to TMDB directly: every call goes through the `tmdb`
 * Supabase Edge Function, which holds the API key and caches results in films_cache / api_cache.
 */
import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from './supabase';
import type { Film, FilmSummary, Paged, Person, PersonSummary } from './types';

export type ListKind = 'trending' | 'popular' | 'top_rated' | 'now_playing' | 'upcoming';

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('tmdb', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const detail = await error.context.json().catch(() => null);
      throw new Error(detail?.error ?? 'Film service error');
    }
    throw new Error(error.message || 'Network request failed');
  }
  return data as T;
}

export const tmdb = {
  film: (id: number) => call<Film>({ action: 'film', id }),
  films: (ids: number[]) => (ids.length ? call<Film[]>({ action: 'films', ids }) : Promise.resolve([] as Film[])),
  search: (query: string, page = 1) => call<Paged<FilmSummary>>({ action: 'search', query, page }),
  list: (kind: ListKind, page = 1) => call<Paged<FilmSummary>>({ action: 'list', kind, page }),
  genre: (genreId: number, page = 1) => call<Paged<FilmSummary>>({ action: 'genre', genreId, page }),
  similar: (id: number) => call<Paged<FilmSummary>>({ action: 'similar', id }),
  genres: () => call<{ id: number; name: string }[]>({ action: 'genres' }),
  person: (id: number) => call<Person>({ action: 'person', id }),
  searchPeople: (query: string) => call<{ results: PersonSummary[] }>({ action: 'search_people', query }),
};

export type ImageSize = 'w92' | 'w154' | 'w185' | 'w342' | 'w500' | 'w780' | 'w1280' | 'original';

export function tmdbImage(path: string | null | undefined, size: ImageSize = 'w342'): string | null {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

/** TMDB's standard movie genres (stable ids) — used offline for onboarding and Discover chips. */
export const GENRES: { id: number; name: string }[] = [
  { id: 28, name: 'Action' },
  { id: 12, name: 'Adventure' },
  { id: 16, name: 'Animation' },
  { id: 35, name: 'Comedy' },
  { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentary' },
  { id: 18, name: 'Drama' },
  { id: 10751, name: 'Family' },
  { id: 14, name: 'Fantasy' },
  { id: 36, name: 'History' },
  { id: 27, name: 'Horror' },
  { id: 10402, name: 'Music' },
  { id: 9648, name: 'Mystery' },
  { id: 10749, name: 'Romance' },
  { id: 878, name: 'Science Fiction' },
  { id: 53, name: 'Thriller' },
  { id: 10752, name: 'War' },
  { id: 37, name: 'Western' },
];

export const genreName = (id: number) => GENRES.find((g) => g.id === id)?.name ?? 'Other';
