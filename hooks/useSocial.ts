import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useEffect, useId } from 'react';

import { mergePages, nextCursor } from '@/features/social/feedCursor';
import { supabase, unwrap } from '@/lib/supabase';
import type { AppNotification, Comment, FeedItem, Profile } from '@/lib/types';
import { useUserId } from '@/store/auth';

/* ----------------------------------------------------------------- follows */

export type FollowStatus = 'none' | 'pending' | 'accepted';

export function useFollowStatus(targetId: string | null | undefined) {
  const me = useUserId();
  return useQuery({
    queryKey: ['follow', me, targetId],
    enabled: !!me && !!targetId && me !== targetId,
    queryFn: async (): Promise<FollowStatus> => {
      const row = unwrap(
        await supabase
          .from('follows')
          .select('status')
          .eq('follower_id', me as string)
          .eq('following_id', targetId as string)
          .maybeSingle(),
      ) as { status: FollowStatus } | null;
      return row?.status ?? 'none';
    },
  });
}

export function useToggleFollow(targetId: string | null | undefined) {
  const me = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (follow: boolean) => {
      if (!me || !targetId) throw new Error('Not signed in');
      if (follow) unwrap(await supabase.from('follows').insert({ follower_id: me, following_id: targetId }));
      else unwrap(await supabase.from('follows').delete().eq('follower_id', me).eq('following_id', targetId));
    },
    onMutate: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['follow'] });
      qc.invalidateQueries({ queryKey: ['profileCounts'] });
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['diary', 'user', targetId] });
      qc.invalidateQueries({ queryKey: ['follows'] });
    },
  });
}

export type FollowRow = { status: string; created_at: string; profile: Pick<Profile, 'id' | 'username' | 'avatar_url' | 'display_name'> };

export function useFollowList(userId: string | undefined, kind: 'followers' | 'following') {
  return useQuery({
    queryKey: ['follows', kind, userId],
    enabled: !!userId,
    queryFn: async () => {
      const q =
        kind === 'followers'
          ? supabase
              .from('follows')
              .select('status, created_at, profile:profiles!follows_follower_id_fkey(id, username, avatar_url, display_name)')
              .eq('following_id', userId as string)
          : supabase
              .from('follows')
              .select('status, created_at, profile:profiles!follows_following_id_fkey(id, username, avatar_url, display_name)')
              .eq('follower_id', userId as string);
      return unwrap(await q.eq('status', 'accepted').order('created_at', { ascending: false })) as unknown as FollowRow[];
    },
  });
}

/** Accept or reject a pending follow request (you are the followed user). */
export function useRespondToFollow() {
  const me = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ followerId, accept }: { followerId: string; accept: boolean }) => {
      const q = supabase.from('follows');
      if (accept) unwrap(await q.update({ status: 'accepted' }).eq('follower_id', followerId).eq('following_id', me as string));
      else unwrap(await q.delete().eq('follower_id', followerId).eq('following_id', me as string));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['profileCounts'] });
      qc.invalidateQueries({ queryKey: ['follows'] });
    },
  });
}

export function useBlockUser(targetId: string | undefined) {
  const me = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrap(await supabase.from('blocks').insert({ blocker_id: me, blocked_id: targetId })),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useReport() {
  const me = useUserId();
  return useMutation({
    mutationFn: async (r: { target_type: 'user' | 'review' | 'list' | 'comment'; target_id: string; reason: string }) =>
      unwrap(await supabase.from('reports').insert({ ...r, reporter_id: me })),
  });
}

/* ----------------------------------------------------------------- comments */

export function useComments(type: 'review' | 'list', id: string | undefined) {
  return useQuery({
    queryKey: ['comments', type, id],
    enabled: !!id,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('comments')
          .select('*, profile:profiles!comments_user_id_fkey(username, avatar_url)')
          .eq('target_type', type)
          .eq('target_id', id as string)
          .order('created_at', { ascending: true })
          .limit(200),
      ) as Comment[],
  });
}

export function useAddComment(type: 'review' | 'list', id: string | undefined) {
  const me = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, spoiler }: { body: string; spoiler: boolean }) =>
      unwrap(
        await supabase
          .from('comments')
          .insert({ user_id: me, target_type: type, target_id: id, body: body.trim(), spoiler })
          .select('*, profile:profiles!comments_user_id_fkey(username, avatar_url)')
          .single(),
      ) as Comment,
    onSuccess: (c) => {
      qc.setQueryData<Comment[]>(['comments', type, id], (old) => [...(old ?? []), c]);
      qc.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useDeleteComment(type: 'review' | 'list', id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (commentId: string) => unwrap(await supabase.from('comments').delete().eq('id', commentId)),
    onSuccess: (_d, commentId) =>
      qc.setQueryData<Comment[]>(['comments', type, id], (old) => (old ?? []).filter((c) => c.id !== commentId)),
  });
}

/* ----------------------------------------------------------------- feed */

const FEED_PAGE = 20;

/** Activity feed with cursor pagination on (created_at, id) — see features/social/feedCursor.ts. */
export function useFeed() {
  const me = useUserId();
  const q = useInfiniteQuery({
    queryKey: ['feed', me],
    enabled: !!me,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      (unwrap(await supabase.rpc('get_feed', { p_cursor: pageParam, p_limit: FEED_PAGE })) ?? []) as FeedItem[],
    getNextPageParam: (last) =>
      nextCursor(
        // Keep the server's exact timestamp string (microseconds) in the cursor.
        last.map((r) => ({ ...r, createdAt: r.created_at })),
        FEED_PAGE,
      ),
  });
  const items = q.data
    ? mergePages(q.data.pages.map((p) => p.map((r) => ({ ...r, createdAt: r.created_at }))))
    : undefined;
  return { ...q, items };
}

/* ----------------------------------------------------------------- notifications */

export function useNotifications() {
  const me = useUserId();
  const qc = useQueryClient();
  const instance = useId();
  const q = useQuery({
    queryKey: ['notifications', me],
    enabled: !!me,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('notifications')
          .select('*, actor:profiles!notifications_actor_id_fkey(username, avatar_url)')
          .order('created_at', { ascending: false })
          .limit(100),
      ) as AppNotification[],
  });

  // Live updates via Supabase Realtime (RLS limits the stream to the owner's rows).
  useEffect(() => {
    if (!me) return;
    const channel = supabase
      .channel(`notifications:${me}:${instance}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${me}` }, () =>
        qc.invalidateQueries({ queryKey: ['notifications', me] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [me, qc, instance]);

  return q;
}

export function useUnreadCount() {
  const { data } = useNotifications();
  return (data ?? []).filter((n) => !n.read_at).length;
}

export function useMarkNotificationsRead() {
  const me = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrap(
        await supabase
          .from('notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('user_id', me as string)
          .is('read_at', null),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', me] }),
  });
}
