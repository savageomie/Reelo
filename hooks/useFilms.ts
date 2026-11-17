import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase, unwrap } from '@/lib/supabase';
import { tmdb, type ListKind } from '@/lib/tmdb';
import type { Film, FilmStats, Profile } from '@/lib/types';

const DAY = 24 * 3600 * 1000;

export function useFilm(id: number | null | undefined) {
  return useQuery({
    queryKey: ['film', id],
    queryFn: () => tmdb.film(id as number),
    enabled: !!id,
    staleTime: DAY,
  });
}

/** Batch-load film metadata (from films_cache via the edge function) and prime per-film caches. */
export function useFilms(ids: number[]) {
  const qc = useQueryClient();
  const unique = [...new Set(ids)].sort((a, b) => a - b);
  return useQuery({
    queryKey: ['films', unique],
    queryFn: async () => {
      // The edge function accepts up to 60 ids per call.
      const chunks: number[][] = [];
      for (let i = 0; i < unique.length; i += 60) chunks.push(unique.slice(i, i + 60));
      const films = (await Promise.all(chunks.map((c) => tmdb.films(c)))).flat();
      const map: Record<number, Film> = {};
      for (const f of films) {
        map[f.tmdb_id] = f;
        if (!f.is_partial) qc.setQueryData(['film', f.tmdb_id], f);
      }
      return map;
    },
    enabled: unique.length > 0,
    staleTime: DAY,
    placeholderData: keepPreviousData,
  });
}

export function useFilmList(kind: ListKind) {
  return useQuery({ queryKey: ['tmdbList', kind], queryFn: () => tmdb.list(kind), staleTime: 6 * 3600 * 1000 });
}

export function useSearchFilms(query: string) {
  const q = query.trim();
  return useInfiniteQuery({
    queryKey: ['search', 'films', q],
    queryFn: ({ pageParam }) => tmdb.search(q, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    enabled: q.length >= 2,
    staleTime: DAY,
  });
}

export function useGenreFilms(genreId: number | null) {
  return useInfiniteQuery({
    queryKey: ['genre', genreId],
    queryFn: ({ pageParam }) => tmdb.genre(genreId as number, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages && last.page < 10 ? last.page + 1 : undefined),
    enabled: genreId != null,
    staleTime: DAY,
  });
}

export function useSimilarFilms(id: number) {
  return useQuery({ queryKey: ['similar', id], queryFn: () => tmdb.similar(id), staleTime: DAY });
}

export function usePerson(id: number) {
  return useQuery({ queryKey: ['person', id], queryFn: () => tmdb.person(id), staleTime: DAY });
}

export function useSearchPeople(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ['search', 'people', q],
    queryFn: () => tmdb.searchPeople(q),
    enabled: q.length >= 2,
    staleTime: DAY,
  });
}

/** Search Reelo users by username / display name (Postgres full-text, prefix match). */
export function useSearchUsers(query: string) {
  const term = query.trim().toLowerCase().replace(/[^a-z0-9_ ]/g, '').split(/\s+/).filter(Boolean);
  return useQuery({
    queryKey: ['search', 'users', term.join(' ')],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, bio')
          .textSearch('search', term.map((t) => `${t}:*`).join(' & '), { config: 'simple' })
          .limit(20),
      ) as Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url' | 'bio'>[],
    enabled: term.length > 0 && term.join('').length >= 2,
  });
}

export function useFilmStats(tmdbId: number) {
  return useQuery({
    queryKey: ['filmStats', tmdbId],
    queryFn: async () =>
      unwrap(await supabase.from('film_stats').select('*').eq('tmdb_id', tmdbId).maybeSingle()) as FilmStats | null,
  });
}

/** "Users who liked this also liked" — precomputed item-item similarity. */
export function useAlsoLiked(tmdbId: number) {
  return useQuery({
    queryKey: ['alsoLiked', tmdbId],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('film_similarity')
          .select('similar_tmdb_id, score')
          .eq('tmdb_id', tmdbId)
          .order('score', { ascending: false })
          .limit(15),
      ) as { similar_tmdb_id: number; score: number }[],
  });
}
