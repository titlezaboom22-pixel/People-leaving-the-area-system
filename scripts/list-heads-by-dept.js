/**
 * แสดงรายชื่อหัวหน้าทั้งระบบ — แยกตามแผนก
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
const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

// Filter HEAD roleType + active + Lv.2-8
const heads = all.filter(u => {
  if (u.active === false) return false;
  if (u.roleType !== 'HEAD') return false;
  const lv = Number(u.approvalLevel || 0);
  return lv >= 2 && lv <= 8;
});

// Group by department
const byDept = {};
for (const h of heads) {
  const dept = h.department || '(ไม่ระบุ)';
  if (!byDept[dept]) byDept[dept] = [];
  byDept[dept].push(h);
}

// Sort each dept by Lv. (4 → 5 → 6 → 7 → 8)
for (const d in byDept) {
  byDept[d].sort((a, b) => (Number(a.approvalLevel) || 99) - (Number(b.approvalLevel) || 99));
}

// Sort departments alphabetically
const sortedDepts = Object.keys(byDept).sort();

const lvLabel = (lv) => ({
  2: 'Director',
  3: 'GM',
  4: 'Asst. GM',
  5: 'ผู้จัดการฝ่าย',
  6: 'ผู้ช่วยผู้จัดการฝ่าย',
  7: 'หัวหน้าแผนก',
  8: 'Supervisor',
}[lv] || `Lv.${lv}`);

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  📋 รายชื่อหัวหน้า (Lv.4-8) แยกตามแผนก — ระบบจะส่ง email ให้    ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

let totalHeads = 0;
for (const dept of sortedDepts) {
  const list = byDept[dept];
  console.log(`\n🏢 ${dept}  (${list.length} คน)`);
  console.log('─'.repeat(70));
  for (const h of list) {
    const email = h.email || '(ไม่มี email)';
    const lv = h.approvalLevel || '-';
    console.log(`  Lv.${lv}  ${h.id.padEnd(10)}  ${(h.name || h.displayName || '-').padEnd(30)}  ${email}`);
    console.log(`        ${lvLabel(lv).padEnd(46)}`);
  }
  totalHeads += list.length;
}

console.log('\n' + '═'.repeat(70));
console.log(`📊 รวมทั้งหมด: ${totalHeads} คน · ${sortedDepts.length} แผนก`);
console.log('═'.repeat(70));

// แผนกที่ไม่มีหัวหน้า
const allDepartments = new Set(all.filter(u => u.department).map(u => u.department));
const noHeadDepts = [...allDepartments].filter(d => !byDept[d] && d !== 'GA');
if (noHeadDepts.length > 0) {
  console.log('\n⚠️  แผนกที่ "ไม่มีหัวหน้า Lv.4-8":');
  for (const d of noHeadDepts) {
    const usersInDept = all.filter(u => u.department === d).length;
    console.log(`   - ${d} (มี ${usersInDept} คน)`);
  }
}

console.log('\n');
process.exit(0);
