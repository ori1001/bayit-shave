module.exports = {
  preset: 'jest-expo',
  testPathIgnorePatterns: ['/node_modules/', 'supabase/', '/e2e/'],
  resolver: '<rootDir>/jest.resolver.js',
  setupFiles: ['<rootDir>/jest.setup.js'],
};
