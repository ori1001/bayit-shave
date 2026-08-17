// AsyncStorage is a native module, so anything importing it (the offline
// completion queue, the Supabase auth storage adapter, calendar sync) fails to
// load under Jest without the library's own mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// useSafeAreaInsets throws outside a SafeAreaProvider. Screens are rendered
// directly in unit tests, without the root layout that provides it, so the
// library's own mock stands in with zero insets.
// The mock is an ES default export, so it arrives wrapped once Babel compiles it.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

// The Supabase client throws at import time when EXPO_PUBLIC_SUPABASE_URL and
// friends are absent, which they are under Jest. Any module that transitively
// reaches it would take its whole suite down -- so this stands in by default.
// Suites that assert on queries still declare their own
// jest.mock('../../lib/supabase', ...), which takes precedence over this.
jest.mock('./src/lib/supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
    from: jest.fn(),
    auth: {
      getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
  },
}));
