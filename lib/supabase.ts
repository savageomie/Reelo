import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { env, isConfigured } from './env';
import { kv } from './storage';

/**
 * Supabase client using ONLY the public anon key. All data access is protected by RLS.
 * When .env is missing we still create a client (pointing at a placeholder) so the app can boot
 * and show the "setup required" screen instead of crashing.
 */
export const supabase = createClient(
  isConfigured ? env.supabaseUrl : 'https://placeholder.supabase.co',
  isConfigured ? env.supabaseAnonKey : 'public-anon-key-placeholder',
  {
    auth: {
      storage: {
        getItem: (k: string) => kv.getItem(k),
        setItem: (k: string, v: string) => kv.setItem(k, v),
        removeItem: (k: string) => kv.removeItem(k),
      },
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  },
);

// Refresh tokens only while the app is in the foreground (recommended for React Native).
if (Platform.OS !== 'web' && isConfigured) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Throw PostgREST errors so TanStack Query surfaces them as error states. */
export function unwrap<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw res.error;
  return res.data;
}

export async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('Not signed in');
  return id;
}
