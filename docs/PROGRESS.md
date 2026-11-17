# Reelo — build progress

Resume from here if interrupted. Checks for every phase: `npm run lint`, `npm run typecheck`, `npm test`,
plus `npx expo export --platform android` to prove the bundle builds.

## Phase 0 — Setup ✅

Plan: Expo SDK 58 app with Expo Router (root `app/`), NativeWind, fonts, theme tokens, providers
(QueryClient, gesture handler, safe area), storage abstraction, env config, CLAUDE.md, ESLint, Jest, CI.

Done:
- Expo app scaffolded, all stack libraries installed with `npx expo install`.
- `CLAUDE.md`, `.env.example`, `.gitignore` (ignores `.env`), `.github/workflows/ci.yml`.
- Theme tokens (`theme/palette.js`), Tailwind config, dark/light via NativeWind class strategy.
- UI primitives: Text, Button, Screen, Skeleton, EmptyState/ErrorState.
- `lib/storage.ts` (MMKV → AsyncStorage fallback), `lib/env.ts`, `lib/queryClient.ts`.
- Supabase project: cannot be created without credentials — see docs/HANDOFF.md.
