# Decisions log

Choices made while building Reelo autonomously where the blueprint was silent or ambiguous.
Each entry: what was decided, and why. (★ = worth knowing for the viva.)

## Platform & tooling

- **D-001 Expo SDK 58 (latest stable on 2026-11-17).** React Native 0.88, React 19.3, TypeScript 6.
  All Expo packages added with `npx expo install` so versions match the SDK.
- **D-002 Routes live in root `app/`** (blueprint section 9), not `src/app/` (the newer Expo template default). Expo Router supports both.
- **D-003 ★ MMKV with AsyncStorage fallback.** MMKV (v4, Nitro modules) is not bundled in Expo Go, and the
  blueprint requires an Expo Go demo. `lib/storage.ts` tries MMKV first and falls back to AsyncStorage when
  the native module is missing. The APK / dev build uses MMKV; Expo Go uses AsyncStorage. The offline queue and
  persisted settings use the same async `KVStore` interface either way.
- **D-004 NativeWind v4.2 + Tailwind v3.4** (NativeWind v5 is still a release candidate). Dark mode uses
  `darkMode: 'class'` and NativeWind's `colorScheme.set()`, driven by the theme preference in Settings
  (`system` / `dark` / `light`, default dark: "dark-first"). Colours that cannot be classNames (icons, charts,
  navigation headers) come from `useTheme()` which reads the same `theme/palette.js` tokens.
- **D-005 Fonts:** DM Serif Display (titles) + Inter (body), both Google Fonts (OFL). **Icons:** Lucide (ISC).
- **D-006 Charts with react-native-svg directly** (heatmap, bars) instead of Victory Native, to avoid
  Skia (not needed for these simple charts) and keep the bundle small.

## Database & security

- **D-007 ★ All tables written up front in Phase 1** (one migration per area) so RLS could be designed and tested
  as a whole. Extra tables beyond section 5: `film_stats` (Reelo average + histogram), `api_cache` (TMDB list
  cache, no client access), `blocks`, `reports` (section 11 moderation).
- **D-008 ★ RLS tested automatically with PGlite** (Postgres compiled to WASM) — `npm run test:db` applies the real
  migrations to a stub of Supabase's `auth` schema/roles and runs two-/three-account checks. No Docker needed; runs in CI.
- **D-009 ★ Private profiles use follow requests.** Following a private user inserts a `pending` follow (status set by a
  trigger, not the client). Only accepted followers pass `can_view_user()`, so "followers can read private diaries"
  cannot be bypassed by just following. The followed user accepts by updating the row (only they can).
- **D-010 Visibility helpers are SECURITY DEFINER** (`can_view_user`, `is_group_member`, ...) with `search_path` pinned,
  so policies don't recurse through other tables' RLS. They only answer yes/no for `auth.uid()`.
- **D-011 ★ `get_feed`, `compute_taste_match` are SECURITY INVOKER** so RLS still applies inside them: the feed can't leak
  private diaries, and taste match can't compare against a private diary you can't see.
- **D-012 Feed events are written by triggers only** (no insert policy). `created_at` of diary rows is set server-side to
  `now()` so clients can't pin posts to the top of feeds by back/forward-dating.
- **D-013 Rate limits in triggers:** 30 diary inserts/min, 5 comments/min per user (service role exempt for seed/import).
- **D-014 ★ Offline LWW in SQL:** `upsert_diary_entry` does `insert ... on conflict (id) do update ... where
  existing.updated_at <= incoming.updated_at`; `updated_at` is clamped to `now()` so a client can't win forever.
- **D-015 Film "heart" uses `likes(target_type='film')`**; the diary entry also stores `liked` for that viewing
  (Letterboxd-style). film_stats.like_count counts diary hearts.
- **D-016 Watch Together state changes only via RPCs** (`start_voting`, `close_voting`, `reset_group`), enforced by a
  trigger; votes' `group_id` is derived from the pick server-side so a vote can't be cast into another group.
- **D-017 Onboarding ratings become diary entries** dated today and tagged `onboarding` (the schema has no
  separate "rating without a viewing"). They feed taste match and recommendations immediately.

## TMDB

- **D-018 ★ TMDB proxy is cache-first and whitelisted**: details are cached 7 days in `films_cache` (refetched when stale
  or partial), list/search responses cached 6–24 h in `api_cache` and served stale on TMDB outage. List results are
  stored as `is_partial` rows so diaries/feeds can show titles/posters without extra TMDB calls. Batch endpoint
  (`films`) refreshes at most 12 missing films per call.
- **D-019 Watch-provider region defaults to IN** (edge secret `TMDB_REGION` to change).
- **D-020 Poster colour theme computed server-side**: the edge function decodes the w92 poster (jpeg-js) and stores a
  palette in films_cache.palette — no native module needed in Expo Go.

## Testing

- **D-021 Jest mocks:** Lucide (ESM-only) and Reanimated 4 are replaced by small local mocks in `test/` via
  `moduleNameMapper`; RNTL 14's async `render`/`fireEvent` are awaited.
