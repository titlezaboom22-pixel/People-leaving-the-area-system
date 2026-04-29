/**
 * ทดสอบว่าหลังเปลี่ยน dept แล้ว — GA workflow ยังหา 4 คนนี้เจอไหม?
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

console.log('\n════════════════════════════════════════════════════════════════');
console.log('🧪 ทดสอบ Routing หลังเปลี่ยน GA Team → EEE');
console.log('════════════════════════════════════════════════════════════════\n');

// 1. Query "GA workflow" (เลียนแบบ getUsersByDepartment('GA', { role: 'GA' }))
const target = norm('GA');
const gaResults = all.filter(u => {
  const primaryMatch = norm(u.department) === target;
  const additionalDepts = Array.isArray(u.headOfAlsoDepartments) ? u.headOfAlsoDepartments : [];
  const additionalMatch = additionalDepts.some(d => norm(d) === target);
  if (!primaryMatch && !additionalMatch) return false;
  if ((u.role || '').toUpperCase() !== 'GA') return false;
  return true;
});

console.log(`✅ Test 1: GA workflow query  →  ส่งใบ GA จะหา ${gaResults.length} คน`);
gaResults.forEach(u => console.log(`   • ${u.id}  ${u.name}  (dept=${u.department}, headOf=${JSON.stringify(u.headOfAlsoDepartments || [])})`));

// 2. Query "EEE head approver" (vehicle booking)
const eeeTarget = norm('EMPLOYEE EXPERIENCE ENGAGEMENT');
const eeeHeads = all.filter(u => {
  if (norm(u.department) !== eeeTarget) return false;
  if (u.roleType !== 'HEAD') return false;
  const lv = Number(u.approvalLevel || 0);
  return lv >= 3 && lv <= 8;
});

console.log(`\n✅ Test 2: EEE head approver  →  ใบขอใช้รถจาก EEE ส่งหา ${eeeHeads.length} คน`);
eeeHeads.forEach(u => console.log(`   • Lv.${u.approvalLevel}  ${u.id}  ${u.name}`));

// 3. EEE department members (ใน Admin filter)
const eeeAll = all.filter(u => norm(u.department) === eeeTarget);
console.log(`\n📊 Test 3: EEE department total  →  ${eeeAll.length} คน (รวมพนักงาน + หัวหน้า + GA team)`);

// 4. ตรวจ 4 คน GA team
console.log(`\n🔍 Test 4: GA Team (4 คน) สถานะปัจจุบัน:`);
const gaTeam = all.filter(u => ['00406', '01583', '01861', '01905'].includes(u.id));
gaTeam.forEach(u => {
  console.log(`   ${u.id}  ${u.name}`);
  console.log(`     dept: ${u.department}  |  role: ${u.role}  |  headOfAlso: ${JSON.stringify(u.headOfAlsoDepartments || [])}`);
});

console.log('\n════════════════════════════════════════════════════════════════');
if (gaResults.length === 4) {
  console.log('✅ Routing ทำงานถูกต้อง — GA workflow ยังหา 4 คนเจอ');
} else {
  console.log(`⚠️  GA workflow ได้ ${gaResults.length}/4 คน — อาจมีปัญหา`);
}
console.log('════════════════════════════════════════════════════════════════\n');

process.exit(0);
