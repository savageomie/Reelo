# Reelo — instructions for Claude Code

Reelo is a social movie diary (final-year lab project). The blueprint in `docs/Blueprint.md.txt`
is the source of truth for features, schema, RLS, algorithms, screens and phase order.
Progress lives in `docs/PROGRESS.md`; design decisions in `docs/DECISIONS.md`.

## Stack (do not swap libraries without recording a decision)

- Expo SDK 58, React Native 0.88, React 19, **Expo Router** (file-based routes in root `app/`), TypeScript (strict)
- NativeWind v4 (Tailwind v3 classes) — tokens in `theme/palette.js`, `tailwind.config.js`
- Reanimated 4 + react-native-worklets, Gesture Handler, FlashList v2, expo-image, react-native-svg (charts)
- TanStack Query (server state), Zustand (client state), MMKV with AsyncStorage fallback (`lib/storage.ts`)
- Supabase JS (Auth, Postgres + RLS, Realtime, Edge Functions in Deno), pg_cron
- Jest (jest-expo preset) + React Native Testing Library; ESLint (eslint-config-expo); Prettier
- Icons: lucide-react-native. Fonts: DM Serif Display (titles), Inter (body) via @expo-google-fonts.

Expo changes every SDK: before touching an Expo API, check https://docs.expo.dev/versions/v58.0.0/ .
Always add Expo packages with `npx expo install <pkg>` (on Windows dev deps: `npx expo install <pkg> "--" --dev`).

## Folder structure

```
app/            Expo Router screens only (every file is a route; _layout.tsx = navigator)
components/     Reusable UI (components/ui = primitives: Text, Button, Screen, Skeleton, EmptyState...)
features/       Pure domain logic per area: diary, lists, social, groups, stats, recs, offline, import
lib/            supabase client, tmdb client, offline queue runtime, storage, env, utils
hooks/          TanStack Query hooks (useX) — the only place screens get server data from
store/          Zustand stores
theme/          colours, fonts, tokens
supabase/migrations/  SQL schema + RLS (timestamped files, never edit an applied migration — add a new one)
supabase/functions/   Deno edge functions (_shared/ = pure modules also unit-tested by Jest)
scripts/        seed generator and tooling
__tests__/      Jest tests (*.test.ts / *.test.tsx)
```

## Naming rules

- Components: `PascalCase.tsx`, one exported component per file. Hooks: `useThing.ts` in `hooks/`.
- Pure modules: `camelCase.ts`; they must not import React, React Native or Supabase so they stay unit-testable.
- Routes: kebab-case or `[param].tsx` per Expo Router. Route files default-export the screen.
- SQL: snake_case tables (plural), columns, functions. Migrations: `YYYYMMDDHHMMSS_description.sql`.
- Query keys: arrays starting with the entity, e.g. `['diary', userId]`, `['film', tmdbId]`.

## Hard rules

1. **Always add RLS to every new table** (`alter table ... enable row level security` + explicit policies)
   in the same migration that creates the table. Write the policy and a test/check alongside it.
2. **Run `npm run lint`, `npm run typecheck` and `npm test` before finishing any task**, and fix all failures.
3. **Never commit secrets.** `.env` is git-ignored; `.env.example` holds placeholders only.
   The TMDB key is only read inside edge functions via `Deno.env.get('TMDB_API_KEY')`. The app uses
   only the Supabase anon key. The service-role key is only used by `scripts/seed.mjs` from your shell.
4. Every screen has loading (skeleton), empty and error states, and works in dark and light mode.
5. Touch targets >= 44pt, `accessibilityLabel` on icon-only buttons.
6. Validate user input (usernames, reviews, comments) with the limits in `lib/validation.ts`; the DB
   enforces the same limits with CHECK constraints.
7. Commit after each working feature/phase with a clear message (`Phase N: ...`).

## Commands

```bash
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm test            # Jest (unit + RNTL component tests)
npm run test:db     # apply migrations to PGlite and run RLS/trigger/SQL checks
npm run check       # all of the above — run before finishing any task
npm run seed        # demo data (needs SUPABASE_SERVICE_ROLE_KEY in .env); seed:dry for an offline dry run
npx expo export --platform android   # proves the JS bundle builds
```

Setup/deploy steps for Supabase, TMDB secret and edge functions: `docs/HANDOFF.md`.
