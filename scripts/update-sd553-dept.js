/**
 * One-off: ย้าย SD553 ไปแผนก EEE + อัปเดต label ของ HEAD-EEE
 *   รัน: node scripts/update-sd553-dept.js
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const env = {};
  for (const line of readFileSync(resolve(__dirname, '..', '.env'), 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const env = loadEnv();
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});
const db = getFirestore(app);
await signInAnonymously(getAuth(app));
const appId = env.VITE_APP_ID || 'visitor-soc-001';

const NEW_DEPT = 'EEE (Employee Experience Engagement)';
for (const uid of ['SD553', 'HEAD-EEE', 'EMP-EEE-01']) {
  try {
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', uid), { department: NEW_DEPT });
    console.log(`✓ ${uid} → ${NEW_DEPT}`);
  } catch (e) {
    console.warn(`✗ ${uid}: ${e.message}`);
  }
}
process.exit(0);
