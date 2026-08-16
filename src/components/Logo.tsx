import Svg, { Path } from 'react-native-svg';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing } from '../theme';

/**
 * Two overlapping house silhouettes — a muted green-grey one behind, a deep
 * slate-blue one in front — echoing "two people, one home", which is what the
 * app is about.
 *
 * Drawn as vectors rather than shipped as a bitmap so it stays sharp at every
 * size and can recolour with the theme.
 */
export const LOGO_GREEN = '#8FAE8F';
export const LOGO_SLATE = '#47586B';

interface LogoMarkProps {
  size?: number;
  testID?: string;
}

export function LogoMark({ size = 64, testID = 'logo-mark' }: LogoMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" testID={testID}>
      {/* Back house: roof pitched left, body squared off where the front
          house overlaps it. */}
      <Path
        d="M8 46 L34 20 L52 38 L52 84 L30 84 L30 64 L20 64 L20 84 L8 84 Z"
        fill={LOGO_GREEN}
      />
      {/* Front house, with a chimney on the right shoulder. */}
      <Path
        d="M46 48 L66 28 L66 16 L76 16 L76 28 L92 44 L92 84 L58 84 L58 60 L46 60 Z"
        fill={LOGO_SLATE}
      />
    </Svg>
  );
}

interface LogoProps {
  size?: number;
  showWordmark?: boolean;
  testID?: string;
}

export function Logo({ size = 72, showWordmark = true, testID = 'logo' }: LogoProps) {
  return (
    <View style={styles.wrap} testID={testID}>
      <LogoMark size={size} />
      {showWordmark && <Text style={[styles.wordmark, { fontSize: size * 0.34 }]}>BAYIT SHAVE</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  wordmark: {
    fontWeight: '800',
    letterSpacing: 2,
    color: LOGO_GREEN,
  },
});
