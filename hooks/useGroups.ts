import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';

import { supabase, unwrap } from '@/lib/supabase';
import type { Group, GroupMember, GroupPick, GroupVote } from '@/lib/types';
import { useUserId } from '@/store/auth';

export type GroupSummary = Group & { members: { user_id: string }[]; picks: { id: string }[] };

export function useMyGroups() {
  const me = useUserId();
  return useQuery({
    queryKey: ['groups', 'mine', me],
    enabled: !!me,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('groups')
          .select('*, members:group_members!group_members_group_id_fkey(user_id), picks:group_picks!group_picks_group_id_fkey(id)')
          .order('created_at', { ascending: false }),
      ) as GroupSummary[],
  });
}

export interface GroupDetail {
  group: Group;
  members: GroupMember[];
  picks: GroupPick[];
  votes: GroupVote[];
}

/**
 * Full group state + Realtime: any change to the group, its members, picks or votes
 * (by anyone) refetches, so tallies update live on every phone.
 */
export function useGroup(id: string | undefined) {
  const qc = useQueryClient();
  const instance = useId();
  const [live, setLive] = useState(false);
  const key = ['group', id];
  const q = useQuery({
    queryKey: key,
    enabled: !!id,
    queryFn: async (): Promise<GroupDetail | null> => {
      const [g, m, p, v] = await Promise.all([
        supabase.from('groups').select('*').eq('id', id as string).maybeSingle(),
        supabase.from('group_members').select('*, profile:profiles!group_members_user_id_fkey(username, avatar_url)').eq('group_id', id as string).order('joined_at'),
        supabase.from('group_picks').select('*').eq('group_id', id as string).order('created_at').order('id'),
        supabase.from('group_votes').select('*').eq('group_id', id as string),
      ]);
      const group = unwrap(g) as Group | null;
      if (!group) return null;
      return {
        group,
        members: unwrap(m) as GroupMember[],
        picks: unwrap(p) as GroupPick[],
        votes: unwrap(v) as GroupVote[],
      };
    },
  });

  useEffect(() => {
    if (!id) return;
    const refresh = () => qc.invalidateQueries({ queryKey: ['group', id] });
    const filter = `group_id=eq.${id}`;
    const channel = supabase
      .channel(`group:${id}:${instance}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_votes', filter }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_picks', filter }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'groups', filter: `id=eq.${id}` }, () => {
        refresh();
        qc.invalidateQueries({ queryKey: ['groups'] });
      })
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, qc, instance]);

  return { ...q, live };
}

function useGroupMutation<V, R>(fn: (v: V) => Promise<R>, groupId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      if (groupId) qc.invalidateQueries({ queryKey: ['group', groupId] });
      qc.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

export function useCreateGroup() {
  const me = useUserId();
  return useGroupMutation(async ({ name, mode }: { name: string; mode: 'ranked' | 'swipe' }) =>
    unwrap(await supabase.from('groups').insert({ name: name.trim(), owner_id: me, voting_mode: mode }).select().single()) as Group,
  );
}

export function useJoinGroup() {
  return useGroupMutation(async (code: string) => unwrap(await supabase.rpc('join_group', { p_code: code })) as string);
}

export function useLeaveGroup(groupId: string) {
  const me = useUserId();
  return useGroupMutation(
    async () => unwrap(await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', me as string)),
    groupId,
  );
}

export function useDeleteGroup(groupId: string) {
  return useGroupMutation(async () => unwrap(await supabase.from('groups').delete().eq('id', groupId)), groupId);
}

export function useUpdateGroupFilters(groupId: string) {
  return useGroupMutation(
    async (filters: Group['filters']) => unwrap(await supabase.from('groups').update({ filters }).eq('id', groupId)),
    groupId,
  );
}

export function useAddPick(groupId: string) {
  const me = useUserId();
  return useGroupMutation(
    async (tmdbId: number) =>
      unwrap(await supabase.from('group_picks').insert({ group_id: groupId, tmdb_id: tmdbId, added_by: me })),
    groupId,
  );
}

export function useRemovePick(groupId: string) {
  return useGroupMutation(async (pickId: string) => unwrap(await supabase.from('group_picks').delete().eq('id', pickId)), groupId);
}

export function useStartVoting(groupId: string) {
  return useGroupMutation(
    async (mode: 'ranked' | 'swipe') => unwrap(await supabase.rpc('start_voting', { p_group: groupId, p_mode: mode })),
    groupId,
  );
}

export function useCloseVoting(groupId: string) {
  return useGroupMutation(async () => unwrap(await supabase.rpc('close_voting', { p_group: groupId })) as string, groupId);
}

export function useResetGroup(groupId: string) {
  return useGroupMutation(async () => unwrap(await supabase.rpc('reset_group', { p_group: groupId })), groupId);
}

/** Swipe vote: upsert yes/no for one pick. */
export function useSwipeVote(groupId: string) {
  const me = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pickId, value }: { pickId: string; value: 0 | 1 }) =>
      unwrap(
        await supabase
          .from('group_votes')
          .upsert({ group_id: groupId, pick_id: pickId, user_id: me, value, rank: null }, { onConflict: 'pick_id,user_id' }),
      ),
    onMutate: ({ pickId, value }) => {
      qc.setQueryData<GroupDetail | null>(['group', groupId], (old) =>
        old
          ? {
              ...old,
              votes: [...old.votes.filter((v) => !(v.pick_id === pickId && v.user_id === me)), { group_id: groupId, pick_id: pickId, user_id: me as string, value, rank: null }],
            }
          : old,
      );
    },
  });
}

/** Ranked ballot: replace my ranks with the given order (first = rank 1). */
export function useSubmitRanking(groupId: string) {
  const me = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (order: string[]) => {
      unwrap(await supabase.from('group_votes').delete().eq('group_id', groupId).eq('user_id', me as string));
      if (order.length) {
        unwrap(
          await supabase
            .from('group_votes')
            .insert(order.map((pick_id, i) => ({ group_id: groupId, pick_id, user_id: me, rank: i + 1 }))),
        );
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['group', groupId] }),
  });
}
