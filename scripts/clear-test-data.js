/**
 * One-off: ล้าง test data ทั้งหมด — ให้ทุก user เริ่มจาก 0
 *   รัน: node scripts/clear-test-data.js
 *
 * เก็บไว้: users, smtp_settings, equipment_stock, audit_logs, login_attempts
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const env = {};
  for (const line of readFileSync(resolve(__dirname, '..', '.env'), 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const env = loadEnv();
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});
const db = getFirestore(app);
await signInAnonymously(getAuth(app));
const appId = env.VITE_APP_ID || 'visitor-soc-001';

const COLLECTIONS_TO_CLEAR = [
  'approval_workflows',
  'appointments',
  'employee_logs',
  'equipment_requests',
  'goods_inout_logs',
  'visitor_logs',
  'outing_logs',
  'vehicle_bookings',
];

let totalDeleted = 0;
for (const name of COLLECTIONS_TO_CLEAR) {
  try {
    const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', name));
    if (snap.empty) {
      console.log(`  - ${name}: ว่างอยู่แล้ว`);
      continue;
    }
    let n = 0;
    for (const d of snap.docs) {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', name, d.id));
      n++;
    }
    console.log(`  ✓ ${name}: ลบ ${n} รายการ`);
    totalDeleted += n;
  } catch (e) {
    console.warn(`  ✗ ${name}: ${e.message}`);
  }
}
console.log(`\nเสร็จแล้ว — ลบทั้งหมด ${totalDeleted} documents`);
process.exit(0);
