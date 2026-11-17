import * as Haptics from 'expo-haptics';
import { Redirect, Stack, router, useLocalSearchParams } from 'expo-router';
import { Wifi, WifiOff } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import { Poster } from '@/components/PosterCard';
import { SwipeDeck } from '@/components/SwipeDeck';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState, errorMessage } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { ballotsFromVotes, instantRunoff, tallySwipe } from '@/features/groups/rankedChoice';
import { useFilms } from '@/hooks/useFilms';
import { useCloseVoting, useGroup, useSubmitRanking, useSwipeVote } from '@/hooks/useGroups';
import { useUserId } from '@/store/auth';
import { useTheme } from '@/theme';

/** Live voting: swipe or ranked ballot + realtime tally (same algorithm as the SQL close_voting). */
export default function Vote() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useUserId();
  const { colors } = useTheme();
  const group = useGroup(id);
  const picks = useMemo(() => group.data?.picks ?? [], [group.data?.picks]);
  const votes = useMemo(() => group.data?.votes ?? [], [group.data?.votes]);
  const films = useFilms(picks.map((p) => p.tmdb_id));
  const swipe = useSwipeVote(id);
  const submit = useSubmitRanking(id);
  const close = useCloseVoting(id);
  const myRanks = useMemo(
    () => votes.filter((v) => v.user_id === me && v.rank != null).sort((a, b) => (a.rank as number) - (b.rank as number)).map((v) => v.pick_id),
    [votes, me],
  );
  const [draft, setDraft] = useState<string[] | null>(null);
  const [redo, setRedo] = useState(false);
  const order = draft ?? myRanks;

  const g = group.data?.group;
  const candidates = picks.map((p) => p.id);
  const tally = useMemo(() => {
    if (!g) return null;
    if (g.voting_mode === 'ranked') {
      const r = instantRunoff(candidates, ballotsFromVotes(votes.map((v) => ({ userId: v.user_id, pickId: v.pick_id, rank: v.rank }))));
      return { leader: r.winner, counts: r.rounds[0]?.counts ?? {}, rounds: r.rounds.length };
    }
    const s = tallySwipe(candidates, votes.map((v) => ({ userId: v.user_id, pickId: v.pick_id, value: v.value })));
    return { leader: s.winner, counts: s.yes, rounds: 1 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, votes, picks]);

  if (group.isLoading)
    return (
      <View className="flex-1 gap-3 bg-bg p-4 dark:bg-bg-dark">
        <Skeleton height={300} />
        <Skeleton height={100} />
      </View>
    );
  if (group.isError) return <ErrorState error={group.error} onRetry={() => group.refetch()} />;
  if (!g) return <EmptyState title="Group not found" />;
  if (g.status === 'closed') return <Redirect href={`/group/${id}/result`} />;
  if (g.status === 'picking') return <Redirect href={`/group/${id}`} />;

  const isOwner = g.owner_id === me;
  const voters = new Set(votes.map((v) => v.user_id)).size;
  const memberCount = group.data?.members.length ?? 0;
  const mySwiped = new Set(votes.filter((v) => v.user_id === me && v.value != null).map((v) => v.pick_id));
  const unvoted = picks.filter((p) => redo || !mySwiped.has(p.id));
  const leaderPick = picks.find((p) => p.id === tally?.leader);
  const leaderFilm = leaderPick ? films.data?.[leaderPick.tmdb_id] : undefined;

  const toggleRank = (pickId: string) => {
    Haptics.selectionAsync().catch(() => {});
    setDraft((cur) => {
      const base = cur ?? myRanks;
      return base.includes(pickId) ? base.filter((x) => x !== pickId) : [...base, pickId];
    });
  };

  return (
    <ScrollView className="flex-1 bg-bg dark:bg-bg-dark" contentContainerClassName="gap-6 p-4 pb-24">
      <Stack.Screen
        options={{
          title: g.name,
          headerRight: () =>
            group.live ? <Wifi size={18} color={colors.success} accessibilityLabel="Live" /> : <WifiOff size={18} color={colors.muted} accessibilityLabel="Connecting" />,
        }}
      />

      {/* Live results */}
      <View className="rounded-2xl bg-surface p-4 dark:bg-surface-dark" accessibilityLiveRegion="polite">
        <View className="flex-row items-center justify-between">
          <Text variant="label">Live results</Text>
          <Text variant="caption" className="text-xs">
            {voters}/{memberCount} voted
          </Text>
        </View>
        {voters === 0 ? (
          <Text variant="caption" className="mt-2">
            No votes yet — be the first.
          </Text>
        ) : (
          <View className="mt-3 flex-row items-center gap-3">
            <Poster posterPath={leaderFilm?.poster_path} title={leaderFilm?.title ?? '…'} width={48} size="w92" rounded={6} />
            <View className="flex-1">
              <Text variant="caption" className="text-xs">
                {g.voting_mode === 'ranked' ? `Leading after instant runoff (${tally?.rounds} round${tally?.rounds === 1 ? '' : 's'})` : 'Most “yes” votes'}
              </Text>
              <Text className="font-semibold">{leaderFilm?.title ?? '…'}</Text>
            </View>
          </View>
        )}
        <View className="mt-3 gap-1.5">
          {picks.map((p) => {
            const n = tally?.counts[p.id] ?? 0;
            const max = Math.max(1, ...Object.values(tally?.counts ?? {}));
            return (
              <Animated.View key={p.id} layout={LinearTransition} className="flex-row items-center gap-2">
                <Text className="w-28 text-xs" numberOfLines={1}>
                  {films.data?.[p.tmdb_id]?.title ?? '…'}
                </Text>
                <View className="h-2 flex-1 overflow-hidden rounded-full bg-surface2 dark:bg-surface2-dark">
                  <View style={{ width: `${(n / max) * 100}%` }} className={`h-2 rounded-full ${p.id === tally?.leader ? 'bg-accent' : 'bg-muted'}`} />
                </View>
                <Text variant="caption" className="w-6 text-right text-xs">
                  {n}
                </Text>
              </Animated.View>
            );
          })}
        </View>
        {g.voting_mode === 'ranked' ? (
          <Text variant="caption" className="mt-2 text-[10px]">
            Bars show first-choice votes.
          </Text>
        ) : null}
      </View>

      {/* Ballot */}
      {g.voting_mode === 'swipe' ? (
        unvoted.length ? (
          <SwipeDeck
            key={unvoted[0].id}
            pickId={unvoted[0].id}
            film={films.data?.[unvoted[0].tmdb_id]}
            remaining={unvoted.length}
            onVote={(pickId, value) => {
              swipe.mutate({ pickId, value }, { onError: (e) => toast(errorMessage(e), 'error') });
              if (redo && unvoted.length === 1) setRedo(false);
            }}
          />
        ) : (
          <View className="items-center gap-3">
            <Text variant="heading">You’ve voted on every pick 🎉</Text>
            <Text variant="caption">Waiting for the others…</Text>
            <Button title="Change my votes" variant="secondary" onPress={() => setRedo(true)} />
          </View>
        )
      ) : (
        <View className="gap-3">
          <Text variant="heading">Rank the picks</Text>
          <Text variant="caption">Tap films in order of preference. Tap again to remove. You don’t have to rank them all.</Text>
          {picks.map((p) => {
            const f = films.data?.[p.tmdb_id];
            const pos = order.indexOf(p.id);
            return (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityLabel={pos >= 0 ? `${f?.title}, ranked ${pos + 1}` : `${f?.title}, not ranked`}
                onPress={() => toggleRank(p.id)}
                className={`min-h-[60px] flex-row items-center gap-3 rounded-xl border p-2 ${pos >= 0 ? 'border-accent' : 'border-line dark:border-line-dark'}`}
              >
                <View className={`h-9 w-9 items-center justify-center rounded-full ${pos >= 0 ? 'bg-accent' : 'bg-surface2 dark:bg-surface2-dark'}`}>
                  <Text className={`font-bold ${pos >= 0 ? 'text-[#0E0F13]' : ''}`}>{pos >= 0 ? pos + 1 : '–'}</Text>
                </View>
                <Poster posterPath={f?.poster_path} title={f?.title ?? '…'} width={36} size="w92" rounded={4} />
                <Text className="flex-1" numberOfLines={1}>
                  {f?.title ?? '…'}
                </Text>
              </Pressable>
            );
          })}
          <Button
            title={myRanks.length && !draft ? 'Ballot submitted ✓' : 'Submit my ballot'}
            disabled={order.length === 0 || (!draft && myRanks.length > 0)}
            loading={submit.isPending}
            onPress={() =>
              submit.mutate(order, {
                onSuccess: () => {
                  setDraft(null);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                  toast('Ballot submitted', 'success');
                },
                onError: (e) => toast(errorMessage(e), 'error'),
              })
            }
          />
        </View>
      )}

      {isOwner ? (
        <Button
          title="Close voting & reveal winner"
          variant="secondary"
          loading={close.isPending}
          onPress={() =>
            Alert.alert('Close voting?', `${voters} of ${memberCount} members have voted.`, [
              { text: 'Keep voting', style: 'cancel' },
              {
                text: 'Reveal winner',
                onPress: () =>
                  close.mutate(undefined, {
                    onSuccess: () => router.replace(`/group/${id}/result`),
                    onError: (e) => toast(errorMessage(e), 'error'),
                  }),
              },
            ])
          }
        />
      ) : (
        <Text variant="caption" className="text-center">
          The owner will reveal the winner when everyone has voted.
        </Text>
      )}
    </ScrollView>
  );
}
