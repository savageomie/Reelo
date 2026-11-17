import * as Haptics from 'expo-haptics';
import { Check, X } from 'lucide-react-native';
import { Dimensions, Pressable, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import type { Film } from '@/lib/types';
import { Poster } from './PosterCard';
import { Text } from './ui/Text';

const { width: W } = Dimensions.get('window');
const THRESHOLD = W * 0.28;

interface Props {
  pickId: string;
  film: Film | undefined;
  onVote: (pickId: string, value: 0 | 1) => void;
  remaining: number;
}

/** Tinder-style swipe card: right = yes, left = no. Buttons do the same for accessibility. */
export function SwipeDeck({ pickId, film, onVote, remaining }: Props) {
  const tx = useSharedValue(0);
  const rot = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { rotate: `${(tx.value / W) * 18}deg` }],
  }));
  const yesStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, tx.value / THRESHOLD)) }));
  const noStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, -tx.value / THRESHOLD)) }));

  const commit = (value: 0 | 1) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    tx.set(withTiming(value ? W * 1.5 : -W * 1.5, { duration: 220 }));
    setTimeout(() => {
      onVote(pickId, value);
      tx.set(0);
    }, 230);
  };

  const pan = usePanGesture({
    runOnJS: true,
    onUpdate: (e) => {
      tx.set(e.translationX);
    },
    onDeactivate: (e) => {
      if (e.translationX > THRESHOLD) commit(1);
      else if (e.translationX < -THRESHOLD) commit(0);
      else tx.set(withSpring(0));
    },
  });

  return (
    <View className="items-center gap-6">
      <Text variant="caption">{remaining} left to vote on</Text>
      <GestureDetector gesture={pan}>
        <Animated.View style={[rot, { width: W * 0.72 }]} className="items-center rounded-3xl bg-surface p-3 shadow-lg dark:bg-surface-dark">
          <Poster posterPath={film?.poster_path} title={film?.title ?? '…'} width={W * 0.72 - 24} size="w500" rounded={16} />
          <Text variant="heading" className="mt-3 text-center" numberOfLines={2}>
            {film?.title ?? '…'}
          </Text>
          <Text variant="caption">{[film?.year, film?.runtime ? `${film.runtime} min` : null].filter(Boolean).join(' · ')}</Text>
          <Animated.View style={[yesStyle, { position: 'absolute', top: 24, left: 24 }]} className="rounded-lg border-4 border-success px-3 py-1">
            <Text className="text-2xl font-bold text-success">YES</Text>
          </Animated.View>
          <Animated.View style={[noStyle, { position: 'absolute', top: 24, right: 24 }]} className="rounded-lg border-4 border-danger px-3 py-1">
            <Text className="text-2xl font-bold text-danger">NOPE</Text>
          </Animated.View>
        </Animated.View>
      </GestureDetector>
      <View className="flex-row gap-10">
        <Pressable accessibilityRole="button" accessibilityLabel={`No to ${film?.title ?? 'this film'}`} onPress={() => commit(0)} className="h-16 w-16 items-center justify-center rounded-full border-2 border-danger">
          <X size={30} color="#EF4444" />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Yes to ${film?.title ?? 'this film'}`} onPress={() => commit(1)} className="h-16 w-16 items-center justify-center rounded-full border-2 border-success">
          <Check size={30} color="#22C55E" />
        </Pressable>
      </View>
    </View>
  );
}
