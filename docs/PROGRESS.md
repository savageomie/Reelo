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

## Phase 1 — Auth, profiles, TMDB proxy, search, film page, log a film ✅

Plan: full SQL schema (all section 5 tables + RLS + triggers + SQL functions) as migrations, a PGlite test
harness that applies them and checks RLS with real accounts, the `tmdb` edge function with films_cache, the
pure algorithm modules (section 6) with Jest tests, then auth -> onboarding -> discover/search -> film -> log.

Done:
- `supabase/migrations/*` — every table from section 5 (+ film_stats, api_cache, blocks, reports), indexes,
  generated tsvector + GIN search, triggers (film stats, feed events, notifications, rate limits), RPCs
  (`get_feed`, `compute_taste_match`, `tally_ranked_choice`, `upsert_diary_entry`, groups, account deletion), pg_cron.
- `npm run test:db` — 41 checks in PGlite incl. two-account RLS, LWW, IRV parity with TS, cascade delete.
- `supabase/functions/tmdb` (cache-first proxy, whitelisted actions, poster palette) + `_shared` pure modules.
- Pure modules + tests: taste match, ranked choice, offline queue, feed cursor, recommendations, stats, rating, validation.
- Screens: welcome, sign up, log in (+Google), onboarding, discover, search results, film detail, person, log modal, Log tab.
- Offline queue runtime (`lib/offlineQueue.ts`) already used by logging and watchlist.
