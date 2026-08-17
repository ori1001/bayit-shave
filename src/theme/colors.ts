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

/**
 * One hue per destination. The tab, the screen header and any card belonging to
 * that area share it, so where you are is legible without reading a label.
 */
export const sectionColors = {
  today: colors.amber,
  calendar: colors.indigo,
  balance: colors.teal,
  templates: colors.sage,
  inbox: colors.violet,
  settings: '#47586B',
  unavailability: colors.violet,
} as const;

export type SectionKey = keyof typeof sectionColors;

/**
 * Semantic state colours. These carry meaning, so they are never reused as
 * decoration -- a green here always means "done", never "this looks nice".
 */
export const stateColors = {
  done: '#4E8B45',
  pending: colors.amber,
  overdue: colors.rose,
  proposed: colors.violet,
  open: '#8A918B',
} as const;

export type StateKey = keyof typeof stateColors;

/**
 * Members get a stable colour derived from their id, so one person's avatar,
 * assignee chip and balance row always match across every screen.
 */
export const memberPalette = [
  '#1F9E93',
  '#D45A82',
  '#5B72C9',
  '#E0793A',
  '#8B5FBF',
  '#7AA23E',
  '#3FAFC9',
  '#D99A2B',
] as const;

export function colorForMember(memberId: string | null | undefined): string {
  if (!memberId) {
    return stateColors.open;
  }
  // Sum of char codes: stable across sessions and devices, and needs no lookup
  // table that could drift from the member list.
  let hash = 0;
  for (let i = 0; i < memberId.length; i++) {
    hash = (hash + memberId.charCodeAt(i)) % memberPalette.length;
  }
  return memberPalette[hash];
}

/** Translucent tint of any hex, for icon badges and card washes. */
export function tint(hex: string, alpha = '33'): string {
  return `${hex}${alpha}`;
}

function channel(hex: string, offset: number): number {
  return parseInt(hex.slice(1 + offset * 2, 3 + offset * 2), 16);
}

/**
 * An *opaque* mix of two colours.
 *
 * `tint` is translucent, so whatever sits behind shows through -- fine over a
 * flat page, wrong for a card that has to stay lighter than the page it sits
 * on. This returns a solid colour instead, so a barely-tinted white card still
 * reads as white against the cream background rather than dissolving into it.
 *
 * `amount` is how much of `hex` to keep: 0 returns `base`, 1 returns `hex`.
 */
export function blend(hex: string, base: string, amount: number): string {
  const to = (value: number) => Math.round(value).toString(16).padStart(2, '0');
  const mixed = [0, 1, 2].map((i) => channel(base, i) + (channel(hex, i) - channel(base, i)) * amount);
  return `#${mixed.map(to).join('')}`;
}

/** A card-safe wash of a colour: solid, and only a few percent off white. */
export function wash(hex: string, amount = 0.06): string {
  return blend(hex, colors.surface, amount);
}
