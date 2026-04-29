/**
 * ดูว่า workflow ล่าสุดส่ง email ไปให้ใครบ้าง
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

const norm = (s) => (s || '').toString().toUpperCase().replace(/[^A-Z0-9ก-๙]/g, '');

// 1. โหลด users + workflows
const usersSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.active !== false);

const wfSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows'));
const all = wfSnap.docs.map(d => ({ ...d.data(), _docId: d.id })).filter(w => w.status === 'pending');

if (all.length === 0) {
  console.log('\n❌ ไม่มี workflow pending\n');
  process.exit(0);
}

all.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
const latest = all[0];

const reqDept = latest.requesterDepartment || latest.requestPayload?.department;
const targetDept = latest.targetType === 'GA' ? 'GA'
  : latest.targetType === 'HR' ? 'HR'
  : latest.targetType === 'SECURITY' ? 'SECURITY'
  : reqDept;

console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
console.log('║  📧 รายชื่อคนที่ระบบส่ง email ไปให้                                        ║');
console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

console.log(`📋 เอกสาร:        ${latest.sourceForm}`);
console.log(`👤 ผู้ขอ:          ${latest.requesterName} (${latest.requesterId})`);
console.log(`🏢 แผนก:          ${reqDept}`);
console.log(`📅 ส่งเมื่อ:        ${new Date(latest.createdAt).toLocaleString('th-TH')}`);
console.log(`🎯 ขั้นตอนนี้:     ${latest.stepLabel} → ส่งหา "${targetDept}"`);
console.log('');

// หาหัวหน้าที่ตรงกับ target dept (เลียนแบบ getUsersByDepartment)
const target = norm(targetDept);
const matchedHeads = allUsers.filter(u => {
  if (u.roleType !== 'HEAD') return false;
  const lv = Number(u.approvalLevel || 0);
  if (lv < 3 || lv > 8) return false;

  const primaryMatch = norm(u.department) === target;
  const additionalDepts = Array.isArray(u.headOfAlsoDepartments) ? u.headOfAlsoDepartments : [];
  const additionalMatch = additionalDepts.some(d => norm(d) === target);
  return primaryMatch || additionalMatch;
}).sort((a, b) => (Number(a.approvalLevel) || 99) - (Number(b.approvalLevel) || 99));

console.log(`━━━ 📨 ${matchedHeads.length} หัวหน้าที่ระบบส่ง email ไปให้ ━━━\n`);

if (matchedHeads.length === 0) {
  console.log(`❌ ไม่พบหัวหน้าใน "${targetDept}" ที่ Lv.3-8`);
  console.log(`   email ส่งไม่ได้!\n`);
} else {
  matchedHeads.forEach((h, i) => {
    console.log(`  ${i + 1}. 👤 ${h.name || h.displayName || h.id}`);
    console.log(`     🆔 รหัส: ${h.id}  ·  Lv.${h.approvalLevel}`);
    console.log(`     📧 ${h.email || '⚠️ ไม่มี email!'}`);
    if (h.department !== targetDept) {
      console.log(`     ℹ️  อยู่จริงแผนก ${h.department}`);
    }
    const additional = Array.isArray(h.headOfAlsoDepartments) ? h.headOfAlsoDepartments : [];
    if (additional.length) {
      console.log(`     ➕ ดูแลเพิ่ม: ${additional.join(', ')}`);
    }
    console.log('');
  });
}

console.log('═'.repeat(76));
console.log('💡 ต่อไปนี้:');
console.log('   1. ตรวจ inbox ทั้งหมดด้านบน (รวม Junk/Spam)');
console.log('   2. ถ้าไม่ได้ → เป็นไปได้ว่า Render server ตื่นช้า (~15 วินาที)');
console.log('   3. หรือ wake server ด้วย: ');
console.log('      curl https://tbkk-email-server.onrender.com/api/health');
console.log('═'.repeat(76));
console.log('');

process.exit(0);
