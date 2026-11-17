/**
 * Push notifications (P1). Registers the Expo push token in push_tokens (owner-only RLS).
 * Delivery: a Database Webhook on notifications INSERT calls the send-push edge function.
 * Expo Go on Android cannot receive remote pushes since SDK 53, so failures are swallowed —
 * in-app notifications (Realtime + notifications table) always work.
 */
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

let registeredFor: string | null = null;

export function startPushRegistration(userId: string) {
  if (registeredFor === userId || Platform.OS === 'web') return;
  registeredFor = userId;
  void (async () => {
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
      const { status: existing } = await Notifications.getPermissionsAsync();
      const status = existing === 'granted' ? existing : (await Notifications.requestPermissionsAsync()).status;
      if (status !== 'granted') return;
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Reelo',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }
      const projectId =
        (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
        Constants.easConfig?.projectId;
      const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
      await supabase.from('push_tokens').upsert({ token, user_id: userId, platform: Platform.OS }, { onConflict: 'token' });
    } catch {
      // Not available in this runtime (e.g. Expo Go on Android) — in-app notifications still work.
    }
  })();
}
