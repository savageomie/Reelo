import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { User } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Poster } from '@/components/PosterCard';
import { SearchBar } from '@/components/SearchBar';
import { Avatar } from '@/components/ui/Avatar';
import { Chip } from '@/components/ui/Chip';
import { Screen } from '@/components/ui/Screen';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { useDebounce } from '@/hooks/useDebounce';
import { useSearchFilms, useSearchPeople, useSearchUsers } from '@/hooks/useFilms';
import { genreName, tmdbImage } from '@/lib/tmdb';
import { useTheme } from '@/theme';

type Tab = 'films' | 'people' | 'users';

/** Search results: films (TMDB), people (TMDB), Reelo users (Postgres full-text). */
export default function SearchScreen() {
  const params = useLocalSearchParams<{ q?: string; pick?: string }>();
  const [query, setQuery] = useState(params.q ?? '');
  const [tab, setTab] = useState<Tab>('films');
  const q = useDebounce(query);
  const films = useSearchFilms(q);
  const people = useSearchPeople(tab === 'people' ? q : '');
  const users = useSearchUsers(tab === 'users' ? q : '');
  const { colors } = useTheme();
  const pickMode = params.pick === 'log';

  const filmResults = films.data?.pages.flatMap((p) => p.results) ?? [];

  const body = () => {
    if (q.trim().length < 2) return <EmptyState title="Start typing" message="Search by title, actor, director or username." />;
    if (tab === 'films') {
      if (films.isLoading) return <SkeletonRows />;
      if (films.isError) return <ErrorState error={films.error} onRetry={() => films.refetch()} />;
      if (!filmResults.length) return <EmptyState title="No films match" message={`Nothing found for “${q}”.`} />;
      return (
        <FlashList
          data={filmResults}
          keyExtractor={(f) => String(f.tmdb_id)}
          contentContainerStyle={{ paddingBottom: 40 }}
          onEndReached={() => films.hasNextPage && !films.isFetchingNextPage && films.fetchNextPage()}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.title} ${item.year ?? ''}`}
              onPress={() => router.push(pickMode ? `/log/${item.tmdb_id}` : `/film/${item.tmdb_id}`)}
              className="flex-row gap-3 px-4 py-2 active:opacity-70"
            >
              <Poster posterPath={item.poster_path} title={item.title} width={52} size="w154" rounded={6} />
              <View className="flex-1 justify-center">
                <Text className="font-semibold" numberOfLines={2}>
                  {item.title}
                </Text>
                <Text variant="caption">
                  {[item.year, item.genre_ids.slice(0, 2).map(genreName).join(', ')].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </Pressable>
          )}
        />
      );
    }
    if (tab === 'people') {
      if (people.isLoading) return <SkeletonRows />;
      if (people.isError) return <ErrorState error={people.error} onRetry={() => people.refetch()} />;
      const list = people.data?.results ?? [];
      if (!list.length) return <EmptyState title="No people match" />;
      return (
        <FlashList
          data={list}
          keyExtractor={(p) => String(p.id)}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/person/${item.id}`)}
              className="min-h-[56px] flex-row items-center gap-3 px-4 py-2 active:opacity-70"
            >
              {item.profile_path ? (
                <Image source={{ uri: tmdbImage(item.profile_path, 'w185') ?? undefined }} style={{ width: 44, height: 44, borderRadius: 22 }} />
              ) : (
                <View className="h-11 w-11 items-center justify-center rounded-full bg-surface2 dark:bg-surface2-dark">
                  <User size={20} color={colors.muted} />
                </View>
              )}
              <View>
                <Text className="font-semibold">{item.name}</Text>
                <Text variant="caption">{item.known_for_department ?? ''}</Text>
              </View>
            </Pressable>
          )}
        />
      );
    }
    if (users.isLoading) return <SkeletonRows />;
    if (users.isError) return <ErrorState error={users.error} onRetry={() => users.refetch()} />;
    const list = users.data ?? [];
    if (!list.length) return <EmptyState title="No users match" />;
    return (
      <FlashList
        data={list}
        keyExtractor={(u) => u.id}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/user/${item.username}`)}
            className="min-h-[56px] flex-row items-center gap-3 px-4 py-2 active:opacity-70"
          >
            <Avatar uri={item.avatar_url} name={item.username} size={44} />
            <View className="flex-1">
              <Text className="font-semibold">{item.display_name ?? item.username}</Text>
              <Text variant="caption">@{item.username}</Text>
            </View>
          </Pressable>
        )}
      />
    );
  };

  return (
    <Screen edges={[]}>
      <View className="gap-2 px-4 pb-2 pt-2">
        <SearchBar value={query} onChangeText={setQuery} autoFocus={!params.q} placeholder={pickMode ? 'Which film did you watch?' : undefined} />
        {!pickMode ? (
          <View className="flex-row gap-2">
            <Chip label="Films" selected={tab === 'films'} onPress={() => setTab('films')} />
            <Chip label="People" selected={tab === 'people'} onPress={() => setTab('people')} />
            <Chip label="Users" selected={tab === 'users'} onPress={() => setTab('users')} />
          </View>
        ) : null}
      </View>
      <View className="flex-1">{body()}</View>
    </Screen>
  );
}
