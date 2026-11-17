/**
 * Public runtime config. Only EXPO_PUBLIC_* variables are inlined into the app bundle.
 * NEVER put the TMDB key or the Supabase service-role key here: those live only in
 * edge-function secrets / your local shell when running the seed script.
 */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
};

export const isConfigured = Boolean(
  env.supabaseUrl &&
    env.supabaseAnonKey &&
    !env.supabaseUrl.includes('YOUR_') &&
    !env.supabaseAnonKey.includes('YOUR_'),
);
