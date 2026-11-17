import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { useMyProfile } from '@/hooks/useProfile';
import { isConfigured } from '@/lib/env';
import { useAuth } from '@/store/auth';
import { palette } from '@/theme';

/** Entry gate: setup check -> auth -> onboarding -> tabs. */
export default function Index() {
  const { session, initialized } = useAuth();
  const profile = useMyProfile();

  if (!isConfigured) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Text variant="display">Reelo</Text>
          <Text variant="heading" className="text-center">
            Setup required
          </Text>
          <Text variant="caption" className="text-center">
            Copy .env.example to .env, add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart
            `npx expo start`. See docs/HANDOFF.md.
          </Text>
        </View>
      </Screen>
    );
  }

  if (!initialized || (session && profile.isLoading)) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-4">
          <Text variant="display">Reelo</Text>
          <ActivityIndicator color={palette.accent} />
        </View>
      </Screen>
    );
  }

  if (!session) return <Redirect href="/welcome" />;
  if (profile.isError) return <ErrorState error={profile.error} onRetry={() => profile.refetch()} />;
  if (profile.data && !profile.data.onboarded) return <Redirect href="/onboarding" />;
  return <Redirect href="/home" />;
}
