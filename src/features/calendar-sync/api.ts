import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Mission } from '../missions/api';

const CALENDAR_ID_KEY = 'bayit-shave:device-calendar-id';
const EVENT_MAP_KEY = 'bayit-shave:mission-event-ids';
const CALENDAR_TITLE = 'Bayit Shave';

type EventMap = Record<string, string>;

async function readEventMap(): Promise<EventMap> {
  const raw = await AsyncStorage.getItem(EVENT_MAP_KEY);
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as EventMap;
  } catch {
    return {};
  }
}

async function writeEventMap(map: EventMap): Promise<void> {
  await AsyncStorage.setItem(EVENT_MAP_KEY, JSON.stringify(map));
}

/**
 * Finds or creates the app's own device calendar.
 *
 * Missions go in a dedicated calendar rather than the user's default so a
 * re-sync can never touch events the app did not create, and so the whole lot
 * can be hidden or removed in one action by the user.
 */
async function ensureCalendar(): Promise<string | null> {
  const cached = await AsyncStorage.getItem(CALENDAR_ID_KEY);
  if (cached) {
    const existing = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    if (existing.some((c) => c.id === cached)) {
      return cached;
    }
    // The user deleted it out from under us; fall through and make a new one.
  }

  const sources = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = sources.find((c) => c.allowsModifications);

  const id = await Calendar.createCalendarAsync({
    title: CALENDAR_TITLE,
    name: CALENDAR_TITLE,
    color: '#26332E',
    entityType: Calendar.EntityTypes.EVENT,
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
    ...(Platform.OS === 'ios' && writable?.source ? { sourceId: writable.source.id } : {}),
    ...(Platform.OS === 'android'
      ? {
          ownerAccount: 'local',
          source: { name: CALENDAR_TITLE, isLocalAccount: true, type: 'LOCAL' },
        }
      : {}),
  });

  await AsyncStorage.setItem(CALENDAR_ID_KEY, id);
  return id;
}

/**
 * Mirrors the given missions into the device calendar.
 *
 * Keyed by mission id through a locally stored map, so re-syncing updates the
 * existing event instead of adding a duplicate every time the screen loads.
 * Returns null when device calendars are unavailable (web, or a declined
 * permission) -- callers should treat that as "no sync", not an error.
 */
export async function syncMissionsToDeviceCalendar(
  missions: Mission[]
): Promise<{ created: number; updated: number } | null> {
  if (Platform.OS === 'web') {
    return null;
  }

  const permission = await Calendar.requestCalendarPermissionsAsync();
  if (permission.status !== 'granted') {
    return null;
  }

  const calendarId = await ensureCalendar();
  if (!calendarId) {
    return null;
  }

  const eventMap = await readEventMap();
  let created = 0;
  let updated = 0;

  for (const mission of missions) {
    // due_date is a plain calendar day; an all-day event avoids inventing a
    // time and avoids timezone drift shifting a chore onto the wrong day.
    const startDate = new Date(`${mission.due_date}T00:00:00`);
    const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
    const details = {
      title: mission.title,
      startDate,
      endDate,
      allDay: true,
      notes: `${mission.points} points`,
    };

    const existingId = eventMap[mission.id];
    if (existingId) {
      try {
        await Calendar.updateEventAsync(existingId, details);
        updated += 1;
        continue;
      } catch {
        // Event was removed on the device; fall through and recreate it.
        delete eventMap[mission.id];
      }
    }

    const eventId = await Calendar.createEventAsync(calendarId, details);
    eventMap[mission.id] = eventId;
    created += 1;
  }

  await writeEventMap(eventMap);
  return { created, updated };
}
