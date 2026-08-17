import { render, waitFor, fireEvent, act } from '@testing-library/react-native';
import { Text, Pressable } from 'react-native';
import { useScreenData, clearScreenData, primeScreenData } from '../screen-data';

/**
 * Asserted through rendered output rather than a captured hook result.
 *
 * The React Compiler is on for this project, so collecting render-time values
 * into an array from a component body is not reliable -- the compiler is free to
 * skip the body. What the screen paints is the thing under test anyway.
 */
function Probe<T>({ cacheKey, fetcher }: { cacheKey: string; fetcher: () => Promise<T> }) {
  const { data, loading, error, fromCache, refresh, update } = useScreenData<T>(cacheKey, fetcher);
  return (
    <>
      <Text testID="from-cache">{String(fromCache)}</Text>
      <Text testID="loading">{String(loading)}</Text>
      <Text testID="data">{JSON.stringify(data ?? null)}</Text>
      <Text testID="error">{error ?? ''}</Text>
      <Pressable testID="refresh" onPress={() => refresh()} />
      <Pressable
        testID="drop-first"
        onPress={() => update((current) => ({ ...current, items: (current as { items: string[] }).items.slice(1) }))}
      />
    </>
  );
}

/**
 * A fetch the test decides when to finish, so the in-flight state is
 * observable. It must always be settled before the test ends: a promise left
 * pending keeps React's act scope open and empties the *next* test's tree.
 */
function deferred<T>() {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { fetcher: () => promise, settle };
}

const textOf = (el: { props: Record<string, unknown> }) => String(el.props.children);

describe('useScreenData', () => {
  beforeEach(() => {
    clearScreenData();
  });

  it('shows a loading state the first time a key is loaded', async () => {
    const inFlight = deferred<{ n: number }>();

    const { getByTestId, unmount } = await render(<Probe cacheKey="k" fetcher={inFlight.fetcher} />);
    expect(textOf(getByTestId('loading'))).toBe('true');
    expect(textOf(getByTestId('data'))).toBe('null');

    await act(async () => inFlight.settle({ n: 1 }));
    expect(textOf(getByTestId('loading'))).toBe('false');
    unmount();
  });

  it('reports fromCache false for a key it had to fetch', async () => {
    const inFlight = deferred<{ n: number }>();

    const { getByTestId, unmount } = await render(<Probe cacheKey="k" fetcher={inFlight.fetcher} />);
    expect(textOf(getByTestId('from-cache'))).toBe('false');

    await act(async () => inFlight.settle({ n: 1 }));
    // Still false once the data lands: this mount did not open from cache, and
    // flipping it now would restart every row's entrance under the user.
    expect(textOf(getByTestId('from-cache'))).toBe('false');
    unmount();
  });

  it('reports fromCache true when the answer was already there', async () => {
    primeScreenData('k', { n: 1 });
    const inFlight = deferred<{ n: number }>();

    // This is what lets a screen skip its entrance animation on a tab return.
    const { getByTestId, unmount } = await render(<Probe cacheKey="k" fetcher={inFlight.fetcher} />);
    expect(textOf(getByTestId('from-cache'))).toBe('true');

    await act(async () => inFlight.settle({ n: 2 }));
    expect(textOf(getByTestId('from-cache'))).toBe('true');
    unmount();
  });

  it('paints cached data on the first frame of a revisit, with no loading state', async () => {
    // Standing in for "this screen has already been opened this session".
    primeScreenData('k', { n: 1 });
    const inFlight = deferred<{ n: number }>();

    // The refetch has not answered yet, so anything on screen came from cache.
    const { getByTestId, unmount } = await render(<Probe cacheKey="k" fetcher={inFlight.fetcher} />);
    expect(textOf(getByTestId('loading'))).toBe('false');
    expect(textOf(getByTestId('data'))).toBe('{"n":1}');

    await act(async () => inFlight.settle({ n: 1 }));
    unmount();
  });

  it('still revalidates in the background on a revisit', async () => {
    primeScreenData('k', { n: 1 });
    const fetcher = jest.fn().mockResolvedValue({ n: 2 });

    const { getByTestId, unmount } = await render(<Probe cacheKey="k" fetcher={fetcher} />);
    await waitFor(() => expect(textOf(getByTestId('data'))).toBe('{"n":2}'));
    expect(fetcher).toHaveBeenCalledTimes(1);
    // No loading state at any point: the cached copy stayed on screen and the
    // newer answer replaced it in place.
    expect(textOf(getByTestId('loading'))).toBe('false');
    unmount();
  });

  it('keys separately, so one screen never serves another screen its data', async () => {
    primeScreenData('a', { n: 1 });
    const inFlight = deferred<{ n: number }>();

    const { getByTestId, unmount } = await render(<Probe cacheKey="b" fetcher={inFlight.fetcher} />);
    expect(textOf(getByTestId('loading'))).toBe('true');
    expect(textOf(getByTestId('data'))).toBe('null');

    await act(async () => inFlight.settle({ n: 2 }));
    expect(textOf(getByTestId('data'))).toBe('{"n":2}');
    unmount();
  });

  it('is emptied by clearScreenData, so a new account never sees the old one', async () => {
    primeScreenData('k', { n: 1 });
    clearScreenData();
    const inFlight = deferred<{ n: number }>();

    const { getByTestId, unmount } = await render(<Probe cacheKey="k" fetcher={inFlight.fetcher} />);
    expect(textOf(getByTestId('loading'))).toBe('true');
    expect(textOf(getByTestId('data'))).toBe('null');

    await act(async () => inFlight.settle({ n: 9 }));
    unmount();
  });
  // Last in the file: it is the only case that mounts twice, and the second
  // tree's teardown otherwise lands after the following test has rendered,
  // emptying that test's tree instead of its own.
  it('applies a local change immediately and keeps it in the cache', async () => {
    primeScreenData('k', { items: ['a', 'b'] });
    const fetcher = jest.fn().mockResolvedValue({ items: ['a', 'b'] });

    const first = await render(<Probe cacheKey="k" fetcher={fetcher} />);
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    await fireEvent.press(first.getByTestId('drop-first'));
    expect(textOf(first.getByTestId('data'))).toBe('{"items":["b"]}');
    first.unmount();

    // The optimistic edit survives navigating away and back.
    const second = await render(<Probe cacheKey="k" fetcher={fetcher} />);
    expect(textOf(second.getByTestId('data'))).toBe('{"items":["b"]}');
    // Explicit: this test mounts twice, and leaving the second tree to the
    // library's automatic cleanup lets it run after the next test has already
    // rendered, which empties that test's tree instead.
    second.unmount();
  });
});
