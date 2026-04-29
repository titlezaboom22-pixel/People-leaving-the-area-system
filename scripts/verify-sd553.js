import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of readFileSync(resolve(__dirname, '..', '.env'), 'utf-8').split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('='); if (i === -1) continue;
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
const app = initializeApp({apiKey:env.VITE_FIREBASE_API_KEY,authDomain:env.VITE_FIREBASE_AUTH_DOMAIN,projectId:env.VITE_FIREBASE_PROJECT_ID,storageBucket:env.VITE_FIREBASE_STORAGE_BUCKET,messagingSenderId:env.VITE_FIREBASE_MESSAGING_SENDER_ID,appId:env.VITE_FIREBASE_APP_ID});
const db = getFirestore(app);
await signInAnonymously(getAuth(app));
const appId = env.VITE_APP_ID || 'visitor-soc-001';

async function hashPw(p) { const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p)); return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''); }

const newHash = await hashPw('1234');
const expected1234 = await hashPw('1234');

const ref = doc(db, 'artifacts', appId, 'public', 'data', 'users', 'SD553');
const before = (await getDoc(ref)).data();
console.log('=== ก่อนแก้ ===');
console.log('  passwordHash:', before?.passwordHash?.slice(0, 20) + '...');
console.log('  expected1234:', expected1234.slice(0, 20) + '...');
console.log('  active:', before?.active);
console.log('  ตรงกันไหม:', before?.passwordHash === expected1234 ? '✓ YES' : '❌ NO');

await setDoc(ref, { passwordHash: newHash, active: true }, { merge: true });

const after = (await getDoc(ref)).data();
console.log('\n=== หลังแก้ ===');
console.log('  passwordHash:', after?.passwordHash?.slice(0, 20) + '...');
console.log('  ตรงกัน 1234 ไหม:', after?.passwordHash === expected1234 ? '✓ YES' : '❌ NO');

// ลบ login_attempts ของ SD553 (เผื่อโดน lockout)
const lockRef = doc(db, 'artifacts', appId, 'public', 'data', 'login_attempts', 'SD553');
await setDoc(lockRef, { count: 0, lockedUntil: null }, { merge: true });
console.log('\n✓ ปลด lockout ของ SD553 (count=0)');
console.log('\n🔑 SD553 / 1234 พร้อม login');
process.exit(0);
