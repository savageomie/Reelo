import { router } from 'expo-router';
import { Clapperboard, Sparkles, Users } from 'lucide-react-native';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { palette } from '@/theme';

const POINTS = [
  { icon: Clapperboard, text: 'Log every film. Rate, review, build lists.' },
  { icon: Sparkles, text: 'See how your taste matches your friends.' },
  { icon: Users, text: 'Watch Together: vote live on what to watch.' },
];

export default function Welcome() {
  return (
    <Screen edges={['top', 'bottom']}>
      <View className="flex-1 justify-between px-6 pb-6 pt-16">
        <Animated.View entering={FadeInDown.duration(500)}>
          <Text variant="display" className="text-5xl text-accent">
            Reelo
          </Text>
          <Text variant="title" className="mt-2">
            Your taste is your identity.
          </Text>
          <View className="mt-10 gap-5">
            {POINTS.map(({ icon: Icon, text }, i) => (
              <Animated.View key={text} entering={FadeInDown.delay(150 + i * 120)} className="flex-row items-center gap-4">
                <View className="h-11 w-11 items-center justify-center rounded-full bg-surface2 dark:bg-surface2-dark">
                  <Icon size={22} color={palette.accent} />
                </View>
                <Text className="flex-1">{text}</Text>
              </Animated.View>
            ))}
          </View>
        </Animated.View>
        <View className="gap-3">
          <Button title="Create account" onPress={() => router.push('/sign-up')} />
          <Button title="I already have an account" variant="secondary" onPress={() => router.push('/log-in')} />
          <Text variant="caption" className="mt-2 text-center text-xs">
            Film data from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.
          </Text>
        </View>
      </View>
    </Screen>
  );
}
