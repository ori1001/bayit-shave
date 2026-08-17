import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Screen } from '../Screen';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), navigate: jest.fn() }),
}));

describe('Screen', () => {
  it('keeps the tab bar on screen while the content is loading', async () => {
    const { getByTestId, queryByText } = await render(
      <Screen title="Today" tab="today" houseId="h1" loading>
        <Text>content</Text>
      </Screen>
    );

    // The skeleton replaces the content, never the frame. Returning a bare
    // full-screen loader is what used to strand the user with no navigation.
    expect(getByTestId('screen-loading')).toBeTruthy();
    expect(getByTestId('tab-today')).toBeTruthy();
    expect(getByTestId('tab-calendar')).toBeTruthy();
    expect(getByTestId('tab-more')).toBeTruthy();
    expect(queryByText('content')).toBeNull();
  });

  it('keeps the tab bar on screen when the load failed', async () => {
    const { getByTestId, queryByText } = await render(
      <Screen title="Today" tab="today" houseId="h1" error="Network request failed" errorTestID="today-load-error">
        <Text>content</Text>
      </Screen>
    );

    expect(getByTestId('today-load-error')).toBeTruthy();
    expect(getByTestId('today-load-error-retry')).toBeTruthy();
    expect(getByTestId('tab-today')).toBeTruthy();
    expect(queryByText('content')).toBeNull();
  });

  it('shows the content once neither loading nor failing', async () => {
    const { getByText, queryByTestId } = await render(
      <Screen title="Today" tab="today" houseId="h1">
        <Text>content</Text>
      </Screen>
    );

    expect(getByText('content')).toBeTruthy();
    expect(queryByTestId('screen-loading')).toBeNull();
  });

  it('shows an error in preference to a skeleton when both are set', async () => {
    const { getByTestId, queryByTestId } = await render(
      <Screen title="Today" tab="today" houseId="h1" loading error="Network request failed">
        <Text>content</Text>
      </Screen>
    );

    // A stale refresh that fails while the skeleton is up must surface the
    // failure, not sit on placeholder rows forever.
    expect(getByTestId('load-error')).toBeTruthy();
    expect(queryByTestId('screen-loading')).toBeNull();
  });

  it('omits the bar entirely on screens that declare no tab', async () => {
    const { queryByTestId } = await render(
      <Screen title="Sign in">
        <Text>content</Text>
      </Screen>
    );

    expect(queryByTestId('tab-today')).toBeNull();
  });
});
