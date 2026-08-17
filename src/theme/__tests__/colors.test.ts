import { blend, wash, tint, colors, CATEGORY_META, MISSION_CATEGORIES } from '../index';

describe('blend', () => {
  it('returns the base at 0 and the colour at 1', () => {
    expect(blend('#1F9E93', '#FFFFFF', 0)).toBe('#ffffff');
    expect(blend('#1F9E93', '#FFFFFF', 1)).toBe('#1f9e93');
  });

  it('lands halfway between the two at 0.5', () => {
    expect(blend('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });

  it('always produces a full six-digit hex, including for single-digit channels', () => {
    expect(blend('#000000', '#FFFFFF', 0.99)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('wash', () => {
  it('is opaque, so a card does not take the page colour through it', () => {
    // Eight characters would mean an alpha channel, which is what `tint` is for.
    expect(wash(CATEGORY_META.dishes.color)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('stays close enough to white to read as a white card', () => {
    for (const category of MISSION_CATEGORIES) {
      const result = wash(CATEGORY_META[category].color);
      const channels = [1, 3, 5].map((i) => parseInt(result.slice(i, i + 2), 16));
      // Within a tenth of white on every channel: a hint of colour, not a fill.
      expect(Math.min(...channels)).toBeGreaterThan(0xff - 0x1a);
    }
  });

  it('differs per category, which is the entire point', () => {
    const distinct = new Set(MISSION_CATEGORIES.map((c) => wash(CATEGORY_META[c].color)));
    expect(distinct.size).toBe(MISSION_CATEGORIES.length);
  });
});

describe('tint', () => {
  it('appends an alpha channel to the hex', () => {
    expect(tint(colors.sage, '1F')).toBe(`${colors.sage}1F`);
  });
});
