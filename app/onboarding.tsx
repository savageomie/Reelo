import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Poster } from '@/components/PosterCard';
import { RatingStars } from '@/components/RatingStars';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Screen } from '@/components/ui/Screen';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { ErrorState, errorMessage } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { todayISO } from '@/features/diary/grouping';
import { useSaveEntry } from '@/hooks/useDiary';
import { useFilmList } from '@/hooks/useFilms';
import { useUpdateProfile } from '@/hooks/useProfile';
import { GENRES } from '@/lib/tmdb';

/** Onboarding: pick favourite genres, then rate a few films so taste match & recs aren't empty. */
export default function Onboarding() {
  const [step, setStep] = useState<0 | 1>(0);
  const [genres, setGenres] = useState<number[]>([]);
  const [ratings, setRatings] = useState<Record<number, number | null>>({});
  const popular = useFilmList('top_rated');
  const update = useUpdateProfile();
  const save = useSaveEntry();

  const toggle = (id: number) =>
    setGenres((g) => (g.includes(id) ? g.filter((x) => x !== id) : g.length >= 10 ? g : [...g, id]));

  const finish = async () => {
    try {
      const today = todayISO();
      for (const [id, rating] of Object.entries(ratings)) {
        if (rating == null) continue;
        await save.mutateAsync({
          tmdb_id: Number(id),
          watched_on: today,
          rating,
          review: null,
          spoiler: false,
          tags: ['onboarding'],
          is_rewatch: false,
          liked: rating >= 4.5,
        });
      }
      await update.mutateAsync({ favourite_genres: genres, onboarded: true });
      router.replace('/home');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const rated = Object.values(ratings).filter((r) => r != null).length;

  if (step === 0) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScrollView contentContainerClassName="px-5 pb-6 pt-8">
          <Text variant="label">Step 1 of 2</Text>
          <Text variant="title" className="mt-2">
            What do you love watching?
          </Text>
          <Text variant="caption" className="mb-6 mt-1">
            Pick a few genres. We use them for your first recommendations.
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {GENRES.map((g) => (
              <Chip key={g.id} label={g.name} selected={genres.includes(g.id)} onPress={() => toggle(g.id)} />
            ))}
          </View>
        </ScrollView>
        <View className="px-5 pb-4">
          <Button title={genres.length ? 'Next' : 'Skip'} onPress={() => setStep(1)} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerClassName="px-5 pb-6 pt-8">
        <Text variant="label">Step 2 of 2</Text>
        <Text variant="title" className="mt-2">
          Rate films you’ve seen
        </Text>
        <Text variant="caption" className="mb-4 mt-1">
          Rate at least 3 to unlock taste match. Skip any you haven’t seen.
        </Text>
        {popular.isLoading ? (
          <SkeletonRows count={5} />
        ) : popular.isError ? (
          <ErrorState error={popular.error} onRetry={() => popular.refetch()} />
        ) : (
          <View className="gap-4">
            {(popular.data?.results ?? []).slice(0, 15).map((f) => (
              <View key={f.tmdb_id} className="flex-row items-center gap-3">
                <Poster posterPath={f.poster_path} title={f.title} width={56} size="w154" rounded={6} />
                <View className="flex-1 gap-1">
                  <Text className="font-semibold" numberOfLines={1}>
                    {f.title} {f.year ? <Text variant="caption">{f.year}</Text> : null}
                  </Text>
                  <RatingStars
                    size={24}
                    value={ratings[f.tmdb_id] ?? null}
                    onChange={(v) => setRatings((r) => ({ ...r, [f.tmdb_id]: v }))}
                  />
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
      <View className="flex-row gap-3 px-5 pb-4">
        <Button title="Back" variant="secondary" onPress={() => setStep(0)} className="flex-1" />
        <Button
          title={rated ? `Finish (${rated} rated)` : 'Finish'}
          onPress={finish}
          loading={update.isPending}
          className="flex-[2]"
        />
      </View>
    </Screen>
  );
}
