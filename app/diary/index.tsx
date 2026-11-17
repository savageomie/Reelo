import { FlashList } from '@shopify/flash-list';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { BookOpen, CloudUpload, Heart, MessageSquareText, Repeat } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Poster } from '@/components/PosterCard';
import { RatingStars } from '@/components/RatingStars';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { dayOfMonth, flattenSections, groupByMonth, shortWeekday } from '@/features/diary/grouping';
import { useUserDiary } from '@/hooks/useDiary';
import { useFilms } from '@/hooks/useFilms';
import { useProfileById } from '@/hooks/useProfile';
import type { DiaryEntry } from '@/lib/types';
import { useUserId } from '@/store/auth';
import { useTheme } from '@/theme';

/** Diary view grouped by month (FlashList with sticky-style month headers). */
export default function DiaryScreen() {
  const params = useLocalSearchParams<{ userId?: string }>();
  const me = useUserId();
  const userId = params.userId ?? me;
  const isMe = userId === me;
  const owner = useProfileById(isMe ? null : userId);
  const diary = useUserDiary(userId);
  const films = useFilms((diary.data ?? []).map((e) => e.tmdb_id));
  const { colors } = useTheme();

  const rows = flattenSections(
    groupByMonth((diary.data ?? []).map((e) => ({ ...e, watchedOn: e.watched_on }))),
    (e) => e.id,
  );

  const title = isMe ? 'My diary' : owner.data ? `@${owner.data.username}’s diary` : 'Diary';

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <Stack.Screen options={{ title }} />
      {diary.isLoading ? (
        <SkeletonRows count={8} />
      ) : diary.isError ? (
        <ErrorState error={diary.error} onRetry={() => diary.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={isMe ? 'Your diary is empty' : 'Nothing logged yet'}
          message={isMe ? 'Log the films you watch and they’ll show up here, grouped by month.' : 'Their diary may be private.'}
          actionLabel={isMe ? 'Log a film' : undefined}
          onAction={isMe ? () => router.push('/log') : undefined}
        />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(r) => r.key}
          getItemType={(r) => r.type}
          onRefresh={() => diary.refetch()}
          refreshing={diary.isRefetching}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item: row }) => {
            if (row.type === 'header') {
              return (
                <View className="flex-row items-baseline justify-between bg-bg px-4 pb-2 pt-5 dark:bg-bg-dark">
                  <Text variant="heading">{row.title}</Text>
                  <Text variant="caption">{row.count} films</Text>
                </View>
              );
            }
            const e = row.item as DiaryEntry & { pending?: boolean };
            const f = films.data?.[e.tmdb_id];
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${f?.title ?? 'Film'} watched ${e.watched_on}`}
                onPress={() => router.push(`/diary/${e.id}`)}
                className="min-h-[72px] flex-row items-center gap-3 px-4 py-2 active:opacity-70"
              >
                <View className="w-10 items-center">
                  <Text className="text-xl font-bold">{dayOfMonth(e.watched_on)}</Text>
                  <Text variant="caption" className="text-[10px] uppercase">
                    {shortWeekday(e.watched_on)}
                  </Text>
                </View>
                <Poster posterPath={f?.poster_path} title={f?.title ?? '…'} width={40} size="w92" rounded={4} />
                <View className="flex-1 gap-1">
                  <Text className="font-semibold" numberOfLines={1}>
                    {f?.title ?? '…'} {f?.year ? <Text variant="caption">{f.year}</Text> : null}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    {e.rating != null ? <RatingStars value={e.rating} size={12} /> : null}
                    {e.liked ? <Heart size={12} color={colors.danger} fill={colors.danger} /> : null}
                    {e.is_rewatch ? <Repeat size={12} color={colors.muted} /> : null}
                    {e.review ? <MessageSquareText size={12} color={colors.muted} /> : null}
                    {e.pending ? <CloudUpload size={12} color={colors.accent} accessibilityLabel="Waiting to sync" /> : null}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
