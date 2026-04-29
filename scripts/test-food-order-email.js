/**
 * Test ส่งเมล "เบิกอาหาร" ให้ GA team — ใช้ format เดียวกับใบเบิกรถ
 *
 * ทำอะไร:
 * 1. สร้าง test workflow FOOD_ORDER ใน Firestore (status: pending)
 * 2. ดึง email GA team ทั้ง 4 คน
 * 3. ส่ง email จริงผ่าน /api/send-approval-email
 *
 * Run: node scripts/test-food-order-email.js
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

console.log(`\n🧪 TEST: ส่งเมลใบเบิกอาหารให้ GA team\n`);
console.log(`📧 Email API: ${EMAIL_API}`);
console.log(`🌐 Public URL: ${PUBLIC_URL}\n`);

// 1. ดึง GA team
const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
const gaSnap = await getDocs(query(usersRef, where('department', '==', 'GA')));
const gaUsers = gaSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  .filter(u => u.role === 'GA' && u.email);

console.log(`👥 GA team ${gaUsers.length} คน:`);
gaUsers.forEach(u => console.log(`   • ${u.id} ${u.name} → ${u.email}`));
console.log('');

if (gaUsers.length === 0) {
  console.log('❌ ไม่พบ GA team');
  process.exit(1);
}

// 2. สร้าง test workflow
const wfId = `wf-test-${Date.now()}`;
const chainId = `chain-test-${Date.now()}`;
const testWorkflow = {
  id: wfId,
  chainId,
  step: 1,
  stepLabel: 'GA รับออเดอร์',
  topic: 'เอกสารสั่งอาหาร — TEST',
  sourceForm: 'FOOD_ORDER',
  requesterId: 'SD553',
  requesterName: 'อรรถชัย กระแสร์ชล (TEST)',
  requesterDepartment: 'EEE (Employee Experience Engagement)',
  department: 'GA',
  targetType: 'GA',
  totalSteps: 1,
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
    note: 'ทดสอบ — ลูกค้ามาประชุม 5 ท่าน',
  },
};

console.log(`📝 สร้าง test workflow ใน Firestore...`);
try {
  await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows'), {
    ...testWorkflow,
    firestoreCreatedAt: Timestamp.now(),
  });
  console.log(`   ✓ Workflow ID: ${wfId}\n`);
} catch (e) {
  console.log(`   ❌ Failed: ${e.message}`);
  process.exit(1);
}

// 3. Health check email server
console.log(`🏥 Checking email server...`);
try {
  const r = await fetch(`${EMAIL_API}/api/health`);
  const j = await r.json();
  console.log(`   ✓ Email server: ${JSON.stringify(j)}\n`);
} catch (e) {
  console.log(`   ❌ Email server ไม่พร้อม: ${e.message}`);
  console.log(`   → ตรวจสอบว่า server email รันอยู่ที่ ${EMAIL_API}`);
  process.exit(1);
}

// 4. ส่ง email ไปทุกคน — แต่ละคนได้ URL เฉพาะ (?as=email) เพื่อ auto-fill ชื่อ
const date = new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

console.log(`📨 กำลังส่ง email ${gaUsers.length} ฉบับ (แต่ละคน URL เฉพาะ)...\n`);

let success = 0;
let failed = 0;
for (const u of gaUsers) {
  // 🎯 URL เฉพาะคน — ระบบจะ auto-fill ชื่อในหน้า approve
  const approveUrl = `${PUBLIC_URL}/index.html?approve=${wfId}&as=${encodeURIComponent(u.email)}`;
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
        approveUrl,
      }),
    });
    if (r.ok) {
      const j = await r.json();
      console.log(`  ✓ ส่งให้ ${u.name} (${u.email}) ${j.demo ? '[DEMO mode]' : '[real SMTP]'}`);
      success++;
    } else {
      const t = await r.text();
      console.log(`  ✗ ส่งให้ ${u.name} ล้มเหลว: ${t.slice(0, 100)}`);
      failed++;
    }
  } catch (e) {
    console.log(`  ✗ ส่งให้ ${u.name} ล้มเหลว: ${e.message}`);
    failed++;
  }
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`✅ สำเร็จ: ${success}/${gaUsers.length}`);
if (failed > 0) console.log(`❌ ล้มเหลว: ${failed}`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`\n🔗 ลิงก์อนุมัติ (ทดสอบเปิดได้):`);
console.log(`\n   📌 ลิงก์เฉพาะคน (auto-fill ชื่อ):`);
gaUsers.forEach(u => {
  const url = `${PUBLIC_URL}/index.html?approve=${wfId}&as=${encodeURIComponent(u.email)}`;
  console.log(`   • ${u.name}:\n     ${url}`);
});
console.log(`\n   📌 ลิงก์ปกติ (ต้องเลือกชื่อเอง):`);
console.log(`     ${PUBLIC_URL}/index.html?approve=${wfId}\n`);
console.log(`💡 ตรวจ inbox ของ GA team:`);
gaUsers.forEach(u => console.log(`   📥 ${u.email}`));
console.log(`\n📌 หลังทดสอบเสร็จ ลบ workflow test ออกได้:`);
console.log(`   doc id ใน collection: approval_workflows (id: ${wfId})\n`);

process.exit(0);
