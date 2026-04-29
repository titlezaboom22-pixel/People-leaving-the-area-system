/**
 * สร้าง test workflow ที่อยู่ step 2 (GA แล้ว) — มีคนแพ้อาหาร
 * เพื่อให้ user เปิดลิงก์เห็นหน้า GA approve เลย
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, Timestamp } from 'firebase/firestore';
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

const chainId = `chain-test-ga-${Date.now()}`;
const step1Id = `wf-test-ga-step1-${Date.now()}`;
const step2Id = `wf-test-ga-step2-${Date.now()}`;
const now = new Date().toISOString();

const requestPayload = {
  responsiblePerson: 'อรรถชัย กระแสร์ชล',
  employeeId: 'SD553',
  department: 'EEE',
  email: 'intern_attachai.k@tbkk.co.th',
  orderDate: new Date().toLocaleDateString('th-TH'),
  orderTime: '12:00',
  location: 'ห้องประชุม A',
  purpose: 'รับรองลูกค้า ABC Co. (5 ท่าน)',
  drinkRows: [
    { menu: 'กาแฟดำ', name: 'กาแฟดำ (เย็น)', temp: 'เย็น', qty: 2, count: 2, unitPrice: 40, lineTotal: 80, details: 'กาแฟดำ (เย็น)' },
    { menu: 'ลาเต้', name: 'ลาเต้ (เย็น)', temp: 'เย็น', qty: 1, count: 1, unitPrice: 45, lineTotal: 45, details: 'ลาเต้ (เย็น)' },
    { menu: 'ชาเขียว', name: 'ชาเขียว (เย็น)', temp: 'เย็น', qty: 1, count: 1, unitPrice: 40, lineTotal: 40, details: 'ชาเขียว (เย็น)' },
  ],
  foodRows: [
    {
      menu: 'กระเพราหมู',
      details: 'กระเพราหมู',
      proteins: ['หมู'],
      spicy: ['เผ็ด'],
      egg: ['ไข่ดาว'],
      hasAllergy: true,
      allergies: ['กระเทียม', 'พริก'],
      allergyNames: ['คุณสมหญิง', 'คุณวิชัย'],
      qty: 2,
      count: 2,
      unitPrice: 30,
      lineTotal: 60,
    },
    {
      menu: 'เซ็ต ฿40 (ต้มจืดเต้าหู้+ผัดผักรวม+ปีกไก่ทอด)',
      details: 'เซ็ต ฿40 (ต้มจืดเต้าหู้+ผัดผักรวม+ปีกไก่ทอด)',
      hasAllergy: false,
      qty: 2,
      count: 2,
      unitPrice: 40,
      lineTotal: 80,
    },
    {
      menu: 'ไข่เจียวหัวหอม',
      details: 'ไข่เจียวหัวหอม',
      spicy: ['ไม่เผ็ด'],
      hasAllergy: true,
      allergies: ['ไข่', 'นมวัว'],
      allergyNames: ['คุณอรุณี'],
      qty: 1,
      count: 1,
      unitPrice: 30,
      lineTotal: 30,
    },
  ],
  drinkTotalAmount: 165,
  foodTotalAmount: 170,
  totalAmount: 335,
  note: 'มีคน 3 คนแพ้อาหาร — กรุณาทำแยก!',
};

// Step 1 — หัวหน้าอนุมัติแล้ว (status = approved)
const step1 = {
  id: step1Id,
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
  status: 'approved',
  createdAt: now,
  acknowledgedAt: now,
  approvedBy: 'ศรายุทธ รัตนนท์',
  approvedSign: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTUwIiBoZWlnaHQ9IjUwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0xMCAyNSBDIDIwIDEwLCAzMCA0MCwgNDAgMjUgUyA2MCAxMCwgNzAgMjUiIHN0cm9rZT0iIzAwMDA4MCIgZmlsbD0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIyIi8+PC9zdmc+',
  requestPayload,
};

// Step 2 — รอ GA อนุมัติ (status = pending)
const step2 = {
  id: step2Id,
  chainId,
  step: 2,
  stepLabel: 'GA รับออเดอร์',
  topic: 'เอกสารสั่งเครื่องดื่ม+อาหาร — รอ GA',
  sourceForm: 'DRINK_FOOD_ORDER',
  requesterId: 'SD553',
  requesterName: 'อรรถชัย กระแสร์ชล (TEST)',
  requesterDepartment: 'EEE (Employee Experience Engagement)',
  department: 'GA',
  targetType: 'GA',
  totalSteps: 2,
  status: 'pending',
  createdAt: now,
  acknowledgedAt: null,
  approvedBy: null,
  approvedSign: null,
  requestPayload,
};

const collRef = collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows');
await addDoc(collRef, { ...step1, firestoreCreatedAt: Timestamp.now() });
await addDoc(collRef, { ...step2, firestoreCreatedAt: Timestamp.now() });

console.log(`\n✅ สร้าง test workflow — step 2 (GA) — รออนุมัติ\n`);
console.log(`👨‍💼 หัวหน้าอนุมัติแล้ว: ศรายุทธ รัตนนท์`);
console.log(`👤 รอ GA อนุมัติ: 4 คน (ทองจิต / ชนะชัย / ณรงค์ศักดิ์ / เบญจมาศ)\n`);
console.log(`💰 รายการ:`);
console.log(`   ☕ เครื่องดื่ม: 3 รายการ ฿165`);
console.log(`   🍱 อาหาร: 3 รายการ ฿170 (มีคนแพ้ 2 รายการ)`);
console.log(`   💰 รวม: ฿335\n`);

console.log(`🔗 เปิดดูเป็น GA "ทองจิต":`);
console.log(`\n   ${PUBLIC_URL}/index.html?approve=${step2Id}&as=tongjit%40tbkk.co.th\n`);

console.log(`💡 ในหน้านี้:`);
console.log(`   1. ระบบ auto-detect "ทองจิต เจริญยิ่ง"`);
console.log(`   2. เห็นเอกสารแบบ Card สวย`);
console.log(`   3. มีลายเซ็นหัวหน้าศรายุทธแล้ว`);
console.log(`   4. เซ็นลายเซ็น → กดอนุมัติ`);
console.log(`   5. → ไปหน้า "ส่งให้ร้านกาแฟ" + "ส่งให้ร้านข้าว"`);

process.exit(0);
