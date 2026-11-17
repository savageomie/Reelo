import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { Bell, Users } from 'lucide-react-native';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { FeedCard } from '@/components/FeedCard';
import { HomeRails } from '@/components/HomeRails';
import { Avatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { useFeed, useUnreadCount } from '@/hooks/useSocial';
import { useSimilarUsers } from '@/hooks/useTaste';
import { palette } from '@/theme';

function SimilarPeople() {
  const similar = useSimilarUsers(12);
  if (!similar.data?.length) return null;
  return (
    <View className="mt-6">
      <Text variant="heading" className="mb-3 px-4">
        People with similar taste
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-4 px-4">
        {similar.data.map((u) => (
          <Pressable
            key={u.user_id}
            accessibilityRole="button"
            accessibilityLabel={`${u.username}, ${u.score}% taste match`}
            onPress={() => router.push(`/user/${u.username}`)}
            className="w-20 items-center gap-1"
          >
            <Avatar uri={u.avatar_url} name={u.username} size={56} />
            <Text className="text-xs font-semibold" numberOfLines={1}>
              {u.username}
            </Text>
            <Text className="text-xs font-bold text-accent">{u.score}%</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export default function Home() {
  const feed = useFeed();
  const unread = useUnreadCount();
  const items = feed.items ?? [];

  const header = (
    <View>
      <View className="flex-row items-center justify-between px-4 pt-2">
        <Text variant="display" className="text-accent">
          Reelo
        </Text>
        <View>
          <IconButton icon={Bell} label={`Notifications${unread ? `, ${unread} unread` : ''}`} onPress={() => router.push('/notifications')} />
          {unread ? <View className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-accent" /> : null}
        </View>
      </View>
      <HomeRails />
      <SimilarPeople />
      <Text variant="heading" className="mb-1 mt-8 px-4">
        Friends’ activity
      </Text>
    </View>
  );

  return (
    <Screen>
      <FlashList
        data={items}
        keyExtractor={(i) => i.id}
        ListHeaderComponent={header}
        onRefresh={() => feed.refetch()}
        refreshing={feed.isRefetching && !feed.isFetchingNextPage}
        onEndReachedThreshold={0.5}
        onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
        renderItem={({ item }) => <FeedCard item={item} />}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={
          feed.isLoading ? (
            <SkeletonRows count={4} />
          ) : feed.isError ? (
            <ErrorState error={feed.error} onRetry={() => feed.refetch()} />
          ) : (
            <EmptyState
              icon={Users}
              title="Your feed is quiet"
              message="Follow friends or people with similar taste to see what they’re watching."
              actionLabel="Find people"
              onAction={() => router.push({ pathname: '/search', params: { q: '' } })}
            />
          )
        }
        ListFooterComponent={feed.isFetchingNextPage ? <ActivityIndicator color={palette.accent} className="my-6" /> : null}
      />
    </Screen>
  );
}
