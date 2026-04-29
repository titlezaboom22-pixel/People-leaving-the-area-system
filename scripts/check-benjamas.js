import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { readFileSync } from 'fs';

const env = {};
for (const line of readFileSync('.env', 'utf-8').split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('='); if (i === -1) continue;
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
});
const db = getFirestore(app);
await signInAnonymously(getAuth(app));
const appId = env.VITE_APP_ID || 'visitor-soc-001';

const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', '01905'));
if (!snap.exists()) {
  console.log('❌ ไม่พบ 01905');
  process.exit(1);
}
const u = snap.data();
console.log('\n📋 ข้อมูลปัจจุบันของ 01905 ในระบบ:\n');
for (const k of Object.keys(u).sort()) {
  if (k === 'passwordHash' || k === 'firestoreCreatedAt') continue;
  console.log(`  ${k.padEnd(28)}: ${typeof u[k] === 'object' ? JSON.stringify(u[k]) : u[k]}`);
}
process.exit(0);
