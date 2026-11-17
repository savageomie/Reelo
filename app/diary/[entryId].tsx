import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Heart, Pencil, Repeat } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';

import { CommentThread } from '@/components/CommentThread';
import { Poster } from '@/components/PosterCard';
import { RatingStars } from '@/components/RatingStars';
import { Avatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { formatDate } from '@/features/diary/grouping';
import { useDiaryEntry } from '@/hooks/useDiary';
import { useFilm } from '@/hooks/useFilms';
import { useLikeState, useToggleLike } from '@/hooks/useLikes';
import { useUserId } from '@/store/auth';
import { useTheme } from '@/theme';

/** Diary entry / review page with likes and comments. */
export default function DiaryEntryScreen() {
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  const entry = useDiaryEntry(entryId);
  const film = useFilm(entry.data?.tmdb_id);
  const me = useUserId();
  const { colors } = useTheme();
  const likes = useLikeState('review', entryId);
  const toggleLike = useToggleLike('review', entryId);
  const [revealed, setRevealed] = useState(false);

  if (entry.isLoading) {
    return (
      <View className="flex-1 gap-3 bg-bg p-4 dark:bg-bg-dark">
        <Skeleton height={120} />
        <Skeleton height={200} />
      </View>
    );
  }
  if (entry.isError) return <ErrorState error={entry.error} onRetry={() => entry.refetch()} />;
  if (!entry.data) return <EmptyState title="Entry not found" message="It may have been deleted, or the diary is private." />;

  const e = entry.data;
  const isMine = e.user_id === me;
  const f = film.data;
  const hidden = e.spoiler && !revealed && !isMine;

  return (
    <KeyboardAvoidingView className="flex-1 bg-bg dark:bg-bg-dark" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen
        options={{
          title: isMine ? 'My entry' : 'Review',
          headerRight: () =>
            isMine ? (
              <IconButton icon={Pencil} label="Edit entry" onPress={() => router.push({ pathname: '/log/[tmdbId]', params: { tmdbId: e.tmdb_id, entryId: e.id } })} />
            ) : null,
        }}
      />
      <ScrollView contentContainerClassName="gap-5 p-4 pb-16" keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" onPress={() => e.profile && router.push(`/user/${e.profile.username}`)} className="flex-row items-center gap-2">
          <Avatar uri={e.profile?.avatar_url} name={e.profile?.username ?? 'me'} size={32} />
          <Text className="font-semibold">{e.profile?.display_name || e.profile?.username || 'You'}</Text>
          {e.pending ? <Text variant="caption">· waiting to sync</Text> : null}
        </Pressable>

        <Pressable accessibilityRole="button" onPress={() => router.push(`/film/${e.tmdb_id}`)} className="flex-row gap-4">
          <Poster posterPath={f?.poster_path} title={f?.title ?? '…'} width={90} size="w185" />
          <View className="flex-1 gap-1">
            {film.isLoading ? <Skeleton width="80%" height={22} /> : <Text variant="title">{f?.title ?? 'Unknown film'}</Text>}
            <Text variant="caption">{f?.year ?? ''}</Text>
            <View className="mt-1 flex-row items-center gap-2">
              {e.rating != null ? <RatingStars value={e.rating} size={18} /> : null}
              {e.liked ? <Heart size={16} color={colors.danger} fill={colors.danger} accessibilityLabel="Liked" /> : null}
              {e.is_rewatch ? <Repeat size={16} color={colors.muted} accessibilityLabel="Rewatch" /> : null}
            </View>
            <Text variant="caption">
              {e.is_rewatch ? 'Rewatched' : 'Watched'} {formatDate(e.watched_on)}
            </Text>
          </View>
        </Pressable>

        {e.review ? (
          hidden ? (
            <Pressable accessibilityRole="button" onPress={() => setRevealed(true)} className="rounded-xl bg-surface2 p-4 dark:bg-surface2-dark">
              <Text variant="caption">⚠︎ This review contains spoilers. Tap to reveal.</Text>
            </Pressable>
          ) : (
            <Text className="text-[17px] leading-7">{e.review}</Text>
          )
        ) : (
          <Text variant="caption">No review written.</Text>
        )}

        {e.tags?.length ? (
          <View className="flex-row flex-wrap gap-2">
            {e.tags.map((t) => (
              <View key={t} className="rounded-full bg-surface2 px-3 py-1 dark:bg-surface2-dark">
                <Text className="text-xs">#{t}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {!e.pending ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={likes.data?.likedByMe ? 'Unlike review' : 'Like review'}
              onPress={() => toggleLike.mutate(!likes.data?.likedByMe)}
              className="min-h-[44px] flex-row items-center gap-2 self-start"
            >
              <Heart size={22} color={likes.data?.likedByMe ? colors.danger : colors.muted} fill={likes.data?.likedByMe ? colors.danger : 'transparent'} />
              <Text>
                {likes.data?.count ?? 0} like{likes.data?.count === 1 ? '' : 's'}
              </Text>
            </Pressable>
            <CommentThread type="review" id={e.id} />
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
