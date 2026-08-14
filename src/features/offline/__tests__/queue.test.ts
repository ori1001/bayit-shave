import AsyncStorage from '@react-native-async-storage/async-storage';
import { completeMission } from '../../missions/api';
import { completeMissionWithQueue, drainQueue, readQueue, enqueueCompletion } from '../queue';

jest.mock('../../missions/api', () => ({ completeMission: jest.fn() }));

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
    setItem: jest.fn((k: string, v: string) => {
      store[k] = v;
      return Promise.resolve();
    }),
    __reset: () => {
      store = {};
    },
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage as unknown as { __reset: () => void }).__reset();
});

describe('completeMissionWithQueue', () => {
  it('reports synced and queues nothing when the request succeeds', async () => {
    (completeMission as jest.Mock).mockResolvedValue({ mission: {} });

    expect(await completeMissionWithQueue('m1')).toEqual({ synced: true });
    expect(await readQueue()).toEqual([]);
  });

  it('queues the completion when the request fails, so the tap is not lost', async () => {
    (completeMission as jest.Mock).mockRejectedValue(new Error('Network request failed'));

    expect(await completeMissionWithQueue('m1')).toEqual({ synced: false });
    expect(await readQueue()).toEqual(['m1']);
  });

  it('does not queue the same mission twice', async () => {
    (completeMission as jest.Mock).mockRejectedValue(new Error('offline'));

    await completeMissionWithQueue('m1');
    await completeMissionWithQueue('m1');

    expect(await readQueue()).toEqual(['m1']);
  });
});

describe('drainQueue', () => {
  it('clears entries that succeed', async () => {
    await enqueueCompletion('m1');
    await enqueueCompletion('m2');
    (completeMission as jest.Mock).mockResolvedValue({ mission: {} });

    expect(await drainQueue()).toEqual({ synced: 2, remaining: 0 });
    expect(await readQueue()).toEqual([]);
  });

  it('keeps entries that still fail rather than dropping the completion', async () => {
    await enqueueCompletion('m1');
    await enqueueCompletion('m2');
    (completeMission as jest.Mock)
      .mockResolvedValueOnce({ mission: {} })
      .mockRejectedValueOnce(new Error('still offline'));

    expect(await drainQueue()).toEqual({ synced: 1, remaining: 1 });
    expect(await readQueue()).toEqual(['m2']);
  });

  it('is a no-op on an empty queue', async () => {
    expect(await drainQueue()).toEqual({ synced: 0, remaining: 0 });
    expect(completeMission).not.toHaveBeenCalled();
  });

  it('recovers from a corrupt queue instead of wedging', async () => {
    await AsyncStorage.setItem('bayit-shave:pending-completions', '{not json');

    expect(await readQueue()).toEqual([]);
    expect(await drainQueue()).toEqual({ synced: 0, remaining: 0 });
  });
});
