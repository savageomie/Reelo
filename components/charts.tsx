import { View } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

import { heatLevel, heatmapGrid, MONTH_SHORT, type Ranked } from '@/features/stats/computeStats';
import { useTheme } from '@/theme';
import { Text } from './ui/Text';

/** GitHub-style calendar heatmap of films watched per day (react-native-svg). */
export function Heatmap({ year, counts, cell = 11, gap = 3 }: { year: number; counts: Record<string, number>; cell?: number; gap?: number }) {
  const { colors } = useTheme();
  const weeks = heatmapGrid(year, counts);
  const max = Math.max(1, ...Object.values(counts));
  const shades = [colors.surface2, `${colors.accent}55`, `${colors.accent}88`, `${colors.accent}BB`, colors.accent];
  const width = weeks.length * (cell + gap);
  const height = 7 * (cell + gap) + 14;
  const total = Object.entries(counts).filter(([d]) => d.startsWith(String(year))).reduce((a, [, n]) => a + n, 0);
  // Label a week column when its first day starts a new month.
  const monthStarts: { i: number; d: string }[] = [];
  let lastMonth = '';
  weeks.forEach((w, i) => {
    const d = w.find((c) => c.date)?.date;
    if (d && d.slice(5, 7) !== lastMonth) {
      lastMonth = d.slice(5, 7);
      monthStarts.push({ i, d });
    }
  });

  return (
    <View accessible accessibilityLabel={`Heatmap: ${total} films watched in ${year}`}>
      <Svg width={width} height={height}>
        {monthStarts.map(({ i, d }) => (
          <SvgText key={`m${i}`} x={i * (cell + gap)} y={10} fontSize={9} fill={colors.muted}>
            {MONTH_SHORT[Number(d.slice(5, 7)) - 1]}
          </SvgText>
        ))}
        {weeks.map((week, wi) =>
          week.map((c, di) =>
            c.date ? (
              <Rect
                key={c.date}
                x={wi * (cell + gap)}
                y={14 + di * (cell + gap)}
                width={cell}
                height={cell}
                rx={2}
                fill={shades[heatLevel(c.count, max)]}
              />
            ) : null,
          ),
        )}
      </Svg>
    </View>
  );
}

/** Horizontal bars for ranked lists (genres, directors, actors, decades). */
export function HBars({ data, color }: { data: Ranked[]; color?: string }) {
  const { colors } = useTheme();
  const max = Math.max(1, ...data.map((d) => d.count));
  if (!data.length) return <Text variant="caption">Not enough data yet.</Text>;
  return (
    <View className="gap-2">
      {data.map((d) => (
        <View key={d.key} className="gap-1" accessible accessibilityLabel={`${d.name}: ${d.count}`}>
          <View className="flex-row justify-between">
            <Text className="text-sm" numberOfLines={1}>
              {d.name}
            </Text>
            <Text variant="caption" className="text-sm">
              {d.count}
            </Text>
          </View>
          <View className="h-2 overflow-hidden rounded-full bg-surface2 dark:bg-surface2-dark">
            <View style={{ width: `${(d.count / max) * 100}%`, backgroundColor: color ?? colors.accent }} className="h-2 rounded-full" />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Vertical bars with labels (films per month). */
export function VBars({ values, labels, height = 110 }: { values: number[]; labels: string[]; height?: number }) {
  const { colors } = useTheme();
  const max = Math.max(1, ...values);
  return (
    <View accessible accessibilityLabel={labels.map((l, i) => `${l} ${values[i]}`).join(', ')}>
      <View className="flex-row items-end gap-1" style={{ height }}>
        {values.map((v, i) => (
          <View key={i} className="flex-1 items-center justify-end" style={{ height }}>
            {v ? (
              <Text variant="caption" className="text-[9px]">
                {v}
              </Text>
            ) : null}
            <View style={{ height: Math.max(2, (v / max) * (height - 14)), backgroundColor: v ? colors.accent : colors.border }} className="w-full rounded-t" />
          </View>
        ))}
      </View>
      <View className="mt-1 flex-row gap-1">
        {labels.map((l, i) => (
          <Text key={i} variant="caption" className="flex-1 text-center text-[9px]">
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <View className="min-w-[46%] flex-1 rounded-2xl bg-surface p-4 dark:bg-surface-dark" accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="label">{label}</Text>
      <Text variant="display" className="mt-1">
        {value}
      </Text>
      {sub ? (
        <Text variant="caption" className="text-xs">
          {sub}
        </Text>
      ) : null}
    </View>
  );
}
