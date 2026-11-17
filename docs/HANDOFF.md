# Reelo — handoff

Everything below was built autonomously. Nothing has been deployed and no keys were used. This document tells you
exactly what exists, what doesn't, how to bring it up, and what to say in the viva.

---

## 1. What was built, and what is incomplete

### Built (phases 0–8)

| Area | What you get |
| --- | --- |
| App shell | Expo SDK 58, Expo Router (root `app/`), TypeScript strict, NativeWind dark/light theme, DM Serif Display + Inter, Lucide icons |
| Screens (all with skeleton / empty / error states, dark + light) | Welcome, Sign up, Log in (+ Google), Onboarding, Home (feed + recommendation rails), Discover (trending/popular/top rated/genres), Search results (films/people/users), Film detail (poster-themed), Person, Log film modal, Log tab (quick add), Diary (by month), Diary entry (review + likes + comments), Watchlist (sort + filters), Lists overview, List detail, List editor (new/edit), Add-to-list, My profile, Public profile, Edit profile (avatar upload, favourite four), Followers/Following, Notifications, Together (groups), Create/Join group, Group detail (filters + picks), Voting (swipe / ranked), Result, Stats, Wrapped, Settings, Import, About (TMDB attribution), Not-found |
| Database | 9 migrations in `supabase/migrations/`: every table from blueprint 5.1 + `film_stats`, `api_cache`, `blocks`, `reports`; indexes; tsvector + GIN search; triggers (film stats, feed events, notifications, rate limits, follow-request status); SQL functions `get_feed`, `compute_taste_match`, `tally_ranked_choice`, `upsert_diary_entry`, `join_group`/`start_voting`/`close_voting`/`reset_group`, `get_similar_users`, `get_collaborative_recs`, `refresh_*` (pg_cron nightly), `delete_my_account`, `username_available`; avatars storage bucket + policies; Realtime publication |
| RLS | On every table (verified by a test), exactly per blueprint 5.4, plus follow requests for private profiles |
| Edge functions | `tmdb` (cache-first TMDB proxy, whitelisted actions, poster palette), `import-letterboxd`, `send-push` |
| Algorithms (pure TS + Jest, with worked examples) | Taste match, hybrid recommendations, instant-runoff voting, offline queue (idempotent, LWW), cursor feed, stats/heatmap, Letterboxd CSV parsing, poster palette, watchlist filters |
| Tests | **111 Jest tests** (14 suites, incl. React Native Testing Library tests for RatingStars, ReviewCard, LogForm) and **41 database checks** (`npm run test:db`: migrations applied to PGlite, two/three-account RLS checks, triggers, LWW, IRV parity, cascade delete) |
| Seed | `scripts/seed.mjs`: 30 users with taste archetypes, ~1,100 diary entries over 18 months, follows (incl. private + pending), reviews (some with spoilers), likes, comments, 12 lists, watchlists, one ranked group **mid-vote** and one finished swipe group, then refreshes similarity tables |
| CI | `.github/workflows/ci.yml`: lint, typecheck, Jest, DB tests on every push |
| Docs | `CLAUDE.md`, `README.md`, `docs/ARCHITECTURE.md` (architecture + ER diagrams + RLS table), `docs/DECISIONS.md`, `docs/PROGRESS.md` |

Verified locally: `npm run lint` ✓, `npm run typecheck` ✓, `npm test` ✓ (111), `npm run test:db` ✓ (41),
`npx expo export --platform android` ✓ (the production JS bundle builds, so `npx expo start` will bundle).

### Not done / limitations (be upfront about these)

- **Never run on a phone or against a live Supabase project** (no keys). The edge functions were not type-checked
  by Deno (not installed); their shared logic (`supabase/functions/_shared/*`) *is* unit-tested.
- **Not built (scope rule):** shared-element poster transition, drag-and-drop list reordering (move up/down buttons
  instead), taste-profile share card, separate discussion threads.
- **APK not built** — needs your Expo account (`eas.json` is ready; steps below).
- **Push notifications** need the DB webhook (step 2.8) and a development build/APK on Android — Expo Go on Android
  can't receive remote pushes (SDK 53+). In-app notifications work everywhere.
- **MMKV** is only active in a dev build / APK; Expo Go falls back to AsyncStorage automatically (D-003).
- **Google sign-in** needs the Google provider configured in Supabase (optional, step 2.3).
- **TMDB logo** on the About screen loads from TMDB's site with a text fallback; for offline demos drop the official
  logo into `assets/` and point `app/about.tsx` at it.

---

## 2. Step-by-step setup

You need: Node 22+, a phone with **Expo Go** (latest, SDK 58), a free **Supabase** account, a free **TMDB** account.
Run everything from the project folder in PowerShell.

### 2.1 Create the Supabase project

1. https://supabase.com/dashboard → **New project**. Name `reelo`, pick a strong DB password, region close to you
   (e.g. *South Asia (Mumbai)*). Wait until it's ready.
2. **Project Settings → API Keys** (or *Data API*). Copy:
   - Project URL → `https://<ref>.supabase.co` (the `<ref>` is your *project ref*)
   - **anon / publishable** key (public, goes in the app)
   - **service_role / secret** key (private, only for the seed script — never in the app, never committed)

### 2.2 Apply the migrations

Option A — Supabase CLI (recommended, no Docker needed for these commands):

```powershell
npx supabase login                      # opens the browser once
npx supabase link --project-ref <ref>   # asks for the DB password
npx supabase db push                    # applies supabase/migrations/* in order
```

Option B — no CLI: Dashboard → **SQL Editor**, paste and run each file in `supabase/migrations/` **in filename
order** (`...000000_...` first, `...000800_...` last).

Then check:
- **Database → Extensions**: `pg_cron` enabled. If the migration printed "pg_cron not available", enable it there and run:
  ```sql
  select cron.schedule('reelo-taste-similarity', '15 3 * * *', 'select public.refresh_taste_similarity()');
  select cron.schedule('reelo-film-similarity',  '30 3 * * *', 'select public.refresh_film_similarity()');
  ```
- **Database → Publications → supabase_realtime** includes `groups, group_members, group_picks, group_votes, notifications`.
- **Storage**: an `avatars` bucket exists (public).

### 2.3 Auth settings

- **Authentication → Sign In / Providers → Email**: for the demo, turn **Confirm email OFF** (otherwise new sign-ups
  must click an email link before logging in). Seed users are pre-confirmed either way.
- **Authentication → URL Configuration → Redirect URLs**: add `reelo://auth-callback` and `exp://**`.
- (Optional) Google: create an OAuth client in Google Cloud Console (Web application), put its ID/secret into
  **Providers → Google**, and add `https://<ref>.supabase.co/auth/v1/callback` as an authorised redirect URI in Google.

### 2.4 TMDB key → edge-function secret (never in the app)

1. https://www.themoviedb.org → sign up → **Settings → API** → request an API key (Developer, non-commercial,
   describe it as a university project).
2. Copy either the **API Read Access Token** (long, starts with `ey…`) or the **API Key (v3)** — both work.
3. Set it as a secret:
   ```powershell
   npx supabase secrets set TMDB_API_KEY=<your token or key> TMDB_REGION=IN
   ```
   (`TMDB_REGION` controls "Where to watch"; `IN` = India.)

### 2.5 Deploy the edge functions

```powershell
npx supabase functions deploy tmdb
npx supabase functions deploy import-letterboxd
npx supabase functions deploy send-push --no-verify-jwt
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into functions automatically.

### 2.6 Fill `.env`

```powershell
Copy-Item .env.example .env
notepad .env
```

```
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon / publishable key>
SUPABASE_SERVICE_ROLE_KEY=<service_role / secret key>     # seed only
TMDB_API_KEY=<same TMDB token>                             # optional: seed fetches real posters/cast
```

`.env` is git-ignored. Only `EXPO_PUBLIC_*` values are bundled into the app.

### 2.7 Run the seed

```powershell
npm install
npm run seed
```

It prints the logins. **Every seed user's password is `reelo-demo-2026`**:

- Phone 1: `demo@example.com`
- Phone 2: `demo2@example.com`
- Any other: `<username>@example.com` (e.g. `asha_films@example.com`; private ones: `zoe_frames`, `ishita_indie`, `noor_nostalgia`)

The seed is re-runnable (it wipes and recreates its own users' data). With `TMDB_API_KEY` set it caches real
posters for all 82 films; without it, posters fill in the first time each film is opened in the app.

### 2.8 (Optional) Push notifications

```powershell
npx supabase secrets set PUSH_WEBHOOK_SECRET=<any long random string>
```

Dashboard → **Database → Webhooks → Create**: table `notifications`, event **Insert**, type **Supabase Edge
Function** → `send-push` (or HTTP POST `https://<ref>.supabase.co/functions/v1/send-push`), add HTTP header
`x-webhook-secret: <same string>`. Works on iOS Expo Go and on an Android dev build/APK.

### 2.9 Run the app in Expo Go

```powershell
npx expo start          # after changing .env, use: npx expo start -c
```

Scan the QR code (Android: Expo Go → *Scan QR*; iOS: Camera app). If the phone is on a different network, use
`npx expo start --tunnel`.

### 2.10 APK (optional)

```powershell
npx eas-cli@latest login
npx eas-cli@latest init                                  # links an Expo project (adds projectId)
npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref>.supabase.co --visibility plaintext
npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon key> --visibility plaintext
npx eas-cli@latest build -p android --profile preview    # free tier queue; returns an APK link
```

(`.env` is not uploaded to EAS, hence the `env:create` lines.)

### 2.11 The day before the demo

- Open the Supabase dashboard and run any query (free projects pause after ~1 week idle).
- `npm run seed` again for fresh, consistent data (also resets the "Friday Movie Night" vote).
- Use a mobile hotspot for Realtime; keep a screen recording as backup.

---

## 3. Manual test checklist

### Automated (run first)

- [ ] `npm run check` → lint, typecheck, Jest (111), DB tests (41) all green.

### Core flows (phone 1)

- [ ] Sign up a **new** account → onboarding (genres, rate ≥ 3 films) → Home shows "Popular picks to start with".
- [ ] Discover → search "dune" → open the film: backdrop, poster colours, cast, where to watch, Reelo rating histogram.
- [ ] Log it: date chips, drag the stars (half stars, haptic tick), heart, review with "contains spoilers", tags → toast "Logged!".
- [ ] Profile → Diary shows the entry under this month; Stats shows it in the heatmap; Wrapped opens and shares a card.
- [ ] Watchlist: bookmark 3 films on film pages, then sort and filter (≤120 min, genre, "Streaming now").
- [ ] Lists: create a ranked list, add films, reorder with ↑/↓, make it private, share as image.
- [ ] Settings: switch Light/Dark/System; every screen stays readable.

### Offline sync

- [ ] Airplane mode → log a film → banner "Offline · 1 change saved on device"; Diary shows it with a cloud badge.
- [ ] Edit that entry again offline → still one pending change (collapsed).
- [ ] Turn airplane mode off → banner shows "Syncing…" then disappears; entry appears on phone 2's feed.

### Two-account RLS checks (phone 1 = new account **C**, phone 2 = `demo2` = **B**)

- [ ] B: Settings → Private diary ON.
- [ ] C: search users → open `@demo2` → lock card "This diary is private"; tapping Films does nothing; B's reviews don't appear on film pages or in C's feed.
- [ ] C: Follow → button shows **Requested**; still locked.
- [ ] B: Notifications → "requested to follow you" → **Accept**.
- [ ] C: pull to refresh → B's diary, stats and activity now visible; C has **no Edit** button on B's entries.
- [ ] B: create a **private** list → C can't see it in B's lists (and its link shows "List not found").
- [ ] C: open a group link/ID it isn't a member of → "Group not found"; join with the invite code → visible.
- [ ] Only the owner sees "Open voting" / "Close voting".
- [ ] B blocks C (profile ⋯ → Block) → C no longer sees B's diary; follows are removed.
- [ ] SQL proof (Dashboard → SQL Editor → role selector *authenticated*, impersonate user C):
      ```sql
      update public.diary_entries set rating = 1 where user_id = '<B uuid>';   -- 0 rows affected
      select count(*) from public.notifications where user_id = '<B uuid>';   -- 0
      insert into public.diary_entries (user_id, tmdb_id) values ('<B uuid>', 550);  -- RLS error
      ```

### Watch Together (two phones: `demo` and `demo2`)

- [ ] Both: Together → "Friday Movie Night" (voting, 3 of 6 voted). Live results show a leader.
- [ ] demo2 ranks the picks and submits → phone 1's bars and "x/6 voted" update within a second or two.
- [ ] demo: Close voting → both phones land on the Result: winner poster, instant-runoff rounds, "Added to everyone's watchlist".
- [ ] "Sunday Anime Club" shows a finished swipe vote. Create a new swipe group, add picks, swipe left/right on both phones.
- [ ] demo: Result → "Start a new round" resets the group.

### Taste engine

- [ ] demo → open `@sana_scifi` (same taste archetype) → usually a high match; `@nina_ghibli` (animation fan) → usually lower. Home → "People with similar taste".
- [ ] Home → "Recommended for you" (with "Fans of …" captions) and "Because you loved …".
- [ ] Film page → "Reelo users who loved this also loved".

### Import

- [ ] Settings → Import from Letterboxd → pick `docs/sample-letterboxd-diary.csv` (copy it to the phone) → preview
      shows 6 rows → Import → ~5 imported, the made-up title reported as unmatched. Import again → 0 imported, the rest skipped as duplicates.

### Account deletion

- [ ] On a throwaway account: Settings → Delete account → you're signed out; logging in again fails.

---

## 4. Decisions worth knowing for the viva

Full list in `docs/DECISIONS.md`. The ones examiners are most likely to probe:

1. **Why Supabase/Postgres over NoSQL** — the data is a relational social graph (follows, likes, lists, groups);
   SQL functions (`get_feed`, `tally_ranked_choice`, `compute_taste_match`) run next to the data; RLS gives
   per-row security in the database itself, so even a modified app can't read private diaries.
2. **How RLS protects private diaries (D-009, D-010, D-011)** — `diary_entries` select policy:
   `user_id = auth.uid() or can_view_user(user_id)`; `can_view_user` = public profile **or accepted follower**, and
   not blocked. Following a private user creates a **pending** request (status set by a trigger, not the client),
   so you can't just follow your way in. `get_feed` and `compute_taste_match` are **security invoker**, so RLS
   still applies inside them. All of this is tested with multiple accounts in `scripts/test-db.mjs`.
3. **Taste match (D-029)** — worked example in `__tests__/tasteMatch.test.ts`: Alice (generous, mean 3.75) and Bob
   (harsh, mean 3.125) share 3 films; centred vectors `[1.25, 0.75, -1.75]` and `[0.875, 0.875, -1.625]`;
   cosine ≈ 0.987; shrinkage 3/(3+5) → 0.370; mapped `(0.370 + 1)/2` → **69%**. Mean-centring makes harsh and
   generous raters comparable; shrinkage stops one shared film from showing 100% (max 58%).
4. **Ranked choice (D-025)** — worked example in `__tests__/rankedChoice.test.ts`: 5 friends, Dune/Coco/Up; round 1
   2-1-2 (no majority of 5), Coco eliminated, its ballot moves to Up → 3/5 → **Up wins**. Ties: fewest Borda points
   out, then most recently added. The SQL `tally_ranked_choice` gives the identical result (tested). The phones
   compute the live tally; the server decides the official winner.
5. **Offline sync (D-003, D-014)** — every mutation and every diary entry gets a client UUID, so a retry is an
   `insert … on conflict (id) do update` (idempotent). Replay is strictly FIFO; a network error stops the drain
   (no reordering); permanent errors are dropped. Conflicts: last-write-wins on `updated_at`, enforced in SQL
   (`where existing.updated_at <= incoming.updated_at`) and clamped to `now()` so a client can't win forever.
6. **Cursor pagination** — `(created_at, id) < cursor` uses the index and never duplicates/skips rows when new events
   arrive (the test shows OFFSET returning duplicates in the same situation). The cursor keeps Postgres's
   microsecond timestamp string to avoid gaps.
7. **TMDB cache (D-018)** — the app never sees the key; the edge function serves `films_cache` (7-day TTL) and
   `api_cache` (6–24 h) and only calls TMDB on a miss/stale entry, serving stale data during TMDB outages.
8. **Recommendations (D-031)** — collaborative (item-item cosine on "loved" films, nightly via pg_cron) + content
   (genres/director/cast/decade vectors) + popularity, weights 0.5/0.35/0.15; < 5 ratings → popularity (cold start).
9. **Scope cuts** (D-022, D-032, D-033) — chosen per the blueprint's scope-safety rule; say what you'd build next:
   moderation dashboard for reports, a web client, streaming deep links, shared-element transitions.
10. **Expo Go constraints (D-003, push)** — MMKV and Android remote push need a dev build; the app degrades gracefully.
