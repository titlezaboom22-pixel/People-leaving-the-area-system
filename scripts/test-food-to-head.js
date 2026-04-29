/**
 * Test ส่งใบเบิกอาหารไปหา "หัวหน้า EEE" (step 1 ของ flow ใหม่)
 * Run: node scripts/test-food-to-head.js
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

const EMAIL_API = env.VITE_EMAIL_API || 'http://localhost:3001';
const PUBLIC_URL = env.VITE_PUBLIC_URL || 'https://tbkk-system.web.app';

console.log(`\n🧪 TEST: ส่งใบเบิกอาหารไปหา "หัวหน้า EEE" (Step 1)\n`);

// 1. ดึงหัวหน้า EEE ทั้งหมด (Lv.4-8)
const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
const headsSnap = await getDocs(query(usersRef, where('roleType', '==', 'HEAD')));
const norm = (s) => (s || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
const heads = headsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  .filter(u => {
    if (u.active === false) return false;
    const lv = Number(u.approvalLevel || 0);
    if (lv < 2 || lv > 8) return false;
    const ud = norm(u.department);
    return ud === 'EEE' || ud.startsWith('EMPLOYEEEXPERIENCE') || ud.startsWith('EEE');
  })
  .filter(u => u.email);

console.log(`👨‍💼 พบหัวหน้า EEE ${heads.length} คน:`);
heads.forEach(u => console.log(`   • Lv.${u.approvalLevel} ${u.id} ${u.name} → ${u.email}`));
console.log('');

if (heads.length === 0) {
  console.log('❌ ไม่พบหัวหน้า EEE');
  process.exit(1);
}

// 2. สร้าง workflow step 1 = หัวหน้าแผนก
const wfId = `wf-test-foodtohead-${Date.now()}`;
const chainId = `chain-test-foodtohead-${Date.now()}`;
const testWorkflow = {
  id: wfId,
  chainId,
  step: 1,
  stepLabel: 'Check (หัวหน้าแผนก)',
  topic: 'เอกสารสั่งอาหาร — รอหัวหน้าอนุมัติ (TEST)',
  sourceForm: 'FOOD_ORDER',
  requesterId: 'SD553',
  requesterName: 'อรรถชัย กระแสร์ชล (TEST)',
  requesterDepartment: 'EEE (Employee Experience Engagement)',
  department: 'EEE (Employee Experience Engagement)',
  targetType: null,  // step 1 = หัวหน้า ไม่มี targetType
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
    rows: [
      { details: 'เซ็ต ฿40 (ต้มจืดเต้าหู้ + ผัดผักรวม + ปีกไก่ทอด)', count: 1, unitPrice: 40, lineTotal: 40 },
      { details: 'กระเพราหมู (เผ็ด, ไข่ดาว)', count: 1, unitPrice: 30, lineTotal: 30 },
    ],
    totalAmount: 70,
    note: 'ทดสอบ Flow ใหม่ — ลูกค้ามาประชุม 5 ท่าน',
  },
};

console.log(`📝 สร้าง test workflow ใน Firestore...`);
await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows'), {
  ...testWorkflow,
  firestoreCreatedAt: Timestamp.now(),
});
console.log(`   ✓ Workflow ID: ${wfId}\n`);

// 3. ส่ง email ไปหาหัวหน้า — แต่ละคน URL เฉพาะ
const date = new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
console.log(`📨 กำลังส่ง email ${heads.length} ฉบับ (Personalized URL)...\n`);

let success = 0;
for (const u of heads) {
  const personalUrl = `${PUBLIC_URL}/index.html?approve=${wfId}&as=${encodeURIComponent(u.email)}`;
  try {
    const r = await fetch(`${EMAIL_API}/api/send-approval-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: u.email,
        approverName: u.name,
        documentTitle: 'สั่งอาหาร',
        requesterName: 'อรรถชัย กระแสร์ชล (TEST)',
        department: 'EEE',
        date,
        approveUrl: personalUrl,
      }),
    });
    if (r.ok) {
      const j = await r.json();
      console.log(`  ✓ ${u.name} (Lv.${u.approvalLevel}) → ${u.email} ${j.demo ? '[DEMO]' : '[real SMTP]'}`);
      success++;
    } else {
      console.log(`  ✗ ${u.name}: ${(await r.text()).slice(0, 100)}`);
    }
  } catch (e) {
    console.log(`  ✗ ${u.name}: ${e.message}`);
  }
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`✅ ส่งสำเร็จ: ${success}/${heads.length}`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

console.log(`🔗 ลิงก์เฉพาะคน (เปิดดูหน้าที่หัวหน้าจะเห็น):\n`);
heads.forEach(u => {
  const url = `${PUBLIC_URL}/index.html?approve=${wfId}&as=${encodeURIComponent(u.email)}`;
  console.log(`   👨‍💼 ${u.name} (Lv.${u.approvalLevel}):`);
  console.log(`      ${url}\n`);
});

console.log(`📌 ลิงก์ทั่วไป (แสดง dropdown ให้เลือกชื่อ):`);
console.log(`   ${PUBLIC_URL}/index.html?approve=${wfId}\n`);

process.exit(0);
