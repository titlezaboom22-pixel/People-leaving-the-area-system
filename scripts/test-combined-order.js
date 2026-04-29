/**
 * Test สั่งรวม น้ำ+อาหาร (DRINK_FOOD_ORDER) ดูว่าหน้าตาเป็นยังไง
 * Run: node scripts/test-combined-order.js
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, where, Timestamp } from 'firebase/firestore';
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

const PUBLIC_URL = env.VITE_PUBLIC_URL || 'https://tbkk-system.web.app';

const wfId = `wf-test-combined-${Date.now()}`;
const chainId = `chain-test-combined-${Date.now()}`;

const testWorkflow = {
  id: wfId,
  chainId,
  step: 1,
  stepLabel: 'Check (หัวหน้าแผนก)',
  topic: 'เอกสารสั่งเครื่องดื่ม+อาหาร — TEST',
  sourceForm: 'DRINK_FOOD_ORDER',
  requesterId: 'SD553',
  requesterName: 'อรรถชัย กระแสร์ชล (TEST)',
  requesterDepartment: 'EEE (Employee Experience Engagement)',
  department: 'EEE (Employee Experience Engagement)',
  targetType: null,
  totalSteps: 2,
  status: 'pending',
  createdAt: new Date().toISOString(),
  acknowledgedAt: null,
  approvedBy: null,
  approvedSign: null,
  requestPayload: {
    responsiblePerson: 'อรรถชัย กระแสร์ชล',
    employeeId: 'SD553',
    department: 'EEE',
    email: 'intern_attachai.k@tbkk.co.th',
    orderDate: new Date().toLocaleDateString('th-TH'),
    orderTime: '12:00',
    location: 'ห้องประชุม A',
    purpose: 'รับรองลูกค้า ABC Co.',
    drinkRows: [
      { details: 'กาแฟดำ (เย็น)', count: 2, condition: 'เย็น', unitPrice: 40, lineTotal: 80 },
      { details: 'ลาเต้ (เย็น)',  count: 1, condition: 'เย็น', unitPrice: 45, lineTotal: 45 },
      { details: 'ชาเขียว (เย็น)', count: 1, condition: 'เย็น', unitPrice: 40, lineTotal: 40 },
    ],
    foodRows: [
      { details: 'เซ็ต ฿40 (ต้มจืดเต้าหู้ + ผัดผักรวม + ปีกไก่ทอด)', count: 1, unitPrice: 40, lineTotal: 40 },
      { details: 'กระเพราหมู (เผ็ด, ไข่ดาว)', count: 1, unitPrice: 30, lineTotal: 30 },
    ],
    drinkTotalAmount: 165,
    foodTotalAmount: 70,
    totalAmount: 235,
    note: 'ทดสอบใบรวม — ลูกค้ามาประชุม 5 ท่าน',
  },
};

console.log(`\n🧪 สร้างใบทดสอบ: เครื่องดื่ม+อาหาร (TEST)\n`);
await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows'), {
  ...testWorkflow,
  firestoreCreatedAt: Timestamp.now(),
});

console.log(`✅ สร้าง workflow สำเร็จ — ${wfId}\n`);
console.log(`📊 รายการ:`);
console.log(`   ☕ เครื่องดื่ม 4 รายการ — ฿165`);
console.log(`     • กาแฟดำ × 2 = ฿80`);
console.log(`     • ลาเต้ × 1 = ฿45`);
console.log(`     • ชาเขียว × 1 = ฿40`);
console.log(`   🍱 อาหาร 2 รายการ — ฿70`);
console.log(`     • เซ็ต ฿40 × 1`);
console.log(`     • กระเพราหมู × 1 ฿30`);
console.log(`   💰 รวม: ฿235\n`);

console.log(`🔗 ลิงก์เปิดดู (เป็นหัวหน้า "ศรายุทธ"):`);
console.log(`\n   ${PUBLIC_URL}/index.html?approve=${wfId}&as=sarayut_r%40tbkk.co.th\n`);

console.log(`💡 หลังหัวหน้าอนุมัติ → จะส่งต่อไปที่ GA team:`);
console.log(`   ทองจิต / ชนะชัย / ณรงค์ศักดิ์ / เบญจมาศ`);
console.log(`\n📌 ปัญหาปัจจุบัน: GA ได้รับใบเดียว แต่ต้องส่ง 2 ร้าน (กาแฟ + ข้าว)`);

process.exit(0);
