import type { IoniconName } from './categories';
import { isRTL } from '../i18n/direction';

/**
 * One icon per thing in the app.
 *
 * Every name here was checked against the installed Ionicons glyph map, so a
 * typo shows up as a build-time miss rather than an invisible glyph at runtime.
 */
export const ICONS = {
  // Sections
  today: 'sunny' as IoniconName,
  calendar: 'calendar' as IoniconName,
  balance: 'stats-chart' as IoniconName,
  templates: 'repeat' as IoniconName,
  inbox: 'file-tray-full' as IoniconName,
  settings: 'settings' as IoniconName,
  more: 'ellipsis-horizontal' as IoniconName,

  // Entities
  mission: 'ellipse-outline' as IoniconName,
  swap: 'swap-horizontal' as IoniconName,
  unavailability: 'airplane' as IoniconName,
  points: 'pricetag' as IoniconName,
  member: 'person-circle' as IoniconName,
  house: 'people-circle' as IoniconName,
  admin: 'shield-checkmark' as IoniconName,

  // States
  done: 'checkmark-circle' as IoniconName,
  todo: 'ellipse-outline' as IoniconName,
  overdue: 'alarm-outline' as IoniconName,
  awaiting: 'hourglass-outline' as IoniconName,
  ahead: 'trending-up' as IoniconName,
  behind: 'trending-down' as IoniconName,
  offline: 'cloud-offline-outline' as IoniconName,

  // Actions
  add: 'add-circle' as IoniconName,
  edit: 'create-outline' as IoniconName,
  remove: 'trash-outline' as IoniconName,
  approve: 'checkmark-circle' as IoniconName,
  reject: 'close-circle' as IoniconName,
  retry: 'refresh' as IoniconName,
  copy: 'copy-outline' as IoniconName,
  save: 'checkmark-circle' as IoniconName,
  signIn: 'log-in-outline' as IoniconName,
  signUp: 'person-add-outline' as IoniconName,
  mail: 'mail-open-outline' as IoniconName,
  notifications: 'notifications-outline' as IoniconName,
} as const;

/**
 * Direction-aware chevrons.
 *
 * The app is Hebrew-first, so the layout is RTL by default. A hardcoded
 * "chevron-forward" points the wrong way there -- "next month" would visually
 * mean "back". These resolve against the active direction instead.
 */
export function chevronNext(): IoniconName {
  return (isRTL() ? 'chevron-back' : 'chevron-forward') as IoniconName;
}

export function chevronPrev(): IoniconName {
  return (isRTL() ? 'chevron-forward' : 'chevron-back') as IoniconName;
}
