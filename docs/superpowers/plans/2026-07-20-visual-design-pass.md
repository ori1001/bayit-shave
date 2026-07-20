# Visual Design Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every screen gets the colorful, icon-based, card-driven, lightly-animated look that was originally mocked up during brainstorming but never implemented — all 5 core-feature plans were built with flat, undecorated `View`/`Text`/`Pressable` markup to prioritize working logic first. This plan is purely visual: no business logic, no new Edge Functions, no new API functions, no schema changes. Every existing `testID` is preserved exactly so no existing Jest test or established manual-verification flow breaks.

**Architecture:** A small shared design system (`src/theme/`: colors, spacing, radii, a category→icon+color map) plus three reusable primitives (`src/components/Card.tsx`, `src/components/AnimatedPressable.tsx`, `src/components/CategoryIcon.tsx`) built once in Task 1, then applied screen-by-screen in Tasks 2–7. Icons come from `@expo/vector-icons`'s `Ionicons` set (added as a real dependency in Task 1 — every icon name used anywhere in this plan has been verified to exist in the installed glyph map before being written into a task). Microanimations come from `react-native-reanimated` (already a dependency, previously unused in application code) via a scale-on-press spring wrapped into `AnimatedPressable`, used everywhere a `Pressable` is used today.

**Tech Stack:** Expo/TypeScript/Expo Router client (no backend changes this plan). `@expo/vector-icons` (new), `react-native-reanimated` (already present).

## Global Constraints

- **Every existing `testID` on every screen must be preserved character-for-character.** These are load-bearing: they're used by the existing Jest suite indirectly (through screen behavior) and by every prior plan's manual-verification/Playwright evidence trail, and future work will keep relying on them. Do not rename, remove, or add new ones unless a task explicitly calls for it.
- **No behavior changes except the two explicitly called out in Task 7** (rendering the already-defined-but-unused `calendar.newDateLabel` i18n key, and adding a try/catch error surface to the calendar's date-save action — both were open Minor findings from the Calendar & Schedule plan's final review, closed here as a byproduct of touching those exact lines for restyling, not scope creep).
- **No new Edge Functions, no new client API functions, no schema/migration changes.** This plan only touches `src/app/**`, `src/theme/**`, `src/components/**`, `src/i18n/locales/*.json` (only for the one new key in Task 7), `package.json`/`package-lock.json` (one new dependency), and `app.json` is untouched.
- Every icon name used in this plan (`restaurant-outline`, `sparkles-outline`, `shirt-outline`, `trash-outline`, `cart-outline`, `paw-outline`, `leaf-outline`, `water-outline`, `ellipsis-horizontal-circle-outline`, `home-outline`, `person-add-outline`, `log-in-outline`, `add-circle-outline`, `people-outline`, `stats-chart-outline`, `airplane-outline`, `calendar-outline`, `file-tray-full-outline`, `checkmark-circle`, `close-circle`, `swap-horizontal-outline`, `pricetag-outline`, `hourglass-outline`, `shuffle-outline`, `chevron-back`, `chevron-forward`) has been verified to exist in the installed `Ionicons` glyph map (`node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json`) before being written into this plan — implementers should not need to guess or substitute names.
- Hebrew-first RTL / English LTR support (i18next, already wired) must keep working — every string stays behind `t(...)`, no hardcoded copy introduced.
- After every task: run the full Jest suite (`npm test`) and confirm the same pass count as before the task (currently 41/41 — Tasks 1 onward may raise this as Task 1 adds a handful of new component/theme tests).

## File Structure

```
/src
  /theme
    colors.ts          # new — semantic color tokens
    spacing.ts          # new — spacing + radius scale
    categories.ts         # new — CATEGORY_META (icon+color per MissionCategory) + IoniconName type
    index.ts                # new — re-exports the above
    __tests__/
      categories.test.ts      # new
  /components
    Card.tsx              # new — surface container (shadow, radius, border)
    AnimatedPressable.tsx   # new — Pressable + Reanimated scale-on-press
    CategoryIcon.tsx          # new — colored icon badge for a mission category
    __tests__/
      CategoryIcon.test.tsx     # new
      AnimatedPressable.test.tsx  # new
  /app
    _layout.tsx            # MODIFIED — themed default screen background
    index.tsx                # MODIFIED — welcome/auth screen restyle
    today.tsx                  # MODIFIED — today screen restyle
    balance.tsx                  # MODIFIED — balance screen restyle
    calendar.tsx                   # MODIFIED — calendar screen restyle + 2 bonus fixes
    /missions
      suggest.tsx                    # MODIFIED — suggest-mission screen restyle
      suggestions.tsx                   # MODIFIED — suggestions inbox restyle
    /onboarding
      create-house.tsx                    # MODIFIED — create-house screen restyle
      join-house.tsx                        # MODIFIED — join-house screen restyle
    /unavailability
      suggest.tsx                             # MODIFIED — unavailability screen restyle
  /i18n/locales
    he.json                # MODIFIED — one new key, calendar.saveError
    en.json                  # MODIFIED — same, English
```

---

### Task 1: Design system foundation

**Files:**
- Create: `src/theme/colors.ts`
- Create: `src/theme/spacing.ts`
- Create: `src/theme/categories.ts`
- Create: `src/theme/index.ts`
- Create: `src/components/Card.tsx`
- Create: `src/components/AnimatedPressable.tsx`
- Create: `src/components/CategoryIcon.tsx`
- Test: `src/theme/__tests__/categories.test.ts`
- Test: `src/components/__tests__/CategoryIcon.test.tsx`
- Test: `src/components/__tests__/AnimatedPressable.test.tsx`
- Modify: `src/app/_layout.tsx`
- Modify: `package.json` (add `@expo/vector-icons`)

**Interfaces:**
- Produces: `colors`, `spacing`, `radii`, `CATEGORY_META`, `MISSION_CATEGORIES`, `IoniconName` — all re-exported from `src/theme/index.ts`. Every later task imports from `'../theme'` (or `'../../theme'` for nested routes).
- Produces: `<Card style={ViewStyle} testID={string}>` (thin `View` wrapper with the app's card look), `<AnimatedPressable onPress disabled testID style={ViewStyle}>` (drop-in `Pressable` replacement with a press-in/press-out scale spring), `<CategoryIcon category={string} size={number} testID={string}>` (colored circular badge with the category's icon, falls back to `other`'s look for an unrecognized category).

- [ ] **Step 1: Install `@expo/vector-icons`**

```bash
npx expo install @expo/vector-icons
```

This resolves and pins the SDK 57-compatible version (already verified during plan authoring to install cleanly as `^15.0.2` against this project's Expo SDK).

- [ ] **Step 2: Write the failing tests**

`src/theme/__tests__/categories.test.ts`:

```ts
import { CATEGORY_META, MISSION_CATEGORIES } from '../categories';

describe('CATEGORY_META', () => {
  it('has an entry for every mission category with a valid hex color and non-empty icon name', () => {
    for (const category of MISSION_CATEGORIES) {
      const meta = CATEGORY_META[category];
      expect(meta).toBeDefined();
      expect(meta.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(typeof meta.icon).toBe('string');
      expect(meta.icon.length).toBeGreaterThan(0);
    }
  });

  it('has a fallback entry for unknown categories via "other"', () => {
    expect(CATEGORY_META.other).toBeDefined();
  });

  it('covers exactly the 9 categories used elsewhere in the app', () => {
    expect(MISSION_CATEGORIES).toEqual(['dishes', 'clean', 'laundry', 'trash', 'shop', 'pets', 'garden', 'bath', 'other']);
  });
});
```

`src/components/__tests__/CategoryIcon.test.tsx`:

```tsx
import { render } from '@testing-library/react-native';
import { CategoryIcon } from '../CategoryIcon';

describe('CategoryIcon', () => {
  it('renders without crashing for a known category', () => {
    const { getByTestId } = render(<CategoryIcon category="dishes" testID="category-icon-dishes" />);
    expect(getByTestId('category-icon-dishes')).toBeTruthy();
  });

  it('falls back to the "other" style for an unrecognized category instead of crashing', () => {
    const { getByTestId } = render(<CategoryIcon category="not_a_real_category" testID="category-icon-unknown" />);
    expect(getByTestId('category-icon-unknown')).toBeTruthy();
  });
});
```

`src/components/__tests__/AnimatedPressable.test.tsx`:

```tsx
import { render, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';

describe('AnimatedPressable', () => {
  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <AnimatedPressable onPress={onPress} testID="animated-pressable-test">
        <Text>Press me</Text>
      </AnimatedPressable>
    );
    fireEvent.press(getByTestId('animated-pressable-test'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <AnimatedPressable onPress={onPress} disabled testID="animated-pressable-disabled">
        <Text>Press me</Text>
      </AnimatedPressable>
    );
    fireEvent.press(getByTestId('animated-pressable-disabled'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest src/theme/__tests__/categories.test.ts src/components/__tests__/CategoryIcon.test.tsx src/components/__tests__/AnimatedPressable.test.tsx
```

Expected: FAIL — none of `categories.ts`, `CategoryIcon.tsx`, `AnimatedPressable.tsx` exist yet.

- [ ] **Step 3: Implement the theme files**

`src/theme/colors.ts`:

```ts
export const colors = {
  ink: '#26332E',
  cream: '#F6F1E4',
  sage: '#7C9473',
  rose: '#A6425A',
  teal: '#4C7A8C',
  indigo: '#5B72C9',
  violet: '#8B5FBF',
  amber: '#E0A845',
  surface: '#FFFFFF',
  background: '#FAF8F2',
  border: '#E5E1D6',
  textMuted: '#6B6459',
} as const;
```

`src/theme/spacing.ts`:

```ts
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;
```

`src/theme/categories.ts`:

```ts
import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';

export type IoniconName = ComponentProps<typeof Ionicons>['name'];

export interface CategoryMeta {
  color: string;
  icon: IoniconName;
}

export const MISSION_CATEGORIES = ['dishes', 'clean', 'laundry', 'trash', 'shop', 'pets', 'garden', 'bath', 'other'] as const;

export const CATEGORY_META: Record<string, CategoryMeta> = {
  dishes: { color: '#1F9E93', icon: 'restaurant-outline' },
  clean: { color: '#8B5FBF', icon: 'sparkles-outline' },
  laundry: { color: '#5B72C9', icon: 'shirt-outline' },
  trash: { color: '#E0793A', icon: 'trash-outline' },
  shop: { color: '#D45A82', icon: 'cart-outline' },
  pets: { color: '#D99A2B', icon: 'paw-outline' },
  garden: { color: '#7AA23E', icon: 'leaf-outline' },
  bath: { color: '#3FAFC9', icon: 'water-outline' },
  other: { color: '#888888', icon: 'ellipsis-horizontal-circle-outline' },
};
```

`src/theme/index.ts`:

```ts
export * from './colors';
export * from './spacing';
export * from './categories';
```

- [ ] **Step 4: Implement the components**

`src/components/Card.tsx`:

```tsx
import { View, StyleSheet, type ViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii, spacing } from '../theme';

interface CardProps extends ViewProps {
  style?: StyleProp<ViewStyle>;
}

export function Card({ style, children, ...rest }: CardProps) {
  return (
    <View {...rest} style={[styles.card, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
});
```

`src/components/AnimatedPressable.tsx`:

```tsx
import { useCallback } from 'react';
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

interface AnimatedPressableProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
}

export function AnimatedPressable({ style, disabled, onPressIn, onPressOut, ...rest }: AnimatedPressableProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      scale.value = withSpring(0.96, { damping: 15, stiffness: 300 });
      onPressIn?.(event);
    },
    [onPressIn, scale]
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      scale.value = withSpring(1, { damping: 15, stiffness: 300 });
      onPressOut?.(event);
    },
    [onPressOut, scale]
  );

  return (
    <AnimatedPressableBase
      {...rest}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, animatedStyle, disabled ? { opacity: 0.5 } : null]}
    />
  );
}
```

`src/components/CategoryIcon.tsx`:

```tsx
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CATEGORY_META } from '../theme';

interface CategoryIconProps {
  category: string;
  size?: number;
  testID?: string;
}

export function CategoryIcon({ category, size = 22, testID }: CategoryIconProps) {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.other;
  const badgeSize = size + 14;
  return (
    <View
      testID={testID}
      style={[
        styles.badge,
        { width: badgeSize, height: badgeSize, borderRadius: badgeSize / 2, backgroundColor: `${meta.color}22` },
      ]}
    >
      <Ionicons name={meta.icon} size={size * 0.64} color={meta.color} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
```

- [ ] **Step 5: Give the root stack a themed background**

Modify `src/app/_layout.tsx`:

```tsx
import '../i18n';

import { Stack } from 'expo-router';
import { colors } from '../theme';

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npx jest src/theme/__tests__/categories.test.ts src/components/__tests__/CategoryIcon.test.tsx src/components/__tests__/AnimatedPressable.test.tsx
```

Expected: PASS, 5/5 (2 + 2 + 1... verify exact count matches the test blocks above: `categories.test.ts` has 3 tests, `CategoryIcon.test.tsx` has 2, `AnimatedPressable.test.tsx` has 2 — 7 total).

- [ ] **Step 7: Run the full suite**

```bash
npm test
```

Expected: PASS, previous 41 + 7 new = 48/48.

- [ ] **Step 8: Commit**

```bash
git add src/theme src/components package.json package-lock.json src/app/_layout.tsx
git commit -m "feat: add design system foundation (theme, Card, AnimatedPressable, CategoryIcon)"
```

---

### Task 2: Welcome + onboarding screens restyle

**Files:**
- Modify: `src/app/index.tsx`
- Modify: `src/app/onboarding/create-house.tsx`
- Modify: `src/app/onboarding/join-house.tsx`

**Interfaces:**
- Consumes: `colors`, `spacing`, `radii` from `'../theme'` (or `'../../theme'`), `AnimatedPressable` from `'../components/AnimatedPressable'` (or `'../../components/AnimatedPressable'`) — all built in Task 1.
- Produces: nothing new — leaf screens.

All three files below are **complete replacements** — every `testID`, every handler, every piece of state and logic is unchanged from the current file; only imports and JSX/styling change.

- [ ] **Step 1: Replace `src/app/index.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { signUp, signIn } from '../features/auth/api';
import { getMyHouseId } from '../features/missions/api';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { colors, spacing, radii } from '../theme';

export default function WelcomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'signUp' | 'signIn'>('signUp');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setHasSession(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (hasSession) {
      getMyHouseId()
        .then((houseId) => {
          if (houseId) {
            router.replace('/today');
          }
        })
        .catch(() => {
          // no-op: if the house check fails, the user just sees the create/join buttons
        });
    }
  }, [hasSession]);

  async function handleAuthSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'signUp') {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error');
    } finally {
      setSubmitting(false);
    }
  }

  if (hasSession === null) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  if (!hasSession) {
    return (
      <View style={styles.screen}>
        <View style={styles.brand}>
          <Ionicons name="home-outline" size={36} color={colors.ink} />
          <Text style={styles.appName}>{t('onboarding.appName')}</Text>
        </View>
        <Text style={styles.tagline}>{t('onboarding.tagline')}</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder={t('auth.emailLabel')}
          testID="auth-email-input"
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder={t('auth.passwordLabel')}
          testID="auth-password-input"
          secureTextEntry
          style={styles.input}
        />
        {error && (
          <Text testID="auth-error" style={styles.errorText}>
            {error}
          </Text>
        )}
        <AnimatedPressable
          onPress={handleAuthSubmit}
          disabled={submitting || !email || !password}
          testID="auth-submit"
          style={styles.primaryButton}
        >
          <Ionicons name={mode === 'signUp' ? 'person-add-outline' : 'log-in-outline'} size={18} color={colors.cream} />
          <Text style={styles.primaryButtonText}>{t(mode === 'signUp' ? 'auth.signUp' : 'auth.signIn')}</Text>
        </AnimatedPressable>
        <AnimatedPressable onPress={() => setMode(mode === 'signUp' ? 'signIn' : 'signUp')} testID="auth-switch-mode">
          <Text style={styles.switchModeText}>{t(mode === 'signUp' ? 'auth.switchToSignIn' : 'auth.switchToSignUp')}</Text>
        </AnimatedPressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.brand}>
        <Ionicons name="home-outline" size={36} color={colors.ink} />
        <Text style={styles.appName}>{t('onboarding.appName')}</Text>
      </View>
      <Text style={styles.tagline}>{t('onboarding.tagline')}</Text>
      <View style={{ width: '100%', gap: spacing.md, marginTop: spacing.lg }}>
        <AnimatedPressable onPress={() => router.push('/onboarding/create-house')} testID="welcome-create-house" style={styles.primaryButton}>
          <Ionicons name="add-circle-outline" size={18} color={colors.cream} />
          <Text style={styles.primaryButtonText}>{t('onboarding.createHouse')}</Text>
        </AnimatedPressable>
        <AnimatedPressable onPress={() => router.push('/onboarding/join-house')} testID="welcome-join-house" style={styles.secondaryButton}>
          <Ionicons name="people-outline" size={18} color={colors.ink} />
          <Text style={styles.secondaryButtonText}>{t('onboarding.joinHouse')}</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.ink,
  },
  tagline: {
    textAlign: 'center',
    color: colors.textMuted,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  errorText: {
    color: colors.rose,
  },
  primaryButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.ink,
    borderRadius: radii.lg,
    padding: spacing.md,
    width: '100%',
  },
  primaryButtonText: {
    color: colors.cream,
    fontWeight: '700',
  },
  secondaryButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  secondaryButtonText: {
    color: colors.ink,
    fontWeight: '700',
  },
  switchModeText: {
    color: colors.textMuted,
  },
});
```

- [ ] **Step 2: Replace `src/app/onboarding/create-house.tsx`**

```tsx
import { useState } from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { createHouse } from '../../features/onboarding/api';
import { AnimatedPressable } from '../../components/AnimatedPressable';
import { colors, spacing, radii } from '../../theme';

export default function CreateHouseScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [houseName, setHouseName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await createHouse(houseName, adminName);
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Ionicons name="home-outline" size={28} color={colors.ink} />
        <Text style={styles.title}>{t('onboarding.createHouse')}</Text>
      </View>
      <Text style={styles.label}>{t('onboarding.houseNameLabel')}</Text>
      <TextInput value={houseName} onChangeText={setHouseName} testID="house-name-input" style={styles.input} />
      <Text style={styles.label}>{t('onboarding.yourNameLabel')}</Text>
      <TextInput value={adminName} onChangeText={setAdminName} testID="admin-name-input" style={styles.input} />
      {error && (
        <Text testID="create-house-error" style={styles.errorText}>
          {error}
        </Text>
      )}
      <AnimatedPressable
        onPress={handleSubmit}
        disabled={submitting || !houseName || !adminName}
        testID="create-house-submit"
        style={styles.submitButton}
      >
        <Text style={styles.submitButtonText}>{t('onboarding.submit')}</Text>
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
  },
  label: {
    color: colors.textMuted,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  errorText: {
    color: colors.rose,
  },
  submitButton: {
    backgroundColor: colors.ink,
    borderRadius: radii.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  submitButtonText: {
    color: colors.cream,
    fontWeight: '700',
  },
});
```

- [ ] **Step 3: Replace `src/app/onboarding/join-house.tsx`**

```tsx
import { useState } from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { joinHouse } from '../../features/onboarding/api';
import { AnimatedPressable } from '../../components/AnimatedPressable';
import { colors, spacing, radii } from '../../theme';

export default function JoinHouseScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await joinHouse(inviteCode, name);
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Ionicons name="people-outline" size={28} color={colors.ink} />
        <Text style={styles.title}>{t('onboarding.joinHouse')}</Text>
      </View>
      <Text style={styles.label}>{t('onboarding.inviteCodeLabel')}</Text>
      <TextInput value={inviteCode} onChangeText={setInviteCode} testID="invite-code-input" style={styles.input} />
      <Text style={styles.label}>{t('onboarding.yourNameLabel')}</Text>
      <TextInput value={name} onChangeText={setName} testID="join-name-input" style={styles.input} />
      {error && (
        <Text testID="join-house-error" style={styles.errorText}>
          {error}
        </Text>
      )}
      <AnimatedPressable
        onPress={handleSubmit}
        disabled={submitting || !inviteCode || !name}
        testID="join-house-submit"
        style={styles.submitButton}
      >
        <Text style={styles.submitButtonText}>{t('onboarding.submit')}</Text>
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
  },
  label: {
    color: colors.textMuted,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  errorText: {
    color: colors.rose,
  },
  submitButton: {
    backgroundColor: colors.ink,
    borderRadius: radii.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  submitButtonText: {
    color: colors.cream,
    fontWeight: '700',
  },
});
```

- [ ] **Step 4: Run the full Jest suite**

```bash
npm test
```

Expected: PASS, same count as after Task 1 (no new tests this task — pure restyle of screens with existing behavior coverage).

- [ ] **Step 5: Manual verification with real evidence**

Start the stack (`npx expo start --web` if not already running) and drive the real screens with browser tools:
1. Load `/` signed out — confirm the home icon + app name render, email/password fields and sign-up/sign-in submit button render with the new styling, `auth-submit`/`auth-switch-mode`/`auth-email-input`/`auth-password-input` testIDs still present and functional (sign up a fresh test account, confirm it still redirects correctly).
2. After sign-up with no house yet, confirm `welcome-create-house`/`welcome-join-house` buttons render with icons.
3. Click through to `/onboarding/create-house` and `/onboarding/join-house`, confirm the header icon+title render and the form still submits successfully (`create-house-submit`/`join-house-submit` still work, still redirect to `/` then `/today`).
4. Take at least one screenshot showing the new icon-based welcome screen.

Report specific evidence (account email used, screenshot filename) in `.superpowers/sdd/task-2-report.md` (design plan numbering restarts at Task 1 for this plan — use a fresh report path distinct from the Calendar & Schedule plan's `task-2-report.md`, e.g. prefix with `design-`).

- [ ] **Step 6: Commit**

```bash
git add src/app/index.tsx src/app/onboarding/create-house.tsx src/app/onboarding/join-house.tsx
git commit -m "feat: restyle welcome and onboarding screens with design system"
```

---

### Task 3: Today screen restyle

**Files:**
- Modify: `src/app/today.tsx`

**Interfaces:**
- Consumes: `colors`, `spacing`, `radii` from `'../theme'`, `AnimatedPressable`, `Card`, `CategoryIcon` from `'../components/*'` — all from Task 1.
- Produces: nothing new — leaf screen.

- [ ] **Step 1: Replace `src/app/today.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { View, Text, FlatList, TextInput, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getMyHouseId, getMyMembership, getTodayMissions, getHouseMembers, completeMission, editMissionPoints, type Mission } from '../features/missions/api';
import { getMyIncomingSwaps, suggestSwap, respondSwap, type SwapRequest } from '../features/requests/api';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Card } from '../components/Card';
import { CategoryIcon } from '../components/CategoryIcon';
import { colors, spacing, radii } from '../theme';

export default function TodayScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [houseId, setHouseId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);
  const [editPointsValue, setEditPointsValue] = useState('');
  const [pointsEditFeedback, setPointsEditFeedback] = useState<string | null>(null);
  const [pointsEditError, setPointsEditError] = useState<string | null>(null);
  const [members, setMembers] = useState<{ id: string; name: string; role: 'admin' | 'member' }[]>([]);
  const [incomingSwaps, setIncomingSwaps] = useState<SwapRequest[]>([]);
  const [swappingMissionId, setSwappingMissionId] = useState<string | null>(null);
  const [myMemberId, setMyMemberId] = useState<string | null>(null);

  async function load() {
    const hId = await getMyHouseId();
    if (!hId) {
      router.replace('/');
      return;
    }
    setHouseId(hId);
    const membership = await getMyMembership(hId);
    setIsAdmin(membership?.role === 'admin');
    if (membership) {
      setMyMemberId(membership.id);
      const [todayMissions, houseMembers, swaps] = await Promise.all([
        getTodayMissions(hId, membership.id),
        getHouseMembers(hId),
        getMyIncomingSwaps(hId, membership.id),
      ]);
      setMissions(todayMissions);
      setMembers(houseMembers);
      setIncomingSwaps(swaps);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleComplete(missionId: string) {
    await completeMission(missionId);
    await load();
  }

  function startEditPoints(mission: Mission) {
    setEditingMissionId(mission.id);
    setEditPointsValue(String(mission.points));
  }

  async function handleSaveEditPoints(missionId: string) {
    setPointsEditError(null);
    try {
      await editMissionPoints(missionId, Number(editPointsValue));
      setEditingMissionId(null);
      if (!isAdmin) {
        setPointsEditFeedback(t('missions.pointsProposalSent'));
        setTimeout(() => setPointsEditFeedback(null), 4000);
      }
      await load();
    } catch (e) {
      setPointsEditError(e instanceof Error ? e.message : t('missions.editPointsError'));
    }
  }

  async function handleRequestSwap(missionId: string, toMemberId: string) {
    await suggestSwap(missionId, toMemberId);
    setSwappingMissionId(null);
    await load();
  }

  async function handleRespondSwap(swapId: string, decision: 'accept' | 'decline') {
    await respondSwap(swapId, decision);
    await load();
  }

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.greeting}>{t('today.greeting')}</Text>
      {incomingSwaps.length > 0 && (
        <Card style={styles.swapCard}>
          <Text style={styles.sectionTitle}>{t('swap.incomingTitle')}</Text>
          {incomingSwaps.map((swap) => (
            <View key={swap.id} testID={`incoming-swap-${swap.id}`} style={styles.swapRow}>
              <Text style={styles.swapFromName}>{members.find((m) => m.id === swap.from_member)?.name ?? swap.from_member}</Text>
              <AnimatedPressable onPress={() => handleRespondSwap(swap.id, 'accept')} testID={`accept-swap-${swap.id}`} style={styles.iconButton}>
                <Ionicons name="checkmark-circle" size={22} color={colors.sage} />
              </AnimatedPressable>
              <AnimatedPressable onPress={() => handleRespondSwap(swap.id, 'decline')} testID={`decline-swap-${swap.id}`} style={styles.iconButton}>
                <Ionicons name="close-circle" size={22} color={colors.rose} />
              </AnimatedPressable>
            </View>
          ))}
        </Card>
      )}
      {pointsEditFeedback && (
        <Text testID="points-edit-feedback" style={styles.feedbackText}>
          {pointsEditFeedback}
        </Text>
      )}
      {pointsEditError && (
        <Text testID="points-edit-error" style={styles.errorText}>
          {pointsEditError}
        </Text>
      )}
      <FlatList
        data={missions}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ gap: spacing.sm }}
        ListEmptyComponent={<Text style={styles.emptyText}>{t('today.noMissions')}</Text>}
        renderItem={({ item }) => (
          <View style={{ gap: spacing.xs }}>
            <AnimatedPressable onPress={() => handleComplete(item.id)} testID={`mission-row-${item.id}`}>
              <Card style={styles.missionCard}>
                <CategoryIcon category={item.category} />
                <Text style={styles.missionTitle}>{item.title}</Text>
                <Text style={styles.missionPoints}>{item.points}</Text>
                <AnimatedPressable onPress={() => startEditPoints(item)} testID={`edit-points-${item.id}`} style={styles.smallAction}>
                  <Text style={styles.smallActionText}>{t('missions.editPoints')}</Text>
                </AnimatedPressable>
                <AnimatedPressable onPress={() => setSwappingMissionId(item.id)} testID={`swap-${item.id}`} style={styles.smallAction}>
                  <Ionicons name="swap-horizontal-outline" size={16} color={colors.textMuted} />
                </AnimatedPressable>
              </Card>
            </AnimatedPressable>
            {editingMissionId === item.id && (
              <View style={styles.inlineEditRow}>
                <TextInput
                  value={editPointsValue}
                  onChangeText={setEditPointsValue}
                  keyboardType="numeric"
                  testID={`edit-points-input-${item.id}`}
                  style={styles.inlineInput}
                />
                <AnimatedPressable onPress={() => handleSaveEditPoints(item.id)} testID={`edit-points-save-${item.id}`} style={styles.smallAction}>
                  <Text style={styles.saveText}>{t('missions.save')}</Text>
                </AnimatedPressable>
                <AnimatedPressable onPress={() => setEditingMissionId(null)} testID={`edit-points-cancel-${item.id}`} style={styles.smallAction}>
                  <Text style={styles.cancelText}>{t('missions.cancel')}</Text>
                </AnimatedPressable>
              </View>
            )}
            {swappingMissionId === item.id && (
              <View style={styles.swapTargetRow}>
                <Text style={styles.swapTargetLabel}>{t('swap.selectMember')}</Text>
                {members
                  .filter((m) => m.id !== myMemberId)
                  .map((m) => (
                    <AnimatedPressable
                      key={m.id}
                      onPress={() => handleRequestSwap(item.id, m.id)}
                      testID={`swap-target-${item.id}-${m.id}`}
                      style={styles.chip}
                    >
                      <Text style={styles.chipText}>{m.name}</Text>
                    </AnimatedPressable>
                  ))}
              </View>
            )}
          </View>
        )}
      />
      <View style={{ gap: spacing.sm }}>
        <AnimatedPressable
          onPress={() => router.push({ pathname: '/missions/suggest', params: { houseId: houseId ?? '' } })}
          testID="today-suggest-mission"
          style={styles.primaryButton}
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.cream} />
          <Text style={styles.primaryButtonText}>{t('today.suggestMission')}</Text>
        </AnimatedPressable>
        <AnimatedPressable
          onPress={() => router.push({ pathname: '/balance', params: { houseId: houseId ?? '' } })}
          testID="today-balance"
          style={[styles.secondaryButton, { borderColor: colors.teal }]}
        >
          <Ionicons name="stats-chart-outline" size={18} color={colors.teal} />
          <Text style={[styles.secondaryButtonText, { color: colors.teal }]}>{t('today.balance')}</Text>
        </AnimatedPressable>
        <AnimatedPressable
          onPress={() => router.push({ pathname: '/unavailability/suggest', params: { houseId: houseId ?? '' } })}
          testID="today-unavailability"
          style={[styles.secondaryButton, { borderColor: colors.violet }]}
        >
          <Ionicons name="airplane-outline" size={18} color={colors.violet} />
          <Text style={[styles.secondaryButtonText, { color: colors.violet }]}>{t('today.unavailability')}</Text>
        </AnimatedPressable>
        <AnimatedPressable
          onPress={() => router.push({ pathname: '/calendar', params: { houseId: houseId ?? '' } })}
          testID="today-calendar"
          style={[styles.secondaryButton, { borderColor: colors.indigo }]}
        >
          <Ionicons name="calendar-outline" size={18} color={colors.indigo} />
          <Text style={[styles.secondaryButtonText, { color: colors.indigo }]}>{t('today.calendar')}</Text>
        </AnimatedPressable>
        {isAdmin && (
          <AnimatedPressable
            onPress={() => router.push({ pathname: '/missions/suggestions', params: { houseId: houseId ?? '' } })}
            testID="today-suggestions-inbox"
            style={[styles.secondaryButton, { borderColor: colors.ink }]}
          >
            <Ionicons name="file-tray-full-outline" size={18} color={colors.ink} />
            <Text style={[styles.secondaryButtonText, { color: colors.ink }]}>{t('today.suggestions')}</Text>
          </AnimatedPressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: spacing.xl,
    gap: spacing.lg,
    backgroundColor: colors.background,
  },
  greeting: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.ink,
  },
  sectionTitle: {
    fontWeight: '700',
    color: colors.ink,
  },
  swapCard: {
    gap: spacing.sm,
  },
  swapRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  swapFromName: {
    flex: 1,
    color: colors.ink,
  },
  iconButton: {
    padding: spacing.xs,
  },
  feedbackText: {
    color: colors.sage,
  },
  errorText: {
    color: colors.rose,
  },
  emptyText: {
    color: colors.textMuted,
  },
  missionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  missionTitle: {
    flex: 1,
    fontWeight: '700',
    color: colors.ink,
  },
  missionPoints: {
    color: colors.textMuted,
    fontWeight: '700',
  },
  smallAction: {
    padding: spacing.xs,
  },
  smallActionText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  inlineEditRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingStart: 32,
    alignItems: 'center',
  },
  inlineInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: spacing.sm,
    width: 80,
    backgroundColor: colors.surface,
  },
  saveText: {
    color: colors.sage,
    fontWeight: '700',
  },
  cancelText: {
    color: colors.rose,
    fontWeight: '700',
  },
  swapTargetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingStart: 32,
  },
  swapTargetLabel: {
    width: '100%',
    fontSize: 12,
    color: colors.textMuted,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: spacing.sm,
    backgroundColor: colors.surface,
  },
  chipText: {
    fontSize: 11,
    color: colors.ink,
  },
  primaryButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.ink,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  primaryButtonText: {
    color: colors.cream,
    fontWeight: '700',
  },
  secondaryButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  secondaryButtonText: {
    fontWeight: '700',
  },
});
```

- [ ] **Step 2: Run the full Jest suite**

```bash
npm test
```

Expected: PASS, same count as after Task 2.

- [ ] **Step 3: Manual verification with real evidence**

Drive the real Today screen with a seeded house (2+ members, 2+ missions with different categories):
1. Confirm each mission row shows the correct `CategoryIcon` (colored badge matching its category) instead of the old empty circle.
2. Confirm `mission-row-*` still completes the mission on tap, `edit-points-*` and `swap-*` still work (inline edit row appears, swap target chips appear and successfully create a swap).
3. Confirm the 4-5 nav buttons at the bottom render with their icons (suggest/balance/unavailability/calendar/[admin] suggestions).
4. Confirm an incoming swap (if any) renders with the new checkmark/close icon buttons and accept/decline still work.
5. Take a screenshot showing the card-based mission list with category icons.

Report evidence in `.superpowers/sdd/design-task-3-report.md`.

- [ ] **Step 4: Commit**

```bash
git add src/app/today.tsx
git commit -m "feat: restyle Today screen with cards, category icons, and animated buttons"
```

---

### Task 4: Missions suggest + suggestions inbox restyle

**Files:**
- Modify: `src/app/missions/suggest.tsx`
- Modify: `src/app/missions/suggestions.tsx`

**Interfaces:**
- Consumes: `colors`, `spacing`, `radii`, `MISSION_CATEGORIES` from `'../../theme'`, `AnimatedPressable`, `Card`, `CategoryIcon` from `'../../components/*'` — all from Task 1.
- Produces: nothing new — leaf screens.

- [ ] **Step 1: Replace `src/app/missions/suggest.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { suggestMission, getHouseMembers, type MissionCategory, type AssignmentMode } from '../../features/missions/api';
import { AnimatedPressable } from '../../components/AnimatedPressable';
import { CategoryIcon } from '../../components/CategoryIcon';
import { colors, spacing, radii, MISSION_CATEGORIES } from '../../theme';

export default function SuggestMissionScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { houseId } = useLocalSearchParams<{ houseId: string }>();

  const [category, setCategory] = useState<MissionCategory>('dishes');
  const [title, setTitle] = useState('');
  const [points, setPoints] = useState('10');
  const [dueDate, setDueDate] = useState('');
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>('auto');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [members, setMembers] = useState<{ id: string; name: string; role: 'admin' | 'member' }[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  useEffect(() => {
    if (houseId) {
      getHouseMembers(houseId)
        .then(setMembers)
        .catch(() => {
          // no-op: if the member list fails to load, direct-assign just stays unavailable
        });
    }
  }, [houseId]);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await suggestMission({
        house_id: houseId,
        category,
        title,
        points: Number(points),
        due_date: dueDate,
        assignment_mode: assignmentMode,
        ...(assignmentMode === 'direct' ? { target_member_id: selectedMemberId! } : {}),
      });
      router.replace('/today');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>{t('missions.suggestTitle')}</Text>

      <Text style={styles.label}>{t('missions.categoryLabel')}</Text>
      <View style={styles.chipRow}>
        {MISSION_CATEGORIES.map((cat) => (
          <AnimatedPressable
            key={cat}
            onPress={() => setCategory(cat)}
            testID={`category-${cat}`}
            style={[styles.categoryChip, category === cat && styles.categoryChipActive]}
          >
            <CategoryIcon category={cat} size={16} />
            <Text style={[styles.categoryChipText, category === cat && styles.categoryChipTextActive]}>{t(`missions.categories.${cat}`)}</Text>
          </AnimatedPressable>
        ))}
      </View>

      <Text style={styles.label}>{t('missions.titleLabel')}</Text>
      <TextInput value={title} onChangeText={setTitle} testID="mission-title-input" style={styles.input} />

      <Text style={styles.label}>{t('missions.pointsLabel')}</Text>
      <TextInput value={points} onChangeText={setPoints} keyboardType="numeric" testID="mission-points-input" style={styles.input} />

      <Text style={styles.label}>{t('missions.dueDateLabel')}</Text>
      <TextInput value={dueDate} onChangeText={setDueDate} placeholder="2026-07-20" testID="mission-due-date-input" style={styles.input} />

      <View style={styles.toggleRow}>
        <AnimatedPressable
          onPress={() => setAssignmentMode('auto')}
          testID="assignment-pool"
          style={[styles.toggleOption, assignmentMode === 'auto' && styles.toggleOptionActive]}
        >
          <Text style={[styles.toggleOptionText, assignmentMode === 'auto' && styles.toggleOptionTextActive]}>{t('missions.assignmentPool')}</Text>
        </AnimatedPressable>
        <AnimatedPressable
          onPress={() => setAssignmentMode('direct')}
          testID="assignment-direct"
          style={[styles.toggleOption, assignmentMode === 'direct' && styles.toggleOptionActive]}
        >
          <Text style={[styles.toggleOptionText, assignmentMode === 'direct' && styles.toggleOptionTextActive]}>{t('missions.assignmentDirect')}</Text>
        </AnimatedPressable>
      </View>

      {assignmentMode === 'direct' && (
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.label}>{t('missions.selectMember')}</Text>
          <View style={styles.chipRow}>
            {members.map((m) => (
              <AnimatedPressable
                key={m.id}
                onPress={() => setSelectedMemberId(m.id)}
                testID={`member-${m.id}`}
                style={[styles.memberChip, selectedMemberId === m.id && styles.memberChipActive]}
              >
                <Text style={[styles.memberChipText, selectedMemberId === m.id && styles.memberChipTextActive]}>{m.name}</Text>
              </AnimatedPressable>
            ))}
          </View>
        </View>
      )}

      {error && (
        <Text testID="suggest-mission-error" style={styles.errorText}>
          {error}
        </Text>
      )}

      <AnimatedPressable
        onPress={handleSubmit}
        disabled={submitting || !title || !points || !dueDate || (assignmentMode === 'direct' && !selectedMemberId)}
        testID="suggest-mission-submit"
        style={styles.submitButton}
      >
        <Ionicons name="add-circle-outline" size={18} color={colors.ink} />
        <Text style={styles.submitButtonText}>{t('missions.submit')}</Text>
      </AnimatedPressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
  },
  label: {
    color: colors.textMuted,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  categoryChipActive: {
    borderColor: colors.ink,
    backgroundColor: colors.ink,
  },
  categoryChipText: {
    color: colors.ink,
  },
  categoryChipTextActive: {
    color: colors.cream,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  toggleOption: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: radii.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.ink,
    backgroundColor: 'transparent',
  },
  toggleOptionActive: {
    backgroundColor: colors.ink,
  },
  toggleOptionText: {
    color: colors.ink,
  },
  toggleOptionTextActive: {
    color: colors.cream,
  },
  memberChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  memberChipActive: {
    borderColor: colors.ink,
    backgroundColor: colors.ink,
  },
  memberChipText: {
    color: colors.ink,
  },
  memberChipTextActive: {
    color: colors.cream,
  },
  errorText: {
    color: colors.rose,
  },
  submitButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.amber,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  submitButtonText: {
    color: colors.ink,
    fontWeight: '800',
  },
});
```

- [ ] **Step 2: Replace `src/app/missions/suggestions.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getSuggestions, resolveSuggestion, getHouseMembers, type Mission } from '../../features/missions/api';
import {
  getPendingSwapsForAdmin,
  getPendingUnavailability,
  resolveSwap,
  resolveUnavailability,
  type SwapRequest,
  type UnavailabilityRequest,
} from '../../features/requests/api';
import { AnimatedPressable } from '../../components/AnimatedPressable';
import { Card } from '../../components/Card';
import { CategoryIcon } from '../../components/CategoryIcon';
import { colors, spacing, radii, type IoniconName } from '../../theme';

function suggestionTypeOf(mission: Mission): 'new_mission' | 'points_edit' | 'schedule_edit' {
  if (mission.status === 'pending_approval') {
    return 'new_mission';
  }
  if (mission.proposed_points !== null) {
    return 'points_edit';
  }
  return 'schedule_edit';
}

const KIND_ICON: Record<'new_mission' | 'points_edit' | 'schedule_edit', IoniconName> = {
  new_mission: 'add-circle-outline',
  points_edit: 'pricetag-outline',
  schedule_edit: 'calendar-outline',
};

type InboxItem =
  | { kind: 'mission'; mission: Mission }
  | { kind: 'swap'; swap: SwapRequest }
  | { kind: 'unavailability'; unavailability: UnavailabilityRequest };

export default function SuggestionsScreen() {
  const { t } = useTranslation();
  const { houseId } = useLocalSearchParams<{ houseId: string }>();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string; role: 'admin' | 'member' }[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [missions, swaps, unavailability, houseMembers] = await Promise.all([
      getSuggestions(houseId),
      getPendingSwapsForAdmin(houseId),
      getPendingUnavailability(houseId),
      getHouseMembers(houseId),
    ]);
    setMembers(houseMembers);
    setItems([
      ...missions.map((mission): InboxItem => ({ kind: 'mission', mission })),
      ...swaps.map((swap): InboxItem => ({ kind: 'swap', swap })),
      ...unavailability.map((unavailability): InboxItem => ({ kind: 'unavailability', unavailability })),
    ]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [houseId]);

  async function handleMissionDecision(mission: Mission, decision: 'approve' | 'reject') {
    await resolveSuggestion(suggestionTypeOf(mission), mission.id, decision);
    await load();
  }

  async function handleSwapDecision(swap: SwapRequest, decision: 'approve' | 'reject') {
    await resolveSwap(swap.id, decision);
    await load();
  }

  async function handleUnavailabilityDecision(unavailability: UnavailabilityRequest, decision: 'approve' | 'reject') {
    await resolveUnavailability(unavailability.id, decision);
    await load();
  }

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{t('suggestions.title')}</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => (item.kind === 'mission' ? item.mission.id : item.kind === 'swap' ? item.swap.id : item.unavailability.id)}
        contentContainerStyle={{ gap: spacing.sm }}
        ListEmptyComponent={<Text style={styles.emptyText}>{t('suggestions.empty')}</Text>}
        renderItem={({ item }) => {
          if (item.kind === 'mission') {
            const kind = suggestionTypeOf(item.mission);
            return (
              <Card testID={`suggestion-${item.mission.id}`} style={styles.card}>
                <View style={styles.cardHeader}>
                  <CategoryIcon category={item.mission.category} size={18} />
                  <Ionicons name={KIND_ICON[kind]} size={14} color={colors.textMuted} />
                  <Text style={styles.cardKind}>
                    {kind === 'new_mission' ? t('suggestions.newMission') : kind === 'points_edit' ? t('suggestions.pointsEdit') : t('suggestions.scheduleEdit')}
                  </Text>
                </View>
                <Text style={styles.cardBody}>
                  {kind === 'new_mission'
                    ? `${item.mission.title} · ${item.mission.points}`
                    : kind === 'points_edit'
                      ? `${item.mission.title} · ${item.mission.points} → ${item.mission.proposed_points}`
                      : `${item.mission.title} · ${item.mission.due_date} → ${item.mission.proposed_due_date}`}
                </Text>
                <View style={styles.decisionRow}>
                  <AnimatedPressable onPress={() => handleMissionDecision(item.mission, 'approve')} testID={`approve-${item.mission.id}`} style={styles.approveButton}>
                    <Text style={styles.approveButtonText}>{t('suggestions.approve')}</Text>
                  </AnimatedPressable>
                  <AnimatedPressable onPress={() => handleMissionDecision(item.mission, 'reject')} testID={`reject-${item.mission.id}`} style={styles.rejectButton}>
                    <Text style={styles.rejectButtonText}>{t('suggestions.reject')}</Text>
                  </AnimatedPressable>
                </View>
              </Card>
            );
          }

          if (item.kind === 'swap') {
            return (
              <Card testID={`suggestion-swap-${item.swap.id}`} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name="swap-horizontal-outline" size={18} color={colors.indigo} />
                  <Text style={styles.cardKind}>{t('suggestions.swap')}</Text>
                </View>
                <Text style={styles.cardBody}>
                  {item.swap.mission_instances?.title ?? ''} · {members.find((m) => m.id === item.swap.from_member)?.name ?? item.swap.from_member} →{' '}
                  {members.find((m) => m.id === item.swap.to_member)?.name ?? item.swap.to_member}
                </Text>
                <View style={styles.decisionRow}>
                  <AnimatedPressable onPress={() => handleSwapDecision(item.swap, 'approve')} testID={`approve-swap-${item.swap.id}`} style={styles.approveButton}>
                    <Text style={styles.approveButtonText}>{t('suggestions.approve')}</Text>
                  </AnimatedPressable>
                  <AnimatedPressable onPress={() => handleSwapDecision(item.swap, 'reject')} testID={`reject-swap-${item.swap.id}`} style={styles.rejectButton}>
                    <Text style={styles.rejectButtonText}>{t('suggestions.reject')}</Text>
                  </AnimatedPressable>
                </View>
              </Card>
            );
          }

          return (
            <Card testID={`suggestion-unavailability-${item.unavailability.id}`} style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="airplane-outline" size={18} color={colors.violet} />
                <Text style={styles.cardKind}>{t('suggestions.unavailability')}</Text>
              </View>
              <Text style={styles.cardBody}>
                {item.unavailability.period_start} → {item.unavailability.period_end}
                {item.unavailability.reason ? ` · ${item.unavailability.reason}` : ''}
              </Text>
              <View style={styles.decisionRow}>
                <AnimatedPressable
                  onPress={() => handleUnavailabilityDecision(item.unavailability, 'approve')}
                  testID={`approve-unavailability-${item.unavailability.id}`}
                  style={styles.approveButton}
                >
                  <Text style={styles.approveButtonText}>{t('suggestions.approve')}</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  onPress={() => handleUnavailabilityDecision(item.unavailability, 'reject')}
                  testID={`reject-unavailability-${item.unavailability.id}`}
                  style={styles.rejectButton}
                >
                  <Text style={styles.rejectButtonText}>{t('suggestions.reject')}</Text>
                </AnimatedPressable>
              </View>
            </Card>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: spacing.xl,
    gap: spacing.lg,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
  },
  emptyText: {
    color: colors.textMuted,
  },
  card: {
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cardKind: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  cardBody: {
    fontWeight: '700',
    color: colors.ink,
  },
  decisionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  approveButton: {
    flex: 1,
    backgroundColor: colors.sage,
    borderRadius: radii.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  approveButtonText: {
    color: colors.surface,
    fontWeight: '700',
  },
  rejectButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.rose,
    borderRadius: radii.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  rejectButtonText: {
    color: colors.rose,
    fontWeight: '700',
  },
});
```

- [ ] **Step 3: Run the full Jest suite**

```bash
npm test
```

Expected: PASS, same count as after Task 3.

- [ ] **Step 4: Manual verification with real evidence**

1. On `suggest.tsx`: confirm each category chip shows its `CategoryIcon`; select a few, confirm active-state styling switches correctly; submit a mission successfully (`suggest-mission-submit` still works, still redirects to `/today`).
2. On `suggestions.tsx`: seed one of each suggestion kind (new_mission via a non-admin, points_edit, schedule_edit, swap, unavailability) and confirm each card renders with the correct icon (add-circle/pricetag/calendar/swap-horizontal/airplane) and the correct category icon for mission-type cards; approve/reject at least two different kinds and confirm they resolve correctly (card disappears, DB state matches — cross-check at least one specific mission/swap/unavailability UUID against Postgres).
3. Screenshot at least one populated inbox showing multiple card kinds with their icons.

Report evidence in `.superpowers/sdd/design-task-4-report.md`.

- [ ] **Step 5: Commit**

```bash
git add src/app/missions/suggest.tsx src/app/missions/suggestions.tsx
git commit -m "feat: restyle mission-suggest and suggestions-inbox screens with design system"
```

---

### Task 5: Balance screen restyle

**Files:**
- Modify: `src/app/balance.tsx`

**Interfaces:**
- Consumes: `colors`, `spacing`, `radii` from `'../theme'`, `AnimatedPressable`, `Card` from `'../components/*'` — all from Task 1.
- Produces: nothing new — leaf screen.

- [ ] **Step 1: Replace `src/app/balance.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getMyMembership } from '../features/missions/api';
import { getPointsPool, getOpenMissions, runBalance, assignMission, type PointsPoolEntry, type OpenMission } from '../features/balance/api';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Card } from '../components/Card';
import { colors, spacing, radii } from '../theme';

export default function BalanceScreen() {
  const { t } = useTranslation();
  const { houseId } = useLocalSearchParams<{ houseId: string }>();
  const [pool, setPool] = useState<PointsPoolEntry[]>([]);
  const [openMissions, setOpenMissions] = useState<OpenMission[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  async function load() {
    const membership = await getMyMembership(houseId);
    setIsAdmin(membership?.role === 'admin');
    const [poolRows, missions] = await Promise.all([getPointsPool(houseId), getOpenMissions(houseId)]);
    setPool(poolRows);
    setOpenMissions(missions);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [houseId]);

  async function handleRunBalance() {
    setRunning(true);
    try {
      await runBalance(houseId);
      await load();
    } finally {
      setRunning(false);
    }
  }

  async function handleManualAssign(missionId: string, memberId: string) {
    await assignMission(missionId, memberId);
    await load();
  }

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{t('balance.title')}</Text>
      <FlatList
        data={pool}
        keyExtractor={(p) => p.member_id}
        contentContainerStyle={{ gap: spacing.sm }}
        renderItem={({ item }) => {
          const target = item.points_target + item.debt;
          const behind = target - item.points_earned;
          const progress = target > 0 ? Math.min(1, Math.max(0, item.points_earned / target)) : 1;
          const onTrack = behind <= 0;
          return (
            <Card testID={`balance-row-${item.member_id}`} style={styles.row}>
              <View style={styles.rowHeader}>
                <Ionicons name={onTrack ? 'checkmark-circle' : 'hourglass-outline'} size={18} color={onTrack ? colors.sage : colors.rose} />
                <Text style={styles.memberName}>{item.name}</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: onTrack ? colors.sage : colors.rose }]} />
              </View>
              <Text style={styles.detailText}>
                {t('balance.earned')}: {item.points_earned} · {t('balance.target')}: {Math.round(item.points_target)}
                {item.debt > 0 ? ` · ${t('balance.debt')}: ${item.debt}` : ''}
              </Text>
              <Text style={styles.detailText}>{behind > 0 ? `${t('balance.behindBy')} ${Math.round(behind)}` : t('balance.onTrack')}</Text>
            </Card>
          );
        }}
      />
      {isAdmin && (
        <AnimatedPressable onPress={handleRunBalance} disabled={running} testID="run-balance" style={styles.primaryButton}>
          <Ionicons name="shuffle-outline" size={18} color={colors.cream} />
          <Text style={styles.primaryButtonText}>{t('balance.runBalance')}</Text>
        </AnimatedPressable>
      )}
      {isAdmin && openMissions.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.sectionTitle}>{t('balance.openMissions')}</Text>
          {openMissions.map((m) => (
            <View key={m.id} testID={`open-mission-${m.id}`} style={styles.openMissionRow}>
              <Text style={styles.openMissionText}>
                {m.title} · {m.points}
              </Text>
              <View style={styles.chipRow}>
                {pool.map((p) => (
                  <AnimatedPressable key={p.member_id} onPress={() => handleManualAssign(m.id, p.member_id)} testID={`assign-${m.id}-${p.member_id}`} style={styles.chip}>
                    <Text style={styles.chipText}>{p.name}</Text>
                  </AnimatedPressable>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: spacing.xl,
    gap: spacing.lg,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
  },
  row: {
    gap: spacing.xs,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  memberName: {
    fontWeight: '700',
    color: colors.ink,
  },
  progressTrack: {
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radii.pill,
  },
  detailText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  sectionTitle: {
    fontWeight: '700',
    color: colors.ink,
  },
  primaryButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.ink,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  primaryButtonText: {
    color: colors.cream,
    fontWeight: '700',
  },
  openMissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  openMissionText: {
    flex: 1,
    color: colors.ink,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: spacing.sm,
    backgroundColor: colors.surface,
  },
  chipText: {
    fontSize: 11,
    color: colors.ink,
  },
});
```

**Note:** `behind`/`target`/`progress` are display-only computations local to the render — the underlying math (`target = points_target + debt`, `behind = target - points_earned`) is unchanged from the current file, just restructured to also drive the new progress-bar width. The displayed "target" text still shows `Math.round(item.points_target)` alone (without debt), exactly as before.

- [ ] **Step 2: Run the full Jest suite**

```bash
npm test
```

Expected: PASS, same count as after Task 4.

- [ ] **Step 3: Manual verification with real evidence**

1. Seed a house where at least one member is behind and one is on-track (or exactly on target). Confirm the checkmark/hourglass icon and progress bar color correctly reflect each member's `onTrack` state, and the progress bar width is visually proportional to `earned/target`.
2. As admin, run `run-balance` and confirm it still works (pool updates, progress bars update).
3. As admin, manually assign an open mission via a member chip and confirm it still works.
4. Screenshot the balance screen showing at least one on-track and one behind member with visibly different progress bar colors.

Report evidence in `.superpowers/sdd/design-task-5-report.md`.

- [ ] **Step 4: Commit**

```bash
git add src/app/balance.tsx
git commit -m "feat: restyle Balance screen with progress bars and status icons"
```

---

### Task 6: Unavailability screen restyle

**Files:**
- Modify: `src/app/unavailability/suggest.tsx`

**Interfaces:**
- Consumes: `colors`, `spacing`, `radii` from `'../../theme'`, `AnimatedPressable` from `'../../components/AnimatedPressable'` — from Task 1.
- Produces: nothing new — leaf screen.

- [ ] **Step 1: Replace `src/app/unavailability/suggest.tsx`**

```tsx
import { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { suggestUnavailability } from '../../features/requests/api';
import { AnimatedPressable } from '../../components/AnimatedPressable';
import { colors, spacing, radii } from '../../theme';

export default function SuggestUnavailabilityScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { houseId } = useLocalSearchParams<{ houseId: string }>();

  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await suggestUnavailability(houseId, periodStart, periodEnd, reason || undefined);
      router.replace('/today');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Ionicons name="airplane-outline" size={26} color={colors.violet} />
        <Text style={styles.title}>{t('unavailability.title')}</Text>
      </View>

      <Text style={styles.label}>{t('unavailability.periodStartLabel')}</Text>
      <TextInput value={periodStart} onChangeText={setPeriodStart} placeholder="2026-08-01" testID="unavailability-start-input" style={styles.input} />

      <Text style={styles.label}>{t('unavailability.periodEndLabel')}</Text>
      <TextInput value={periodEnd} onChangeText={setPeriodEnd} placeholder="2026-08-05" testID="unavailability-end-input" style={styles.input} />

      <Text style={styles.label}>{t('unavailability.reasonLabel')}</Text>
      <TextInput value={reason} onChangeText={setReason} testID="unavailability-reason-input" style={styles.input} />

      {error && (
        <Text testID="unavailability-error" style={styles.errorText}>
          {error}
        </Text>
      )}

      <AnimatedPressable onPress={handleSubmit} disabled={submitting || !periodStart || !periodEnd} testID="unavailability-submit" style={styles.submitButton}>
        <Text style={styles.submitButtonText}>{t('unavailability.submit')}</Text>
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
  },
  label: {
    color: colors.textMuted,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  errorText: {
    color: colors.rose,
  },
  submitButton: {
    backgroundColor: colors.violet,
    borderRadius: radii.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  submitButtonText: {
    color: colors.surface,
    fontWeight: '800',
  },
});
```

- [ ] **Step 2: Run the full Jest suite**

```bash
npm test
```

Expected: PASS, same count as after Task 5.

- [ ] **Step 3: Manual verification with real evidence**

Submit a real unavailability request through the restyled form (`unavailability-start-input`/`unavailability-end-input`/`unavailability-reason-input`/`unavailability-submit`), confirm it still redirects to `/today` and the request still appears correctly in the admin's suggestions inbox (built in Task 4). Screenshot the restyled form showing the airplane header icon.

Report evidence in `.superpowers/sdd/design-task-6-report.md`.

- [ ] **Step 4: Commit**

```bash
git add src/app/unavailability/suggest.tsx
git commit -m "feat: restyle Unavailability screen with design system"
```

---

### Task 7: Calendar screen restyle + 2 bonus fixes

**Files:**
- Modify: `src/app/calendar.tsx`
- Modify: `src/i18n/locales/he.json`
- Modify: `src/i18n/locales/en.json`

**Interfaces:**
- Consumes: `colors`, `spacing`, `radii`, `CATEGORY_META` from `'../theme'`, `AnimatedPressable`, `Card`, `CategoryIcon` from `'../components/*'` — all from Task 1.
- Produces: nothing new — leaf screen.

This task also closes two Minor findings left open by the Calendar & Schedule plan's final whole-branch review, since both touch lines this restyle is already rewriting:
1. `calendar.newDateLabel` was defined in both locale files but never rendered — now rendered as a label above the date input.
2. `handleSaveDate` had no error handling (unlike the Today screen's points-edit save) — now wrapped in try/catch with a visible error message, mirroring the established pattern.

- [ ] **Step 1: Add the one new translation key**

Add to `src/i18n/locales/he.json`'s `calendar` object (alongside the existing `newDateLabel` key): `"saveError": "שמירת התאריך נכשלה"`
Add to `src/i18n/locales/en.json`'s `calendar` object: `"saveError": "Failed to save the date"`

- [ ] **Step 2: Replace `src/app/calendar.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getMonthMissions, getHouseMembers, getMyMembership, editMissionSchedule, type Mission } from '../features/missions/api';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Card } from '../components/Card';
import { CategoryIcon } from '../components/CategoryIcon';
import { colors, spacing, radii, CATEGORY_META } from '../theme';

export default function CalendarScreen() {
  const { t } = useTranslation();
  const { houseId } = useLocalSearchParams<{ houseId: string }>();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string; role: 'admin' | 'member' }[]>([]);
  const [myMemberId, setMyMemberId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);
  const [newDateValue, setNewDateValue] = useState('');
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const membership = await getMyMembership(houseId);
    setMyMemberId(membership?.id ?? null);
    setIsAdmin(membership?.role === 'admin');
    const [monthMissions, houseMembers] = await Promise.all([getMonthMissions(houseId, year, month), getHouseMembers(houseId)]);
    setMissions(monthMissions);
    setMembers(houseMembers);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [houseId, year, month]);

  const visibleMissions = useMemo(() => (mineOnly ? missions.filter((m) => m.assigned_to === myMemberId) : missions), [missions, mineOnly, myMemberId]);

  const missionsByDay = useMemo(() => {
    const map = new Map<number, Mission[]>();
    for (const mission of visibleMissions) {
      const day = Number(mission.due_date.slice(8, 10));
      const existing = map.get(day) ?? [];
      existing.push(mission);
      map.set(day, existing);
    }
    return map;
  }, [visibleMissions]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  function handlePrevMonth() {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
    setSelectedDay(null);
  }

  function handleNextMonth() {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
    setSelectedDay(null);
  }

  function startEditDate(mission: Mission) {
    setScheduleError(null);
    setEditingMissionId(mission.id);
    setNewDateValue(mission.due_date);
  }

  async function handleSaveDate(missionId: string) {
    setScheduleError(null);
    try {
      await editMissionSchedule(missionId, newDateValue);
      setEditingMissionId(null);
      await load();
    } catch (e) {
      setScheduleError(e instanceof Error ? e.message : t('calendar.saveError'));
    }
  }

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  const selectedMissions = selectedDay !== null ? (missionsByDay.get(selectedDay) ?? []) : [];

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{t('calendar.title')}</Text>

      <View style={styles.monthNav}>
        <AnimatedPressable onPress={handlePrevMonth} testID="calendar-prev-month" style={styles.monthNavButton}>
          <Ionicons name="chevron-back" size={20} color={colors.ink} />
        </AnimatedPressable>
        <Text style={styles.monthLabel}>
          {year}-{String(month).padStart(2, '0')}
        </Text>
        <AnimatedPressable onPress={handleNextMonth} testID="calendar-next-month" style={styles.monthNavButton}>
          <Ionicons name="chevron-forward" size={20} color={colors.ink} />
        </AnimatedPressable>
      </View>

      <View style={styles.toggleRow}>
        <AnimatedPressable onPress={() => setMineOnly(false)} testID="calendar-everyone" style={[styles.toggleOption, !mineOnly && styles.toggleOptionActive]}>
          <Text style={[styles.toggleOptionText, !mineOnly && styles.toggleOptionTextActive]}>{t('calendar.everyone')}</Text>
        </AnimatedPressable>
        <AnimatedPressable onPress={() => setMineOnly(true)} testID="calendar-mine" style={[styles.toggleOption, mineOnly && styles.toggleOptionActive]}>
          <Text style={[styles.toggleOptionText, mineOnly && styles.toggleOptionTextActive]}>{t('calendar.mine')}</Text>
        </AnimatedPressable>
      </View>

      <View style={styles.grid}>
        {dayNumbers.map((day) => {
          const dayMissions = missionsByDay.get(day) ?? [];
          return (
            <AnimatedPressable key={day} onPress={() => setSelectedDay(day)} testID={`calendar-day-${day}`} style={[styles.dayCell, selectedDay === day && styles.dayCellSelected]}>
              <Text style={styles.dayNumber}>{day}</Text>
              <View style={styles.dotRow}>
                {dayMissions.slice(0, 3).map((m, i) => (
                  <View key={i} style={[styles.dot, { backgroundColor: (CATEGORY_META[m.category] ?? CATEGORY_META.other).color }]} />
                ))}
              </View>
            </AnimatedPressable>
          );
        })}
      </View>

      {selectedDay !== null && (
        <ScrollView style={styles.dayDetail} contentContainerStyle={{ gap: spacing.sm }}>
          {selectedMissions.length === 0 && <Text style={styles.emptyText}>{t('calendar.noMissionsThisDay')}</Text>}
          {selectedMissions.map((mission) => {
            const canEdit = isAdmin || mission.assigned_to === myMemberId;
            const assigneeName = members.find((m) => m.id === mission.assigned_to)?.name ?? '';
            return (
              <Card key={mission.id} testID={`calendar-mission-${mission.id}`} style={styles.missionCard}>
                <View style={styles.missionCardHeader}>
                  <CategoryIcon category={mission.category} size={18} />
                  <Text style={styles.missionCardTitle}>{mission.title}</Text>
                  <Text style={styles.missionCardPoints}>{mission.points}</Text>
                </View>
                <Text style={styles.assigneeText}>{assigneeName}</Text>
                {canEdit ? (
                  <AnimatedPressable onPress={() => startEditDate(mission)} testID={`calendar-edit-${mission.id}`}>
                    <Text style={styles.editLink}>{isAdmin ? t('calendar.editDate') : t('calendar.suggestNewDate')}</Text>
                  </AnimatedPressable>
                ) : (
                  <Text style={styles.viewOnlyText}>{t('calendar.viewOnly')}</Text>
                )}
                {editingMissionId === mission.id && (
                  <View style={{ gap: spacing.xs }}>
                    <Text style={styles.dateInputLabel}>{t('calendar.newDateLabel')}</Text>
                    <View style={styles.editRow}>
                      <TextInput value={newDateValue} onChangeText={setNewDateValue} testID={`calendar-date-input-${mission.id}`} style={styles.dateInput} />
                      <AnimatedPressable onPress={() => handleSaveDate(mission.id)} testID={`calendar-date-save-${mission.id}`}>
                        <Text style={styles.saveText}>{t('calendar.save')}</Text>
                      </AnimatedPressable>
                      <AnimatedPressable onPress={() => setEditingMissionId(null)} testID={`calendar-date-cancel-${mission.id}`}>
                        <Text style={styles.cancelText}>{t('calendar.cancel')}</Text>
                      </AnimatedPressable>
                    </View>
                    {scheduleError && (
                      <Text testID={`calendar-schedule-error-${mission.id}`} style={styles.errorText}>
                        {scheduleError}
                      </Text>
                    )}
                  </View>
                )}
              </Card>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
  },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  monthNavButton: {
    padding: spacing.xs,
  },
  monthLabel: {
    fontWeight: '700',
    color: colors.ink,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  toggleOption: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: radii.md,
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.ink,
  },
  toggleOptionActive: {
    backgroundColor: colors.ink,
  },
  toggleOptionText: {
    color: colors.ink,
  },
  toggleOptionTextActive: {
    color: colors.cream,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  dayCell: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: colors.surface,
  },
  dayCellSelected: {
    borderWidth: 2,
    borderColor: colors.ink,
  },
  dayNumber: {
    fontSize: 11,
    color: colors.ink,
  },
  dotRow: {
    flexDirection: 'row',
    gap: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  dayDetail: {
    flex: 1,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingTop: spacing.md,
  },
  emptyText: {
    color: colors.textMuted,
  },
  missionCard: {
    gap: spacing.xs,
  },
  missionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  missionCardTitle: {
    fontWeight: '700',
    flex: 1,
    color: colors.ink,
  },
  missionCardPoints: {
    fontSize: 12,
    color: colors.textMuted,
  },
  assigneeText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  editLink: {
    fontSize: 12,
    color: colors.teal,
  },
  viewOnlyText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  dateInputLabel: {
    fontSize: 11,
    color: colors.textMuted,
  },
  editRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  dateInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: spacing.xs,
    width: 120,
    backgroundColor: colors.surface,
  },
  saveText: {
    color: colors.sage,
    fontWeight: '700',
  },
  cancelText: {
    color: colors.rose,
    fontWeight: '700',
  },
  errorText: {
    color: colors.rose,
    fontSize: 12,
  },
});
```

- [ ] **Step 3: Run the full Jest suite**

```bash
npm test
```

Expected: PASS, same count as after Task 6.

- [ ] **Step 4: Manual verification with real evidence**

1. Seed a month with 2-3 missions across different categories/days. Confirm the day-grid dots use the same category colors as elsewhere in the app, tapping a day shows Card-based mission rows with `CategoryIcon`.
2. Confirm `calendar.newDateLabel` now visibly renders above the date input when editing (previously defined but unused — screenshot this specifically to prove the fix).
3. As admin, edit a mission's date directly and confirm it still applies immediately.
4. As a non-admin on their own mission, confirm "Suggest new date" still creates a proposal without changing the live date.
5. Confirm month navigation (`calendar-prev-month`/`calendar-next-month`) and the Mine/Everyone toggle still work.
6. For the error-surface fix: this is best-effort — if there's a straightforward way to trigger a genuine failure (e.g. attempt to save with `newDateValue` cleared to an empty string, which the server will reject as a bad date), confirm `calendar-schedule-error-*` renders with a message and the UI doesn't silently fail. If not easily reproducible, note that in the report as an accepted gap in this task's verification rather than skipping it silently.
7. Screenshot showing the new date-input label and (if reproduced) the error message.

Report evidence in `.superpowers/sdd/design-task-7-report.md`.

- [ ] **Step 5: Commit**

```bash
git add src/app/calendar.tsx src/i18n/locales/he.json src/i18n/locales/en.json
git commit -m "feat: restyle Calendar screen with design system, render date label, add error surface"
```

---

## End-to-End Manual Verification

After all 7 tasks, against the local Supabase stack (`npx supabase start`, `npx supabase functions serve`, `npx expo start --web`):

1. Walk the full journey once, screen by screen: welcome → sign up → create house → today (with icons on nav buttons and mission rows) → suggest a mission (category chips with icons) → suggestions inbox (icon-tagged cards) → balance (progress bars) → calendar (category-colored dots, card-based day detail) → unavailability request.
2. Confirm every `testID` referenced anywhere in `.superpowers/sdd/*-report.md` or in existing Playwright/e2e specs still resolves to a real, functioning element.
3. Confirm RTL (Hebrew, default locale) still lays out correctly on at least 2-3 of the restyled screens — the new icon/card additions should mirror correctly under `I18nManager` RTL the same way the pre-existing layout did.
4. Full Jest suite one final time (`npm test`) — expect 48/48 (41 pre-existing + 7 from Task 1).
