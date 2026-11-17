import { Image } from 'expo-image';
import { View } from 'react-native';

import { palette } from '@/theme';
import { Text } from './Text';

const COLORS = ['#F5A524', '#7C3AED', '#0EA5E9', '#10B981', '#EF4444', '#EC4899', '#14B8A6', '#F97316'];

function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

interface AvatarProps {
  uri?: string | null;
  name: string;
  size?: number;
}

export function Avatar({ uri, name, size = 40 }: AvatarProps) {
  const style = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return <Image source={{ uri }} style={style} contentFit="cover" accessibilityLabel={`${name} avatar`} />;
  }
  return (
    <View
      style={[style, { backgroundColor: colorFor(name) }]}
      className="items-center justify-center"
      accessibilityLabel={`${name} avatar`}
    >
      <Text style={{ fontSize: size * 0.42, color: palette.dark.bg }} className="font-bold">
        {(name[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  );
}

/** Overlapping avatars (group members, likes). */
export function AvatarStack({ people, size = 28, max = 5 }: { people: { name: string; uri?: string | null }[]; size?: number; max?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <View className="flex-row items-center">
      {shown.map((p, i) => (
        <View
          key={`${p.name}-${i}`}
          style={{ marginLeft: i === 0 ? 0 : -size / 3, borderRadius: size, borderWidth: 2 }}
          className="border-bg dark:border-bg-dark"
        >
          <Avatar uri={p.uri} name={p.name} size={size} />
        </View>
      ))}
      {extra > 0 ? (
        <Text variant="caption" className="ml-2">
          +{extra}
        </Text>
      ) : null}
    </View>
  );
}
