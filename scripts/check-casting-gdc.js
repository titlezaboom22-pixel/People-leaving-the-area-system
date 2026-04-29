/**
 * ตรวจ CASTING ENGINEER + GRAVITY DIE CASTING — มี Lv. อะไรบ้าง?
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

const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
const all = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.active !== false);

const TARGETS = ['CASTING ENGINEER', 'GRAVITY DIE CASTING'];
const lvLabel = { 2:'Director', 3:'GM', 4:'Asst.GM', 5:'ผู้จัดการฝ่าย', 6:'ผช.ผจก.ฝ่าย', 7:'หัวหน้าแผนก', 8:'Supervisor', 9:'พนักงาน' };

for (const dept of TARGETS) {
  const list = all.filter(u => u.department === dept);
  console.log(`\n╔══════════════════════════════════════════════════════════════════╗`);
  console.log(`║  🏢 ${dept.padEnd(60)} ║`);
  console.log(`║     รวม ${list.length} คน                                                       ║`);
  console.log(`╚══════════════════════════════════════════════════════════════════╝`);

  // นับ Lv. แต่ละระดับ
  const byLv = {};
  for (const u of list) {
    const lv = Number(u.approvalLevel || 0);
    if (!byLv[lv]) byLv[lv] = [];
    byLv[lv].push(u);
  }

  for (const lv of [2,3,4,5,6,7,8,9,0]) {
    if (!byLv[lv]) continue;
    const label = lv === 0 ? 'ไม่กำหนด' : (lvLabel[lv] || `Lv.${lv}`);
    const isApprover = lv >= 3 && lv <= 8 ? '✅ APPROVER' : '❌';
    console.log(`\n  Lv.${lv}  ${label}  (${byLv[lv].length} คน)  ${isApprover}`);
    console.log('  ' + '─'.repeat(70));
    byLv[lv].forEach(u => {
      console.log(`    ${(u.id || '').padEnd(8)} ${(u.name || u.displayName || '-').padEnd(28)} role:${u.role || '-'}/${u.roleType || '-'} ${u.email || ''}`);
    });
  }
}

console.log('\n');

// แนะนำ
console.log('═'.repeat(72));
console.log('💡 ถ้าต้องการเพิ่มหัวหน้า Lv. อื่น:');
console.log('   1. หา user ในแผนกที่ตำแหน่งสูง (Lv.5-7)');
console.log('   2. แก้ในระบบ → กำหนดเป็น HEAD + ตั้ง approvalLevel');
console.log('   3. หรือย้าย user จากแผนกอื่นมาดูแล (multi-dept)');
console.log('═'.repeat(72));
console.log('');

process.exit(0);
