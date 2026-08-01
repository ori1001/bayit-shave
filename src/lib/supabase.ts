import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail with a message that names the missing variable instead of the opaque
  // "supabaseUrl is required" that createClient throws at module-load time --
  // which reads as an immediate, causeless crash on app open.
  throw new Error(
    'Missing Supabase configuration: ' +
      [
        !supabaseUrl && 'EXPO_PUBLIC_SUPABASE_URL',
        !supabaseAnonKey && 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
      ]
        .filter(Boolean)
        .join(', ') +
      '. Local runs read these from .env; EAS builds read them from the profile env block in eas.json.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'bayit_shave' },
  auth: {
    // Native only: auth-js has no usable default store there and falls back to
    // in-memory, so every cold start lands back on the sign-in screen.
    // detectSessionInUrl is browser-only, so it goes off alongside it.
    //
    // Web keeps auth-js's own localStorage default. AsyncStorage's web shim
    // reaches for window at import time, which crashes the static (Node)
    // render that `web.output: "static"` performs at export.
    ...(Platform.OS === 'web' ? {} : { storage: AsyncStorage, detectSessionInUrl: false }),
    persistSession: true,
    autoRefreshToken: true,
  },
});
