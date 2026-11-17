import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Trophy } from 'lucide-react-native';
import { useEffect } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { Poster } from '@/components/PosterCard';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { useFilms } from '@/hooks/useFilms';
import { useGroup, useResetGroup } from '@/hooks/useGroups';
import { useUserId } from '@/store/auth';
import { palette } from '@/theme';

/** Winner announcement + how the vote went (instant-runoff rounds or yes counts). */
export default function Result() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useUserId();
  const group = useGroup(id);
  const picks = group.data?.picks ?? [];
  const films = useFilms(picks.map((p) => p.tmdb_id));
  const reset = useResetGroup(id);
  const g = group.data?.group;

  useEffect(() => {
    if (g?.status === 'closed') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [g?.status]);

  if (group.isLoading)
    return (
      <View className="flex-1 items-center gap-3 bg-bg p-6 dark:bg-bg-dark">
        <Skeleton width={200} height={300} />
        <Skeleton width="60%" height={28} />
      </View>
    );
  if (group.isError) return <ErrorState error={group.error} onRetry={() => group.refetch()} />;
  if (!g) return <EmptyState title="Group not found" />;
  if (g.status !== 'closed')
    return <EmptyState title="No winner yet" message="Voting hasn’t closed." actionLabel="Back to group" onAction={() => router.replace(`/group/${id}`)} />;

  const titleOf = (pickId: string) => {
    const p = picks.find((x) => x.id === pickId);
    return p ? (films.data?.[p.tmdb_id]?.title ?? '…') : '…';
  };
  const winner = picks.find((p) => p.id === g.winner_pick_id);
  const wf = winner ? films.data?.[winner.tmdb_id] : undefined;
  const rounds = g.result?.rounds ?? [];

  return (
    <ScrollView className="flex-1 bg-bg dark:bg-bg-dark" contentContainerClassName="items-center gap-4 p-6 pb-24">
      <Stack.Screen options={{ title: g.name }} />
      <Animated.View entering={ZoomIn.springify()} className="items-center gap-2">
        <Trophy size={40} color={palette.accent} />
        <Text variant="label">Tonight you’re watching</Text>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(250).springify()} className="items-center gap-3">
        <Poster posterPath={wf?.poster_path} title={wf?.title ?? 'Winner'} width={200} size="w500" rounded={16} />
        <Text variant="display" className="text-center">
          {wf?.title ?? '…'}
        </Text>
        <Text variant="caption">{[wf?.year, wf?.runtime ? `${wf.runtime} min` : null].filter(Boolean).join(' · ')}</Text>
        <Text variant="caption" className="text-center">
          Added to everyone’s watchlist ✓
        </Text>
        {winner ? <Button title="Open film" variant="secondary" onPress={() => router.push(`/film/${winner.tmdb_id}`)} /> : null}
      </Animated.View>

      <View className="mt-4 w-full rounded-2xl bg-surface p-4 dark:bg-surface-dark">
        <Text variant="heading" className="mb-2">
          How the vote went
        </Text>
        {g.voting_mode === 'ranked' ? (
          rounds.length === 0 ? (
            <Text variant="caption">No ballots were cast; the earliest pick won.</Text>
          ) : (
            rounds.map((r, i) => (
              <View key={i} className="mb-3">
                <Text className="font-semibold">Round {i + 1}</Text>
                {Object.entries(r.counts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([pid, n]) => (
                    <Text key={pid} variant="caption">
                      {titleOf(pid)}: {n} vote{n === 1 ? '' : 's'}
                      {pid === r.eliminated ? '  — eliminated' : ''}
                    </Text>
                  ))}
              </View>
            ))
          )
        ) : (
          Object.entries(g.result?.yes ?? {})
            .sort((a, b) => b[1] - a[1])
            .map(([pid, n]) => (
              <Text key={pid} variant="caption">
                {titleOf(pid)}: {n} yes
              </Text>
            ))
        )}
        {g.voting_mode === 'ranked' ? (
          <Text variant="caption" className="mt-1 text-[10px]">
            Instant runoff: the film with the fewest first choices is eliminated each round and those ballots move to their next choice,
            until one film has a majority.
          </Text>
        ) : null}
      </View>

      {g.owner_id === me ? (
        <Button
          title="Start a new round"
          variant="ghost"
          onPress={() =>
            Alert.alert('Start over?', 'Clears all votes and reopens picking.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Reset', onPress: () => reset.mutate(undefined, { onSuccess: () => router.replace(`/group/${id}`) }) },
            ])
          }
        />
      ) : null}
    </ScrollView>
  );
}
