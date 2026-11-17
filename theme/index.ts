import { useColorScheme } from 'nativewind';

import { palette } from './palette';

export { palette };

export const fonts = {
  display: 'DMSerifDisplay_400Regular',
  body: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;
/** Minimum touch target (accessibility, blueprint section 8). */
export const HIT = 44;

/** Resolved colours for the active scheme, for props that cannot take a className (icons, charts). */
export function useTheme() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme !== 'light';
  const c = isDark ? palette.dark : palette.light;
  return {
    isDark,
    colors: {
      ...c,
      accent: palette.accent,
      accentMuted: palette.accentMuted,
      danger: palette.danger,
      success: palette.success,
      star: palette.star,
    },
  };
}
