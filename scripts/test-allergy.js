/**
 * Test workflow ที่มีคนแพ้อาหาร — ดูว่า GA จะเห็นแบบไหน
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

const wfId = `wf-test-allergy-${Date.now()}`;
const chainId = `chain-test-allergy-${Date.now()}`;

const testWorkflow = {
  id: wfId,
  chainId,
  step: 1,
  stepLabel: 'Check (หัวหน้าแผนก)',
  topic: 'เอกสารสั่งอาหาร — มีคนแพ้อาหาร (TEST)',
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
    purpose: 'รับรองลูกค้า ABC Co. (5 ท่าน)',
    drinkRows: [
      { menu: 'กาแฟดำ', name: 'กาแฟดำ (เย็น)', temp: 'เย็น', qty: 2, count: 2, unitPrice: 40, lineTotal: 80, details: 'กาแฟดำ (เย็น)' },
      { menu: 'ลาเต้', name: 'ลาเต้ (เย็น)', temp: 'เย็น', qty: 1, count: 1, unitPrice: 45, lineTotal: 45, details: 'ลาเต้ (เย็น)' },
    ],
    foodRows: [
      // 🥘 กระเพราหมู — แพ้กระเทียม
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
      // 🍱 เซ็ต — ไม่มีแพ้
      {
        menu: 'เซ็ต ฿40 (ต้มจืด+ผัดผัก+ปีกไก่)',
        details: 'เซ็ต ฿40 (ต้มจืดเต้าหู้+ผัดผักรวม+ปีกไก่ทอด)',
        hasAllergy: false,
        qty: 2,
        count: 2,
        unitPrice: 40,
        lineTotal: 80,
      },
      // 🍳 ไข่เจียว — แพ้นมและไข่
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
    drinkTotalAmount: 125,
    foodTotalAmount: 170,
    totalAmount: 295,
    note: 'มีคน 3 คนแพ้อาหาร — กรุณาทำแยก!',
  },
};

await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows'), {
  ...testWorkflow,
  firestoreCreatedAt: Timestamp.now(),
});

console.log(`\n✅ สร้าง test workflow มีคนแพ้อาหาร — ${wfId}\n`);
console.log(`📊 รายการ:`);
console.log(`   ☕ เครื่องดื่ม: 2 รายการ`);
console.log(`   🍱 อาหาร: 3 รายการ`);
console.log(`     • 🥘 กระเพราหมู ⚠️ แพ้: กระเทียม, พริก (สมหญิง, วิชัย)`);
console.log(`     • 🍱 เซ็ต ฿40 — ปกติ`);
console.log(`     • 🍳 ไข่เจียว ⚠️ แพ้: ไข่, นมวัว (อรุณี)`);
console.log(`   💰 รวม: ฿295\n`);
console.log(`🔗 เปิดลิงก์ดูเลย:\n`);
console.log(`   ${PUBLIC_URL}/index.html?approve=${wfId}&as=sarayut_r%40tbkk.co.th\n`);
process.exit(0);
