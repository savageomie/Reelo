import type { LucideIcon } from 'lucide-react-native';
import { Pressable } from 'react-native';

import { useTheme } from '@/theme';

interface IconButtonProps {
  icon: LucideIcon;
  label: string;
  onPress?: () => void;
  color?: string;
  fill?: string;
  size?: number;
  className?: string;
  disabled?: boolean;
}

/** Icon-only button with a 44pt touch target and an accessibility label (blueprint section 8). */
export function IconButton({ icon: Icon, label, onPress, color, fill, size = 22, className = '', disabled }: IconButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      className={`h-11 w-11 items-center justify-center rounded-full active:opacity-60 ${disabled ? 'opacity-40' : ''} ${className}`}
    >
      <Icon size={size} color={color ?? colors.text} fill={fill ?? 'transparent'} />
    </Pressable>
  );
}
