/**
 * Live Test ส่งเมล GA workflow — ทดสอบว่า GA ได้รับครบ 4 คนไหม
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
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

console.log('\n🧪 Test: ส่งเมล GA → 4 คน (หลังย้ายไป EEE)\n');

// 1. Health check
console.log('1. Health check...');
try {
  const r = await fetch(`${EMAIL_API}/api/health`, { signal: AbortSignal.timeout(60000) });
  const j = await r.json();
  console.log(`   ✓ Server OK, SMTP: ${j.smtp}, From: ${j.from}\n`);
} catch (e) { console.log(`   ❌ Server ไม่พร้อม: ${e.message}\n`); }

// 2. หา GA team
console.log('2. หา GA team (เลียนแบบ getUsersByDepartment)...');
const norm = (s) => (s || '').toString().toUpperCase().replace(/[^A-Z0-9ก-๙]/g, '');
const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
const all = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.active !== false);

const target = norm('GA');
const gaTeam = all.filter(u => {
  const primaryMatch = norm(u.department) === target;
  const additionalDepts = Array.isArray(u.headOfAlsoDepartments) ? u.headOfAlsoDepartments : [];
  const additionalMatch = additionalDepts.some(d => norm(d) === target);
  if (!primaryMatch && !additionalMatch) return false;
  if ((u.role || '').toUpperCase() !== 'GA') return false;
  return true;
});

console.log(`   พบ ${gaTeam.length} คน:`);
gaTeam.forEach(u => console.log(`   • ${u.id} ${u.name} ${u.email ? `(${u.email})` : '⚠️ ไม่มี email'}`));
console.log('');

// 3. ส่งเมลทดสอบ
const withEmail = gaTeam.filter(u => u.email);
console.log(`3. ส่งเมลทดสอบ ${withEmail.length} ฉบับ...\n`);

const date = new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
const wfId = `wf-test-ga-routing-${Date.now()}`;
const approveUrl = `${PUBLIC_URL}/index.html?approve=${wfId}`;

let success = 0, failed = 0;
for (const u of withEmail) {
  try {
    const r = await fetch(`${EMAIL_API}/api/send-approval-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: u.email,
        approverName: u.name,
        documentTitle: '🧪 Test GA Routing',
        requesterName: 'Test User',
        department: 'EEE',
        date,
        approveUrl: `${approveUrl}&as=${encodeURIComponent(u.email)}`,
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (r.ok) {
      const j = await r.json();
      console.log(`   ✓ ${u.name} → ${u.email} ${j.demo ? '[DEMO]' : '[real SMTP]'}`);
      success++;
    } else {
      console.log(`   ✗ ${u.name}: HTTP ${r.status}`);
      failed++;
    }
  } catch (e) {
    console.log(`   ✗ ${u.name}: ${e.message}`);
    failed++;
  }
}

console.log('\n' + '═'.repeat(70));
if (success === withEmail.length) {
  console.log(`✅ ส่งครบ ${success}/${withEmail.length} — GA ทุกคนได้ email`);
} else {
  console.log(`⚠️  ส่งสำเร็จ ${success}/${withEmail.length}, ล้มเหลว ${failed}`);
}
console.log('═'.repeat(70));

console.log('\n📌 ขั้นตอนตรวจ:');
console.log('   1. ตรวจ inbox ทั้ง 4 เมล (รวม spam):');
withEmail.forEach(u => console.log(`      📥 ${u.email}`));
console.log('   2. ถ้าได้ครบ → ระบบ routing ทำงานถูก');
console.log('   3. ถ้าได้ไม่ครบ → ส่งภาพ inbox ที่ไม่ได้รับมา debug');
console.log('');

process.exit(0);
