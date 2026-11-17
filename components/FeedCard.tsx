import { router } from 'expo-router';
import { Heart, List as ListIcon, MessageCircle, Repeat, UserPlus } from 'lucide-react-native';
import { useRecyclingState } from '@shopify/flash-list';
import { Pressable, View } from 'react-native';

import { timeAgo } from '@/features/diary/grouping';
import { useToggleLike } from '@/hooks/useLikes';
import type { FeedItem } from '@/lib/types';
import { useTheme } from '@/theme';
import { Poster } from './PosterCard';
import { RatingStars } from './RatingStars';
import { Avatar } from './ui/Avatar';
import { Text } from './ui/Text';

/** One activity in the home feed: a log/review, a new list, or a follow. */
export function FeedCard({ item }: { item: FeedItem }) {
  const { colors } = useTheme();
  // FlashList recycles rows: state must reset when the row shows a different item.
  const [liked, setLiked] = useRecyclingState(item.liked_by_me, [item.id]);
  const [likeCount, setLikeCount] = useRecyclingState(item.like_count, [item.id]);
  const [revealed, setRevealed] = useRecyclingState(false, [item.id]);
  const toggle = useToggleLike(item.type === 'list' ? 'list' : 'review', item.ref_id);

  const like = () => {
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    toggle.mutate(next, {
      onError: () => {
        setLiked(!next);
        setLikeCount((c) => c + (next ? -1 : 1));
      },
    });
  };

  const header = (verb: string) => (
    <View className="flex-row items-center gap-2">
      <Pressable accessibilityRole="button" accessibilityLabel={item.actor_username} onPress={() => router.push(`/user/${item.actor_username}`)}>
        <Avatar uri={item.actor_avatar_url} name={item.actor_username} size={28} />
      </Pressable>
      <Text className="flex-1 text-sm" numberOfLines={2}>
        <Text className="text-sm font-semibold">{item.actor_username}</Text> {verb}
      </Text>
      <Text variant="caption" className="text-xs">
        {timeAgo(item.created_at)}
      </Text>
    </View>
  );

  if (item.type === 'follow') {
    return (
      <View className="border-b border-line px-4 py-3 dark:border-line-dark">
        <View className="flex-row items-center gap-2">
          <UserPlus size={16} color={colors.muted} />
          <Text className="flex-1 text-sm">
            <Text className="text-sm font-semibold" onPress={() => router.push(`/user/${item.actor_username}`)}>
              {item.actor_username}
            </Text>{' '}
            followed{' '}
            <Text className="text-sm font-semibold" onPress={() => item.target_username && router.push(`/user/${item.target_username}`)}>
              {item.target_username}
            </Text>
          </Text>
          <Text variant="caption" className="text-xs">
            {timeAgo(item.created_at)}
          </Text>
        </View>
      </View>
    );
  }

  if (item.type === 'list') {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(`/list/${item.list_id}`)}
        className="gap-2 border-b border-line px-4 py-4 active:opacity-80 dark:border-line-dark"
      >
        {header('made a new list')}
        <View className="flex-row items-center gap-3 rounded-xl bg-surface p-3 dark:bg-surface-dark">
          <ListIcon size={22} color={colors.accent} />
          <Text className="flex-1 font-semibold">{item.list_title}</Text>
        </View>
        <Actions liked={liked} likeCount={likeCount} commentCount={item.comment_count} onLike={like} />
      </Pressable>
    );
  }

  const verb = `${item.is_rewatch ? 'rewatched' : 'watched'}${item.review ? ' and reviewed' : ''}`;
  const hidden = !!item.spoiler && !revealed;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.actor_username} ${verb} ${item.film_title ?? ''}`}
      onPress={() => router.push(`/diary/${item.ref_id}`)}
      className="gap-2 border-b border-line px-4 py-4 active:opacity-80 dark:border-line-dark"
    >
      {header(verb)}
      <View className="flex-row gap-3">
        <Pressable accessibilityRole="button" accessibilityLabel={item.film_title ?? 'Film'} onPress={() => item.tmdb_id && router.push(`/film/${item.tmdb_id}`)}>
          <Poster posterPath={item.poster_path} title={item.film_title ?? '…'} width={64} size="w154" rounded={6} />
        </Pressable>
        <View className="flex-1 gap-1">
          <Text className="font-semibold" numberOfLines={1}>
            {item.film_title ?? 'A film'} {item.film_year ? <Text variant="caption">{item.film_year}</Text> : null}
          </Text>
          <View className="flex-row items-center gap-2">
            {item.rating != null ? <RatingStars value={Number(item.rating)} size={13} /> : null}
            {item.liked ? <Heart size={13} color={colors.danger} fill={colors.danger} /> : null}
            {item.is_rewatch ? <Repeat size={13} color={colors.muted} /> : null}
          </View>
          {item.review ? (
            hidden ? (
              <Pressable accessibilityRole="button" onPress={() => setRevealed(true)} className="mt-1 rounded-lg bg-surface2 px-3 py-2 dark:bg-surface2-dark">
                <Text variant="caption" className="text-xs">
                  ⚠︎ Spoilers — tap to reveal
                </Text>
              </Pressable>
            ) : (
              <Text className="text-sm leading-5" numberOfLines={4}>
                {item.review}
              </Text>
            )
          ) : null}
        </View>
      </View>
      <Actions liked={liked} likeCount={likeCount} commentCount={item.comment_count} onLike={like} />
    </Pressable>
  );
}

function Actions({ liked, likeCount, commentCount, onLike }: { liked: boolean; likeCount: number; commentCount: number; onLike: () => void }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row gap-6 pl-9">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={liked ? 'Unlike' : 'Like'}
        onPress={onLike}
        hitSlop={10}
        className="min-h-[32px] flex-row items-center gap-1"
      >
        <Heart size={16} color={liked ? colors.danger : colors.muted} fill={liked ? colors.danger : 'transparent'} />
        <Text variant="caption" className="text-xs">
          {likeCount}
        </Text>
      </Pressable>
      <View className="min-h-[32px] flex-row items-center gap-1">
        <MessageCircle size={16} color={colors.muted} />
        <Text variant="caption" className="text-xs">
          {commentCount}
        </Text>
      </View>
    </View>
  );
}
