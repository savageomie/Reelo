import { router, useLocalSearchParams } from 'expo-router';

import { ListEditor } from '@/components/ListEditor';
import { errorMessage } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { useCreateList } from '@/hooks/useLists';

export default function NewList() {
  const { tmdbId } = useLocalSearchParams<{ tmdbId?: string }>();
  const create = useCreateList();
  return (
    <ListEditor
      initial={{ tmdbIds: tmdbId ? [Number(tmdbId)] : [] }}
      saving={create.isPending}
      onSave={(v) =>
        create.mutate(
          { input: { title: v.title, description: v.description || null, is_public: v.is_public, is_ranked: v.is_ranked }, tmdbIds: v.tmdbIds },
          {
            onSuccess: (l) => {
              toast('List created', 'success');
              router.replace(`/list/${l.id}`);
            },
            onError: (e) => toast(errorMessage(e), 'error'),
          },
        )
      }
    />
  );
}
