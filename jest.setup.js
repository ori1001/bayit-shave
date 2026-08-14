// AsyncStorage is a native module, so anything importing it (the offline
// completion queue, the Supabase auth storage adapter, calendar sync) fails to
// load under Jest without the library's own mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
