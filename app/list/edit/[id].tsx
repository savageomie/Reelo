import { router, useLocalSearchParams } from 'expo-router';
import { Alert } from 'react-native';

import { ListEditor } from '@/components/ListEditor';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState, errorMessage } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { useDeleteList, useList, useUpdateList } from '@/hooks/useLists';
import { supabase, unwrap } from '@/lib/supabase';

export default function EditList() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const list = useList(id);
  const update = useUpdateList(id);
  const del = useDeleteList();

  if (list.isLoading) return <SkeletonRows />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  if (!list.data) return <EmptyState title="List not found" />;
  const l = list.data;

  return (
    <ListEditor
      initial={{ ...l, description: l.description ?? '', tmdbIds: l.items.map((i) => i.tmdb_id) }}
      saving={update.isPending}
      onSave={async (v) => {
        try {
          const before = new Set(l.items.map((i) => i.tmdb_id));
          const after = new Set(v.tmdbIds);
          const removed = [...before].filter((x) => !after.has(x));
          const added = v.tmdbIds.filter((x) => !before.has(x));
          if (removed.length) unwrap(await supabase.from('list_items').delete().eq('list_id', id).in('tmdb_id', removed));
          if (added.length) unwrap(await supabase.from('list_items').insert(added.map((tmdb_id) => ({ list_id: id, tmdb_id, position: 0 }))));
          await update.mutateAsync({
            input: { title: v.title, description: v.description || null, is_public: v.is_public, is_ranked: v.is_ranked },
            order: v.tmdbIds,
          });
          toast('List saved', 'success');
          router.back();
        } catch (e) {
          toast(errorMessage(e), 'error');
        }
      }}
      onDelete={() =>
        Alert.alert('Delete list?', 'This cannot be undone.', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () =>
              del.mutate(id, {
                onSuccess: () => {
                  toast('List deleted');
                  router.dismissTo('/lists');
                },
              }),
          },
        ])
      }
    />
  );
}
