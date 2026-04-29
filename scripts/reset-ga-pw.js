// Reset password = 1234 ให้ทั้ง GA Team + Lv.4/5 EEE + Lv.9 พนักงาน EEE สำหรับทดสอบ
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
const pw = await hashPw('1234');
// GA Team 4 + Lv.4 + Lv.5 EEE + ตัวอย่าง Lv.9
const ids = ['01905', '01861', '01583', '00406', '02007', '01396', '02051', '02081'];
for (const id of ids) {
  const ref = doc(db, 'artifacts', appId, 'public', 'data', 'users', id);
  await setDoc(ref, { passwordHash: pw }, { merge: true });
  const d = (await getDoc(ref)).data();
  console.log(`✓ ${id}  ${d?.name || d?.displayName || ''}  → password = 1234`);
}
process.exit(0);
