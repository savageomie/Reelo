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
