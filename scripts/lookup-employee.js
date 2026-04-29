/**
 * 🔍 Lookup ตามรหัสพนักงาน → ดูว่าอยู่แผนกไหน → หัวหน้าใครจะอนุมัติ
 *
 * วิธีใช้:
 *   node scripts/lookup-employee.js SD553
 *   node scripts/lookup-employee.js 01941
 *   node scripts/lookup-employee.js              ← แสดงตัวอย่าง
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

const target = (process.argv[2] || '').trim().toUpperCase();
if (!target) {
  console.log('\n📌 วิธีใช้:');
  console.log('   node scripts/lookup-employee.js SD553');
  console.log('   node scripts/lookup-employee.js 01941');
  console.log('\n💡 ใส่รหัสพนักงานเพื่อดูว่าอยู่แผนกไหน + หัวหน้าใครจะอนุมัติ\n');
  process.exit(0);
}

const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
const all = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.active !== false);

// หาคน
const found = all.find(u => (u.id || '').toUpperCase() === target);
if (!found) {
  console.log(`\n❌ ไม่พบรหัสพนักงาน "${target}" ในระบบ\n`);
  // หาคล้ายๆ
  const similar = all.filter(u => (u.id || '').toUpperCase().includes(target) || (u.name || '').includes(target)).slice(0, 5);
  if (similar.length > 0) {
    console.log(`💡 พบคล้ายๆ:`);
    similar.forEach(s => console.log(`   ${s.id}  ${s.name}  (${s.department})`));
  }
  console.log('\n');
  process.exit(1);
}

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  🔍 ผลการค้นหา                                                  ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

console.log(`👤 ${found.name || found.displayName || found.id}`);
console.log(`   รหัสพนักงาน: ${found.id}`);
console.log(`   Email:       ${found.email || '(ไม่มี)'}`);
console.log(`   แผนก:        ${found.department || '(ไม่ระบุ)'}`);
console.log(`   ตำแหน่ง:     ${found.position || found.positionTitle || '(ไม่ระบุ)'}`);
console.log(`   Role:        ${found.role || '-'} / ${found.roleType || '-'}`);
console.log(`   ระดับ (Lv.): ${found.approvalLevel || '0 (ไม่ใช่ approver)'}`);

// หาหัวหน้าของแผนกนี้
const norm = (s) => (s || '').toString().toUpperCase().replace(/[^A-Z0-9ก-๙]/g, '');
const userDeptN = norm(found.department);
const userDeptShort = userDeptN.split(/[\s()]/).filter(Boolean)[0];

const heads = all.filter(u => {
  if (u.roleType !== 'HEAD') return false;
  const lv = Number(u.approvalLevel || 0);
  if (lv < 2 || lv > 8) return false;
  const ud = norm(u.department);
  if (ud === userDeptN) return true;
  if (userDeptShort && (ud.startsWith(userDeptShort) || userDeptN.startsWith(ud.split(/[\s()]/)[0]))) return true;
  if ((userDeptShort === 'EEE' && ud.startsWith('EMPLOYEEEXPERIENCE')) ||
      (ud === 'EEE' && userDeptN.startsWith('EMPLOYEEEXPERIENCE'))) return true;
  return false;
}).sort((a, b) => (Number(a.approvalLevel) || 99) - (Number(b.approvalLevel) || 99));

console.log('\n' + '═'.repeat(66));
console.log(`📨 ระบบจะส่ง email ไปหา ${heads.length} คน เมื่อ ${found.id} ส่งใบขอ:`);
console.log('═'.repeat(66));

if (heads.length === 0) {
  console.log('\n   ⚠️  ไม่มีหัวหน้า Lv.2-8 ในแผนกนี้!');
  console.log('   → ระบบจะส่งให้ admin จัดการ');
  console.log('   → หรือต้องเพิ่มหัวหน้าให้แผนกนี้\n');
} else {
  heads.forEach((h, i) => {
    const lvLabel = ({2:'Director',3:'GM',4:'Asst.GM',5:'ผู้จัดการฝ่าย',6:'ผู้ช่วยผู้จัดการฝ่าย',7:'หัวหน้าแผนก',8:'Supervisor'})[h.approvalLevel] || `Lv.${h.approvalLevel}`;
    console.log(`\n  ${i + 1}. ${h.name || h.displayName}`);
    console.log(`     • รหัส:  ${h.id}`);
    console.log(`     • Lv.${h.approvalLevel} ${lvLabel}`);
    console.log(`     • Email: ${h.email || '(ไม่มี)'}`);
    console.log(`     • แผนก: ${h.department}`);
  });
  console.log(`\n💡 ใครเซ็นก่อน — อีก ${heads.length - 1} คนกดลิงก์ไม่ได้แล้ว (first-approve-wins)`);
}

// ถ้าตัวเอ็งเป็น HEAD → แสดงพนักงานในแผนกที่ตัวเอ็งจะอนุมัติให้
if (found.roleType === 'HEAD' && Number(found.approvalLevel || 0) >= 2 && Number(found.approvalLevel || 0) <= 8) {
  const subordinates = all.filter(u => {
    if (u.id === found.id) return false;
    if (u.roleType === 'HEAD') return false;
    const ud = norm(u.department);
    if (ud === userDeptN) return true;
    if (userDeptShort && (ud.startsWith(userDeptShort) || userDeptN.startsWith(ud.split(/[\s()]/)[0]))) return true;
    return false;
  });
  console.log('\n' + '═'.repeat(66));
  console.log(`👥 ${found.name} จะได้รับ email อนุมัติเมื่อพนักงาน ${subordinates.length} คนนี้ส่งใบ:`);
  console.log('═'.repeat(66));
  subordinates.slice(0, 20).forEach(s => {
    console.log(`   ${(s.id || '').padEnd(10)} ${s.name || s.displayName || '-'}`);
  });
  if (subordinates.length > 20) console.log(`   ... และอีก ${subordinates.length - 20} คน`);
}

console.log('\n');
process.exit(0);
