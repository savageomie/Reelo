import { Text as RNText, type TextProps } from 'react-native';

export type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'caption' | 'label';

const variants: Record<TextVariant, string> = {
  display: 'font-display text-3xl text-ink dark:text-ink-dark',
  title: 'font-display text-2xl text-ink dark:text-ink-dark',
  heading: 'font-semibold text-lg text-ink dark:text-ink-dark',
  body: 'font-sans text-base text-ink dark:text-ink-dark',
  caption: 'font-sans text-sm text-muted dark:text-muted-dark',
  label: 'font-medium text-xs uppercase tracking-wider text-muted dark:text-muted-dark',
};

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  className?: string;
}

export function Text({ variant = 'body', className = '', ...rest }: AppTextProps) {
  return <RNText maxFontSizeMultiplier={1.6} className={`${variants[variant]} ${className}`} {...rest} />;
}
