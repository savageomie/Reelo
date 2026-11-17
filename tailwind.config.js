const { palette } = require('./theme/palette');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './features/**/*.{ts,tsx}'],
  darkMode: 'class',
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        accent: { DEFAULT: palette.accent, muted: palette.accentMuted },
        danger: palette.danger,
        success: palette.success,
        bg: { DEFAULT: palette.light.bg, dark: palette.dark.bg },
        surface: { DEFAULT: palette.light.surface, dark: palette.dark.surface },
        surface2: { DEFAULT: palette.light.surface2, dark: palette.dark.surface2 },
        line: { DEFAULT: palette.light.border, dark: palette.dark.border },
        ink: { DEFAULT: palette.light.text, dark: palette.dark.text },
        muted: { DEFAULT: palette.light.muted, dark: palette.dark.muted },
      },
      fontFamily: {
        display: ['DMSerifDisplay_400Regular'],
        sans: ['Inter_400Regular'],
        medium: ['Inter_500Medium'],
        semibold: ['Inter_600SemiBold'],
        bold: ['Inter_700Bold'],
      },
    },
  },
  plugins: [],
};
