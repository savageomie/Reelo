import { Pressable, View } from 'react-native';

import { Text } from './Text';

interface SectionProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}

/** Titled block used on Home, Film and Profile screens. */
export function Section({ title, actionLabel, onAction, children, className = '', padded = true }: SectionProps) {
  return (
    <View className={`mt-6 ${className}`}>
      <View className={`mb-3 flex-row items-center justify-between ${padded ? 'px-4' : ''}`}>
        <Text variant="heading">{title}</Text>
        {actionLabel && onAction ? (
          <Pressable accessibilityRole="button" onPress={onAction} hitSlop={10} className="min-h-[44px] justify-center">
            <Text className="text-sm font-semibold text-accent">{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}
