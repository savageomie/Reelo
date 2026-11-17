import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

/**
 * Google sign-in (P1) via Supabase OAuth + PKCE in an in-app browser session.
 * Requires the Google provider enabled in Supabase and the redirect URL (reelo://auth-callback,
 * or the exp:// URL printed in dev) added to Auth -> URL configuration. See docs/HANDOFF.md.
 */
export async function signInWithGoogle(): Promise<boolean> {
  const redirectTo = Linking.createURL('auth-callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') return false;
  const url = new URL(res.url);
  const code = url.searchParams.get('code');
  const errDesc = url.searchParams.get('error_description');
  if (errDesc) throw new Error(errDesc);
  if (!code) throw new Error('Sign-in was cancelled');
  const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
  if (exErr) throw exErr;
  return true;
}

export async function signOut() {
  await supabase.auth.signOut();
}
