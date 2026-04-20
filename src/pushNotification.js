import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { app } from './firebase';

let messaging = null;

export async function initPushNotifications() {
  try {
    messaging = getMessaging(app);

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Push notification permission denied');
      return null;
    }

    // Note: VAPID key needs to be generated in Firebase Console > Cloud Messaging > Web Push certificates
    // For now, use a placeholder - user needs to generate this
    const vapidKey = ''; // TODO: Generate in Firebase Console

    if (!vapidKey) {
      console.log('VAPID key not set - push notifications disabled');
      return null;
    }

    const token = await getToken(messaging, { vapidKey });
    console.log('FCM Token:', token);

    // Listen for foreground messages
    onMessage(messaging, (payload) => {
      console.log('Foreground message:', payload);
      // Show notification even when app is in foreground
      if (Notification.permission === 'granted') {
        new Notification(payload.notification?.title || 'SOC Systems', {
          body: payload.notification?.body || 'มีการแจ้งเตือนใหม่',
          icon: '/icon-192.svg',
        });
      }
    });

    return token;
  } catch (err) {
    console.warn('Push notification setup failed:', err);
    return null;
  }
}

export function isNotificationSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator;
}
