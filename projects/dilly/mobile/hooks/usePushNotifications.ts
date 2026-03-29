import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { apiFetch } from '../lib/auth';

// expo-device and expo-notifications require native modules that aren't available
// in Expo Go or the iOS Simulator. Lazy-import to avoid crashing at module load.
let Device: any = null;
let Notifications: any = null;

try {
  Device = require('expo-device');
  Notifications = require('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
} catch {
  // Native modules not available (Expo Go / Simulator)
}

export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<any>(null);
  const notificationListener = useRef<any>();
  const responseListener = useRef<any>();

  useEffect(() => {
    if (!Notifications || !Device) return; // Native modules not available
    registerForPush().then(token => {
      if (token) {
        setExpoPushToken(token);
        // Send token to our API
        apiFetch('/v2/push/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ push_token: token, platform: Platform.OS }),
        }).catch(() => {});
      }
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(n => {
      setNotification(n);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      // Handle navigation based on notification type
      if (data?.route) {
        // Navigate to the route specified in the notification
      }
    });

    return () => {
      if (notificationListener.current) notificationListener.current.remove();
      if (responseListener.current) responseListener.current.remove();
    };
  }, []);

  return { expoPushToken, notification };
}

async function registerForPush(): Promise<string | null> {
  if (!Device || !Notifications || !Device.isDevice) {
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: 'your-project-id', // Will be auto-filled by Expo
  });

  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  return tokenData.data;
}
