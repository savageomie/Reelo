import { AlertTriangle, Film, type LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Button } from './Button';
import { Text } from './Text';

interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, message, icon: Icon = Film, actionLabel, onAction }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View className="flex-1 items-center justify-center gap-3 px-8 py-16" accessibilityRole="summary">
      <Icon size={40} color={colors.muted} />
      <Text variant="heading" className="text-center">
        {title}
      </Text>
      {message ? (
        <Text variant="caption" className="text-center">
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? <Button title={actionLabel} onPress={onAction} className="mt-2" /> : null}
    </View>
  );
}

interface ErrorStateProps {
  error?: unknown;
  onRetry?: () => void;
  title?: string;
}

export function errorMessage(error: unknown): string {
  if (!error) return 'Something went wrong.';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return 'Something went wrong.';
}

export function ErrorState({ error, onRetry, title = 'Could not load this' }: ErrorStateProps) {
  const { colors } = useTheme();
  return (
    <View className="flex-1 items-center justify-center gap-3 px-8 py-16" accessibilityRole="alert">
      <AlertTriangle size={40} color={colors.danger} />
      <Text variant="heading" className="text-center">
        {title}
      </Text>
      <Text variant="caption" className="text-center">
        {errorMessage(error)}
      </Text>
      {onRetry ? <Button title="Try again" variant="secondary" onPress={onRetry} className="mt-2" /> : null}
    </View>
  );
}
