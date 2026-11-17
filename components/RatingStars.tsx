import * as Haptics from 'expo-haptics';
import { Star, StarHalf } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { View, type GestureResponderEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';

import { ratingFromPosition, ratingLabel, snapRating, starFills } from '@/features/diary/rating';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';

interface RatingStarsProps {
  value: number | null;
  onChange?: (value: number | null) => void;
  size?: number;
  testID?: string;
}

/**
 * Half-star rating (0.5 .. 5). Tap or drag across the stars; tapping the current value clears it.
 * Read-only when no onChange is given. Haptic tick + spring "pop" on change (blueprint section 8).
 */
export function RatingStars({ value, onChange, size = 32, testID }: RatingStarsProps) {
  const { colors } = useTheme();
  const haptics = useSettings((s) => s.hapticsEnabled);
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  const origin = useRef({ x: 0, width: 0 });
  const last = useRef<number | null>(value);
  useEffect(() => {
    last.current = value;
  }, [value]);
  const scale = useSharedValue(1);
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const fills = starFills(value);
  const cell = size + 4;
  const totalWidth = cell * 5;

  const measure = () =>
    ref.current?.measureInWindow((x: number, _y: number, width: number) => {
      origin.current = { x, width: width || totalWidth };
    });

  const update = (e: GestureResponderEvent, isTap: boolean) => {
    if (!onChange) return;
    const x = e.nativeEvent.pageX - origin.current.x;
    let next = ratingFromPosition(x, origin.current.width || totalWidth);
    if (isTap && next !== null && next === snapRating(last.current)) next = null; // tap same -> clear
    if (next === last.current) return;
    last.current = next;
    onChange(next);
    if (haptics) Haptics.selectionAsync().catch(() => {});
    scale.set(withSequence(withSpring(1.12, { damping: 8 }), withSpring(1, { damping: 10 })));
  };

  const stars = (
    <Animated.View style={pop} className="flex-row" pointerEvents="none">
      {fills.map((f, i) => (
        <View key={i} style={{ width: cell, alignItems: 'center' }} testID={`star-${i + 1}-${f}`}>
          {f === 'half' ? (
            <View>
              <Star size={size} color={colors.border} fill="transparent" />
              <View style={{ position: 'absolute' }}>
                <StarHalf size={size} color={colors.star} fill={colors.star} />
              </View>
            </View>
          ) : (
            <Star size={size} color={f === 'full' ? colors.star : colors.border} fill={f === 'full' ? colors.star : 'transparent'} />
          )}
        </View>
      ))}
    </Animated.View>
  );

  if (!onChange) {
    return (
      <View accessible accessibilityLabel={ratingLabel(value)} testID={testID}>
        {stars}
      </View>
    );
  }

  return (
    <View
      ref={ref}
      testID={testID}
      onLayout={measure}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Rating"
      accessibilityValue={{ text: ratingLabel(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const cur = snapRating(value) ?? 0;
        const next = e.nativeEvent.actionName === 'increment' ? Math.min(5, cur + 0.5) : cur - 0.5;
        last.current = snapRating(next);
        onChange(last.current);
      }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        measure();
        update(e, true);
      }}
      onResponderMove={(e) => update(e, false)}
      style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', width: totalWidth }}
    >
      {stars}
    </View>
  );
}
