import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Bookmark, BookmarkCheck, Heart, ListPlus, Play, Plus, User } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Poster } from '@/components/PosterCard';
import { PosterRow } from '@/components/PosterRow';
import { RatingHistogram } from '@/components/RatingHistogram';
import { RatingStars } from '@/components/RatingStars';
import { ReviewCard } from '@/components/ReviewCard';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/Section';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { formatDate } from '@/features/diary/grouping';
import { useFilmReviews, useMyEntriesForFilm } from '@/hooks/useDiary';
import { useAlsoLiked, useFilm, useFilmStats, useFilms, useSimilarFilms } from '@/hooks/useFilms';
import { useLikeState, useToggleLike } from '@/hooks/useLikes';
import { useInWatchlist, useToggleWatchlist } from '@/hooks/useWatchlist';
import { tmdbImage } from '@/lib/tmdb';
import { palette, useTheme } from '@/theme';

function ActionButton({
  icon: Icon,
  label,
  onPress,
  active,
  activeColor,
}: {
  icon: typeof Heart;
  label: string;
  onPress: () => void;
  active?: boolean;
  activeColor?: string;
}) {
  const { colors } = useTheme();
  const tint = active ? (activeColor ?? colors.accent) : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      className="min-h-[56px] min-w-[64px] items-center justify-center gap-1 active:opacity-60"
    >
      <Icon size={24} color={tint} fill={active && Icon === Heart ? tint : 'transparent'} />
      <Text variant="caption" className="text-xs">
        {label}
      </Text>
    </Pressable>
  );
}

export default function FilmScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tmdbId = Number(id);
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const film = useFilm(tmdbId);
  const stats = useFilmStats(tmdbId);
  const reviews = useFilmReviews(tmdbId);
  const mine = useMyEntriesForFilm(tmdbId);
  const similar = useSimilarFilms(tmdbId);
  const alsoLiked = useAlsoLiked(tmdbId);
  const alsoLikedFilms = useFilms((alsoLiked.data ?? []).map((r) => r.similar_tmdb_id));
  const inWatchlist = useInWatchlist(tmdbId);
  const toggleWatchlist = useToggleWatchlist();
  const like = useLikeState('film', tmdbId);
  const toggleLike = useToggleLike('film', tmdbId);
  const [expanded, setExpanded] = useState(false);

  if (film.isLoading) {
    return (
      <View className="flex-1 bg-bg dark:bg-bg-dark">
        <Skeleton height={260} rounded={0} />
        <View className="gap-3 p-4">
          <Skeleton width="60%" height={28} />
          <Skeleton width="40%" />
          <Skeleton height={80} />
        </View>
      </View>
    );
  }
  if (film.isError || !film.data) {
    return (
      <View className="flex-1 bg-bg pt-24 dark:bg-bg-dark">
        <ErrorState error={film.error ?? 'Film not found'} onRetry={() => film.refetch()} />
      </View>
    );
  }

  const f = film.data;
  // Poster-derived theme (P2): tint the hero and accent with the poster's colours.
  const theme = f.palette;
  const heroBg = theme ? (isDark ? theme.dark : theme.light) : colors.surface;
  const accent = theme?.primary ?? palette.accent;
  const latest = mine.data?.[0];
  const backdrop = tmdbImage(f.backdrop_path, 'w780');
  const providers = f.providers?.flatrate ?? [];

  return (
    <ScrollView className="flex-1 bg-bg dark:bg-bg-dark" contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
      <View style={{ backgroundColor: heroBg }}>
        {backdrop ? (
          <Animated.View entering={FadeIn.duration(400)}>
            <Image source={{ uri: backdrop }} style={{ width: '100%', height: 240 }} contentFit="cover" />
            <View
              style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 120, backgroundColor: heroBg, opacity: 0.55 }}
            />
          </Animated.View>
        ) : (
          <View style={{ height: insets.top + 56 }} />
        )}
        <View className="-mt-16 flex-row gap-4 px-4 pb-5">
          <Poster posterPath={f.poster_path} title={f.title} width={112} size="w342" />
          <View className="flex-1 justify-end gap-1 pt-16">
            <Text variant="title" numberOfLines={3}>
              {f.title}
            </Text>
            <Text variant="caption">
              {[f.year, f.runtime ? `${f.runtime} min` : null].filter(Boolean).join(' · ')}
            </Text>
            {f.directors?.length ? (
              <Text className="text-sm">
                Directed by{' '}
                {f.directors.map((d, i) => (
                  <Text key={d.id} className="text-sm font-semibold" onPress={() => router.push(`/person/${d.id}`)}>
                    {i ? ', ' : ''}
                    {d.name}
                  </Text>
                ))}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      <View className="flex-row justify-around border-b border-line px-2 py-2 dark:border-line-dark">
        <ActionButton icon={Plus} label={latest ? 'Log again' : 'Log'} onPress={() => router.push(`/log/${tmdbId}`)} />
        <ActionButton
          icon={Heart}
          label={like.data?.count ? String(like.data.count) : 'Like'}
          active={like.data?.likedByMe}
          activeColor={colors.danger}
          onPress={() => toggleLike.mutate(!like.data?.likedByMe)}
        />
        <ActionButton
          icon={inWatchlist ? BookmarkCheck : Bookmark}
          label="Watchlist"
          active={inWatchlist}
          activeColor={accent}
          onPress={() => toggleWatchlist.mutate({ tmdbId, add: !inWatchlist })}
        />
        <ActionButton icon={ListPlus} label="List" onPress={() => router.push({ pathname: '/list/add', params: { tmdbId } })} />
        {f.trailer_key ? (
          <ActionButton
            icon={Play}
            label="Trailer"
            onPress={() => WebBrowser.openBrowserAsync(`https://www.youtube.com/watch?v=${f.trailer_key}`)}
          />
        ) : null}
      </View>

      {latest ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/diary/${latest.id}`)}
          className="mx-4 mt-4 flex-row items-center justify-between rounded-xl bg-surface p-3 dark:bg-surface-dark"
        >
          <View>
            <Text variant="label">You watched this</Text>
            <Text className="text-sm">
              {formatDate(latest.watched_on)}
              {mine.data && mine.data.length > 1 ? ` · ${mine.data.length} times` : ''}
              {latest.pending ? ' · waiting to sync' : ''}
            </Text>
          </View>
          {latest.rating != null ? <RatingStars value={latest.rating} size={16} /> : null}
        </Pressable>
      ) : null}

      {f.tagline ? (
        <Text className="mx-4 mt-5 italic" style={{ color: accent }}>
          {f.tagline}
        </Text>
      ) : null}
      {f.overview ? (
        <Pressable onPress={() => setExpanded((e) => !e)} accessibilityRole="button" accessibilityLabel="Synopsis">
          <Text className="mx-4 mt-2 leading-6" numberOfLines={expanded ? undefined : 4}>
            {f.overview}
          </Text>
        </Pressable>
      ) : null}
      {f.genres?.length ? (
        <View className="mx-4 mt-3 flex-row flex-wrap gap-2">
          {f.genres.map((g) => (
            <View key={g.id} className="rounded-full border border-line px-3 py-1 dark:border-line-dark">
              <Text className="text-xs">{g.name}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Section title="Reelo ratings">
        <View className="mx-4 flex-row items-center gap-5 rounded-xl bg-surface p-4 dark:bg-surface-dark">
          <View className="items-center">
            <Text variant="display" style={{ color: accent }}>
              {stats.data?.avg_rating != null ? Number(stats.data.avg_rating).toFixed(1) : '–'}
            </Text>
            <Text variant="caption" className="text-xs">
              {stats.data?.rating_count ?? 0} ratings
            </Text>
          </View>
          <View className="flex-1">
            {stats.isLoading ? (
              <Skeleton height={56} />
            ) : (
              <RatingHistogram histogram={stats.data?.histogram ?? new Array(10).fill(0)} color={accent} />
            )}
          </View>
        </View>
      </Section>

      <Section title="Where to watch">
        {providers.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 px-4">
            {providers.map((p) => (
              <Pressable
                key={p.id}
                accessibilityRole="link"
                accessibilityLabel={`Stream on ${p.name}`}
                onPress={() => f.providers?.link && WebBrowser.openBrowserAsync(f.providers.link)}
                className="items-center gap-1"
                style={{ width: 64 }}
              >
                <Image source={{ uri: tmdbImage(p.logo_path, 'w92') ?? undefined }} style={{ width: 48, height: 48, borderRadius: 10 }} />
                <Text variant="caption" className="text-center text-[10px]" numberOfLines={2}>
                  {p.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <Text variant="caption" className="px-4">
            Not streaming in {f.providers?.region ?? 'your region'} right now.
          </Text>
        )}
        <Text variant="caption" className="mt-2 px-4 text-[10px]">
          Streaming data by JustWatch via TMDB.
        </Text>
      </Section>

      {f.cast?.length ? (
        <Section title="Cast">
          <View style={{ height: 150 }}>
            <FlashList
              horizontal
              data={f.cast}
              keyExtractor={(c) => String(c.id)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16 }}
              ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name} as ${item.character}`}
                  onPress={() => router.push(`/person/${item.id}`)}
                  style={{ width: 80 }}
                  className="items-center"
                >
                  {item.profile_path ? (
                    <Image source={{ uri: tmdbImage(item.profile_path, 'w185') ?? undefined }} style={{ width: 72, height: 72, borderRadius: 36 }} />
                  ) : (
                    <View className="h-[72px] w-[72px] items-center justify-center rounded-full bg-surface2 dark:bg-surface2-dark">
                      <User color={colors.muted} />
                    </View>
                  )}
                  <Text className="mt-1 text-center text-xs font-semibold" numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text variant="caption" className="text-center text-[10px]" numberOfLines={1}>
                    {item.character}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        </Section>
      ) : null}

      <Section title="Reviews">
        {reviews.isLoading ? (
          <View className="gap-3 px-4">
            <Skeleton height={60} />
            <Skeleton height={60} />
          </View>
        ) : reviews.isError ? (
          <Text variant="caption" className="px-4">
            Couldn’t load reviews.
          </Text>
        ) : (reviews.data ?? []).length === 0 ? (
          <View className="px-4">
            <Text variant="caption">No reviews yet. Be the first.</Text>
            <Button title="Write a review" variant="secondary" className="mt-3 self-start" onPress={() => router.push(`/log/${tmdbId}`)} />
          </View>
        ) : (
          (reviews.data ?? []).slice(0, 8).map((r) => (
            <ReviewCard
              key={r.id}
              entryId={r.id}
              username={r.profile?.username ?? 'someone'}
              avatarUrl={r.profile?.avatar_url}
              rating={r.rating}
              review={r.review}
              spoiler={r.spoiler}
              liked={r.liked}
              isRewatch={r.is_rewatch}
              watchedOn={r.watched_on}
            />
          ))
        )}
      </Section>

      <Section title="Reelo users who loved this also loved">
        <PosterRow
          items={(alsoLiked.data ?? [])
            .map((r) => alsoLikedFilms.data?.[r.similar_tmdb_id])
            .filter((x): x is NonNullable<typeof x> => !!x)}
          loading={alsoLiked.isLoading || alsoLikedFilms.isLoading}
          emptyText="Not enough ratings yet — check back after more people log it."
        />
      </Section>

      <Section title="More like this">
        <PosterRow items={similar.data?.results} loading={similar.isLoading} error={similar.isError} />
      </Section>
    </ScrollView>
  );
}
