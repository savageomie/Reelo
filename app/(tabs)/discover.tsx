import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { PosterCard } from '@/components/PosterCard';
import { PosterRow } from '@/components/PosterRow';
import { SearchBar } from '@/components/SearchBar';
import { Chip } from '@/components/ui/Chip';
import { Screen } from '@/components/ui/Screen';
import { Section } from '@/components/ui/Section';
import { SkeletonGrid } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { useFilmList, useGenreFilms } from '@/hooks/useFilms';
import { GENRES } from '@/lib/tmdb';

export default function Discover() {
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState<number | null>(null);
  const trending = useFilmList('trending');
  const popular = useFilmList('popular');
  const topRated = useFilmList('top_rated');
  const byGenre = useGenreFilms(genre);

  const submit = () => {
    if (query.trim().length >= 2) router.push({ pathname: '/search', params: { q: query.trim() } });
  };

  const genreFilms = byGenre.data?.pages.flatMap((p) => p.results) ?? [];

  return (
    <Screen>
      <View className="px-4 pb-2 pt-2">
        <Text variant="title" className="mb-3">
          Discover
        </Text>
        <SearchBar value={query} onChangeText={setQuery} onSubmit={submit} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="max-h-14 flex-grow-0" contentContainerClassName="gap-2 px-4 py-2">
        <Chip label="All" selected={genre === null} onPress={() => setGenre(null)} />
        {GENRES.map((g) => (
          <Chip key={g.id} label={g.name} selected={genre === g.id} onPress={() => setGenre(g.id)} />
        ))}
      </ScrollView>

      {genre !== null ? (
        byGenre.isLoading ? (
          <SkeletonGrid />
        ) : byGenre.isError ? (
          <ErrorState error={byGenre.error} onRetry={() => byGenre.refetch()} />
        ) : genreFilms.length === 0 ? (
          <EmptyState title="No films found" />
        ) : (
          <FlashList
            data={genreFilms}
            numColumns={3}
            keyExtractor={(f) => String(f.tmdb_id)}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40 }}
            onEndReached={() => byGenre.hasNextPage && !byGenre.isFetchingNextPage && byGenre.fetchNextPage()}
            renderItem={({ item }) => (
              <View className="items-center p-1.5">
                <PosterCard tmdbId={item.tmdb_id} title={item.title} posterPath={item.poster_path} width={108} />
              </View>
            )}
          />
        )
      ) : (
        <ScrollView contentContainerClassName="pb-24">
          <Section title="Trending this week">
            <PosterRow items={trending.data?.results} loading={trending.isLoading} error={trending.isError} width={120} />
          </Section>
          <Section title="Popular">
            <PosterRow items={popular.data?.results} loading={popular.isLoading} error={popular.isError} />
          </Section>
          <Section title="Top rated of all time">
            <PosterRow items={topRated.data?.results} loading={topRated.isLoading} error={topRated.isError} />
          </Section>
        </ScrollView>
      )}
    </Screen>
  );
}
