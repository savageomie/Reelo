import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Text } from './ui/Text';

interface Props {
  histogram: number[]; // 10 buckets: 0.5 .. 5
  height?: number;
  color?: string;
}

/** Letterboxd-style rating distribution bars (0.5★ .. 5★). */
export function RatingHistogram({ histogram, height = 56, color }: Props) {
  const { colors } = useTheme();
  const max = Math.max(1, ...histogram);
  const total = histogram.reduce((a, b) => a + b, 0);
  return (
    <View accessible accessibilityLabel={`Rating distribution from ${total} ratings`}>
      <View className="flex-row items-end gap-[3px]" style={{ height }}>
        {histogram.map((n, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: Math.max(2, (n / max) * height),
              backgroundColor: color ?? colors.accent,
              opacity: n ? 0.9 : 0.25,
              borderTopLeftRadius: 3,
              borderTopRightRadius: 3,
            }}
          />
        ))}
      </View>
      <View className="mt-1 flex-row justify-between">
        <Text variant="caption" className="text-xs">
          ½★
        </Text>
        <Text variant="caption" className="text-xs">
          ★★★★★
        </Text>
      </View>
    </View>
  );
}
