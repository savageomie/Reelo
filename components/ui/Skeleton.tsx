import { useEffect } from 'react';
import { View, type DimensionValue } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  rounded?: number;
  className?: string;
}

/** Pulsing placeholder block used by every screen's loading state. */
export function Skeleton({ width = '100%', height = 16, rounded = 8, className = '' }: SkeletonProps) {
  const opacity = useSharedValue(0.5);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      accessibilityLabel="Loading"
      style={[{ width, height, borderRadius: rounded }, style]}
      className={`bg-surface2 dark:bg-surface2-dark ${className}`}
    />
  );
}

/** Common skeleton layouts. */
export function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <View className="gap-4 p-4">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} className="flex-row gap-3">
          <Skeleton width={56} height={84} />
          <View className="flex-1 gap-2 pt-1">
            <Skeleton width="70%" />
            <Skeleton width="40%" height={12} />
            <Skeleton width="90%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function SkeletonPosterRow({ count = 4 }: { count?: number }) {
  return (
    <View className="flex-row gap-3 px-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} width={104} height={156} rounded={10} />
      ))}
    </View>
  );
}

export function SkeletonGrid({ count = 9 }: { count?: number }) {
  return (
    <View className="flex-row flex-wrap gap-3 p-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} width="30%" height={150} rounded={10} />
      ))}
    </View>
  );
}
