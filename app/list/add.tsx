import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Check, Plus } from 'lucide-react-native';
import { Pressable, ScrollView } from 'react-native';

import { SkeletonRows } from '@/components/ui/Skeleton';
import { ErrorState, errorMessage } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { useAddToList, useRemoveFromList, useUserLists } from '@/hooks/useLists';
import { useUserId } from '@/store/auth';
import { useTheme } from '@/theme';

/** "Add to list" sheet opened from a film page. */
export default function AddToList() {
  const { tmdbId } = useLocalSearchParams<{ tmdbId: string }>();
  const id = Number(tmdbId);
  const me = useUserId();
  const lists = useUserLists(me);
  const add = useAddToList();
  const remove = useRemoveFromList();
  const { colors } = useTheme();

  return (
    <ScrollView className="flex-1 bg-bg dark:bg-bg-dark" contentContainerClassName="pb-12">
      <Stack.Screen options={{ presentation: 'modal', title: 'Add to list' }} />
      <Pressable
        accessibilityRole="button"
        onPress={() => router.replace({ pathname: '/list/new', params: { tmdbId: id } })}
        className="min-h-[56px] flex-row items-center gap-3 border-b border-line px-4 dark:border-line-dark"
      >
        <Plus size={20} color={colors.accent} />
        <Text className="font-semibold text-accent">New list with this film</Text>
      </Pressable>
      {lists.isLoading ? (
        <SkeletonRows count={4} />
      ) : lists.isError ? (
        <ErrorState error={lists.error} onRetry={() => lists.refetch()} />
      ) : (
        (lists.data ?? []).map((l) => {
          const inList = l.items.some((i) => i.tmdb_id === id);
          return (
            <Pressable
              key={l.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: inList }}
              accessibilityLabel={l.title}
              onPress={() =>
                (inList ? remove : add).mutate(
                  { listId: l.id, tmdbId: id },
                  {
                    onSuccess: () => toast(inList ? `Removed from ${l.title}` : `Added to ${l.title}`, 'success'),
                    onError: (e) => toast(errorMessage(e), 'error'),
                  },
                )
              }
              className="min-h-[56px] flex-row items-center gap-3 border-b border-line px-4 dark:border-line-dark"
            >
              <Text className="flex-1">{l.title}</Text>
              <Text variant="caption">{l.items.length}</Text>
              {inList ? <Check size={20} color={colors.accent} /> : null}
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}
