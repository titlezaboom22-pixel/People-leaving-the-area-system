import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

let app = null;
let auth = null;
let db = null;
let firebaseReady = false;

try {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;

  if (apiKey && apiKey !== 'your-api-key') {
    const firebaseConfig = {
      apiKey,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    firebaseReady = true;
  } else {
    console.warn('Firebase config not set. Running in demo mode.');
  }
} catch (error) {
  console.error('Firebase initialization error:', error);
}

const appId = import.meta.env.VITE_APP_ID || 'visitor-soc-001';

export { app, auth, db, firebaseReady, appId };
