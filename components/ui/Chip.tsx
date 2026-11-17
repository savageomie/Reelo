import { Pressable } from 'react-native';

import { Text } from './Text';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  className?: string;
}

export function Chip({ label, selected, onPress, className = '' }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={label}
      onPress={onPress}
      disabled={!onPress}
      className={`min-h-[36px] items-center justify-center rounded-full border px-4 ${
        selected
          ? 'border-accent bg-accent'
          : 'border-line bg-surface dark:border-line-dark dark:bg-surface-dark'
      } ${className}`}
      hitSlop={4}
    >
      <Text className={`text-sm ${selected ? 'font-semibold text-[#0E0F13]' : ''}`}>{label}</Text>
    </Pressable>
  );
}
