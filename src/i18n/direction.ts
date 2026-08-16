import { I18nManager } from 'react-native';
import i18n from './index';

/**
 * Whether the UI is currently right-to-left.
 *
 * I18nManager.isRTL alone is not enough. On native, forceRTL only takes effect
 * after a reload, so it can lag the active language; on web it may never be set
 * at all even though the text renders right-to-left. The active i18n language
 * is authoritative in both cases, so either signal is accepted.
 */
export function isRTL(): boolean {
  return I18nManager.isRTL || i18n.language?.startsWith('he') === true;
}
