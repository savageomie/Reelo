import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kv } from '@/lib/storage';

export type ThemePreference = 'system' | 'dark' | 'light';

interface SettingsState {
  theme: ThemePreference;
  hapticsEnabled: boolean;
  setTheme: (t: ThemePreference) => void;
  setHaptics: (on: boolean) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      hapticsEnabled: true,
      setTheme: (theme) => set({ theme }),
      setHaptics: (hapticsEnabled) => set({ hapticsEnabled }),
    }),
    { name: 'reelo.settings', storage: createJSONStorage(() => kv) },
  ),
);
