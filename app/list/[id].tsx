import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Heart, Lock, Pencil, Share2 } from 'lucide-react-native';
import { useRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

import { CommentThread } from '@/components/CommentThread';
import { PosterCard } from '@/components/PosterCard';
import { Avatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/IconButton';
import { SkeletonGrid } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { useFilms } from '@/hooks/useFilms';
import { useLikeState, useToggleLike } from '@/hooks/useLikes';
import { useList } from '@/hooks/useLists';
import { useUserId } from '@/store/auth';
import { useTheme } from '@/theme';

export default function ListDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const list = useList(id);
  const films = useFilms((list.data?.items ?? []).map((i) => i.tmdb_id));
  const me = useUserId();
  const likes = useLikeState('list', id);
  const toggleLike = useToggleLike('list', id);
  const { colors } = useTheme();
  const shotRef = useRef<React.ComponentRef<typeof View>>(null);

  const share = async () => {
    const l = list.data;
    if (!l) return;
    try {
      // Share as an image when possible (P2), else as text with a deep link.
      if (shotRef.current && (await Sharing.isAvailableAsync())) {
        const uri = await captureRef(shotRef.current as never, { format: 'png', quality: 0.9 });
        await Sharing.shareAsync(uri, { dialogTitle: l.title });
        return;
      }
    } catch {
      // fall through to text share
    }
    const titles = l.items.map((it, i) => `${l.is_ranked ? `${i + 1}. ` : '• '}${films.data?.[it.tmdb_id]?.title ?? it.tmdb_id}`);
    await Share.share({ message: `${l.title} — a list by @${l.owner.username} on Reelo\n\n${titles.join('\n')}\n\nreelo://list/${l.id}` }).catch(() =>
      toast('Could not share', 'error'),
    );
  };

  if (list.isLoading) return <SkeletonGrid />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  if (!list.data) return <EmptyState icon={Lock} title="List not found" message="It may be private or deleted." />;

  const l = list.data;
  const isMine = l.owner_id === me;

  return (
    <KeyboardAvoidingView className="flex-1 bg-bg dark:bg-bg-dark" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <View className="flex-row">
              <IconButton icon={Share2} label="Share list" onPress={share} />
              {isMine ? <IconButton icon={Pencil} label="Edit list" onPress={() => router.push(`/list/edit/${l.id}`)} /> : null}
            </View>
          ),
        }}
      />
      <ScrollView contentContainerClassName="pb-16" keyboardShouldPersistTaps="handled">
        <View ref={shotRef} collapsable={false} className="bg-bg px-4 pb-4 dark:bg-bg-dark">
          <View className="flex-row items-center gap-2">
            {!l.is_public ? <Lock size={14} color={colors.muted} /> : null}
            <Text variant="title" className="flex-1">
              {l.title}
            </Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => router.push(`/user/${l.owner.username}`)} className="mt-2 flex-row items-center gap-2">
            <Avatar uri={l.owner.avatar_url} name={l.owner.username} size={22} />
            <Text variant="caption">
              @{l.owner.username} · {l.items.length} films{l.is_ranked ? ' · ranked' : ''}
            </Text>
          </Pressable>
          {l.description ? <Text className="mt-3 leading-6">{l.description}</Text> : null}
          {l.items.length === 0 ? (
            <EmptyState title="This list is empty" message={isMine ? 'Add films from any film page, or edit the list.' : undefined} />
          ) : (
            <View className="mt-4 flex-row flex-wrap justify-between gap-y-3">
              {l.items.map((it, i) => {
                const f = films.data?.[it.tmdb_id];
                return (
                  <View key={it.tmdb_id} style={{ width: '31%' }}>
                    <PosterCard
                      tmdbId={it.tmdb_id}
                      title={f?.title ?? '…'}
                      posterPath={f?.poster_path}
                      width={104}
                      badge={
                        l.is_ranked ? (
                          <View className="h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1">
                            <Text className="text-xs font-bold text-[#0E0F13]">{i + 1}</Text>
                          </View>
                        ) : undefined
                      }
                    />
                    {it.note ? (
                      <Text variant="caption" className="mt-1 text-xs" numberOfLines={2}>
                        {it.note}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
          <Text variant="caption" className="mt-3 text-[10px]">
            reelo · film data TMDB
          </Text>
        </View>

        <View className="px-4">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={likes.data?.likedByMe ? 'Unlike list' : 'Like list'}
            onPress={() => toggleLike.mutate(!likes.data?.likedByMe)}
            className="mb-4 min-h-[44px] flex-row items-center gap-2 self-start"
          >
            <Heart size={22} color={likes.data?.likedByMe ? colors.danger : colors.muted} fill={likes.data?.likedByMe ? colors.danger : 'transparent'} />
            <Text>
              {likes.data?.count ?? 0} like{likes.data?.count === 1 ? '' : 's'}
            </Text>
          </Pressable>
          <CommentThread type="list" id={l.id} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
