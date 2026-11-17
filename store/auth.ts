import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { isConfigured } from '@/lib/env';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  initialized: boolean;
}

export const useAuth = create<AuthState>(() => ({ session: null, initialized: false }));

export const useUserId = () => useAuth((s) => s.session?.user.id ?? null);

let started = false;

/** Subscribe once to Supabase auth changes (called from the root layout). */
export function startAuthListener() {
  if (started) return;
  started = true;
  if (!isConfigured) {
    useAuth.setState({ session: null, initialized: true });
    return;
  }
  supabase.auth
    .getSession()
    .then(({ data }) => useAuth.setState({ session: data.session, initialized: true }))
    .catch(() => useAuth.setState({ session: null, initialized: true }));
  supabase.auth.onAuthStateChange((event, session) => {
    const prev = useAuth.getState().session?.user.id;
    useAuth.setState({ session, initialized: true });
    if (event === 'SIGNED_OUT' || (prev && session?.user.id !== prev)) queryClient.clear();
  });
}
