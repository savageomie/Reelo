import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { Bell, Heart, MessageCircle, Popcorn, Trophy, UserCheck, UserPlus, Users, type LucideIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState, errorMessage } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { timeAgo } from '@/features/diary/grouping';
import { useMarkNotificationsRead, useNotifications, useRespondToFollow } from '@/hooks/useSocial';
import type { AppNotification } from '@/lib/types';
import { useTheme } from '@/theme';

const META: Record<AppNotification['type'], { icon: LucideIcon; text: (n: AppNotification) => string }> = {
  follow: { icon: UserPlus, text: () => 'started following you' },
  follow_request: { icon: UserPlus, text: () => 'requested to follow you' },
  follow_accepted: { icon: UserCheck, text: () => 'accepted your follow request' },
  like_review: { icon: Heart, text: () => 'liked your review' },
  like_list: { icon: Heart, text: () => 'liked your list' },
  comment_review: { icon: MessageCircle, text: (n) => `commented: “${n.payload.excerpt ?? ''}”` },
  comment_list: { icon: MessageCircle, text: (n) => `commented on your list: “${n.payload.excerpt ?? ''}”` },
  group_voting: { icon: Popcorn, text: (n) => `opened voting in ${n.payload.group_name ?? 'your group'}` },
  group_closed: { icon: Trophy, text: (n) => `closed voting in ${n.payload.group_name ?? 'your group'} — see the winner` },
  group_joined: { icon: Users, text: (n) => `joined ${n.payload.group_name ?? 'your group'}` },
};

function open(n: AppNotification) {
  const p = n.payload;
  switch (n.type) {
    case 'like_review':
    case 'comment_review':
      if (p.target_id) router.push(`/diary/${p.target_id}`);
      break;
    case 'like_list':
    case 'comment_list':
      if (p.target_id) router.push(`/list/${p.target_id}`);
      break;
    case 'group_voting':
    case 'group_joined':
      if (p.group_id) router.push(`/group/${p.group_id}`);
      break;
    case 'group_closed':
      if (p.group_id) router.push(`/group/${p.group_id}/result`);
      break;
    default:
      if (n.actor?.username) router.push(`/user/${n.actor.username}`);
  }
}

export default function Notifications() {
  const notes = useNotifications();
  const markRead = useMarkNotificationsRead();
  const respond = useRespondToFollow();
  const { colors } = useTheme();
  const hasUnread = (notes.data ?? []).some((n) => !n.read_at);

  useEffect(() => {
    if (hasUnread) {
      const t = setTimeout(() => markRead.mutate(), 1500);
      return () => clearTimeout(t);
    }
  }, [hasUnread, markRead]);

  if (notes.isLoading) return <SkeletonRows />;
  if (notes.isError) return <ErrorState error={notes.error} onRetry={() => notes.refetch()} />;
  if ((notes.data ?? []).length === 0)
    return <EmptyState icon={Bell} title="No notifications yet" message="Likes, comments, follows and group votes show up here." />;

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <FlashList
        data={notes.data}
        keyExtractor={(n) => n.id}
        onRefresh={() => notes.refetch()}
        refreshing={notes.isRefetching}
        renderItem={({ item: n }) => {
          const meta = META[n.type];
          const Icon = meta.icon;
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => open(n)}
              className={`min-h-[64px] flex-row items-center gap-3 border-b border-line px-4 py-3 dark:border-line-dark ${
                n.read_at ? '' : 'bg-surface dark:bg-surface-dark'
              }`}
            >
              <View>
                <Avatar uri={n.actor?.avatar_url} name={n.actor?.username ?? '?'} size={40} />
                <View className="absolute -bottom-1 -right-1 h-5 w-5 items-center justify-center rounded-full bg-bg dark:bg-bg-dark">
                  <Icon size={12} color={colors.accent} />
                </View>
              </View>
              <View className="flex-1 gap-1">
                <Text className="text-sm" numberOfLines={3}>
                  <Text className="text-sm font-semibold">{n.actor?.username ?? 'Someone'}</Text> {meta.text(n)}
                </Text>
                <Text variant="caption" className="text-xs">
                  {timeAgo(n.created_at)}
                </Text>
                {n.type === 'follow_request' && n.actor_id ? (
                  <View className="mt-1 flex-row gap-2">
                    <Button
                      title="Accept"
                      className="min-h-[36px] px-4 py-1"
                      onPress={() =>
                        respond.mutate(
                          { followerId: n.actor_id as string, accept: true },
                          { onSuccess: () => toast('Request accepted', 'success'), onError: (e) => toast(errorMessage(e), 'error') },
                        )
                      }
                    />
                    <Button
                      title="Decline"
                      variant="secondary"
                      className="min-h-[36px] px-4 py-1"
                      onPress={() => respond.mutate({ followerId: n.actor_id as string, accept: false })}
                    />
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
