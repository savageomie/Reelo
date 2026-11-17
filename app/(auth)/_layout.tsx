import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme';

export default function AuthLayout() {
  const session = useAuth((s) => s.session);
  const { colors } = useTheme();
  if (session) return <Redirect href="/" />;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerTitle: '',
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="log-in" />
    </Stack>
  );
}
