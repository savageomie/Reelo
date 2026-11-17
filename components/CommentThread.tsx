import { router } from 'expo-router';
import { Send, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, Switch, TextInput, View } from 'react-native';

import { timeAgo } from '@/features/diary/grouping';
import { useAddComment, useComments, useDeleteComment } from '@/hooks/useSocial';
import { LIMITS, validateComment } from '@/lib/validation';
import { useUserId } from '@/store/auth';
import { useTheme } from '@/theme';
import { Avatar } from './ui/Avatar';
import { IconButton } from './ui/IconButton';
import { Skeleton } from './ui/Skeleton';
import { errorMessage } from './ui/States';
import { Text } from './ui/Text';
import { toast } from './ui/Toast';

function CommentBody({ body, spoiler }: { body: string; spoiler: boolean }) {
  const [shown, setShown] = useState(!spoiler);
  if (!shown)
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="Spoiler comment. Tap to reveal." onPress={() => setShown(true)}>
        <Text variant="caption" className="italic">
          Spoiler — tap to reveal
        </Text>
      </Pressable>
    );
  return <Text className="leading-6">{body}</Text>;
}

/** Comments with spoiler tags; owner can delete their own. */
export function CommentThread({ type, id }: { type: 'review' | 'list'; id: string }) {
  const me = useUserId();
  const { colors } = useTheme();
  const comments = useComments(type, id);
  const add = useAddComment(type, id);
  const del = useDeleteComment(type, id);
  const [body, setBody] = useState('');
  const [spoiler, setSpoiler] = useState(false);

  const submit = () => {
    const v = validateComment(body);
    if (!v.ok) return toast(v.error, 'error');
    add.mutate(
      { body, spoiler },
      {
        onSuccess: () => {
          setBody('');
          setSpoiler(false);
        },
        onError: (e) => toast(errorMessage(e).replace('rate_limited: ', ''), 'error'),
      },
    );
  };

  return (
    <View className="gap-3">
      <Text variant="heading">Comments {comments.data?.length ? `(${comments.data.length})` : ''}</Text>
      {comments.isLoading ? (
        <Skeleton height={48} />
      ) : comments.isError ? (
        <Text variant="caption">Couldn’t load comments.</Text>
      ) : (comments.data ?? []).length === 0 ? (
        <Text variant="caption">No comments yet. Start the conversation.</Text>
      ) : (
        comments.data!.map((c) => (
          <View key={c.id} className="flex-row gap-3">
            <Pressable accessibilityRole="button" accessibilityLabel={c.profile?.username} onPress={() => router.push(`/user/${c.profile?.username}`)}>
              <Avatar uri={c.profile?.avatar_url} name={c.profile?.username ?? '?'} size={32} />
            </Pressable>
            <View className="flex-1">
              <Text className="text-sm font-semibold">
                {c.profile?.username} <Text variant="caption" className="text-xs">· {timeAgo(c.created_at)}</Text>
              </Text>
              <CommentBody body={c.body} spoiler={c.spoiler} />
            </View>
            {c.user_id === me ? (
              <IconButton
                icon={Trash2}
                size={16}
                label="Delete comment"
                color={colors.muted}
                onPress={() =>
                  Alert.alert('Delete comment?', undefined, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => del.mutate(c.id) },
                  ])
                }
              />
            ) : null}
          </View>
        ))
      )}
      <View className="mt-2 gap-2 rounded-xl border border-line p-2 dark:border-line-dark">
        <View className="flex-row items-end gap-2">
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Add a comment…"
            placeholderTextColor={colors.muted}
            multiline
            maxLength={LIMITS.comment}
            accessibilityLabel="Comment"
            className="max-h-32 min-h-[44px] flex-1 px-2 py-2 font-sans text-base text-ink dark:text-ink-dark"
          />
          <IconButton icon={Send} label="Post comment" onPress={submit} disabled={!body.trim() || add.isPending} color={colors.accent} />
        </View>
        <View className="flex-row items-center justify-between px-2">
          <Text variant="caption" className="text-xs">
            Contains spoilers
          </Text>
          <Switch value={spoiler} onValueChange={setSpoiler} accessibilityLabel="Comment contains spoilers" trackColor={{ true: colors.accent, false: colors.border }} />
        </View>
      </View>
    </View>
  );
}
