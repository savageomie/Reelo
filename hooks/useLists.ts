import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase, unwrap } from '@/lib/supabase';
import type { List, ListItem, Profile } from '@/lib/types';
import { useUserId } from '@/store/auth';

export type ListWithMeta = List & { items: { tmdb_id: number; position: number }[] };

export function useUserLists(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['lists', 'user', userId],
    enabled: !!userId,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('lists')
          .select('*, items:list_items!list_items_list_id_fkey(tmdb_id, position)')
          .eq('owner_id', userId as string)
          .order('updated_at', { ascending: false }),
      ) as ListWithMeta[],
  });
}

export type ListDetail = List & {
  owner: Pick<Profile, 'id' | 'username' | 'avatar_url'>;
  items: ListItem[];
};

export function useList(id: string | undefined) {
  return useQuery({
    queryKey: ['lists', 'detail', id],
    enabled: !!id,
    queryFn: async () => {
      const list = unwrap(
        await supabase
          .from('lists')
          .select('*, owner:profiles!lists_owner_id_fkey(id, username, avatar_url), items:list_items!list_items_list_id_fkey(*)')
          .eq('id', id as string)
          .maybeSingle(),
      ) as ListDetail | null;
      if (list) list.items.sort((a, b) => a.position - b.position || a.tmdb_id - b.tmdb_id);
      return list;
    },
  });
}

function useInvalidateLists() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['lists'] });
}

export interface ListInput {
  title: string;
  description: string | null;
  is_public: boolean;
  is_ranked: boolean;
}

export function useCreateList() {
  const me = useUserId();
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: async ({ input, tmdbIds = [] }: { input: ListInput; tmdbIds?: number[] }) => {
      const list = unwrap(await supabase.from('lists').insert({ ...input, owner_id: me }).select().single()) as List;
      if (tmdbIds.length) {
        unwrap(
          await supabase
            .from('list_items')
            .insert(tmdbIds.map((tmdb_id, i) => ({ list_id: list.id, tmdb_id, position: i + 1 }))),
        );
      }
      return list;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateList(id: string) {
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: async ({ input, order }: { input: ListInput; order?: number[] }) => {
      unwrap(await supabase.from('lists').update(input).eq('id', id));
      if (order) unwrap(await supabase.rpc('reorder_list', { p_list: id, p_tmdb_ids: order }));
    },
    onSuccess: invalidate,
  });
}

export function useDeleteList() {
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('lists').delete().eq('id', id)),
    onSuccess: invalidate,
  });
}

export function useAddToList() {
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: async ({ listId, tmdbId }: { listId: string; tmdbId: number }) => {
      const { data: last } = await supabase
        .from('list_items')
        .select('position')
        .eq('list_id', listId)
        .order('position', { ascending: false })
        .limit(1);
      const position = (last?.[0]?.position ?? 0) + 1;
      unwrap(
        await supabase
          .from('list_items')
          .upsert({ list_id: listId, tmdb_id: tmdbId, position }, { onConflict: 'list_id,tmdb_id', ignoreDuplicates: true }),
      );
      unwrap(await supabase.from('lists').update({ updated_at: new Date().toISOString() }).eq('id', listId));
    },
    onSuccess: invalidate,
  });
}

export function useRemoveFromList() {
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: async ({ listId, tmdbId }: { listId: string; tmdbId: number }) =>
      unwrap(await supabase.from('list_items').delete().eq('list_id', listId).eq('tmdb_id', tmdbId)),
    onSuccess: invalidate,
  });
}
