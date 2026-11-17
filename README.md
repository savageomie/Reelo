# Reelo

![CI](https://github.com/YOUR_GITHUB_USER/reelo/actions/workflows/ci.yml/badge.svg)

**A social movie diary where your taste is your identity.** Log films, rate (half stars) and review them, build
lists, follow friends, see how aligned your taste is, get recommendations, and pick one film together with
realtime group voting — **Watch Together**.

Expo (React Native) + Supabase, entirely on free tiers. Final-year lab project.

| | |
| --- | --- |
| Blueprint | [docs/Blueprint.md.txt](docs/Blueprint.md.txt) |
| **Setup, deploy & demo guide** | [docs/HANDOFF.md](docs/HANDOFF.md) |
| Architecture, ER diagram, RLS table | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Decisions log (viva notes) | [docs/DECISIONS.md](docs/DECISIONS.md) |
| Build progress | [docs/PROGRESS.md](docs/PROGRESS.md) |

## Highlights

- **Watch Together** — invite by code/link, pool picks with runtime/genre/streaming filters, vote live (swipe or
  ranked choice with instant runoff), winner added to everyone's watchlist.
- **Taste engine** — taste-match % (mean-centred cosine + shrinkage), "people with similar taste", hybrid
  recommendations (content + item-item collaborative + popularity, cold-start fallback).
- **Offline-first logging** — idempotent mutation queue (client UUIDs, last-write-wins), syncs on reconnect.
- **Stats & Wrapped** — calendar heatmap, genre/decade/director breakdowns, shareable yearly Wrapped cards.
- **Poster-themed film pages** — colours extracted from the poster server-side.
- **Security** — Row-Level Security on every table, verified automatically with multiple accounts in CI.

## Quick start

```bash
npm install
cp .env.example .env      # fill in Supabase URL + anon key (see docs/HANDOFF.md)
npx expo start            # scan the QR code with Expo Go
```

## Scripts

| Command | What |
| --- | --- |
| `npm start` | Expo dev server |
| `npm run lint` | ESLint (eslint-config-expo) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Jest unit + component tests (algorithms with worked examples, RNTL components) |
| `npm run test:db` | Applies all migrations to PGlite (Postgres in WASM) and checks RLS/triggers/SQL functions |
| `npm run check` | All of the above |
| `npm run seed` | Seed ~30 demo users (needs `SUPABASE_SERVICE_ROLE_KEY` in `.env`) |
| `npm run seed:dry` | Generate the seed data offline and print a summary |

## Project structure

```
app/                  Expo Router screens (tabs: Home, Discover, Log, Together, Profile)
components/           UI components (components/ui = primitives)
features/             Pure domain logic: diary, lists, social, groups, stats, recs, offline
hooks/                TanStack Query hooks
lib/                  Supabase client, TMDB client, offline queue runtime, storage, validation
store/                Zustand stores
theme/                Colour tokens, fonts
supabase/migrations/  SQL schema, RLS, triggers, functions
supabase/functions/   Edge functions: tmdb, import-letterboxd, send-push (+ _shared pure modules)
scripts/              seed.mjs, test-db.mjs
__tests__/            Jest tests
```

## Attribution & licences

This product uses the TMDB API but is not endorsed or certified by TMDB. Film data and images © TMDB; streaming
availability by JustWatch via TMDB.

Open-source libraries (all used under their own licences): Expo, Expo Router, React Native, React (MIT);
NativeWind, Tailwind CSS (MIT); React Native Reanimated, Gesture Handler, FlashList, react-native-svg,
react-native-view-shot, react-native-mmkv (MIT); TanStack Query, Zustand, Supabase JS (MIT); Lucide icons (ISC);
DM Serif Display and Inter fonts (SIL OFL 1.1); jpeg-js (BSD-3-Clause); PGlite (Apache-2.0 / PostgreSQL licence).
