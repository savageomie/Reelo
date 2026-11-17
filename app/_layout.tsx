import '../global.css';
import 'react-native-url-polyfill/auto';

import { DMSerifDisplay_400Regular } from '@expo-google-fonts/dm-serif-display';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { colorScheme } from 'nativewind';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { OfflineBanner } from '@/components/OfflineBanner';
import { ErrorState } from '@/components/ui/States';
import { ToastHost } from '@/components/ui/Toast';
import { startOfflineSync } from '@/lib/offlineQueue';
import { startPushRegistration } from '@/lib/push';
import { queryClient } from '@/lib/queryClient';
import { startAuthListener, useAuth } from '@/store/auth';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

/** Route-level crash screen (Expo Router picks up this export for every route below the root). */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={{ flex: 1 }} className="bg-bg dark:bg-bg-dark">
      <ErrorState title="Something broke" error={error} onRetry={retry} />
    </View>
  );
}

function ThemedStack() {
  const { isDark, colors } = useTheme();
  const session = useAuth((s) => s.session);

  useEffect(() => {
    if (session) {
      startOfflineSync();
      startPushRegistration(session.user.id);
    }
  }, [session]);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: 'Inter_600SemiBold' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
          headerBackButtonDisplayMode: 'minimal',
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="film/[id]" options={{ title: '', headerTransparent: true }} />
        <Stack.Screen name="person/[id]" options={{ title: '' }} />
        <Stack.Screen name="user/[username]" options={{ title: '' }} />
        <Stack.Screen name="log/[tmdbId]" options={{ presentation: 'modal', title: 'Log film' }} />
        <Stack.Screen name="search" options={{ title: 'Search' }} />
        <Stack.Screen name="diary/index" options={{ title: 'Diary' }} />
        <Stack.Screen name="diary/[entryId]" options={{ title: 'Review' }} />
        <Stack.Screen name="watchlist" options={{ title: 'Watchlist' }} />
        <Stack.Screen name="lists/index" options={{ title: 'Lists' }} />
        <Stack.Screen name="list/[id]" options={{ title: 'List' }} />
        <Stack.Screen name="list/new" options={{ presentation: 'modal', title: 'New list' }} />
        <Stack.Screen name="list/edit/[id]" options={{ presentation: 'modal', title: 'Edit list' }} />
        <Stack.Screen name="edit-profile" options={{ presentation: 'modal', title: 'Edit profile' }} />
        <Stack.Screen name="follows/[userId]" options={{ title: '' }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="group/new" options={{ presentation: 'modal', title: 'Watch Together' }} />
        <Stack.Screen name="group/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="group/[id]/vote" options={{ title: 'Vote', gestureEnabled: false }} />
        <Stack.Screen name="group/[id]/result" options={{ title: 'Result' }} />
        <Stack.Screen name="stats" options={{ title: 'Stats' }} />
        <Stack.Screen name="wrapped" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="import" options={{ title: 'Import from Letterboxd' }} />
        <Stack.Screen name="about" options={{ title: 'About' }} />
      </Stack>
      <OfflineBanner />
      <ToastHost />
    </>
  );
}

export default function RootLayout() {
  const theme = useSettings((s) => s.theme);
  const [fontsLoaded, fontError] = useFonts({
    DMSerifDisplay_400Regular,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    startAuthListener();
  }, []);

  useEffect(() => {
    colorScheme.set(theme);
  }, [theme]);

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemedStack />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
