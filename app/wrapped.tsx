import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { Share2, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, ScrollView, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { HBars } from '@/components/charts';
import { Poster } from '@/components/PosterCard';
import { IconButton } from '@/components/ui/IconButton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { MONTH_SHORT } from '@/features/stats/computeStats';
import { tastePersona } from '@/features/stats/persona';
import { useMyProfile } from '@/hooks/useProfile';
import { useStats } from '@/hooks/useStats';
import { useUserId } from '@/store/auth';
import { palette } from '@/theme';

const { width: W } = Dimensions.get('window');
const BGS = ['#1B1035', '#0B2A3A', '#3A1020', '#10301E', '#2E220A', '#1A1A2E', '#0E0F13'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Yearly Wrapped: swipeable story cards, each exportable as an image (P2). */
export default function Wrapped() {
  const params = useLocalSearchParams<{ year?: string }>();
  const year = Number(params.year) || new Date().getFullYear();
  const me = useUserId();
  const profile = useMyProfile();
  const stats = useStats(me, year);
  const [page, setPage] = useState(0);
  const refs = useRef<(React.ComponentRef<typeof View> | null)[]>([]);
  const s = stats.data?.summary;

  const share = async () => {
    try {
      const uri = await captureRef(refs.current[page] as never, { format: 'png', quality: 1 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { dialogTitle: `My ${year} in film` });
      else toast('Sharing is not available on this device', 'error');
    } catch {
      toast('Could not create the image', 'error');
    }
  };

  const close = (
    <View className="absolute right-2 top-2 z-10 flex-row">
      <IconButton icon={Share2} label="Share this card" color="#fff" onPress={share} />
      <IconButton icon={X} label="Close" color="#fff" onPress={() => router.back()} />
    </View>
  );

  if (stats.isLoading)
    return (
      <View className="flex-1 items-center justify-center bg-bg-dark">
        <ActivityIndicator color={palette.accent} />
        <Text className="mt-3 text-white">Rewinding your year…</Text>
      </View>
    );
  if (stats.isError)
    return (
      <SafeAreaView className="flex-1 bg-bg dark:bg-bg-dark">
        <ErrorState error={stats.error} onRetry={stats.refetch} />
      </SafeAreaView>
    );
  if (!s || s.totalLogs === 0)
    return (
      <SafeAreaView className="flex-1 bg-bg dark:bg-bg-dark">
        {close}
        <EmptyState title={`No films logged in ${year}`} message="Log films through the year and your Wrapped builds itself." actionLabel="Close" onAction={() => router.back()} />
      </SafeAreaView>
    );

  const persona = tastePersona(s);
  const films = stats.data!.films;
  const cards: React.ReactNode[] = [
    <>
      <Text className="text-lg text-white/70">@{profile.data?.username}</Text>
      <Text variant="display" className="text-6xl text-white">
        {year}
      </Text>
      <Text variant="title" className="text-white">
        in film
      </Text>
      <Text className="mt-8 text-white/70">Swipe →</Text>
    </>,
    <>
      <Text className="text-white/70">You watched</Text>
      <Text variant="display" className="text-7xl text-accent">
        {s.totalLogs}
      </Text>
      <Text variant="title" className="text-white">
        films
      </Text>
      <Text className="mt-6 text-lg text-white">
        That’s <Text className="text-lg font-bold text-accent">{s.hours} hours</Text> of cinema.
      </Text>
      <Text className="mt-2 text-white/70">
        {s.uniqueFilms} different films · {s.rewatches} rewatches · {s.reviews} reviews
      </Text>
    </>,
    <>
      <Text className="text-white/70">Your top genre</Text>
      <Text variant="display" className="text-5xl text-accent">
        {s.genres[0]?.name ?? '—'}
      </Text>
      <View className="mt-8 w-full">
        <HBars data={s.genres.slice(0, 5)} color={palette.accent} />
      </View>
    </>,
    <>
      <Text className="text-white/70">Your most-watched director</Text>
      <Text variant="display" className="text-4xl text-white">
        {s.topDirectors[0]?.name ?? '—'}
      </Text>
      <Text className="text-white/70">{s.topDirectors[0] ? `${s.topDirectors[0].count} films` : ''}</Text>
      <Text className="mt-10 text-white/70">…and the face you saw most</Text>
      <Text variant="display" className="text-4xl text-accent">
        {s.topActors[0]?.name ?? '—'}
      </Text>
    </>,
    <>
      <Text className="text-white/70">Your busiest month</Text>
      <Text variant="display" className="text-5xl text-white">
        {s.busiestMonth != null ? MONTHS_LONG[s.busiestMonth] : '—'}
      </Text>
      <Text className="text-white/70">{s.busiestMonth != null ? `${s.perMonth[s.busiestMonth]} films` : ''}</Text>
      <View className="mt-8 flex-row items-end gap-1" style={{ height: 90 }}>
        {s.perMonth.map((v, i) => (
          <View key={i} className="items-center" style={{ width: (W - 96) / 12 }}>
            <View style={{ height: Math.max(3, (v / Math.max(1, ...s.perMonth)) * 80) }} className={`w-full rounded-t ${i === s.busiestMonth ? 'bg-accent' : 'bg-white/30'}`} />
            <Text className="text-[9px] text-white/60">{MONTH_SHORT[i][0]}</Text>
          </View>
        ))}
      </View>
      <Text className="mt-6 text-white">
        Longest streak: <Text className="font-bold text-accent">{s.longestStreak} days</Text> in a row
      </Text>
    </>,
    <>
      <Text className="text-white/70">Your highest rated</Text>
      <View className="mt-6 flex-row flex-wrap justify-center gap-3">
        {s.topRated.map((t) => (
          <View key={t.tmdbId} className="items-center">
            <Poster posterPath={films.get(t.tmdbId)?.posterPath} title={films.get(t.tmdbId)?.title ?? ''} width={86} size="w185" />
            <Text className="mt-1 text-xs text-accent">{'★'.repeat(Math.floor(t.rating))}{t.rating % 1 ? '½' : ''}</Text>
          </View>
        ))}
      </View>
    </>,
    <>
      <Text className="text-white/70">Your taste persona</Text>
      <Text variant="display" className="text-center text-5xl text-accent">
        {persona.name}
      </Text>
      <Text className="mt-4 text-center text-lg text-white">{persona.blurb}</Text>
      <View className="mt-10 flex-row gap-6">
        <View className="items-center">
          <Text className="text-3xl font-bold text-white">{s.totalLogs}</Text>
          <Text className="text-xs text-white/60">films</Text>
        </View>
        <View className="items-center">
          <Text className="text-3xl font-bold text-white">{s.hours}</Text>
          <Text className="text-xs text-white/60">hours</Text>
        </View>
        <View className="items-center">
          <Text className="text-3xl font-bold text-white">{s.averageRating ?? '–'}</Text>
          <Text className="text-xs text-white/60">avg ★</Text>
        </View>
      </View>
      <Text className="mt-10 text-xs text-white/50">reelo · {year} Wrapped</Text>
    </>,
  ];

  return (
    <View className="flex-1 bg-black">
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / W))}
      >
        {cards.map((content, i) => (
          <View
            key={i}
            ref={(r) => {
              refs.current[i] = r;
            }}
            collapsable={false}
            style={{ width: W, backgroundColor: BGS[i % BGS.length] }}
          >
            <SafeAreaView className="flex-1 items-center justify-center px-8">
              {page === i ? (
                <Animated.View entering={FadeInUp.duration(500)} className="w-full items-center">
                  {content}
                </Animated.View>
              ) : (
                <View className="w-full items-center">{content}</View>
              )}
            </SafeAreaView>
          </View>
        ))}
      </ScrollView>
      <SafeAreaView className="absolute left-0 right-0 top-0" pointerEvents="box-none">
        <View className="flex-row gap-1 px-3 pt-2">
          {cards.map((_, i) => (
            <View key={i} className={`h-1 flex-1 rounded-full ${i <= page ? 'bg-white' : 'bg-white/25'}`} />
          ))}
        </View>
        {close}
      </SafeAreaView>
    </View>
  );
}
