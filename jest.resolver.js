/**
 * Custom Jest resolver that composes two first-party resolvers instead of
 * replacing either of them:
 *
 * 1. `react-native-worklets/jest/resolver.js` — for worklets-related module
 *    paths, strips `native`-containing extensions so Jest resolves the
 *    JS-safe path instead of native-only worklets files (fixes
 *    `TypeError: Cannot read properties of undefined (reading 'loadUnpackers')`).
 * 2. `@react-native/jest-preset/jest/resolver.js` (jest-expo's own preset
 *    resolver) — unconditionally strips the `exports` field from
 *    `react-native`'s own package.json so Jest's `.ios.js`/`.android.js`/
 *    `.native.js` platform-extension resolution isn't constrained by that
 *    package's `exports` map.
 *
 * Both resolvers work the same way: they mutate `options` and then call
 * `options.defaultResolver(request, options)`. Neither one calls the other
 * module directly, so to compose them we point the worklets resolver's
 * `defaultResolver` at a wrapper that runs the RN preset resolver, which in
 * turn is wired back to the *real* default resolver. That way both
 * transformations (extensions filtering + packageFilter stripping) apply to
 * the single, final call into Jest's real default resolver.
 */
const workletsResolver = require('react-native-worklets/jest/resolver');
const rnPresetResolver = require('@react-native/jest-preset/jest/resolver.js');

module.exports = (request, options) => {
  const realDefaultResolver = options.defaultResolver;

  // When the worklets resolver calls "defaultResolver", route it through the
  // RN preset resolver first (so react-native's exports field still gets
  // stripped), and give that call back the real default resolver so it
  // doesn't loop back into this wrapper.
  const rnAwareDefaultResolver = (req, opts) =>
    rnPresetResolver(req, { ...opts, defaultResolver: realDefaultResolver });

  return workletsResolver(request, {
    ...options,
    defaultResolver: rnAwareDefaultResolver,
  });
};
