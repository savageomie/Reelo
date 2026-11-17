import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { User } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { PosterCard } from '@/components/PosterCard';
import { Skeleton, SkeletonGrid } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { formatDate } from '@/features/diary/grouping';
import { usePerson } from '@/hooks/useFilms';
import { tmdbImage } from '@/lib/tmdb';
import { useTheme } from '@/theme';

export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const person = usePerson(Number(id));
  const { colors } = useTheme();
  const [bioOpen, setBioOpen] = useState(false);

  if (person.isLoading) {
    return (
      <View className="flex-1 bg-bg p-4 dark:bg-bg-dark">
        <View className="flex-row gap-4">
          <Skeleton width={96} height={96} rounded={48} />
          <View className="flex-1 gap-2 pt-4">
            <Skeleton width="70%" height={22} />
            <Skeleton width="40%" />
          </View>
        </View>
        <SkeletonGrid />
      </View>
    );
  }
  if (person.isError || !person.data) {
    return <ErrorState error={person.error ?? 'Person not found'} onRetry={() => person.refetch()} />;
  }
  const p = person.data;

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <Stack.Screen options={{ title: p.name }} />
      <FlashList
        data={p.credits}
        numColumns={3}
        keyExtractor={(c) => String(c.tmdb_id)}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40 }}
        ListHeaderComponent={
          <View className="gap-3 px-1 pb-4 pt-2">
            <View className="flex-row items-center gap-4">
              {p.profile_path ? (
                <Image source={{ uri: tmdbImage(p.profile_path, 'w185') ?? undefined }} style={{ width: 96, height: 96, borderRadius: 48 }} />
              ) : (
                <View className="h-24 w-24 items-center justify-center rounded-full bg-surface2 dark:bg-surface2-dark">
                  <User size={36} color={colors.muted} />
                </View>
              )}
              <View className="flex-1">
                <Text variant="title">{p.name}</Text>
                <Text variant="caption">
                  {[p.known_for_department, p.birthday ? `Born ${formatDate(p.birthday)}` : null].filter(Boolean).join(' · ')}
                </Text>
                {p.place_of_birth ? <Text variant="caption">{p.place_of_birth}</Text> : null}
              </View>
            </View>
            {p.biography ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Biography" onPress={() => setBioOpen((o) => !o)}>
                <Text className="leading-6" numberOfLines={bioOpen ? undefined : 4}>
                  {p.biography}
                </Text>
              </Pressable>
            ) : null}
            <Text variant="heading" className="mt-2">
              Filmography
            </Text>
          </View>
        }
        ListEmptyComponent={<EmptyState title="No films listed" />}
        renderItem={({ item }) => (
          <View className="items-center p-1.5">
            <PosterCard
              tmdbId={item.tmdb_id}
              title={item.title}
              posterPath={item.poster_path}
              width={104}
              showTitle
              subtitle={[item.year, item.role].filter(Boolean).join(' · ')}
            />
          </View>
        )}
      />
    </View>
  );
}
