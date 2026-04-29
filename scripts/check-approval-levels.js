// เช็ค approvalLevel ของ 28 approvers
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
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

const APPROVER_IDS = [
  '00004', '01675', '00201', '01171', '01803', '01754', '01259', '01734',
  '01222', '01228', '01394', '02069', '01396', '01499', '01484', '02068',
  '00300', '02040', '01957', '01677', '01835', '02030', '01434', '01478',
  '01753', '02096', '01810', '02044',
];

const LV_LABELS = {
  3: 'GM', 4: 'Asst.GM', 5: 'ผู้จัดการฝ่าย', 6: 'ผู้ช่วย ผจ.ฝ่าย',
  7: 'หัวหน้าแผนก', 8: 'Supervisor', 9: 'พนักงาน',
};

console.log('ID    | ชื่อ                          | role | roleType | Lv | สิทธิ์อนุมัติ');
console.log('------|------------------------------|------|----------|----|-----------');

const cantApprove = [];
for (const id of APPROVER_IDS) {
  const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', id));
  if (!snap.exists()) {
    console.log(`${id} | ❌ ไม่พบ`);
    continue;
  }
  const d = snap.data();
  const lv = Number(d.approvalLevel || 0);
  const canApprove = lv >= 3 && lv <= 8;
  const flag = canApprove ? '✓ อนุมัติได้' : '❌ อนุมัติไม่ได้';
  const lvLabel = LV_LABELS[lv] || '?';
  console.log(`${id} | ${(d.name || d.displayName || '').padEnd(28)} | ${d.role?.padEnd(4)} | ${(d.roleType || '').padEnd(8)} | ${lv}  | ${flag} (${lvLabel})`);
  if (!canApprove) cantApprove.push({ id, name: d.name || d.displayName, lv, dept: d.department });
}

console.log(`\n=== สรุป: คนที่อนุมัติไม่ได้ (${cantApprove.length}) ===`);
cantApprove.forEach(c => console.log(`  ${c.id}  ${c.name}  Lv.${c.lv}  (${c.dept})`));

process.exit(0);
