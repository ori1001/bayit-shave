import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from '../../lib/supabase';

/**
 * Asks for the OS notification permission and stores the resulting Expo push
 * token against the signed-in member.
 *
 * Returns the token, or null when push is unavailable -- declined permission,
 * web, or a simulator without push support. Callers should treat null as
 * "no push for this member" rather than an error: the app stays fully usable
 * without notifications.
 */
export async function registerForPushNotifications(memberId: string): Promise<string | null> {
  // Expo push tokens are a native concern; the web build has no equivalent and
  // asking would throw rather than degrade.
  if (Platform.OS === 'web') {
    return null;
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') {
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;

  let token: string;
  try {
    const result = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    token = result.data;
  } catch {
    // A device with no Play Services, or a simulator, cannot mint a token.
    return null;
  }

  const { error } = await supabase.from('members').update({ push_token: token }).eq('id', memberId);
  if (error) {
    throw new Error(error.message);
  }

  return token;
}

/**
 * Android needs an explicit channel or notifications arrive silently.
 */
export async function configureNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  await Notifications.setNotificationChannelAsync('missions', {
    name: 'Missions',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}
