/**
 * ตรวจ routing ทุกแผนก: คนในแผนกส่งใบ → email ไปหาหัวหน้าใครบ้าง?
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

const norm = (s) => (s || '').toString().toUpperCase().replace(/[^A-Z0-9ก-๙]/g, '');

const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
const all = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.active !== false);

// หา heads (Lv.3-8) — ตามที่ระบบใช้จริง
const heads = all.filter(u => {
  if (u.roleType !== 'HEAD') return false;
  const lv = Number(u.approvalLevel || 0);
  return lv >= 3 && lv <= 8;
});

// Group employees by dept
const empByDept = {};
for (const u of all) {
  if (u.roleType === 'HEAD') continue;  // skip heads
  if (['ADMIN', 'GA', 'DRIVER', 'SECURITY'].includes(u.role)) continue;
  const dept = u.department || '(ไม่ระบุ)';
  if (!empByDept[dept]) empByDept[dept] = [];
  empByDept[dept].push(u);
}

// Match dept → heads (เลียนแบบ getUsersByDepartment)
const findHeadsForDept = (dept) => {
  const target = norm(dept);
  const targetShort = target.split(/[\s()]/).filter(Boolean)[0];
  return heads.filter(h => {
    const hd = norm(h.department);
    if (hd === target) return true;
    if (targetShort && (hd.startsWith(targetShort) || target.startsWith(hd.split(/[\s()]/)[0]))) return true;
    if ((targetShort === 'EEE' && hd.startsWith('EMPLOYEEEXPERIENCE')) ||
        (hd === 'EEE' && target.startsWith('EMPLOYEEEXPERIENCE'))) return true;
    // headOfAlsoDepartments
    const additional = Array.isArray(h.headOfAlsoDepartments) ? h.headOfAlsoDepartments : [];
    if (additional.some(d => norm(d) === target)) return true;
    return false;
  }).sort((a, b) => (Number(a.approvalLevel) || 99) - (Number(b.approvalLevel) || 99));
};

console.log('\n╔═══════════════════════════════════════════════════════════════════════════╗');
console.log('║  📨 ตรวจ Routing: คนในแต่ละแผนกส่งใบ → email ไปหาใคร?                   ║');
console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

const sortedDepts = Object.keys(empByDept).sort();
let okCount = 0, errCount = 0, noHeadCount = 0;
const errorList = [];

for (const dept of sortedDepts) {
  const empList = empByDept[dept];
  const matched = findHeadsForDept(dept);

  let icon = '';
  let status = '';
  if (matched.length === 0) {
    icon = '❌';
    status = 'ไม่มีหัวหน้า — email ส่งไม่ได้!';
    noHeadCount++;
    errorList.push({ dept, empCount: empList.length, reason: 'ไม่มีหัวหน้า' });
  } else {
    icon = '✅';
    status = `ส่งหา ${matched.length} หัวหน้า`;
    okCount++;
  }

  console.log(`\n${icon} ${dept}  (พนักงาน ${empList.length} คน) — ${status}`);
  console.log('   ' + '─'.repeat(75));

  if (matched.length > 0) {
    matched.forEach(h => {
      const tags = [];
      if (h.department !== dept) tags.push(`(จริงๆอยู่ ${h.department})`);
      const additional = Array.isArray(h.headOfAlsoDepartments) ? h.headOfAlsoDepartments : [];
      if (additional.length) tags.push(`+ดูแล [${additional.join(',')}]`);
      console.log(`   📧 Lv.${h.approvalLevel}  ${(h.id || '').padEnd(8)} ${(h.name || h.displayName || '-').padEnd(28)} → ${h.email || '⚠️ ไม่มี email'}`);
      if (tags.length) console.log(`           ${tags.join(' ')}`);
    });
  }

  // ตัวอย่าง employee 3 คน
  console.log(`\n   👥 ตัวอย่างพนักงานในแผนกนี้:`);
  empList.slice(0, 3).forEach(e => {
    console.log(`      ${(e.id || '').padEnd(8)} ${e.name || e.displayName || '-'} ${e.email ? `(${e.email})` : ''}`);
  });
  if (empList.length > 3) console.log(`      ... และอีก ${empList.length - 3} คน`);
}

console.log('\n\n' + '═'.repeat(78));
console.log('📊 สรุป:');
console.log(`   ✅ แผนกที่ส่งได้:    ${okCount}`);
console.log(`   ❌ แผนกที่ไม่มีหัวหน้า: ${noHeadCount}`);
console.log(`   📂 รวม:           ${okCount + noHeadCount} แผนก`);
console.log('═'.repeat(78));

if (errorList.length > 0) {
  console.log('\n⚠️  แผนกที่ต้องเพิ่มหัวหน้า (พนักงานส่งใบไม่ได้):');
  errorList.forEach(e => console.log(`   ❌ ${e.dept} (${e.empCount} คน): ${e.reason}`));
  console.log('');
}

process.exit(0);
