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
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
});
const db = getFirestore(app);
await signInAnonymously(getAuth(app));
const appId = env.VITE_APP_ID || 'visitor-soc-001';

const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
const eee = [];
for (const d of snap.docs) {
  const u = { id: d.id, ...d.data() };
  const dept = (u.department || '').toString().toUpperCase();
  if (dept.includes('EEE') || dept.includes('EMPLOYEE EXPERIENCE')) eee.push(u);
}
eee.sort((a, b) => (Number(a.approvalLevel) || 99) - (Number(b.approvalLevel) || 99));

console.log('\n=== ผู้ใช้ทั้งหมดในแผนก EEE ===');
for (const u of eee) {
  console.log(`Lv.${u.approvalLevel || '-'} | role=${u.role || '-'}/${u.roleType || '-'} | ${u.id} ${u.name || u.displayName || ''} | ${u.email || '(no email)'}`);
}

console.log('\n=== หัวหน้า Lv.2-8 ที่จะได้รับการแจ้งเตือน (Vehicle Booking) ===');
const approvers = eee.filter(u => {
  const lv = Number(u.approvalLevel || 0);
  return u.roleType === 'HEAD' && lv >= 2 && lv <= 8;
});
if (approvers.length === 0) console.log('❌ ไม่มี!');
else approvers.forEach(u => console.log(`✅ Lv.${u.approvalLevel} | ${u.id} ${u.name || u.displayName} → ${u.email}`));

process.exit(0);
