import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Poster } from '@/components/PosterCard';
import { SearchBar } from '@/components/SearchBar';
import { Screen } from '@/components/ui/Screen';
import { Section } from '@/components/ui/Section';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { useDebounce } from '@/hooks/useDebounce';
import { useFilms, useSearchFilms } from '@/hooks/useFilms';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useUserId } from '@/store/auth';

/** Quick-add: search a film (or pick from your watchlist) and log it. */
export default function LogTab() {
  const [query, setQuery] = useState('');
  const q = useDebounce(query);
  const me = useUserId();
  const search = useSearchFilms(q);
  const watchlist = useWatchlist(me);
  const wlIds = (watchlist.data ?? []).slice(0, 12).map((w) => w.tmdb_id);
  const wlFilms = useFilms(wlIds);
  const results = search.data?.pages.flatMap((p) => p.results).slice(0, 25) ?? [];

  const Row = ({ id, title, year, poster }: { id: number; title: string; year?: number | null; poster: string | null }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Log ${title}`}
      onPress={() => router.push(`/log/${id}`)}
      className="min-h-[56px] flex-row items-center gap-3 px-4 py-2 active:opacity-70"
    >
      <Poster posterPath={poster} title={title} width={44} size="w92" rounded={5} />
      <Text className="flex-1 font-semibold" numberOfLines={1}>
        {title} {year ? <Text variant="caption">{year}</Text> : null}
      </Text>
    </Pressable>
  );

  return (
    <Screen>
      <View className="px-4 pb-2 pt-2">
        <Text variant="title" className="mb-3">
          Log a film
        </Text>
        <SearchBar value={query} onChangeText={setQuery} placeholder="What did you watch?" />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="pb-24">
        {q.trim().length >= 2 ? (
          search.isLoading ? (
            <SkeletonRows count={5} />
          ) : search.isError ? (
            <ErrorState error={search.error} onRetry={() => search.refetch()} />
          ) : results.length === 0 ? (
            <EmptyState title="No films match" message="Check the spelling or try the original title." />
          ) : (
            results.map((f) => <Row key={f.tmdb_id} id={f.tmdb_id} title={f.title} year={f.year} poster={f.poster_path} />)
          )
        ) : (
          <Section title="From your watchlist">
            {watchlist.isLoading ? (
              <SkeletonRows count={3} />
            ) : wlIds.length === 0 ? (
              <EmptyState title="Search for a film above" message="Films you add to your watchlist show up here for one-tap logging." />
            ) : (
              wlIds.map((id) => {
                const f = wlFilms.data?.[id];
                return <Row key={id} id={id} title={f?.title ?? '…'} year={f?.year} poster={f?.poster_path ?? null} />;
              })
            )}
          </Section>
        )}
      </ScrollView>
    </Screen>
  );
}
