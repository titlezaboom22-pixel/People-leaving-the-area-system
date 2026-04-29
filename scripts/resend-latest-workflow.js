/**
 * ส่ง email อีกครั้งสำหรับ workflow ล่าสุด — ใช้ตอน email ไม่ถึงครั้งแรก
 */
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

const EMAIL_API = env.VITE_EMAIL_API || 'https://tbkk-email-server.onrender.com';
const PUBLIC_URL = env.VITE_PUBLIC_URL || 'https://tbkk-system.web.app';
const norm = (s) => (s || '').toString().toUpperCase().replace(/[^A-Z0-9ก-๙]/g, '');

console.log('\n🔄 ส่ง email สำหรับ workflow ล่าสุด...\n');

// 1. Health check
console.log('1️⃣ ตรวจ email server...');
try {
  const r = await fetch(`${EMAIL_API}/api/health`, { signal: AbortSignal.timeout(60000) });
  const j = await r.json();
  console.log(`   Status: ${j.status} · SMTP: ${j.smtp ? '✅ พร้อม' : '❌ DEMO mode (ไม่ส่งจริง!)'}`);
  if (!j.smtp) {
    console.log('\n⚠️  Render server อยู่ใน demo mode — email จะไม่ออกจริง!');
    console.log('   วิธีแก้: ตั้งค่า SMTP_USER / SMTP_PASS ใน Render Environment\n');
  }
} catch (e) { console.log(`   ❌ Server ไม่พร้อม: ${e.message}\n`); }

// 2. หา workflow ล่าสุด
console.log('\n2️⃣ หา workflow ล่าสุดที่ pending...');
const wfSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows'));
const all = wfSnap.docs.map(d => ({ ...d.data(), _docId: d.id })).filter(w => w.status === 'pending');
all.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

if (all.length === 0) { console.log('❌ ไม่มี workflow pending'); process.exit(0); }
const latest = all[0];

const reqDept = latest.requesterDepartment || latest.requestPayload?.department;
const targetDept = latest.targetType === 'GA' ? 'GA'
  : latest.targetType === 'HR' ? 'HR'
  : latest.targetType === 'SECURITY' ? 'SECURITY'
  : reqDept;

console.log(`   📋 ${latest.sourceForm} · ${latest.requesterName} (${reqDept})`);
console.log(`   🎯 ส่งหา: ${targetDept}\n`);

// 3. หาผู้รับ
console.log('3️⃣ หาผู้รับ email...');
const usersSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.active !== false);
const target = norm(targetDept);

const recipients = allUsers.filter(u => {
  const primary = norm(u.department) === target;
  const additional = Array.isArray(u.headOfAlsoDepartments) ? u.headOfAlsoDepartments : [];
  const additionalMatch = additional.some(d => norm(d) === target);
  if (!primary && !additionalMatch) return false;

  if (latest.targetType === 'GA') {
    if ((u.role || '').toUpperCase() !== 'GA') return false;
  } else {
    if (u.roleType !== 'HEAD') return false;
    const lv = Number(u.approvalLevel || 0);
    if (lv < 3 || lv > 8) return false;
  }
  return !!u.email;
});

console.log(`   พบผู้รับ ${recipients.length} คน:`);
recipients.forEach(u => console.log(`     • ${u.id} ${u.name} → ${u.email}`));

if (recipients.length === 0) { console.log('❌ ไม่มีผู้รับ — แก้ data ก่อน'); process.exit(1); }

// 4. ส่ง email
console.log('\n4️⃣ ส่ง email ทุกคน...\n');
const date = new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

const formNames = {
  VEHICLE_BOOKING: '🚗 ขอใช้รถ',
  OUTING_REQUEST: '🚪 ขอออกนอก',
  GOODS_IN_OUT: '📦 นำของเข้า/ออก',
  DRINK_ORDER: '☕ สั่งเครื่องดื่ม',
  FOOD_ORDER: '🍱 สั่งอาหาร',
  DRINK_FOOD_ORDER: '🍱 สั่งอาหาร+เครื่องดื่ม',
};
const docTitle = formNames[latest.sourceForm] || latest.sourceForm;

let success = 0, failed = 0, demo = 0;
for (const u of recipients) {
  try {
    const approveUrl = `${PUBLIC_URL}/index.html?approve=${latest.id || latest._docId}&as=${encodeURIComponent(u.email)}`;
    const r = await fetch(`${EMAIL_API}/api/send-approval-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: u.email,
        approverName: u.name,
        documentTitle: docTitle,
        requesterName: latest.requesterName || '-',
        department: reqDept,
        date,
        approveUrl,
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (r.ok) {
      const j = await r.json();
      const tag = j.demo ? '🎭 DEMO (ไม่ส่งจริง!)' : '✅ ส่งจริง';
      console.log(`   ${tag}  ${u.name} → ${u.email}`);
      if (j.demo) demo++;
      success++;
    } else {
      console.log(`   ❌ ${u.name}: HTTP ${r.status}`);
      failed++;
    }
  } catch (e) {
    console.log(`   ❌ ${u.name}: ${e.message}`);
    failed++;
  }
}

console.log('\n' + '═'.repeat(70));
if (demo === success) {
  console.log(`🎭 ส่งทั้ง ${success} ฉบับ แต่ทุกฉบับเป็น DEMO mode — ไม่ออกจริง!`);
  console.log(`⚠️  ต้องตั้ง SMTP_USER + SMTP_PASS ใน Render Environment ก่อน`);
} else if (success > 0) {
  console.log(`✅ ส่งจริง: ${success - demo} · DEMO: ${demo} · ล้มเหลว: ${failed}`);
} else {
  console.log(`❌ ส่งไม่สำเร็จเลย`);
}
console.log('═'.repeat(70));
console.log('');

process.exit(0);
