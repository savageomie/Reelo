import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { LogForm, type LogFormValues } from '@/components/LogForm';
import { Poster } from '@/components/PosterCard';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState, errorMessage } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { useDeleteEntry, useDiaryEntry, useMyEntriesForFilm, useSaveEntry } from '@/hooks/useDiary';
import { useFilm } from '@/hooks/useFilms';
import { useToggleLike } from '@/hooks/useLikes';
import { useOfflineQueue } from '@/lib/offlineQueue';

/** Log film modal (create) or edit an existing diary entry (?entryId=...). */
export default function LogFilm() {
  const { tmdbId, entryId } = useLocalSearchParams<{ tmdbId: string; entryId?: string }>();
  const id = Number(tmdbId);
  const film = useFilm(id);
  const existing = useDiaryEntry(entryId);
  const previous = useMyEntriesForFilm(id);
  const save = useSaveEntry();
  const del = useDeleteEntry();
  const like = useToggleLike('film', id);
  const online = useOfflineQueue((s) => s.online);
  const editing = !!entryId;

  const onSubmit = async (v: LogFormValues) => {
    try {
      await save.mutateAsync({
        id: entryId,
        tmdb_id: id,
        ...v,
        review: v.review || null,
        created_at: existing.data?.created_at,
      });
      if (v.liked && online) like.mutate(true);
      toast(online ? (editing ? 'Entry updated' : 'Logged!') : 'Saved offline — will sync when you reconnect', 'success');
      router.back();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const onDelete = () =>
    Alert.alert('Delete entry?', 'This removes the diary entry and its review.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await del.mutateAsync(entryId as string);
          toast('Entry deleted');
          router.dismissTo('/diary');
        },
      },
    ]);

  if (editing && existing.isLoading) {
    return (
      <View className="flex-1 gap-3 bg-bg p-4 dark:bg-bg-dark">
        <Skeleton height={90} />
        <Skeleton height={300} />
      </View>
    );
  }
  if (editing && (existing.isError || !existing.data)) {
    return <ErrorState error={existing.error ?? 'Entry not found'} onRetry={() => existing.refetch()} />;
  }

  const f = film.data;
  return (
    <KeyboardAvoidingView className="flex-1 bg-bg dark:bg-bg-dark" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: editing ? 'Edit entry' : 'Log film' }} />
      <ScrollView contentContainerClassName="gap-5 p-4 pb-16" keyboardShouldPersistTaps="handled">
        <View className="flex-row items-center gap-3">
          <Poster posterPath={f?.poster_path} title={f?.title ?? '…'} width={60} size="w154" rounded={6} />
          <View className="flex-1">
            {film.isLoading ? (
              <Skeleton width="70%" height={20} />
            ) : (
              <Text variant="heading" numberOfLines={2}>
                {f?.title ?? 'Unknown film'}
              </Text>
            )}
            <Text variant="caption">{f?.year ?? ''}</Text>
          </View>
        </View>
        <LogForm
          initial={
            existing.data
              ? { ...existing.data, review: existing.data.review ?? '' }
              : undefined
          }
          alreadyWatched={!editing && (previous.data?.length ?? 0) > 0}
          onSubmit={onSubmit}
          submitting={save.isPending}
          submitLabel={editing ? 'Save changes' : 'Log it'}
        />
        {editing ? <Button title="Delete entry" variant="danger" onPress={onDelete} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
