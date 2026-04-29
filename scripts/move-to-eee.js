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

const DEPT = 'EMPLOYEE EXPERIENCE ENGAGEMENT';

// 01905 Benjamas → EEE Lv.4
await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', '01905'), {
  department: DEPT,
  role: 'HOST', roleType: 'HEAD', approvalLevel: 4,
  position: 'Asst.GM',
}, { merge: true });
const b = (await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', '01905'))).data();
console.log(`✓ 01905 Benjamas → ${b.department} | Lv.${b.approvalLevel}`);

// 01941 Mongkon → EEE Lv.5
await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', '01941'), {
  department: DEPT,
  role: 'HOST', roleType: 'HEAD', approvalLevel: 5,
  position: 'ผู้จัดการฝ่าย',
}, { merge: true });
const m = (await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', '01941'))).data();
console.log(`✓ 01941 Mongkon → ${m.department} | Lv.${m.approvalLevel}`);

// ปลด Benjamas / Mongkon ออกจาก GA Team field (ถ้ามี)
await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', '01905'), { isVehicleGATeam: false }, { merge: true });

// ตรวจ SD553 อยู่ EEE ไหม (เพื่อ test)
const sd = (await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', 'SD553'))).data();
console.log(`\nSD553 (ผู้ทดสอบ) อยู่แผนก: ${sd.department}`);
console.log('\n✅ พร้อมทดสอบ — login SD553/1234 → ส่งฟอร์ม → ระบบส่งให้ Benjamas + Mongkon');
process.exit(0);
