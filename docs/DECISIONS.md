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

## UI

- **D-022 List reordering uses accessible move-up/move-down buttons** instead of long-press drag-and-drop. It works
  with screen readers and is reliable in Expo Go; positions are saved in one `reorder_list` RPC call.
- **D-023 List "share as image"** captures the list view with react-native-view-shot + expo-sharing (both in Expo Go),
  falling back to a text share with a `reelo://list/<id>` deep link.
- **D-024 Profile, diary, watchlist and lists screens take an optional `userId`** param so the same screen serves
  "mine" and "someone else's"; RLS decides what is visible, and the UI shows a lock card for private diaries.

## Watch Together

- **D-025 ★ Live tally is computed on each phone with the same IRV module the server mirrors**
  (`features/groups/rankedChoice.ts` ↔ `tally_ranked_choice`). Realtime only signals "something changed";
  the client refetches votes (RLS: members only) and recomputes. The official winner is always decided
  server-side by `close_voting`, so a modified client can't fake a result.
- **D-026 Group filters are owner-controlled** (stored in `groups.filters`) and advisory: picks that break them are
  dimmed rather than blocked, so the group can still choose to keep them.
- **D-027 Ranked ballots are replaced atomically per user** (delete own votes, insert new ranks) while status is
  `voting`; RLS enforces own-vote-only and voting-window-only.
- **D-028 Realtime tables use REPLICA IDENTITY FULL** so filtered DELETE events are delivered too.

## Taste engine

- **D-029 ★ Taste match uses each user's mean over ALL their ratings** (not only the shared films) for centring,
  and the latest rating per film (rewatches). Score = round(((cos · n/(n+5)) + 1) / 2 · 100). No overlap → no score
  ("No films in common yet"); 50% means "no evidence either way"; overlap < 3 is labelled "Early guess".
- **D-030 Precomputed taste_similarity is computed by a SECURITY DEFINER job** and readable only by the two users in
  the pair; the live profile ring uses the invoker function so private diaries are never compared without access.
- **D-031 Recommendations are blended on the device** from three server-side ingredients (collaborative candidates RPC,
  films_cache pool by popularity, the user's own diary). Weights: collaborative 0.5, content 0.35, popularity 0.15;
  fewer than 5 rated films → popularity (+ a little content). Content features: genres (1.0), directors (1.5),
  top-5 cast (0.6), decade (0.5); profile weight = rating − 3 (4★ → 1, 5★ → 2).

## Phase 7 scope cuts and import

- **D-032 Shared-element poster transitions skipped.** Reanimated 4's shared transitions are still behind a feature flag
  and unstable with native-stack; posters fade in via expo-image transitions instead.
- **D-033 P2 extras not built:** taste-profile share card and separate discussion threads (comments with spoiler tags on
  reviews/lists cover discussion).
- **D-034 Letterboxd ratings.csv / watched.csv have no viewing date**, so the date the film was logged on Letterboxd is
  used as `watched_on`; imported entries get a `letterboxd` tag. Re-imports skip (film, date) pairs that already exist.
- **D-035 Import runs in an edge function with the service role** but only ever writes rows for the user identified by the
  caller's JWT (`auth.getUser(token)`), so bulk imports bypass the 30/min rate limit safely.
