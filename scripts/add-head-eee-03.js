/**
 * One-off: เพิ่มหัวหน้า EEE คนที่ 3 (Mongkon)
 *   รัน: node scripts/add-head-eee-03.js
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const env = {};
  for (const line of readFileSync(resolve(__dirname, '..', '.env'), 'utf-8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

async function hashPassword(plain) {
  const data = new TextEncoder().encode(plain);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const env = loadEnv();
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
});
const db = getFirestore(app);
await signInAnonymously(getAuth(app));
const appId = env.VITE_APP_ID || 'visitor-soc-001';

const user = {
  id: 'HEAD-EEE-03',
  displayName: 'Mongkon (หัวหน้า EEE)',
  role: 'HOST',
  roleType: 'HEAD',
  department: 'EEE (Employee Experience Engagement)',
  email: 'mongkon_k@tbkk.co.th',
  active: true,
  status: 'available',
  passwordHash: await hashPassword('1234'),
};

await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', user.id), user);
console.log(`✓ เพิ่ม ${user.id} (${user.displayName}) — รหัส 1234 — ${user.email}`);
process.exit(0);
