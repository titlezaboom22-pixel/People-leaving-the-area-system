importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyA_YqNYiDIGBWVU8820VqpQuPYDQzzw_pM",
  authDomain: "tbkk-system.firebaseapp.com",
  projectId: "tbkk-system",
  storageBucket: "tbkk-system.firebasestorage.app",
  messagingSenderId: "868987667106",
  appId: "1:868987667106:web:8f5f3b71851433de81cdfb",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'SOC Systems';
  const options = {
    body: payload.notification?.body || 'มีการแจ้งเตือนใหม่',
    icon: '/icon-192.svg',
    badge: '/icon-192.svg',
    data: payload.data,
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.openWindow(url));
});
