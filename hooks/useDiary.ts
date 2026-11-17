import { useMutation, useQuery } from '@tanstack/react-query';

import { applyPendingDiary } from '@/features/offline/queue';
import { enqueueMutation, newId, useOfflineQueue, type DiaryUpsertPayload } from '@/lib/offlineQueue';
import { queryClient } from '@/lib/queryClient';
import { supabase, unwrap } from '@/lib/supabase';
import type { DiaryEntry, Profile } from '@/lib/types';
import { useUserId } from '@/store/auth';

const withUpdated = (e: DiaryEntry) => ({ ...e, updatedAt: e.updated_at });

/** Overlay queued offline writes on top of server rows (optimistic offline UI). */
function useWithPending(entries: DiaryEntry[] | undefined, filter: (e: DiaryEntry) => boolean) {
  const queue = useOfflineQueue((s) => s.queue);
  if (!entries) return entries;
  if (queue.length === 0) return entries;
  const pendingIds = new Set(
    queue.filter((m) => m.kind === 'diary.upsert').map((m) => (m.payload as DiaryUpsertPayload).id),
  );
  const merged = applyPendingDiary(
    entries.map(withUpdated),
    queue.map((m) =>
      m.kind === 'diary.upsert'
        ? { ...m, payload: { ...(m.payload as DiaryUpsertPayload), updatedAt: (m.payload as DiaryUpsertPayload).updated_at } }
        : m,
    ),
  ) as (DiaryEntry & { updatedAt?: string })[];
  return merged
    .filter(filter)
    .map((e) => ({ ...e, pending: pendingIds.has(e.id) }))
    .sort((a, b) => (a.watched_on < b.watched_on ? 1 : a.watched_on > b.watched_on ? -1 : b.created_at.localeCompare(a.created_at)));
}

export function useUserDiary(userId: string | null | undefined) {
  const me = useUserId();
  const q = useQuery({
    queryKey: ['diary', 'user', userId],
    enabled: !!userId,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('diary_entries')
          .select('*')
          .eq('user_id', userId as string)
          .order('watched_on', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1000),
      ) as DiaryEntry[],
  });
  const data = useWithPending(q.data, (e) => e.user_id === userId);
  return { ...q, data: userId === me ? data : q.data };
}

export function useMyEntriesForFilm(tmdbId: number) {
  const me = useUserId();
  const q = useQuery({
    queryKey: ['diary', 'film', tmdbId, me],
    enabled: !!me,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('diary_entries')
          .select('*')
          .eq('user_id', me as string)
          .eq('tmdb_id', tmdbId)
          .order('watched_on', { ascending: false }),
      ) as DiaryEntry[],
  });
  return { ...q, data: useWithPending(q.data, (e) => e.tmdb_id === tmdbId && e.user_id === me) };
}

export type EntryWithProfile = DiaryEntry & { profile: Pick<Profile, 'username' | 'avatar_url' | 'display_name'> };

export function useDiaryEntry(id: string | undefined) {
  const queue = useOfflineQueue((s) => s.queue);
  const q = useQuery({
    queryKey: ['diary', 'entry', id],
    enabled: !!id,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('diary_entries')
          .select('*, profile:profiles!diary_entries_user_id_fkey(username, avatar_url, display_name)')
          .eq('id', id as string)
          .maybeSingle(),
      ) as EntryWithProfile | null,
  });
  const pending = queue.find((m) => m.kind === 'diary.upsert' && (m.payload as DiaryUpsertPayload).id === id);
  if (pending && (!q.data || (pending.payload as DiaryUpsertPayload).updated_at >= q.data.updated_at)) {
    return { ...q, data: { ...(q.data ?? {}), ...(pending.payload as DiaryUpsertPayload), pending: true } as EntryWithProfile };
  }
  return q;
}

/** Public reviews of a film (RLS hides private diaries automatically). */
export function useFilmReviews(tmdbId: number) {
  return useQuery({
    queryKey: ['diary', 'reviews', tmdbId],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('diary_entries')
          .select('*, profile:profiles!diary_entries_user_id_fkey(username, avatar_url, display_name)')
          .eq('tmdb_id', tmdbId)
          .not('review', 'is', null)
          .order('created_at', { ascending: false })
          .limit(30),
      ) as EntryWithProfile[],
  });
}

export interface LogInput {
  id?: string;
  tmdb_id: number;
  watched_on: string;
  rating: number | null;
  review: string | null;
  spoiler: boolean;
  tags: string[];
  is_rewatch: boolean;
  liked: boolean;
  created_at?: string;
}

/** Create or edit a diary entry. Always goes through the offline queue (works with no signal). */
export function useSaveEntry() {
  const me = useUserId();
  return useMutation({
    mutationFn: async (input: LogInput) => {
      if (!me) throw new Error('Not signed in');
      const now = new Date().toISOString();
      const payload: DiaryUpsertPayload = {
        id: input.id ?? newId(),
        user_id: me,
        tmdb_id: input.tmdb_id,
        watched_on: input.watched_on,
        rating: input.rating,
        review: input.review?.trim() ? input.review.trim() : null,
        spoiler: input.spoiler,
        tags: input.tags,
        is_rewatch: input.is_rewatch,
        liked: input.liked,
        created_at: input.created_at ?? now,
        updated_at: now,
      };
      enqueueMutation('diary.upsert', `diary:${payload.id}`, payload);
      return payload;
    },
  });
}

export function useDeleteEntry() {
  return useMutation({
    mutationFn: async (id: string) => {
      enqueueMutation('diary.delete', `diary:${id}`, { id });
      queryClient.setQueriesData<DiaryEntry[]>({ queryKey: ['diary'] }, (old) =>
        Array.isArray(old) ? old.filter((e) => e.id !== id) : old,
      );
      return id;
    },
  });
}
