import Constants from 'expo-constants';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Text } from '@/components/ui/Text';

// Official TMDB logo (https://www.themoviedb.org/about/logos-attribution). Loaded remotely; if it can't load,
// a wordmark in TMDB's brand colours is shown instead.
const TMDB_LOGO = 'https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg';

const LIBRARIES = [
  ['Expo / Expo Router', 'MIT'],
  ['React Native', 'MIT'],
  ['React', 'MIT'],
  ['NativeWind', 'MIT'],
  ['Tailwind CSS', 'MIT'],
  ['React Native Reanimated', 'MIT'],
  ['React Native Gesture Handler', 'MIT'],
  ['FlashList (Shopify)', 'MIT'],
  ['expo-image', 'MIT'],
  ['react-native-svg', 'MIT'],
  ['TanStack Query', 'MIT'],
  ['Zustand', 'MIT'],
  ['react-native-mmkv', 'MIT'],
  ['Supabase JS', 'MIT'],
  ['Lucide icons', 'ISC'],
  ['DM Serif Display & Inter (Google Fonts)', 'OFL 1.1'],
  ['react-native-view-shot', 'MIT'],
  ['jpeg-js (edge function)', 'BSD-3-Clause'],
];

/** About + TMDB attribution (blueprint section 17). */
export default function About() {
  const [logoFailed, setLogoFailed] = useState(false);
  return (
    <ScrollView className="flex-1 bg-bg dark:bg-bg-dark" contentContainerClassName="gap-5 p-5 pb-16">
      <View className="items-center gap-1">
        <Text variant="display" className="text-accent">
          Reelo
        </Text>
        <Text variant="caption">Version {Constants.expoConfig?.version ?? '1.0.0'}</Text>
        <Text className="mt-2 text-center">A social movie diary where your taste is your identity.</Text>
      </View>

      <View className="items-center gap-3 rounded-2xl bg-surface p-5 dark:bg-surface-dark">
        {logoFailed ? (
          <View className="rounded-lg px-4 py-2" style={{ backgroundColor: '#0d253f' }} accessibilityLabel="TMDB logo">
            <Text className="text-2xl font-bold" style={{ color: '#01b4e4' }}>
              TMDB
            </Text>
          </View>
        ) : (
          <Image
            source={{ uri: TMDB_LOGO }}
            style={{ width: 180, height: 26 }}
            contentFit="contain"
            accessibilityLabel="The Movie Database (TMDB) logo"
            onError={() => setLogoFailed(true)}
          />
        )}
        <Text className="text-center font-semibold">This product uses the TMDB API but is not endorsed or certified by TMDB.</Text>
        <Text variant="caption" className="text-center">
          Film metadata, posters, cast and crew are provided by The Movie Database. Streaming availability is provided to TMDB by JustWatch.
        </Text>
        <Pressable accessibilityRole="link" onPress={() => WebBrowser.openBrowserAsync('https://www.themoviedb.org/')} className="min-h-[44px] justify-center">
          <Text className="font-semibold text-accent">themoviedb.org</Text>
        </Pressable>
      </View>

      <View className="gap-2">
        <Text variant="heading">Open-source licences</Text>
        {LIBRARIES.map(([name, licence]) => (
          <View key={name} className="flex-row justify-between border-b border-line py-2 dark:border-line-dark">
            <Text className="flex-1 text-sm">{name}</Text>
            <Text variant="caption" className="text-sm">
              {licence}
            </Text>
          </View>
        ))}
      </View>
      <Text variant="caption" className="text-center text-xs">
        Built as a final-year lab project with Expo and Supabase.
      </Text>
    </ScrollView>
  );
}
