# Reelo

A social movie diary where your taste is your identity. Log films, rate and review them, build lists,
follow friends, see how aligned your taste is, get recommendations, and pick a film together with
realtime group voting ("Watch Together").

Built with Expo (React Native) + Supabase. Final-year lab project.

- Blueprint: [docs/Blueprint.md.txt](docs/Blueprint.md.txt)
- Setup & demo instructions: [docs/HANDOFF.md](docs/HANDOFF.md)
- Build progress: [docs/PROGRESS.md](docs/PROGRESS.md) · Decisions: [docs/DECISIONS.md](docs/DECISIONS.md)

## Quick start

```bash
npm install
cp .env.example .env      # fill in Supabase URL + anon key
npx expo start            # scan the QR code with Expo Go
```

## Scripts

| Command | What |
| --- | --- |
| `npm start` | Expo dev server |
| `npm run lint` | ESLint (eslint-config-expo) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Jest unit + component tests |
| `npm run seed` | Seed ~30 demo users (needs service-role key in `.env`) |

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB. Film data and images © TMDB.
