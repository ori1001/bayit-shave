import { PixelRatio, type TextStyle } from 'react-native';

/**
 * One type scale for the whole app.
 *
 * Sizes are set against the platform minimums rather than chosen per screen:
 * anything under 15pt is uncomfortable as body text on a phone held at arm's
 * length, and the app previously ran on 10-12pt for labels, chips and metadata.
 * Nothing below `caption` (13) exists here on purpose.
 *
 * Line heights are baked in because React Native does not derive one from the
 * font size, and the default leading is too tight for Hebrew, whose glyphs are
 * taller than Latin at the same point size.
 */
export const type = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '800' },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '800' },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '800' },
  subheading: { fontSize: 17, lineHeight: 23, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  label: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
} as const satisfies Record<string, TextStyle>;

export type TypeKey = keyof typeof type;

/**
 * Minimum tappable size. 44 is Apple's floor and Android's 48dp rounds to the
 * same thing in practice; the old 14pt icon buttons were roughly half that.
 */
export const HIT_SIZE = 44;

/**
 * Caps how far the OS font setting can scale our text.
 *
 * Rows are icon + text + badge on one line, so unbounded scaling truncates the
 * mission title long before it helps anyone. Allowing 1.3x covers the common
 * larger-text settings without breaking the row.
 */
export function cappedFontScale(max = 1.3): number {
  return Math.min(PixelRatio.getFontScale(), max);
}
