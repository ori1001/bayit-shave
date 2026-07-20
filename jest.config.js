module.exports = {
  preset: 'jest-expo',
  testPathIgnorePatterns: ['/node_modules/', 'supabase/', '/e2e/'],
  resolver: 'react-native-worklets/jest/resolver',
};
