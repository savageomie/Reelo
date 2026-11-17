import { FlashList } from '@shopify/flash-list';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Bookmark } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { PosterCard } from '@/components/PosterCard';
import { Chip } from '@/components/ui/Chip';
import { SkeletonGrid } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { SORT_LABELS, sortAndFilter, type WatchlistSort } from '@/features/lists/watchlistFilter';
import { useFilms } from '@/hooks/useFilms';
import { useProfileById } from '@/hooks/useProfile';
import { useWatchlist } from '@/hooks/useWatchlist';
import { GENRES } from '@/lib/tmdb';
import { useUserId } from '@/store/auth';

const RUNTIMES = [null, 100, 120, 150] as const;

export default function WatchlistScreen() {
  const params = useLocalSearchParams<{ userId?: string }>();
  const me = useUserId();
  const userId = params.userId ?? me;
  const isMe = userId === me;
  const owner = useProfileById(isMe ? null : userId);
  const wl = useWatchlist(userId);
  const films = useFilms((wl.data ?? []).map((w) => w.tmdb_id));
  const [sort, setSort] = useState<WatchlistSort>('added_desc');
  const [genre, setGenre] = useState<number | null>(null);
  const [maxRuntime, setMaxRuntime] = useState<number | null>(null);
  const [streamingOnly, setStreamingOnly] = useState(false);

  const items = useMemo(() => {
    const rows = (wl.data ?? []).map((w) => {
      const f = films.data?.[w.tmdb_id];
      return {
        tmdbId: w.tmdb_id,
        title: f?.title ?? '…',
        year: f?.year ?? null,
        runtime: f?.runtime ?? null,
        genreIds: f?.genre_ids ?? [],
        providerIds: (f?.providers?.flatrate ?? []).map((p) => p.id),
        popularity: f?.popularity ?? null,
        addedAt: w.added_at,
        posterPath: f?.poster_path ?? null,
      };
    });
    const filtered = sortAndFilter(rows, sort, { genreIds: genre ? [genre] : [], maxRuntime });
    return streamingOnly ? filtered.filter((r) => r.providerIds.length > 0) : filtered;
  }, [wl.data, films.data, sort, genre, maxRuntime, streamingOnly]);

  const usedGenres = GENRES.filter((g) => Object.values(films.data ?? {}).some((f) => f.genre_ids?.includes(g.id)));

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <Stack.Screen options={{ title: isMe ? 'Watchlist' : owner.data ? `@${owner.data.username}’s watchlist` : 'Watchlist' }} />
      <View className="gap-1 py-2">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4 py-1">
          {(Object.keys(SORT_LABELS) as WatchlistSort[]).map((s) => (
            <Chip key={s} label={SORT_LABELS[s]} selected={sort === s} onPress={() => setSort(s)} />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4 py-1">
          <Chip label="Streaming now" selected={streamingOnly} onPress={() => setStreamingOnly((s) => !s)} />
          {RUNTIMES.map((r) => (
            <Chip key={String(r)} label={r ? `≤ ${r} min` : 'Any length'} selected={maxRuntime === r} onPress={() => setMaxRuntime(r)} />
          ))}
          <Chip label="All genres" selected={genre === null} onPress={() => setGenre(null)} />
          {usedGenres.map((g) => (
            <Chip key={g.id} label={g.name} selected={genre === g.id} onPress={() => setGenre(g.id)} />
          ))}
        </ScrollView>
      </View>
      {wl.isLoading ? (
        <SkeletonGrid />
      ) : wl.isError ? (
        <ErrorState error={wl.error} onRetry={() => wl.refetch()} />
      ) : (wl.data ?? []).length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title={isMe ? 'Your watchlist is empty' : 'Nothing on this watchlist'}
          message={isMe ? 'Tap the bookmark on any film to save it for later.' : undefined}
          actionLabel={isMe ? 'Discover films' : undefined}
          onAction={isMe ? () => router.push('/discover') : undefined}
        />
      ) : items.length === 0 ? (
        <EmptyState title="No films match these filters" />
      ) : (
        <>
          <Text variant="caption" className="px-4">
            {items.length} film{items.length === 1 ? '' : 's'}
          </Text>
          <FlashList
            data={items}
            numColumns={3}
            keyExtractor={(i) => String(i.tmdbId)}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40 }}
            renderItem={({ item }) => (
              <View className="items-center p-1.5">
                <PosterCard
                  tmdbId={item.tmdbId}
                  title={item.title}
                  posterPath={item.posterPath}
                  width={108}
                  showTitle
                  subtitle={[item.year, item.runtime ? `${item.runtime}m` : null].filter(Boolean).join(' · ')}
                />
              </View>
            )}
          />
        </>
      )}
    </View>
  );
}
