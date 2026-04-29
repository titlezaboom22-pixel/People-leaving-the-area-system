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
const ref = doc(db, 'artifacts', appId, 'public', 'data', 'users', '00591');
await setDoc(ref, {
  approvalLevel: 2,
  position: 'DIRECTOR',
  approvalLevelSetBy: 'admin-script-2026',
}, { merge: true });
const v = (await getDoc(ref)).data();
console.log('✓ อัปเดต 00591 เรียบร้อย');
console.log(`  ชื่อ: ${v.name}`);
console.log(`  ตำแหน่ง: ${v.position}`);
console.log(`  Lv: ${v.approvalLevel} (Director)`);
process.exit(0);
