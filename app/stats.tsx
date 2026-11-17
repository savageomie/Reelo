import { Stack, router, useLocalSearchParams } from 'expo-router';
import { BarChart3, Gift } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { HBars, Heatmap, StatCard, VBars } from '@/components/charts';
import { RatingHistogram } from '@/components/RatingHistogram';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Section } from '@/components/ui/Section';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { MONTH_SHORT, WEEKDAYS } from '@/features/stats/computeStats';
import { useProfileById } from '@/hooks/useProfile';
import { useStats } from '@/hooks/useStats';
import { useUserId } from '@/store/auth';

export default function StatsScreen() {
  const params = useLocalSearchParams<{ userId?: string }>();
  const me = useUserId();
  const userId = params.userId ?? me;
  const isMe = userId === me;
  const owner = useProfileById(isMe ? null : userId);
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState<number | null>(thisYear);
  const stats = useStats(userId, year);
  const s = stats.data?.summary;

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <Stack.Screen options={{ title: isMe ? 'My stats' : owner.data ? `@${owner.data.username}’s stats` : 'Stats' }} />
      {stats.isLoading ? (
        <View className="gap-3 p-4">
          <Skeleton height={36} />
          <View className="flex-row gap-3">
            <Skeleton height={96} width="48%" />
            <Skeleton height={96} width="48%" />
          </View>
          <Skeleton height={120} />
          <Skeleton height={160} />
        </View>
      ) : stats.isError ? (
        <ErrorState error={stats.error} onRetry={stats.refetch} />
      ) : !stats.data || stats.data.years.length === 0 ? (
        <EmptyState icon={BarChart3} title="No stats yet" message="Log a few films and your stats appear here." />
      ) : (
        <ScrollView contentContainerClassName="pb-16">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4 py-3">
            {[...new Set([thisYear, ...stats.data.years])].map((y) => (
              <Chip key={y} label={String(y)} selected={year === y} onPress={() => setYear(y)} />
            ))}
            <Chip label="All time" selected={year === null} onPress={() => setYear(null)} />
          </ScrollView>

          {s && s.totalLogs === 0 ? (
            <EmptyState title={`Nothing logged in ${year}`} message="Pick another year above." />
          ) : s ? (
            <>
              <View className="flex-row flex-wrap gap-3 px-4">
                <StatCard label="Films" value={s.totalLogs} sub={`${s.uniqueFilms} unique · ${s.rewatches} rewatches`} />
                <StatCard label="Hours" value={s.hours} sub={`${s.totalMinutes.toLocaleString()} minutes`} />
                <StatCard label="Avg rating" value={s.averageRating != null ? `${s.averageRating}★` : '–'} sub={`${s.reviews} reviews · ${s.liked} hearts`} />
                <StatCard
                  label="Longest streak"
                  value={`${s.longestStreak}d`}
                  sub={s.favouriteWeekday != null ? `Favourite day: ${WEEKDAYS[s.favouriteWeekday]}` : undefined}
                />
              </View>

              {year != null ? (
                <Section title="Calendar">
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="px-4">
                    <Heatmap year={year} counts={s.heatmap} />
                  </ScrollView>
                </Section>
              ) : null}

              {year != null ? (
                <Section title="Films per month">
                  <View className="px-4">
                    <VBars values={s.perMonth} labels={MONTH_SHORT.map((m) => m[0])} />
                  </View>
                </Section>
              ) : null}

              <Section title="Ratings">
                <View className="px-4">
                  <RatingHistogram histogram={s.ratingDistribution} height={80} />
                </View>
              </Section>

              <Section title="Genres">
                <View className="px-4">
                  <HBars data={s.genres} />
                </View>
              </Section>

              <Section title="Decades">
                <View className="px-4">
                  <HBars data={s.decades} color="#7C3AED" />
                </View>
              </Section>

              <Section title="Top directors">
                <View className="px-4">
                  <HBars data={s.topDirectors} color="#0EA5E9" />
                </View>
              </Section>

              <Section title="Top actors">
                <View className="px-4">
                  <HBars data={s.topActors} color="#10B981" />
                </View>
              </Section>

              {isMe && year != null ? (
                <View className="mt-8 px-4">
                  <Button title={`See your ${year} Wrapped`} icon={<Gift size={18} color="#0E0F13" />} onPress={() => router.push({ pathname: '/wrapped', params: { year } })} />
                </View>
              ) : null}
              <Text variant="caption" className="mt-4 px-4 text-xs">
                Hours use TMDB runtimes; genres/people come from TMDB credits.
              </Text>
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
