import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

import { supabase, unwrap } from '@/lib/supabase';
import { useUserId } from '@/store/auth';

export type LikeTarget = 'review' | 'list' | 'film';

export interface LikeState {
  count: number;
  likedByMe: boolean;
}

export function useLikeState(type: LikeTarget, id: string | number | undefined) {
  const me = useUserId();
  return useQuery({
    queryKey: ['likes', type, String(id)],
    enabled: id !== undefined && !!me,
    queryFn: async (): Promise<LikeState> => {
      const target = String(id);
      const [{ count }, mine] = await Promise.all([
        supabase.from('likes').select('*', { count: 'exact', head: true }).eq('target_type', type).eq('target_id', target),
        supabase.from('likes').select('user_id').eq('target_type', type).eq('target_id', target).eq('user_id', me as string),
      ]);
      return { count: count ?? 0, likedByMe: (unwrap(mine) ?? []).length > 0 };
    },
  });
}

/** Optimistic like toggle with haptic feedback. */
export function useToggleLike(type: LikeTarget, id: string | number | undefined) {
  const me = useUserId();
  const qc = useQueryClient();
  const key = ['likes', type, String(id)];
  return useMutation({
    mutationFn: async (like: boolean) => {
      if (!me) throw new Error('Not signed in');
      const target = String(id);
      if (like) {
        unwrap(
          await supabase
            .from('likes')
            .upsert({ user_id: me, target_type: type, target_id: target }, { ignoreDuplicates: true }),
        );
      } else {
        unwrap(await supabase.from('likes').delete().eq('user_id', me).eq('target_type', type).eq('target_id', target));
      }
    },
    onMutate: async (like) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<LikeState>(key);
      qc.setQueryData<LikeState>(key, (old) => ({
        count: Math.max(0, (old?.count ?? 0) + (like ? 1 : -1)),
        likedByMe: like,
      }));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}
