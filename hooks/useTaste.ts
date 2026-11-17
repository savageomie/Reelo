import { useQuery } from '@tanstack/react-query';

import { supabase, unwrap } from '@/lib/supabase';
import { useUserId } from '@/store/auth';

export interface TasteMatchRow {
  score: number | null;
  similarity: number | null;
  overlap: number;
}

/** Live taste match between me and another user (SQL mirror of features/recs/tasteMatch.ts). */
export function useTasteMatch(otherId: string | null | undefined) {
  const me = useUserId();
  return useQuery({
    queryKey: ['taste', me, otherId],
    enabled: !!me && !!otherId && me !== otherId,
    queryFn: async () => {
      const rows = unwrap(await supabase.rpc('compute_taste_match', { p_user_a: me, p_user_b: otherId })) as TasteMatchRow[];
      return rows?.[0] ?? { score: null, similarity: null, overlap: 0 };
    },
  });
}

export interface SimilarUser {
  user_id: string;
  username: string;
  avatar_url: string | null;
  display_name: string | null;
  score: number;
  overlap: number;
}

/** "People with similar taste" from the nightly-precomputed taste_similarity table. */
export function useSimilarUsers(limit = 10) {
  const me = useUserId();
  return useQuery({
    queryKey: ['similarUsers', me, limit],
    enabled: !!me,
    queryFn: async () => unwrap(await supabase.rpc('get_similar_users', { p_limit: limit, p_min_overlap: 3 })) as SimilarUser[],
  });
}
