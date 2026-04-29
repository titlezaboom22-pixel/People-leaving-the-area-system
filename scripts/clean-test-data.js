// ลบข้อมูล "เคยใช้" — approval_workflows + audit_logs + login_attempts
// ❗ ไม่แตะ users / vehicles / equipment_stock
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
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

const COLLECTIONS_TO_CLEAR = [
  'approval_workflows',
  'vehicle_bookings',
  'equipment_requests',
  'appointments',
  'audit_logs',
  'login_attempts',
  'support_tickets',
];

console.log('🧹 เริ่มลบข้อมูลทดสอบ...\n');
for (const cname of COLLECTIONS_TO_CLEAR) {
  const ref = collection(db, 'artifacts', appId, 'public', 'data', cname);
  const snap = await getDocs(ref);
  if (snap.size === 0) {
    console.log(`  ${cname.padEnd(22)} → ว่างอยู่แล้ว`);
    continue;
  }
  let count = 0;
  for (const d of snap.docs) {
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', cname, d.id));
    count++;
  }
  console.log(`  ${cname.padEnd(22)} → ลบ ${count} รายการ ✓`);
}
console.log('\n✅ เสร็จสิ้น — กลับสู่จุดเริ่มต้น (ไม่มีร่องรอยการใช้งาน)');
console.log('📋 สิ่งที่เก็บไว้: users (907), vehicles, equipment_stock, ตั้งค่าระบบ');
process.exit(0);
