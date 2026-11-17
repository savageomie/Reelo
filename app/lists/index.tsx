import { FlashList } from '@shopify/flash-list';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { List as ListIcon, Lock, Plus } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Poster } from '@/components/PosterCard';
import { IconButton } from '@/components/ui/IconButton';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { useFilms } from '@/hooks/useFilms';
import { useUserLists } from '@/hooks/useLists';
import { useProfileById } from '@/hooks/useProfile';
import { useUserId } from '@/store/auth';

/** Lists overview: list tiles with a fanned stack of the first posters. */
export default function ListsOverview() {
  const params = useLocalSearchParams<{ userId?: string }>();
  const me = useUserId();
  const userId = params.userId ?? me;
  const isMe = userId === me;
  const owner = useProfileById(isMe ? null : userId);
  const lists = useUserLists(userId);
  const coverIds = (lists.data ?? []).flatMap((l) => [...l.items].sort((a, b) => a.position - b.position).slice(0, 4).map((i) => i.tmdb_id));
  const films = useFilms(coverIds);

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <Stack.Screen
        options={{
          title: isMe ? 'My lists' : owner.data ? `@${owner.data.username}’s lists` : 'Lists',
          headerRight: () => (isMe ? <IconButton icon={Plus} label="New list" onPress={() => router.push('/list/new')} /> : null),
        }}
      />
      {lists.isLoading ? (
        <SkeletonRows />
      ) : lists.isError ? (
        <ErrorState error={lists.error} onRetry={() => lists.refetch()} />
      ) : (lists.data ?? []).length === 0 ? (
        <EmptyState
          icon={ListIcon}
          title={isMe ? 'No lists yet' : 'No public lists'}
          message={isMe ? 'Make a list: favourites of the decade, comfort films, a horror marathon…' : undefined}
          actionLabel={isMe ? 'Create a list' : undefined}
          onAction={isMe ? () => router.push('/list/new') : undefined}
        />
      ) : (
        <FlashList
          data={lists.data}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item }) => {
            const covers = [...item.items].sort((a, b) => a.position - b.position).slice(0, 4);
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${item.items.length} films`}
                onPress={() => router.push(`/list/${item.id}`)}
                className="flex-row items-center gap-4 border-b border-line px-4 py-4 active:opacity-70 dark:border-line-dark"
              >
                <View className="w-[132px] flex-row">
                  {covers.length === 0 ? (
                    <View className="h-[72px] w-12 rounded-md bg-surface2 dark:bg-surface2-dark" />
                  ) : (
                    covers.map((c, i) => (
                      <View key={c.tmdb_id} style={{ marginLeft: i ? -22 : 0, zIndex: 4 - i }}>
                        <Poster posterPath={films.data?.[c.tmdb_id]?.poster_path} title="" width={48} size="w92" rounded={5} />
                      </View>
                    ))
                  )}
                </View>
                <View className="flex-1 gap-1">
                  <View className="flex-row items-center gap-1">
                    {!item.is_public ? <Lock size={12} color="#9AA0AC" accessibilityLabel="Private" /> : null}
                    <Text className="font-semibold" numberOfLines={2}>
                      {item.title}
                    </Text>
                  </View>
                  <Text variant="caption">
                    {item.items.length} film{item.items.length === 1 ? '' : 's'}
                    {item.is_ranked ? ' · ranked' : ''}
                  </Text>
                  {item.description ? (
                    <Text variant="caption" numberOfLines={2} className="text-xs">
                      {item.description}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
