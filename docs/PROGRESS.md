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

## Phase 2 — Watchlist, lists, profile, diary views ✅

Plan: profile screen shared by "me" and public profiles; diary grouped by month; diary entry page; watchlist
with sort/filters (pure, tested); lists overview/detail/editor/add-to-list; followers/following.

Done:
- My profile tab + public profile (`ProfileView`): counts, favourite four, recent films, taste-match ring,
  follow/requested state, private-diary lock, block/report menu.
- Edit profile: avatar upload to Storage (`avatars/<uid>/...`), username/display name/bio, private toggle, favourite four.
- Diary (month sections in FlashList, pending-sync badge), Diary entry (spoiler reveal, likes, comments).
- Watchlist: 6 sorts, genre/runtime/"streaming now" filters (`features/lists/watchlistFilter.ts` + tests).
- Lists overview, list detail (likes, comments, share as image/text), list editor (create/edit, reorder, remove, delete),
  add-to-list sheet; followers/following screen.

## Phase 3 — Follows, feed, likes, comments, notifications ✅

Plan: home feed via `get_feed` RPC with cursor-based infinite scroll; feed cards with optimistic likes; comment
threads with spoiler tags; notifications screen with follow-request accept/decline and live updates; push delivery.

Done:
- Home: feed (FlashList + `useInfiniteQuery`, cursor = `(created_at, id)`), "People with similar taste", trending rail.
- `FeedCard` for log/review, new list, follow events; optimistic like with rollback; spoiler reveal.
- Comments (`CommentThread`) on reviews and lists, with spoiler flag, delete own, DB rate limit surfaced as a toast.
- Notifications screen: Realtime subscription, unread dot on Home/Profile, mark-read, accept/decline follow requests,
  deep links to the review/list/group.
- Push: `lib/push.ts` registers Expo push tokens (owner-only RLS); `supabase/functions/send-push` delivers via the
  Expo Push API when called by a Database Webhook on `notifications` INSERT.
- Block/report (public profile menu).
