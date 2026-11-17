import * as Clipboard from 'expo-clipboard';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Copy, Share2, Trash2, Wifi, WifiOff } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, View } from 'react-native';

import { Poster } from '@/components/PosterCard';
import { SearchBar } from '@/components/SearchBar';
import { AvatarStack } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Section } from '@/components/ui/Section';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState, errorMessage } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { matchesFilters } from '@/features/lists/watchlistFilter';
import { useDebounce } from '@/hooks/useDebounce';
import { useFilms, useSearchFilms } from '@/hooks/useFilms';
import { useAddPick, useDeleteGroup, useGroup, useLeaveGroup, useRemovePick, useStartVoting, useUpdateGroupFilters } from '@/hooks/useGroups';
import { useWatchlist } from '@/hooks/useWatchlist';
import { toFilterable } from '@/lib/filmAdapters';
import { GENRES, genreName } from '@/lib/tmdb';
import { useUserId } from '@/store/auth';
import { useTheme } from '@/theme';

const RUNTIMES = [null, 100, 120, 150] as const;

/** Group detail: invite, members, filters (runtime/genre/shared streaming service) and the picks pool. */
export default function GroupDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useUserId();
  const { colors } = useTheme();
  const group = useGroup(id);
  const picks = useMemo(() => group.data?.picks ?? [], [group.data?.picks]);
  const wl = useWatchlist(me);
  const [query, setQuery] = useState('');
  const search = useSearchFilms(useDebounce(query));
  const films = useFilms([...picks.map((p) => p.tmdb_id), ...(wl.data ?? []).slice(0, 30).map((w) => w.tmdb_id)]);
  const addPick = useAddPick(id);
  const removePick = useRemovePick(id);
  const start = useStartVoting(id);
  const updateFilters = useUpdateGroupFilters(id);
  const leave = useLeaveGroup(id);
  const del = useDeleteGroup(id);

  const g = group.data?.group;
  const filters = g?.filters ?? {};
  const isOwner = g?.owner_id === me;
  const pickIds = new Set(picks.map((p) => p.tmdb_id));

  const providers = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of picks) for (const pr of films.data?.[p.tmdb_id]?.providers?.flatrate ?? []) map.set(pr.id, pr.name);
    return [...map.entries()];
  }, [picks, films.data]);

  const filterOpts = { maxRuntime: filters.max_runtime ?? null, genreIds: filters.genre_ids ?? [], providerIds: filters.provider_ids ?? [] };
  const watchlistSuggestions = (wl.data ?? [])
    .filter((w) => !pickIds.has(w.tmdb_id))
    .filter((w) => matchesFilters(toFilterable(films.data?.[w.tmdb_id], w.tmdb_id), filterOpts))
    .slice(0, 10);

  const setFilter = (patch: Partial<typeof filters>) => updateFilters.mutate({ ...filters, ...patch }, { onError: (e) => toast(errorMessage(e), 'error') });
  const add = (tmdbId: number) =>
    addPick.mutate(tmdbId, {
      onSuccess: () => toast('Added to the pool', 'success'),
      onError: (e) => toast(errorMessage(e).includes('duplicate') ? 'Already in the pool' : errorMessage(e), 'error'),
    });

  const invite = async () => {
    if (!g) return;
    await Share.share({ message: `Join “${g.name}” on Reelo to pick tonight's film! Code: ${g.invite_code}\nreelo://group/join?code=${g.invite_code}` });
  };

  if (group.isLoading)
    return (
      <View className="flex-1 gap-3 bg-bg p-4 dark:bg-bg-dark">
        <Skeleton height={80} />
        <Skeleton height={140} />
        <Skeleton height={200} />
      </View>
    );
  if (group.isError) return <ErrorState error={group.error} onRetry={() => group.refetch()} />;
  if (!g) return <EmptyState title="Group not found" message="You may not be a member any more." />;

  if (g.status === 'voting')
    return (
      <View className="flex-1 bg-bg p-4 dark:bg-bg-dark">
        <Stack.Screen options={{ title: g.name }} />
        <EmptyState title="Voting is open!" message="Cast your vote — results update live." actionLabel="Vote now" onAction={() => router.replace(`/group/${id}/vote`)} />
      </View>
    );
  if (g.status === 'closed')
    return (
      <View className="flex-1 bg-bg p-4 dark:bg-bg-dark">
        <Stack.Screen options={{ title: g.name }} />
        <EmptyState title="We have a winner" actionLabel="See result" onAction={() => router.replace(`/group/${id}/result`)} />
      </View>
    );

  return (
    <ScrollView className="flex-1 bg-bg dark:bg-bg-dark" contentContainerClassName="pb-24" keyboardShouldPersistTaps="handled">
      <Stack.Screen
        options={{
          title: g.name,
          headerRight: () =>
            group.live ? <Wifi size={18} color={colors.success} accessibilityLabel="Live" /> : <WifiOff size={18} color={colors.muted} accessibilityLabel="Connecting" />,
        }}
      />
      <View className="mx-4 mt-2 flex-row items-center justify-between rounded-2xl bg-surface p-4 dark:bg-surface-dark">
        <View>
          <Text variant="label">Invite code</Text>
          <Text variant="display" className="tracking-[6px]">
            {g.invite_code}
          </Text>
        </View>
        <View className="flex-row">
          <IconButton
            icon={Copy}
            label="Copy invite code"
            onPress={async () => {
              await Clipboard.setStringAsync(g.invite_code);
              toast('Code copied');
            }}
          />
          <IconButton icon={Share2} label="Share invite" onPress={invite} />
        </View>
      </View>

      <View className="mx-4 mt-4 flex-row items-center justify-between">
        <AvatarStack people={(group.data?.members ?? []).map((m) => ({ name: m.profile?.username ?? '?', uri: m.profile?.avatar_url }))} />
        <Text variant="caption">
          {group.data?.members.length} members · {g.voting_mode === 'ranked' ? 'ranked choice' : 'swipe'}
        </Text>
      </View>

      <Section title="Filters">
        <View className="gap-2">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4">
            {RUNTIMES.map((r) => (
              <Chip key={String(r)} label={r ? `≤ ${r} min` : 'Any length'} selected={(filters.max_runtime ?? null) === r} onPress={isOwner ? () => setFilter({ max_runtime: r }) : undefined} />
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4">
            {GENRES.map((ge) => {
              const on = (filters.genre_ids ?? []).includes(ge.id);
              return (
                <Chip
                  key={ge.id}
                  label={ge.name}
                  selected={on}
                  onPress={isOwner ? () => setFilter({ genre_ids: on ? (filters.genre_ids ?? []).filter((x) => x !== ge.id) : [...(filters.genre_ids ?? []), ge.id] }) : undefined}
                />
              );
            })}
          </ScrollView>
          {providers.length ? (
            <>
              <Text variant="caption" className="px-4 text-xs">
                Streaming services we share:
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4">
                {providers.map(([pid, name]) => {
                  const on = (filters.provider_ids ?? []).includes(pid);
                  return (
                    <Chip
                      key={pid}
                      label={name}
                      selected={on}
                      onPress={isOwner ? () => setFilter({ provider_ids: on ? (filters.provider_ids ?? []).filter((x) => x !== pid) : [...(filters.provider_ids ?? []), pid] }) : undefined}
                    />
                  );
                })}
              </ScrollView>
            </>
          ) : null}
          {!isOwner ? (
            <Text variant="caption" className="px-4 text-xs">
              Only the group owner can change filters.
            </Text>
          ) : null}
        </View>
      </Section>

      <Section title={`Picks (${picks.length})`}>
        {picks.length === 0 ? (
          <Text variant="caption" className="px-4">
            No picks yet — add a few films below.
          </Text>
        ) : (
          <View className="gap-2 px-4">
            {picks.map((p) => {
              const f = films.data?.[p.tmdb_id];
              const ok = matchesFilters(toFilterable(f, p.tmdb_id), filterOpts);
              const canRemove = p.added_by === me || isOwner;
              return (
                <View key={p.id} className={`flex-row items-center gap-3 ${ok ? '' : 'opacity-50'}`}>
                  <Poster posterPath={f?.poster_path} title={f?.title ?? '…'} width={44} size="w92" rounded={5} />
                  <View className="flex-1">
                    <Text className="font-semibold" numberOfLines={1}>
                      {f?.title ?? '…'}
                    </Text>
                    <Text variant="caption" className="text-xs">
                      {[f?.year, f?.runtime ? `${f.runtime} min` : null, f?.genre_ids?.slice(0, 2).map(genreName).join(', ')].filter(Boolean).join(' · ')}
                      {ok ? '' : ' · doesn’t match filters'}
                    </Text>
                  </View>
                  {canRemove ? <IconButton icon={Trash2} size={18} label={`Remove ${f?.title ?? 'pick'}`} color={colors.muted} onPress={() => removePick.mutate(p.id)} /> : null}
                </View>
              );
            })}
          </View>
        )}
      </Section>

      <Section title="Add a pick">
        <View className="gap-2 px-4">
          <SearchBar value={query} onChangeText={setQuery} placeholder="Search any film" />
          {(search.data?.pages[0]?.results ?? []).slice(0, 6).map((f) => (
            <Pressable key={f.tmdb_id} accessibilityRole="button" accessibilityLabel={`Add ${f.title}`} onPress={() => (setQuery(''), add(f.tmdb_id))} className="min-h-[44px] flex-row items-center gap-3">
              <Poster posterPath={f.poster_path} title={f.title} width={32} size="w92" rounded={4} />
              <Text className="flex-1">
                {f.title} <Text variant="caption">{f.year ?? ''}</Text>
              </Text>
            </Pressable>
          ))}
          {watchlistSuggestions.length ? (
            <>
              <Text variant="caption" className="mt-2 text-xs">
                From your watchlist (matching filters)
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3">
                {watchlistSuggestions.map((w) => {
                  const f = films.data?.[w.tmdb_id];
                  return (
                    <Pressable key={w.tmdb_id} accessibilityRole="button" accessibilityLabel={`Add ${f?.title ?? 'film'}`} onPress={() => add(w.tmdb_id)}>
                      <Poster posterPath={f?.poster_path} title={f?.title ?? '…'} width={72} size="w185" />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          ) : null}
        </View>
      </Section>

      <View className="mt-8 gap-3 px-4">
        {isOwner ? (
          <Button
            title={picks.length < 2 ? 'Add at least 2 picks to vote' : 'Open voting'}
            disabled={picks.length < 2}
            loading={start.isPending}
            onPress={() =>
              start.mutate(g.voting_mode, {
                onSuccess: () => router.replace(`/group/${id}/vote`),
                onError: (e) => toast(errorMessage(e), 'error'),
              })
            }
          />
        ) : (
          <Text variant="caption" className="text-center">
            Waiting for the owner to open voting…
          </Text>
        )}
        <Button
          title={isOwner ? 'Delete group' : 'Leave group'}
          variant="ghost"
          onPress={() =>
            Alert.alert(isOwner ? 'Delete group?' : 'Leave group?', undefined, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: isOwner ? 'Delete' : 'Leave',
                style: 'destructive',
                onPress: () => (isOwner ? del : leave).mutate(undefined, { onSuccess: () => router.dismissTo('/together') }),
              },
            ])
          }
        />
      </View>
    </ScrollView>
  );
}
