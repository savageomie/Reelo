import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { runPipeline } from '@/features/recs/pipeline';
import type { FilmFeatures } from '@/features/recs/recommend';
import { supabase, unwrap } from '@/lib/supabase';
import { useUserId } from '@/store/auth';
import { useUserDiary } from './useDiary';
import { useWatchlist } from './useWatchlist';

type CacheRow = {
  tmdb_id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
  genre_ids: number[];
  directors: { id: number }[];
  cast: { id: number }[];
  popularity: number | null;
};

const COLUMNS = 'tmdb_id, title, year, poster_path, genre_ids, directors, cast, popularity';

const toFeatures = (r: CacheRow): FilmFeatures => ({
  tmdbId: r.tmdb_id,
  genreIds: r.genre_ids ?? [],
  directorIds: (r.directors ?? []).map((d) => d.id),
  castIds: (r.cast ?? []).map((c) => c.id),
  year: r.year,
  popularity: r.popularity,
});

/** Hybrid recommendations (content + collaborative + popularity) for the Home rails. */
export function useRecommendations() {
  const me = useUserId();
  const diary = useUserDiary(me);
  const wl = useWatchlist(me);
  const myIds = useMemo(() => [...new Set((diary.data ?? []).map((e) => e.tmdb_id))], [diary.data]);

  const data = useQuery({
    queryKey: ['recs', me, myIds.length],
    enabled: !!me && !!diary.data,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const [pool, collab] = await Promise.all([
        supabase.from('films_cache').select(COLUMNS).order('popularity', { ascending: false, nullsFirst: false }).limit(200),
        supabase.rpc('get_collaborative_recs', { p_limit: 40 }),
      ]);
      const collabRows = (unwrap(collab) ?? []) as { tmdb_id: number; score: number; because_of: number | null }[];
      const poolRows = (unwrap(pool) ?? []) as CacheRow[];
      const need = [...new Set([...myIds, ...collabRows.map((c) => c.tmdb_id)])].filter((id) => !poolRows.some((r) => r.tmdb_id === id));
      const extra: CacheRow[] = [];
      for (let i = 0; i < need.length; i += 150) {
        extra.push(...((unwrap(await supabase.from('films_cache').select(COLUMNS).in('tmdb_id', need.slice(i, i + 150))) ?? []) as CacheRow[]));
      }
      const rows = new Map<number, CacheRow>([...poolRows, ...extra].map((r) => [r.tmdb_id, r]));
      return { rows, poolIds: poolRows.map((r) => r.tmdb_id), collab: collabRows };
    },
  });

  const result = useMemo(() => {
    if (!data.data || !diary.data) return undefined;
    const features = new Map([...data.data.rows.values()].map((r) => [r.tmdb_id, toFeatures(r)]));
    const out = runPipeline({
      entries: diary.data.map((e) => ({ tmdbId: e.tmdb_id, rating: e.rating == null ? null : Number(e.rating), liked: e.liked, watchedOn: e.watched_on })),
      features,
      candidates: data.data.poolIds,
      collaborative: data.data.collab.map((c) => ({ tmdbId: c.tmdb_id, score: Number(c.score), becauseOf: c.because_of })),
      watchlist: (wl.data ?? []).map((w) => w.tmdb_id),
    });
    return { ...out, rows: data.data.rows };
  }, [data.data, diary.data, wl.data]);

  return { data: result, isLoading: diary.isLoading || data.isLoading, isError: data.isError, error: data.error, refetch: data.refetch };
}
