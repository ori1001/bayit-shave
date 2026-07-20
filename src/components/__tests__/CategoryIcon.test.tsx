import { render } from '@testing-library/react-native';
import { CategoryIcon } from '../CategoryIcon';

describe('CategoryIcon', () => {
  it('renders without crashing for a known category', async () => {
    const { getByTestId } = await render(<CategoryIcon category="dishes" testID="category-icon-dishes" />);
    expect(getByTestId('category-icon-dishes')).toBeTruthy();
  });

  it('falls back to the "other" style for an unrecognized category instead of crashing', async () => {
    const { getByTestId } = await render(<CategoryIcon category="not_a_real_category" testID="category-icon-unknown" />);
    expect(getByTestId('category-icon-unknown')).toBeTruthy();
  });
});
