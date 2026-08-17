import { getMonthMissions, getHouseMembers, getMyMembership, getSuggestions, type Mission } from './missions/api';
import { getPointsPool, getOpenMissions, type PointsPoolEntry, type OpenMission } from './balance/api';
import {
  getPendingSwapsForAdmin,
  getPendingUnavailability,
  type SwapRequest,
  type UnavailabilityRequest,
} from './requests/api';
import { getHouseSettings, type HouseSettings, type MemberWeight } from './settings/api';
import { getTemplates, type MissionTemplate } from './templates/api';
import { peekScreenData, primeScreenData } from '../lib/screen-data';

/**
 * What each tab needs, and how to fetch it.
 *
 * Defined once, away from the screens, for two reasons: the screens and the
 * prefetch below have to agree exactly on both the cache key and the payload
 * shape or the prefetch quietly does nothing, and a screen that owns its own
 * fetcher cannot be warmed before it is mounted.
 */

export type HouseMember = { id: string; name: string; role: 'admin' | 'member' };

export interface CalendarData {
  missions: Mission[];
  members: HouseMember[];
  myMemberId: string | null;
  isAdmin: boolean;
}

export interface BalanceData {
  pool: PointsPoolEntry[];
  openMissions: OpenMission[];
  isAdmin: boolean;
}

export type InboxItem =
  | { kind: 'mission'; mission: Mission }
  | { kind: 'swap'; swap: SwapRequest }
  | { kind: 'unavailability'; unavailability: UnavailabilityRequest };

export interface InboxData {
  items: InboxItem[];
  members: HouseMember[];
  isAdmin: boolean;
}

export interface SettingsData {
  house: HouseSettings;
  members: MemberWeight[];
  myMemberId: string | null;
  isAdmin: boolean;
}

export interface TemplatesData {
  templates: MissionTemplate[];
  members: HouseMember[];
  isAdmin: boolean;
}

export const calendarKey = (houseId: string, year: number, month: number) => `calendar:${houseId}:${year}-${month}`;
export const balanceKey = (houseId: string) => `balance:${houseId}`;
export const inboxKey = (houseId: string) => `inbox:${houseId}`;
export const settingsKey = (houseId: string) => `settings:${houseId}`;
export const templatesKey = (houseId: string) => `templates:${houseId}`;

export async function fetchCalendar(houseId: string, year: number, month: number): Promise<CalendarData> {
  const membership = await getMyMembership(houseId);
  const [missions, members] = await Promise.all([getMonthMissions(houseId, year, month), getHouseMembers(houseId)]);
  return { missions, members, myMemberId: membership?.id ?? null, isAdmin: membership?.role === 'admin' };
}

export async function fetchBalance(houseId: string): Promise<BalanceData> {
  const membership = await getMyMembership(houseId);
  const [pool, openMissions] = await Promise.all([getPointsPool(houseId), getOpenMissions(houseId)]);
  return { pool, openMissions, isAdmin: membership?.role === 'admin' };
}

export async function fetchInbox(houseId: string): Promise<InboxData> {
  const membership = await getMyMembership(houseId);
  const [missions, swaps, unavailability, members] = await Promise.all([
    getSuggestions(houseId),
    getPendingSwapsForAdmin(houseId),
    getPendingUnavailability(houseId),
    getHouseMembers(houseId),
  ]);
  return {
    members,
    isAdmin: membership?.role === 'admin',
    items: [
      ...missions.map((mission): InboxItem => ({ kind: 'mission', mission })),
      ...swaps.map((swap): InboxItem => ({ kind: 'swap', swap })),
      ...unavailability.map((entry): InboxItem => ({ kind: 'unavailability', unavailability: entry })),
    ],
  };
}

export async function fetchSettings(houseId: string): Promise<SettingsData> {
  const membership = await getMyMembership(houseId);
  const { house, members } = await getHouseSettings(houseId);
  return { house, members, myMemberId: membership?.id ?? null, isAdmin: membership?.role === 'admin' };
}

export async function fetchTemplates(houseId: string): Promise<TemplatesData> {
  const membership = await getMyMembership(houseId);
  // Members come along because a template can be restricted to a subset of the
  // house, and the form needs names to offer.
  const [templates, members] = await Promise.all([getTemplates(houseId), getHouseMembers(houseId)]);
  return { templates, members, isAdmin: membership?.role === 'admin' };
}

/**
 * Fills the other tabs' caches while the user is reading Today.
 *
 * Caching alone only makes the *second* visit to a tab instant; the first one
 * still waited on the network. The whole house is a few dozen rows, so fetching
 * all of it up front costs one round of small queries and makes every tab open
 * on the frame it is tapped, for the rest of the session.
 *
 * Deliberately silent: this is speculative work for a screen the user may never
 * open, so a failure here must never surface. The screen's own fetch will run
 * anyway when it mounts, and that one reports its errors.
 */
export function prefetchTabs(houseId: string, today = new Date()): void {
  const year = today.getFullYear();
  const month = today.getMonth() + 1;

  const warm = <T,>(key: string, fetcher: () => Promise<T>) => {
    // Only ever fills a cold key. Today refetches on every completion and every
    // approval, and without this each of those would drag three more queries
    // along to refresh tabs that revalidate themselves on mount anyway.
    if (peekScreenData(key) !== undefined) {
      return;
    }
    fetcher()
      .then((value) => primeScreenData(key, value))
      .catch(() => {});
  };

  warm(calendarKey(houseId, year, month), () => fetchCalendar(houseId, year, month));
  warm(balanceKey(houseId), () => fetchBalance(houseId));
  warm(inboxKey(houseId), () => fetchInbox(houseId));
}
