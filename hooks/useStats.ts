import { useEffect, useMemo } from 'react';

import { computeStats, type StatsFilm } from '@/features/stats/computeStats';
import { supabase } from '@/lib/supabase';
import { genreName } from '@/lib/tmdb';
import { useUserId } from '@/store/auth';
import { useUserDiary } from './useDiary';
import { useFilms } from './useFilms';

/** Stats for a user and year (null = all time), computed on device from diary + films_cache. */
export function useStats(userId: string | null | undefined, year: number | null) {
  const me = useUserId();
  const diary = useUserDiary(userId);
  const ids = useMemo(() => [...new Set((diary.data ?? []).map((e) => e.tmdb_id))], [diary.data]);
  const films = useFilms(ids);

  const stats = useMemo(() => {
    if (!diary.data) return undefined;
    const map = new Map<number, StatsFilm>();
    for (const [id, f] of Object.entries(films.data ?? {})) {
      map.set(Number(id), {
        title: f.title,
        year: f.year,
        runtime: f.runtime ?? null,
        genres: f.genres?.length ? f.genres : (f.genre_ids ?? []).map((id) => ({ id, name: genreName(id) })),
        directors: (f.directors ?? []).map((d) => ({ id: d.id, name: d.name })),
        cast: (f.cast ?? []).map((c) => ({ id: c.id, name: c.name })),
        posterPath: f.poster_path,
      });
    }
    return {
      summary: computeStats(
        diary.data.map((e) => ({
          tmdbId: e.tmdb_id,
          watchedOn: e.watched_on,
          rating: e.rating == null ? null : Number(e.rating),
          liked: e.liked,
          isRewatch: e.is_rewatch,
          hasReview: !!e.review,
        })),
        map,
        year,
      ),
      films: map,
      years: [...new Set(diary.data.map((e) => Number(e.watched_on.slice(0, 4))))].sort((a, b) => b - a),
    };
  }, [diary.data, films.data, year]);

  // Cache my yearly stats in user_stats (used as a snapshot for Wrapped; owner-only writes via RLS).
  useEffect(() => {
    if (!stats || userId !== me || year == null || films.isFetching) return;
    void supabase
      .from('user_stats')
      .upsert({ user_id: me, year, data: stats.summary, updated_at: new Date().toISOString() })
      .then(() => undefined);
  }, [stats, userId, me, year, films.isFetching]);

  return {
    data: stats,
    isLoading: diary.isLoading || (ids.length > 0 && films.isLoading),
    isError: diary.isError || films.isError,
    error: diary.error ?? films.error,
    refetch: () => {
      diary.refetch();
      films.refetch();
    },
  };
}
