/**
 * 🧪 Live Test — สร้าง workflow จาก SD553 (EEE) → ส่ง email หา 5 หัวหน้า EEE จริง
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { readFileSync } from 'fs';

const env = {};
for (const line of readFileSync('.env', 'utf-8').split('\n')) {
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

console.log('\n🧪 LIVE TEST: SD553 ส่งใบ → 5 หัวหน้า EEE\n');

// 1. Wake up email server
console.log('1. ปลุก email server...');
try {
  const r = await fetch(`${EMAIL_API}/api/health`, { signal: AbortSignal.timeout(60000) });
  const j = await r.json();
  console.log(`   ✓ Server: ${j.status}, SMTP: ${j.smtp}`);
} catch (e) {
  console.log(`   ❌ Server ไม่พร้อม: ${e.message}`);
}

// 2. หา EEE heads
console.log('\n2. หาหัวหน้า EEE (Lv.4-8)...');
const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
const allSnap = await getDocs(usersRef);
const all = allSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.active !== false);

const norm = (s) => (s || '').toString().toUpperCase().replace(/[^A-Z0-9ก-๙]/g, '');
const heads = all.filter(u => {
  if (u.roleType !== 'HEAD') return false;
  const lv = Number(u.approvalLevel || 0);
  if (lv < 2 || lv > 8) return false;
  const ud = norm(u.department);
  if (ud === 'EMPLOYEEEXPERIENCEENGAGEMENT' || ud === 'EEE' || ud.startsWith('EMPLOYEEEXPERIENCE')) return true;
  // Also include heads who have EEE in additional departments
  const additional = Array.isArray(u.headOfAlsoDepartments) ? u.headOfAlsoDepartments : [];
  return additional.some(d => norm(d) === 'EEE' || norm(d).startsWith('EMPLOYEEEXPERIENCE'));
}).sort((a, b) => (Number(a.approvalLevel) || 99) - (Number(b.approvalLevel) || 99));

console.log(`   พบ ${heads.length} หัวหน้า:`);
heads.forEach(h => console.log(`   • Lv.${h.approvalLevel} ${h.id} ${h.name} → ${h.email}`));

// 3. สร้าง test workflow
const wfId = `wf-eee-livetest-${Date.now()}`;
const chainId = `chain-eee-livetest-${Date.now()}`;
const workflow = {
  id: wfId,
  chainId,
  step: 1,
  stepLabel: 'Check (หัวหน้าแผนก)',
  topic: 'ใบขอใช้รถ — Live Test EEE',
  sourceForm: 'VEHICLE_BOOKING',
  requesterId: 'SD553',
  requesterName: 'อรรถชัย กระแสร์ชล (LIVE TEST)',
  requesterDepartment: 'EMPLOYEE EXPERIENCE ENGAGEMENT',
  department: 'EMPLOYEE EXPERIENCE ENGAGEMENT',
  targetType: null,
  totalSteps: 2,
  status: 'pending',
  createdAt: new Date().toISOString(),
  acknowledgedAt: null,
  approvedBy: null,
  approvedSign: null,
  requestPayload: {
    name: 'อรรถชัย กระแสร์ชล',
    requesterId: 'SD553',
    department: 'EEE',
    email: 'intern_attachai.k@tbkk.co.th',
    date: new Date().toISOString().split('T')[0],
    timeStart: '10:00',
    timeEnd: '12:00',
    routes: [{ origin: 'TBKK เฟส 10', destination: 'TBKK เฟส 8' }],
    purpose: '5.1: Live test ระบบ',
    drivingOption: '6.2',
    needDriver: true,
  },
};

console.log(`\n3. สร้าง workflow: ${wfId}`);
await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows'), {
  ...workflow,
  firestoreCreatedAt: Timestamp.now(),
});

// 4. ส่ง email หาทุกคน
console.log(`\n4. ส่ง email ${heads.length} ฉบับ:`);
const date = new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
let sent = 0, failed = 0;
const results = [];

for (const h of heads) {
  if (!h.email) { console.log(`   ⏭ ${h.name} — ไม่มี email`); continue; }
  const personalUrl = `${PUBLIC_URL}/index.html?approve=${wfId}&as=${encodeURIComponent(h.email)}`;
  try {
    const r = await fetch(`${EMAIL_API}/api/send-approval-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: h.email,
        approverName: h.name,
        documentTitle: 'ใบขอใช้รถ',
        requesterName: 'อรรถชัย กระแสร์ชล (LIVE TEST)',
        department: 'EEE',
        date,
        approveUrl: personalUrl,
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (r.ok) {
      const j = await r.json();
      console.log(`   ✓ ${h.name} (${h.email}) ${j.demo ? '[DEMO]' : '[real SMTP]'}`);
      sent++;
      results.push({ name: h.name, email: h.email, url: personalUrl, ok: true });
    } else {
      const t = await r.text();
      console.log(`   ✗ ${h.name}: HTTP ${r.status}`);
      failed++;
    }
  } catch (e) {
    console.log(`   ✗ ${h.name}: ${e.message}`);
    failed++;
  }
}

console.log('\n' + '═'.repeat(72));
console.log(`📊 สำเร็จ ${sent}/${heads.length}  ล้มเหลว ${failed}`);
console.log('═'.repeat(72));

if (sent > 0) {
  console.log(`\n✅ Email ส่งสำเร็จ! ตรวจ inbox + spam ของ:`);
  results.filter(r => r.ok).forEach(r => console.log(`   📥 ${r.email}  (${r.name})`));

  console.log('\n🔗 ลิงก์เปิดดูเอกสาร (ทดสอบเปิดเป็นแต่ละคน):\n');
  results.filter(r => r.ok).forEach(r => {
    console.log(`   👨‍💼 ${r.name}:`);
    console.log(`      ${r.url}\n`);
  });
}

console.log(`\n📌 หลังทดสอบเสร็จ — workflow id: ${wfId} (สามารถลบทิ้งได้)\n`);
process.exit(0);
