import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { tasteLabel } from '@/features/recs/tasteMatch';
import { useTheme } from '@/theme';
import { Skeleton } from './ui/Skeleton';
import { Text } from './ui/Text';

interface Props {
  score: number | null | undefined;
  overlap: number | undefined;
  loading?: boolean;
  username: string;
}

/** Ring showing taste match % with the number of films both users rated. */
export function TasteMatchCard({ score, overlap = 0, loading, username }: Props) {
  const { colors } = useTheme();
  if (loading) return <Skeleton height={88} rounded={14} />;
  const size = 64;
  const r = 28;
  const c = 2 * Math.PI * r;
  const pct = score ?? 0;
  return (
    <View
      className="flex-row items-center gap-4 rounded-2xl bg-surface p-4 dark:bg-surface-dark"
      accessible
      accessibilityLabel={score == null ? 'No taste match yet' : `Taste match ${score} percent over ${overlap} films`}
    >
      <View style={{ width: size, height: size }} className="items-center justify-center">
        <Svg width={size} height={size} style={{ position: 'absolute' }}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.border} strokeWidth={6} fill="none" />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={colors.accent}
            strokeWidth={6}
            fill="none"
            strokeDasharray={`${(pct / 100) * c} ${c}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <Text className="font-bold">{score == null ? '–' : `${score}%`}</Text>
      </View>
      <View className="flex-1">
        <Text variant="label">Taste match with @{username}</Text>
        <Text className="font-semibold">{tasteLabel({ score: score ?? null, overlap })}</Text>
        <Text variant="caption" className="text-xs">
          Based on {overlap} film{overlap === 1 ? '' : 's'} you both rated
        </Text>
      </View>
    </View>
  );
}
