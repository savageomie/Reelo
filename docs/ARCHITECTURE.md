# Reelo — architecture

## System

```mermaid
flowchart TB
  subgraph Phone["React Native app (Expo SDK 58)"]
    UI["Expo Router screens\nNativeWind · Reanimated · FlashList"]
    Q["TanStack Query cache"]
    Z["Zustand stores"]
    OQ["Offline mutation queue\n(MMKV / AsyncStorage)"]
    UI --> Q & Z
    UI --> OQ
  end

  subgraph Supabase["Supabase (free tier)"]
    Auth["Auth (email + Google)"]
    PG[("Postgres\n+ RLS on every table\n+ triggers & SQL functions")]
    RT["Realtime\n(groups, votes, notifications)"]
    ST["Storage (avatars)"]
    EF["Edge Functions (Deno)\ntmdb · import-letterboxd · send-push"]
    CRON["pg_cron nightly\nrefresh_taste_similarity\nrefresh_film_similarity"]
  end

  TMDB["TMDB API"]
  EXPO["Expo Push API"]

  Q -- "HTTPS (anon key + user JWT)" --> PG
  OQ -- "replay: upsert_diary_entry (idempotent, LWW)" --> PG
  UI -- WebSocket --> RT
  UI --> Auth
  UI --> ST
  Q -- "functions.invoke" --> EF
  EF -- "cache miss / stale only" --> TMDB
  EF -- "films_cache · api_cache" --> PG
  PG -- "DB webhook on notifications" --> EF
  EF --> EXPO
  CRON --> PG
```

Key flows (blueprint section 4):

1. **Browse/search** → `tmdb` edge function → `films_cache`/`api_cache` hit, else TMDB → cache → app. The TMDB key
   exists only as an edge-function secret.
2. **Log a film** → offline queue (client UUID) → `upsert_diary_entry` RPC → triggers refresh `film_stats` and write an
   `activity_events` row. Offline: queued in MMKV, replayed in order on reconnect.
3. **Feed** → `get_feed(cursor, limit)` joins `activity_events` with accepted follows; cursor on `(created_at, id)`.
4. **Voting** → clients subscribe to `group_votes` via Realtime; tallies recompute live; `close_voting` decides.
5. **Recommendations** → pg_cron refreshes `taste_similarity` and `film_similarity`; the app blends them with
   content features and popularity.

## Entity–relationship diagram

```mermaid
erDiagram
  AUTH_USERS ||--|| PROFILES : "id"
  PROFILES ||--o{ DIARY_ENTRIES : writes
  PROFILES ||--o{ WATCHLIST : saves
  PROFILES ||--o{ LISTS : owns
  LISTS ||--o{ LIST_ITEMS : contains
  PROFILES ||--o{ FOLLOWS : "follower / following"
  PROFILES ||--o{ BLOCKS : blocks
  PROFILES ||--o{ REPORTS : files
  PROFILES ||--o{ LIKES : gives
  PROFILES ||--o{ COMMENTS : writes
  PROFILES ||--o{ ACTIVITY_EVENTS : "actor"
  PROFILES ||--o{ NOTIFICATIONS : receives
  PROFILES ||--o{ PUSH_TOKENS : registers
  PROFILES ||--o{ GROUPS : owns
  GROUPS ||--o{ GROUP_MEMBERS : has
  PROFILES ||--o{ GROUP_MEMBERS : joins
  GROUPS ||--o{ GROUP_PICKS : pools
  GROUP_PICKS ||--o{ GROUP_VOTES : receives
  PROFILES ||--o{ GROUP_VOTES : casts
  PROFILES ||--o{ TASTE_SIMILARITY : "user_a / user_b"
  PROFILES ||--o{ USER_STATS : caches
  FILMS_CACHE ||--o| FILM_STATS : "tmdb_id"
  FILMS_CACHE ||--o{ FILM_SIMILARITY : "tmdb_id"
  FILMS_CACHE ||..o{ DIARY_ENTRIES : "tmdb_id (soft)"
  FILMS_CACHE ||..o{ WATCHLIST : "tmdb_id (soft)"
  FILMS_CACHE ||..o{ LIST_ITEMS : "tmdb_id (soft)"
  FILMS_CACHE ||..o{ GROUP_PICKS : "tmdb_id (soft)"

  PROFILES {
    uuid id PK
    text username UK
    text avatar_url
    text bio
    bool is_private
    int[] favourites
    tsvector search
  }
  FILMS_CACHE {
    int tmdb_id PK
    text title
    int year
    jsonb genres
    int runtime
    jsonb directors
    jsonb cast
    jsonb providers
    jsonb palette
    timestamptz fetched_at
  }
  DIARY_ENTRIES {
    uuid id PK "client-generated"
    uuid user_id FK
    int tmdb_id
    date watched_on
    numeric rating "0.5..5"
    text review
    bool spoiler
    text[] tags
    bool is_rewatch
    bool liked
    timestamptz updated_at "LWW"
  }
  FOLLOWS {
    uuid follower_id PK
    uuid following_id PK
    text status "accepted|pending"
  }
  GROUPS {
    uuid id PK
    uuid owner_id FK
    text invite_code UK
    text status "picking|voting|closed"
    text voting_mode "ranked|swipe"
    jsonb filters
    uuid winner_pick_id
  }
  GROUP_VOTES {
    uuid pick_id PK
    uuid user_id PK
    uuid group_id
    smallint value "swipe"
    smallint rank "ranked"
  }
  TASTE_SIMILARITY {
    uuid user_a PK
    uuid user_b PK
    int score
    int overlap
  }
```

`tmdb_id` references to `films_cache` are deliberately *soft* (no FK): a film can be logged before it has ever been
cached, and the cache can be refreshed or evicted independently.

## RLS summary (blueprint 5.4)

| Table | Read | Write |
| --- | --- | --- |
| profiles | any signed-in user | owner only (insert via auth trigger) |
| diary_entries, watchlist, activity_events, user_stats | owner, or anyone if profile public, or accepted followers; never when blocked | owner only |
| lists / list_items | public lists: everyone; private: owner | owner only |
| follows | signed-in users | create/delete own; followed user may accept or remove |
| likes, comments | if the target is visible to you | create/delete own (comments rate-limited) |
| groups, members, picks, votes | members only | picks while `picking`; votes own-only while `voting`; status via RPC |
| notifications, push_tokens, blocks, reports | owner only | owner only (notifications written by triggers) |
| films_cache, film_stats, film_similarity | signed-in users | service role / triggers only |
| api_cache | nobody | service role only |
| taste_similarity | the two users in the pair | nightly job only |

Checked automatically by `npm run test:db` (PGlite) — see `scripts/test-db.mjs`.
