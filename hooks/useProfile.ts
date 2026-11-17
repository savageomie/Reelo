import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase, unwrap } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { useUserId } from '@/store/auth';

export function useMyProfile() {
  const uid = useUserId();
  return useQuery({
    queryKey: ['profile', 'id', uid],
    queryFn: async () => unwrap(await supabase.from('profiles').select('*').eq('id', uid as string).single()) as Profile,
    enabled: !!uid,
  });
}

export function useProfileByUsername(username: string | undefined) {
  return useQuery({
    queryKey: ['profile', 'username', username],
    queryFn: async () =>
      unwrap(await supabase.from('profiles').select('*').eq('username', (username as string).toLowerCase()).maybeSingle()) as Profile | null,
    enabled: !!username,
  });
}

export function useProfileById(id: string | null | undefined) {
  return useQuery({
    queryKey: ['profile', 'id', id],
    queryFn: async () => unwrap(await supabase.from('profiles').select('*').eq('id', id as string).single()) as Profile,
    enabled: !!id,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const uid = useUserId();
  return useMutation({
    mutationFn: async (patch: Partial<Omit<Profile, 'id' | 'created_at'>>) =>
      unwrap(await supabase.from('profiles').update(patch).eq('id', uid as string).select().single()) as Profile,
    onSuccess: (p) => {
      qc.setQueryData(['profile', 'id', p.id], p);
      qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

export interface FollowCounts {
  followers: number;
  following: number;
  films: number;
  thisYear: number;
  lists: number;
}

export function useProfileCounts(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['profileCounts', userId],
    enabled: !!userId,
    queryFn: async (): Promise<FollowCounts> => {
      const uid = userId as string;
      const year = new Date().getFullYear();
      const head = { count: 'exact' as const, head: true };
      const [followers, following, films, thisYear, lists] = await Promise.all([
        supabase.from('follows').select('*', head).eq('following_id', uid).eq('status', 'accepted'),
        supabase.from('follows').select('*', head).eq('follower_id', uid).eq('status', 'accepted'),
        supabase.from('diary_entries').select('*', head).eq('user_id', uid),
        supabase.from('diary_entries').select('*', head).eq('user_id', uid).gte('watched_on', `${year}-01-01`),
        supabase.from('lists').select('*', head).eq('owner_id', uid),
      ]);
      return {
        followers: followers.count ?? 0,
        following: following.count ?? 0,
        films: films.count ?? 0,
        thisYear: thisYear.count ?? 0,
        lists: lists.count ?? 0,
      };
    },
  });
}
