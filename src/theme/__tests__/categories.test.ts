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
