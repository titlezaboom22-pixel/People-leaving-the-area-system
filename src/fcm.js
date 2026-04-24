import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { app, db, firebaseReady, appId } from './firebase';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

let messaging = null;

function getMsg() {
  if (!firebaseReady || !app) return null;
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return null;
  if (!messaging) {
    try { messaging = getMessaging(app); } catch (err) {
      console.warn('FCM not available:', err?.message);
      return null;
    }
  }
  return messaging;
}

/**
 * ขอสิทธิ์ notification + เก็บ FCM token ใน users/{staffId}.fcmTokens
 * เรียกหลัง login สำเร็จ
 */
export async function setupFCM(staffId) {
  if (!staffId) return { ok: false, reason: 'no-staff-id' };
  if (!VAPID_KEY) return { ok: false, reason: 'no-vapid-key' };
  const msg = getMsg();
  if (!msg) return { ok: false, reason: 'fcm-not-supported' };

  try {
    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return { ok: false, reason: 'permission-denied' };
    } else if (Notification.permission === 'denied') {
      return { ok: false, reason: 'permission-denied' };
    }

    const swReg = await navigator.serviceWorker.ready;
    const token = await getToken(msg, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });
    if (!token) return { ok: false, reason: 'no-token' };

    try {
      const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', staffId);
      await updateDoc(userRef, {
        fcmTokens: arrayUnion(token),
        fcmTokenUpdatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('FCM token save failed:', err?.message);
    }

    return { ok: true, token };
  } catch (err) {
    console.warn('setupFCM error:', err?.message);
    return { ok: false, reason: 'error', error: err?.message };
  }
}

/**
 * Listener สำหรับ push message ขณะแอปเปิดอยู่ (foreground)
 * จะแสดง in-app notification หรือ toast ได้
 */
export function onForegroundMessage(callback) {
  const msg = getMsg();
  if (!msg) return () => {};
  try {
    return onMessage(msg, callback);
  } catch {
    return () => {};
  }
}
