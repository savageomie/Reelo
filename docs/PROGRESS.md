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

## Phase 4 — Stats, heatmap, Wrapped ✅

Plan: compute stats on device from diary + films_cache (pure `computeStats`, already tested), render with
react-native-svg charts, cache yearly snapshot in `user_stats`, build a swipeable shareable Wrapped.

Done:
- `components/charts.tsx`: calendar heatmap (SVG), horizontal & vertical bars, stat cards.
- Stats screen (any user, RLS-respecting): year chips + all-time, films/hours/avg/streak, heatmap, per month,
  rating distribution, genres, decades, top directors & actors.
- Wrapped: 7 story cards (totals, top genre, director/actor, busiest month, top rated, taste persona),
  each exported as a PNG via view-shot + share sheet. `features/stats/persona.ts` + tests.
- Owner's yearly stats snapshot upserted into `user_stats`.

## Phase 5 — Watch Together with realtime voting ✅

Plan: groups list, create/join by code or deep link, group page with filters + picks pool, live voting
(swipe deck or ranked ballot) with Realtime-driven tallies, owner closes voting via RPC, winner page.

Done:
- `hooks/useGroups.ts`: group state + one Realtime channel per screen on groups / members / picks / votes.
- Together tab, Create-or-join (code), `reelo://group/join?code=…` deep link, invite share + copy.
- Group page: members, owner-controlled filters (max runtime, genres, shared streaming services), picks pool
  flagged when they break filters, add picks via search or "from your watchlist (matching filters)".
- Voting: swipe cards (RNGH v3 `usePanGesture` + Reanimated, with accessible yes/no buttons) or tap-to-rank ballot;
  live results computed with the same IRV code the server uses; "x/y voted"; live/connecting indicator.
- `close_voting` RPC picks the winner (IRV or most yes), stores the rounds, adds the film to every member's
  watchlist and notifies everyone; Result page shows round-by-round elimination. Owner can reset.

## Phase 6 — Recommendations and taste match ✅

Plan: taste match live via `compute_taste_match` (profile ring) and precomputed via `taste_similarity`
("People with similar taste"); hybrid recommendations from a pure, tested pipeline.

Done:
- Taste-match ring on every other user's profile (mean-centred cosine + shrinkage, SQL ↔ TS parity tested).
- "People with similar taste" on Home (`get_similar_users`, overlap ≥ 3, nightly pg_cron refresh).
- "Users who loved this also loved" on film pages (item-item `film_similarity`).
- `features/recs/pipeline.ts` (+ tests): content profile from loved films, collaborative candidates from
  `get_collaborative_recs`, popularity; hybrid blend; cold-start fallback; "Because you loved X" rail.
- Home rails: Recommended for you (with "Fans of X" explanations), Because you loved X, Trending.

## Phase 7 — CSV import, offline sync, polish, animations ✅ (trimmed per scope rule)

Plan: Letterboxd import (pure parser + edge function + screen), finish offline UX, settings, About/TMDB
attribution, error boundary; keep animations to the high-value spots.

Done:
- `supabase/functions/_shared/letterboxd.ts` (RFC 4180 CSV, diary/reviews/ratings/watched/watchlist detection,
  TMDB best-match by title+year) + tests; `import-letterboxd` edge function (TMDB key server-side, cached matches,
  idempotent re-import, per-user inserts); Import screen with preview and unmatched report.
- Offline: queue already powers logging/watchlist; floating offline/pending banner, pending badges in Diary/Film,
  Settings "Sync now" with status.
- Settings: theme (dark/light/system), haptics, private diary, import, about, sign out, delete account (cascade).
- About: TMDB logo + required notice, JustWatch credit, open-source licence list.
- Root ErrorBoundary + not-found route.
- Motion already in place: rating spring + haptics, swipe cards, toasts, Wrapped card entrances, live vote bars.

Trimmed (see DECISIONS D-032..D-034): shared-element poster transition, drag-to-reorder, taste-profile card,
discussion threads (comments with spoiler tags cover the need).

## Phase 8 — Seed data, tests, APK config, docs ✅

Done:
- `scripts/seed.mjs` (+ `seedData.mjs`, `--dry-run`): 30 users, ~1,100 diary entries, follows, reviews, likes,
  comments, 12 lists, watchlists, a ranked group mid-vote and a finished swipe group; refreshes similarity tables.
- Tests: 111 Jest tests in 14 suites + 41 PGlite DB checks; all wired into CI and `npm run check`.
- `eas.json` (preview profile builds an APK; env via `eas env:create`).
- Docs: `README.md`, `docs/ARCHITECTURE.md` (architecture + ER diagrams, RLS table), `docs/HANDOFF.md`
  (setup, deploy, seed, run, manual test checklist, viva notes), sample Letterboxd CSV.
- Final verification: lint ✓, typecheck ✓, Jest 111/111 ✓, DB 41/41 ✓, `expo export` (Android bundle) ✓,
  `expo-doctor` 20/20 ✓, `expo start` boots Metro ✓.

Not possible here (needs your accounts): deploying to Supabase, running on a phone, building the APK — see HANDOFF.

## Status: all phases complete. Next steps for you are in docs/HANDOFF.md.
