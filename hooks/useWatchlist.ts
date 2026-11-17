import { useMutation, useQuery } from '@tanstack/react-query';

import { enqueueMutation, useOfflineQueue } from '@/lib/offlineQueue';
import { queryClient } from '@/lib/queryClient';
import { supabase, unwrap } from '@/lib/supabase';
import { useUserId } from '@/store/auth';

export interface WatchlistRow {
  user_id: string;
  tmdb_id: number;
  added_at: string;
}

export function useWatchlist(userId: string | null | undefined) {
  const me = useUserId();
  const queue = useOfflineQueue((s) => s.queue);
  const q = useQuery({
    queryKey: ['watchlist', userId],
    enabled: !!userId,
    queryFn: async () =>
      unwrap(
        await supabase.from('watchlist').select('*').eq('user_id', userId as string).order('added_at', { ascending: false }),
      ) as WatchlistRow[],
  });
  if (userId !== me || !q.data) return q;
  // Overlay offline adds/removes.
  let rows = [...q.data];
  for (const m of queue) {
    const p = m.payload as { tmdb_id: number };
    if (m.kind === 'watchlist.add' && !rows.some((r) => r.tmdb_id === p.tmdb_id))
      rows = [{ user_id: me as string, tmdb_id: p.tmdb_id, added_at: new Date(m.createdAt).toISOString() }, ...rows];
    if (m.kind === 'watchlist.remove') rows = rows.filter((r) => r.tmdb_id !== p.tmdb_id);
  }
  return { ...q, data: rows };
}

export function useInWatchlist(tmdbId: number) {
  const me = useUserId();
  const { data } = useWatchlist(me);
  return !!data?.some((r) => r.tmdb_id === tmdbId);
}

export function useToggleWatchlist() {
  const me = useUserId();
  return useMutation({
    mutationFn: async ({ tmdbId, add }: { tmdbId: number; add: boolean }) => {
      if (!me) throw new Error('Not signed in');
      enqueueMutation(add ? 'watchlist.add' : 'watchlist.remove', `watchlist:${tmdbId}`, { tmdb_id: tmdbId, user_id: me });
      queryClient.setQueryData<WatchlistRow[]>(['watchlist', me], (old) =>
        !old
          ? old
          : add
            ? [{ user_id: me, tmdb_id: tmdbId, added_at: new Date().toISOString() }, ...old.filter((r) => r.tmdb_id !== tmdbId)]
            : old.filter((r) => r.tmdb_id !== tmdbId),
      );
    },
  });
}
