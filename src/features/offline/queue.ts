import AsyncStorage from '@react-native-async-storage/async-storage';
import { completeMission } from '../missions/api';

const QUEUE_KEY = 'bayit-shave:pending-completions';

/**
 * Offline "done" taps.
 *
 * The server side is what makes this safe: complete-mission performs the
 * assigned -> done transition conditionally and reports an already-completed
 * mission as success, so draining the queue twice -- or draining it while the
 * original request is still in flight -- cannot double-credit the ledger.
 */
export async function readQueue(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    // A corrupt queue must not wedge completions forever.
    return [];
  }
}

async function writeQueue(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([...new Set(ids)]));
}

export async function enqueueCompletion(missionId: string): Promise<void> {
  const queue = await readQueue();
  if (!queue.includes(missionId)) {
    await writeQueue([...queue, missionId]);
  }
}

/**
 * Completes a mission, falling back to the queue if the request fails.
 *
 * Returns whether it went through immediately. A queued completion is not an
 * error from the user's point of view -- the tap is recorded and will sync.
 */
export async function completeMissionWithQueue(missionId: string): Promise<{ synced: boolean }> {
  try {
    await completeMission(missionId);
    return { synced: true };
  } catch {
    await enqueueCompletion(missionId);
    return { synced: false };
  }
}

/**
 * Attempts every queued completion, keeping the ones that still fail.
 *
 * Failures are retained rather than dropped so a completion is never lost, and
 * successes are removed so the queue drains rather than growing forever.
 */
export async function drainQueue(): Promise<{ synced: number; remaining: number }> {
  const queue = await readQueue();
  if (queue.length === 0) {
    return { synced: 0, remaining: 0 };
  }

  const stillPending: string[] = [];
  let synced = 0;

  for (const missionId of queue) {
    try {
      await completeMission(missionId);
      synced += 1;
    } catch {
      stillPending.push(missionId);
    }
  }

  await writeQueue(stillPending);
  return { synced, remaining: stillPending.length };
}
