import { router } from 'expo-router';
import { Heart, MessageCircle, Repeat } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { formatDate } from '@/features/diary/grouping';
import { useTheme } from '@/theme';
import { Poster } from './PosterCard';
import { RatingStars } from './RatingStars';
import { Avatar } from './ui/Avatar';
import { Text } from './ui/Text';

export interface ReviewCardProps {
  entryId: string;
  username: string;
  avatarUrl?: string | null;
  rating: number | null;
  review: string | null;
  spoiler?: boolean;
  liked?: boolean;
  isRewatch?: boolean;
  watchedOn?: string | null;
  film?: { tmdbId: number; title: string; year?: number | null; posterPath: string | null } | null;
  likeCount?: number;
  commentCount?: number;
  onPress?: () => void;
  /** Show only the first N lines of the review. */
  clamp?: number;
}

/** Review with spoiler protection: spoiler text stays hidden until tapped (blueprint 11). */
export function ReviewCard({
  entryId,
  username,
  avatarUrl,
  rating,
  review,
  spoiler,
  liked,
  isRewatch,
  watchedOn,
  film,
  likeCount,
  commentCount,
  onPress,
  clamp = 6,
}: ReviewCardProps) {
  const { colors } = useTheme();
  const [revealed, setRevealed] = useState(false);
  const hidden = !!spoiler && !revealed;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Review by ${username}${film ? ` of ${film.title}` : ''}`}
      onPress={onPress ?? (() => router.push(`/diary/${entryId}`))}
      className="flex-row gap-3 border-b border-line px-4 py-4 active:opacity-80 dark:border-line-dark"
    >
      {film ? (
        <Pressable accessibilityRole="button" accessibilityLabel={film.title} onPress={() => router.push(`/film/${film.tmdbId}`)}>
          <Poster posterPath={film.posterPath} title={film.title} width={56} size="w154" rounded={6} />
        </Pressable>
      ) : null}
      <View className="flex-1 gap-1.5">
        <View className="flex-row items-center gap-2">
          <Avatar uri={avatarUrl} name={username} size={22} />
          <Text className="text-sm font-semibold" testID="review-username">
            {username}
          </Text>
          {watchedOn ? (
            <Text variant="caption" className="text-xs">
              · {formatDate(watchedOn)}
            </Text>
          ) : null}
        </View>
        {film ? (
          <Text className="font-semibold" numberOfLines={1}>
            {film.title} {film.year ? <Text variant="caption">{film.year}</Text> : null}
          </Text>
        ) : null}
        <View className="flex-row items-center gap-2">
          {rating != null ? <RatingStars value={rating} size={14} /> : null}
          {liked ? <Heart size={14} color={colors.danger} fill={colors.danger} accessibilityLabel="Liked" /> : null}
          {isRewatch ? <Repeat size={14} color={colors.muted} accessibilityLabel="Rewatch" /> : null}
        </View>
        {review ? (
          hidden ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Contains spoilers. Tap to reveal."
              onPress={() => setRevealed(true)}
              className="mt-1 rounded-lg bg-surface2 px-3 py-3 dark:bg-surface2-dark"
              testID="spoiler-cover"
            >
              <Text variant="caption">⚠︎ This review contains spoilers. Tap to reveal.</Text>
            </Pressable>
          ) : (
            <Text className="leading-6" numberOfLines={clamp} testID="review-text">
              {review}
            </Text>
          )
        ) : null}
        {likeCount !== undefined || commentCount !== undefined ? (
          <View className="mt-1 flex-row gap-4">
            <View className="flex-row items-center gap-1">
              <Heart size={14} color={colors.muted} />
              <Text variant="caption" className="text-xs">
                {likeCount ?? 0}
              </Text>
            </View>
            <View className="flex-row items-center gap-1">
              <MessageCircle size={14} color={colors.muted} />
              <Text variant="caption" className="text-xs">
                {commentCount ?? 0}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
