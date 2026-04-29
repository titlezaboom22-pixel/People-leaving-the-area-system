/**
 * Debug — ตรวจว่าทำไม email ไม่ส่งหาหัวหน้า
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
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

console.log('\n🔍 Debug: ทำไม email ไม่ส่งหาหัวหน้า?\n');
console.log(`📧 Email API: ${EMAIL_API}\n`);

// 1. Check email server
console.log('1. ตรวจ email server...');
try {
  const r = await fetch(`${EMAIL_API}/api/health`);
  const j = await r.json();
  console.log(`   ✓ Server status: ${j.status}`);
  console.log(`   ✓ SMTP: ${j.smtp ? 'พร้อม' : '❌ ไม่พร้อม'}`);
  console.log(`   ✓ From: ${j.from}`);
  if (j.security?.allowlist) console.log(`   ✓ Allowed domains: ${j.security.allowlist.join(', ')}`);
} catch (e) {
  console.log(`   ❌ Server ไม่ตอบ: ${e.message}`);
  console.log(`   → ปัญหา: เว็บไม่สามารถส่ง email ได้`);
  process.exit(1);
}

// 2. Get latest pending workflow
console.log('\n2. ดู workflow ล่าสุดที่ pending...');
const wfRef = collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows');
const allSnap = await getDocs(wfRef);
const all = allSnap.docs.map(d => ({ ...d.data(), _docId: d.id }))
  .filter(w => w.status === 'pending')
  .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

if (all.length === 0) {
  console.log('   ⚠️  ไม่มี workflow pending');
  process.exit(0);
}

const w = all[0];
console.log(`   📋 พบ: ${w.id}`);
console.log(`   • sourceForm: ${w.sourceForm}`);
console.log(`   • ผู้ขอ: ${w.requesterName} (${w.requesterId})`);
console.log(`   • requesterDepartment: "${w.requesterDepartment}"`);
console.log(`   • department (queue): "${w.department}"`);
console.log(`   • targetType: ${w.targetType || '(none)'}`);
console.log(`   • step: ${w.step}/${w.totalSteps || '?'}`);
console.log(`   • createdAt: ${w.createdAt}`);

// 3. หาหัวหน้าที่ควรได้รับ email
console.log('\n3. หาหัวหน้าที่ควรได้รับ email...');
const usersSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.active !== false);

const norm = (s) => (s || '').toString().toUpperCase().replace(/[^A-Z0-9ก-๙]/g, '');
const targetN = norm(w.department || w.requesterDepartment);
const targetShort = targetN.split(/[\s()]/).filter(Boolean)[0];

const heads = users.filter(u => {
  if (u.roleType !== 'HEAD') return false;
  const lv = Number(u.approvalLevel || 0);
  if (lv < 2 || lv > 8) return false;
  const ud = norm(u.department);
  if (ud === targetN) return true;
  if (targetShort && (ud.startsWith(targetShort) || targetN.startsWith(ud.split(/[\s()]/)[0]))) return true;
  if ((targetShort === 'EEE' && ud.startsWith('EMPLOYEEEXPERIENCE')) ||
      (ud === 'EEE' && targetN.startsWith('EMPLOYEEEXPERIENCE'))) return true;
  return false;
});

console.log(`   พบ ${heads.length} หัวหน้าในแผนก "${w.department}"`);
heads.forEach(h => console.log(`   • Lv.${h.approvalLevel} ${h.id} ${h.name} ${h.email ? `(${h.email})` : '⚠️ ไม่มี email'}`));

const headsWithEmail = heads.filter(h => h.email);
if (headsWithEmail.length === 0) {
  console.log('   ❌ ไม่มีหัวหน้าที่มี email!');
  process.exit(1);
}

// 4. ลองส่ง email test
console.log('\n4. ทดสอบส่ง email...');
const PUBLIC_URL = env.VITE_PUBLIC_URL || 'https://tbkk-system.web.app';
const approveUrl = `${PUBLIC_URL}/index.html?approve=${w.id}`;

let sent = 0;
let failed = 0;
const errors = [];

for (const h of headsWithEmail) {
  try {
    const r = await fetch(`${EMAIL_API}/api/send-approval-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: h.email,
        approverName: h.name,
        documentTitle: w.topic || w.sourceForm,
        requesterName: w.requesterName,
        department: w.requesterDepartment || w.department,
        date: new Date(w.createdAt).toLocaleString('th-TH'),
        approveUrl: `${approveUrl}&as=${encodeURIComponent(h.email)}`,
      }),
    });
    if (r.ok) {
      const j = await r.json();
      console.log(`   ✓ ${h.name} (${h.email}) ${j.demo ? '[DEMO]' : '[real SMTP]'}`);
      sent++;
    } else {
      const t = await r.text();
      console.log(`   ✗ ${h.name}: HTTP ${r.status} ${t.slice(0, 80)}`);
      errors.push({ user: h.name, error: t });
      failed++;
    }
  } catch (e) {
    console.log(`   ✗ ${h.name}: ${e.message}`);
    errors.push({ user: h.name, error: e.message });
    failed++;
  }
}

console.log(`\n${'═'.repeat(70)}`);
console.log(`📊 สรุป:  ส่งสำเร็จ ${sent}/${headsWithEmail.length}  ล้มเหลว ${failed}`);
console.log(`${'═'.repeat(70)}`);

if (sent > 0) {
  console.log(`\n✅ Email ส่งได้ปกติ!`);
  console.log(`   ตรวจ inbox + spam folder ของ ${headsWithEmail.map(h => h.email).join(', ')}`);
}

if (failed > 0) {
  console.log(`\n❌ มี email ที่ส่งไม่สำเร็จ:`);
  errors.forEach(e => console.log(`   • ${e.user}: ${e.error.slice(0, 100)}`));
}

console.log(`\n💡 สาเหตุที่อาจเจอ:`);
console.log(`   1. Email ไปอยู่ใน spam folder`);
console.log(`   2. Domain "${headsWithEmail[0]?.email?.split('@')[1]}" ไม่อยู่ใน whitelist`);
console.log(`   3. Email server ติด rate limit`);
console.log(`   4. SMTP credentials ผิด`);

process.exit(0);
