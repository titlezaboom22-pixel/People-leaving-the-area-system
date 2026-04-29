// 📊 นับเอกสารทั้งหมดใน Firestore — ดูก่อนลบ
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

const COLLECTIONS = [
  'approval_workflows',  // เอกสารอนุมัติทั้งหมด (รถ/ออกนอก/ของ/แขก/น้ำ/ข้าว)
  'vehicle_bookings',
  'equipment_requests',
  'appointments',
  'employee_logs',
  'audit_logs',
  'login_attempts',
  'support_tickets',
  'users',               // ⚠️ ห้ามลบ (สำคัญ)
  'equipment_stock',     // ⚠️ ห้ามลบ (สำคัญ)
];

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  📊 จำนวนเอกสารใน Firestore — ก่อนลบดูสรุปก่อน                   ║');
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

let totalDocs = 0;
let totalToDelete = 0;
const PROTECTED = ['users', 'equipment_stock'];

for (const cname of COLLECTIONS) {
  const ref = collection(db, 'artifacts', appId, 'public', 'data', cname);
  const snap = await getDocs(ref);
  const isProtected = PROTECTED.includes(cname);
  const icon = isProtected ? '🔒' : (snap.size > 0 ? '🗑️ ' : '✓');
  const tag = isProtected ? '(ห้ามลบ)' : '';
  console.log(`  ${icon} ${cname.padEnd(22)} ${String(snap.size).padStart(5)} รายการ ${tag}`);

  // Breakdown approval_workflows by sourceForm + status
  if (cname === 'approval_workflows' && snap.size > 0) {
    const byForm = {};
    const byStatus = {};
    snap.docs.forEach(d => {
      const data = d.data();
      const form = data.sourceForm || '(ไม่ระบุ)';
      const status = data.status || '(ไม่ระบุ)';
      byForm[form] = (byForm[form] || 0) + 1;
      byStatus[status] = (byStatus[status] || 0) + 1;
    });
    console.log('     ├─ แยกตามประเภท:');
    Object.entries(byForm).sort((a,b) => b[1]-a[1]).forEach(([k, v]) => {
      console.log(`     │   ${k.padEnd(20)} ${v} ใบ`);
    });
    console.log('     └─ แยกตามสถานะ:');
    Object.entries(byStatus).sort((a,b) => b[1]-a[1]).forEach(([k, v]) => {
      console.log(`         ${k.padEnd(20)} ${v} ใบ`);
    });
  }

  totalDocs += snap.size;
  if (!isProtected) totalToDelete += snap.size;
}

console.log('\n' + '═'.repeat(72));
console.log(`📁 รวมเอกสารทั้งหมด:        ${totalDocs} รายการ`);
console.log(`🗑️  จะถูกลบถ้ารัน clean:    ${totalToDelete} รายการ`);
console.log(`🔒 ที่จะคงอยู่ (ปกป้อง):    ${totalDocs - totalToDelete} รายการ (users + stock)`);
console.log('═'.repeat(72));
console.log('\n💡 ถ้าจะลบจริง รัน: node scripts/clean-test-data.js');
console.log('⚠️  Backup ก่อนลบ: ระบบไม่มี undo!\n');

process.exit(0);
