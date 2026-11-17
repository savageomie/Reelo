import { TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme';
import { Text } from './Text';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string | null;
  hint?: string;
  className?: string;
  maxLengthCounter?: boolean;
}

export function Input({ label, error, hint, className = '', multiline, maxLength, maxLengthCounter, value, ...rest }: InputProps) {
  const { colors } = useTheme();
  return (
    <View className={`gap-1.5 ${className}`}>
      {label ? <Text variant="label">{label}</Text> : null}
      <TextInput
        value={value}
        multiline={multiline}
        maxLength={maxLength}
        placeholderTextColor={colors.muted}
        accessibilityLabel={label ?? rest.placeholder}
        className={`min-h-[44px] rounded-xl border bg-surface px-4 py-3 font-sans text-base text-ink dark:bg-surface-dark dark:text-ink-dark ${
          error ? 'border-danger' : 'border-line dark:border-line-dark'
        } ${multiline ? 'min-h-[110px]' : ''}`}
        style={multiline ? { textAlignVertical: 'top' } : undefined}
        {...rest}
      />
      <View className="flex-row justify-between">
        {error ? (
          <Text className="text-sm text-danger">{error}</Text>
        ) : hint ? (
          <Text variant="caption" className="text-xs">
            {hint}
          </Text>
        ) : (
          <View />
        )}
        {maxLengthCounter && maxLength ? (
          <Text variant="caption" className="text-xs">
            {(value ?? '').length}/{maxLength}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
