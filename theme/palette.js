/**
 * Reelo design tokens (single source of truth).
 * Plain CommonJS so tailwind.config.js and the TypeScript app can both import it.
 * Dark-first cinema look with one accent colour (amber "projector light").
 */
const palette = {
  accent: '#F5A524',
  accentMuted: '#B77A12',
  danger: '#EF4444',
  success: '#22C55E',
  star: '#F5A524',
  dark: {
    bg: '#0E0F13',
    surface: '#171920',
    surface2: '#21242C',
    border: '#2C303A',
    text: '#F2F3F5',
    muted: '#9AA0AC',
  },
  light: {
    bg: '#FAFAF7',
    surface: '#FFFFFF',
    surface2: '#EFEFEA',
    border: '#E1E1DB',
    text: '#121318',
    muted: '#5F6573',
  },
};

module.exports = { palette };
