import { Redirect, Tabs } from 'expo-router';
import { Compass, Home, PlusCircle, User, Users } from 'lucide-react-native';

import { useAuth } from '@/store/auth';
import { palette, useTheme } from '@/theme';

export default function TabsLayout() {
  const session = useAuth((s) => s.session);
  const initialized = useAuth((s) => s.initialized);
  const { colors } = useTheme();
  if (initialized && !session) return <Redirect href="/welcome" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, minHeight: 60 },
        tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 11 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color }) => <Home color={color} size={24} /> }} />
      <Tabs.Screen
        name="discover"
        options={{ title: 'Discover', tabBarIcon: ({ color }) => <Compass color={color} size={24} /> }}
      />
      <Tabs.Screen
        name="log"
        options={{
          title: 'Log',
          tabBarIcon: ({ color }) => <PlusCircle color={color} size={28} />,
          tabBarAccessibilityLabel: 'Log a film',
        }}
      />
      <Tabs.Screen
        name="together"
        options={{ title: 'Together', tabBarIcon: ({ color }) => <Users color={color} size={24} /> }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <User color={color} size={24} /> }} />
    </Tabs>
  );
}
