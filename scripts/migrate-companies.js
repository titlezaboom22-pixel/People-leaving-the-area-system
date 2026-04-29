// One-off: ตั้งค่า company ให้ users ตาม ID prefix
//   W*  → Win
//   0*  → TBKK
//   อื่นๆ → คงเดิม (ไม่แตะ)
//
// รัน: node scripts/migrate-companies.js

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, setDoc, doc } from 'firebase/firestore';
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

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
});
const db = getFirestore(app);
await signInAnonymously(getAuth(app));
const appId = env.VITE_APP_ID || 'visitor-soc-001';

const detectCompany = (id) => {
  const v = (id || '').toString().trim().toUpperCase();
  if (!v) return '';
  if (v.startsWith('W')) return 'Win';
  if (v.startsWith('S')) return 'STU_K';
  if (/^\d/.test(v)) return 'TBKK';
  return '';
};

console.log('🔍 กำลังโหลด users...');
const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'));

const stats = { win: 0, tbkk: 0, stuk: 0, skipped: 0, alreadySet: 0 };
let processed = 0;

for (const d of snap.docs) {
  const data = d.data();
  const detected = detectCompany(d.id);

  if (!detected) {
    stats.skipped++;
    continue;
  }

  if (data.company === detected) {
    stats.alreadySet++;
    continue;
  }

  await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', d.id), {
    company: detected,
  }, { merge: true });

  if (detected === 'Win') stats.win++;
  else if (detected === 'TBKK') stats.tbkk++;
  else if (detected === 'STU_K') stats.stuk++;
  processed++;

  if (processed % 50 === 0) console.log(`   อัปเดตไปแล้ว ${processed} คน...`);
}

console.log('');
console.log('✅ เสร็จสิ้น');
console.log(`   ตั้งเป็น Win:      ${stats.win}`);
console.log(`   ตั้งเป็น TBKK:     ${stats.tbkk}`);
console.log(`   ตั้งเป็น STU_K:    ${stats.stuk}`);
console.log(`   ตั้งไว้แล้ว (skip): ${stats.alreadySet}`);
console.log(`   ไม่เข้าเงื่อนไข:    ${stats.skipped}`);
console.log(`   รวม processed:    ${processed}`);

process.exit(0);
