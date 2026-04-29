import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
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

const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
const byLevel = {};
const lv8 = [], lv9 = [];
for (const d of snap.docs) {
  const u = { id: d.id, ...d.data() };
  if (u.active === false) continue;
  const lv = Number(u.approvalLevel || 0);
  byLevel[lv] = (byLevel[lv] || 0) + 1;
  if (lv === 8) lv8.push(u);
  if (lv === 9) lv9.push(u);
}

console.log('=== สรุปจำนวนคน แยกตาม approvalLevel ===');
Object.keys(byLevel).sort((a,b) => Number(a) - Number(b)).forEach(lv => {
  console.log(`  Lv.${lv}: ${byLevel[lv]} คน`);
});

console.log(`\n=== Level 8 (Supervisor) — ${lv8.length} คน — อนุมัติได้ ===`);
lv8.slice(0, 15).forEach(u => console.log(`  ${u.id}  ${(u.name || u.displayName || '').padEnd(30)}  ${u.role}/${u.roleType}  ${u.department || ''}`));
if (lv8.length > 15) console.log(`  ... และอีก ${lv8.length - 15} คน`);

console.log(`\n=== Level 9 (พนักงาน) — ${lv9.length} คน — อนุมัติไม่ได้ ===`);
lv9.slice(0, 5).forEach(u => console.log(`  ${u.id}  ${(u.name || u.displayName || '').padEnd(30)}  ${u.role}/${u.roleType}  ${u.department || ''}`));
if (lv9.length > 5) console.log(`  ... และอีก ${lv9.length - 5} คน`);

process.exit(0);
