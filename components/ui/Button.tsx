import { ActivityIndicator, Pressable, type PressableProps, View } from 'react-native';

import { palette } from '@/theme';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const base = 'min-h-[44px] flex-row items-center justify-center rounded-xl px-5 py-3';
const styles: Record<Variant, { box: string; text: string }> = {
  primary: { box: 'bg-accent', text: 'text-[#0E0F13] font-semibold' },
  secondary: {
    box: 'bg-surface2 dark:bg-surface2-dark border border-line dark:border-line-dark',
    text: 'text-ink dark:text-ink-dark font-semibold',
  },
  ghost: { box: 'bg-transparent', text: 'text-accent font-semibold' },
  danger: { box: 'bg-danger', text: 'text-white font-semibold' },
};

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  title: string;
  variant?: Variant;
  loading?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

export function Button({
  title,
  variant = 'primary',
  loading,
  disabled,
  icon,
  className = '',
  ...rest
}: ButtonProps) {
  const s = styles[variant];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      className={`${base} ${s.box} ${isDisabled ? 'opacity-50' : 'active:opacity-80'} ${className}`}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#0E0F13' : palette.accent} />
      ) : (
        <View className="flex-row items-center gap-2">
          {icon}
          <Text className={s.text}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}
