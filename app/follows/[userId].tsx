import { FlashList } from '@shopify/flash-list';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Users } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Chip } from '@/components/ui/Chip';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { useProfileById } from '@/hooks/useProfile';
import { useFollowList } from '@/hooks/useSocial';

/** Followers and following lists. */
export default function Follows() {
  const params = useLocalSearchParams<{ userId: string; tab?: 'followers' | 'following' }>();
  const [tab, setTab] = useState<'followers' | 'following'>(params.tab ?? 'followers');
  const profile = useProfileById(params.userId);
  const list = useFollowList(params.userId, tab);

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <Stack.Screen options={{ title: profile.data ? `@${profile.data.username}` : '' }} />
      <View className="flex-row gap-2 px-4 py-2">
        <Chip label="Followers" selected={tab === 'followers'} onPress={() => setTab('followers')} />
        <Chip label="Following" selected={tab === 'following'} onPress={() => setTab('following')} />
      </View>
      {list.isLoading ? (
        <SkeletonRows />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (list.data ?? []).length === 0 ? (
        <EmptyState icon={Users} title={tab === 'followers' ? 'No followers yet' : 'Not following anyone yet'} />
      ) : (
        <FlashList
          data={list.data}
          keyExtractor={(r) => r.profile.id}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/user/${item.profile.username}`)}
              className="min-h-[60px] flex-row items-center gap-3 px-4 py-2 active:opacity-70"
            >
              <Avatar uri={item.profile.avatar_url} name={item.profile.username} size={44} />
              <View>
                <Text className="font-semibold">{item.profile.display_name || item.profile.username}</Text>
                <Text variant="caption">@{item.profile.username}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
