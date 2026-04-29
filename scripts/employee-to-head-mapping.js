/**
 * แสดงพนักงานแต่ละคน → แผนก → หัวหน้าคือใคร (ระบบจะส่ง email ให้)
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { readFileSync, writeFileSync } from 'fs';

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
const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  .filter(u => u.active !== false);

// Normalize dept
const norm = (s) => (s || '').toString().toUpperCase().replace(/[^A-Z0-9ก-๙]/g, '');

// แยกหัวหน้า (Lv.2-8) ออกตามแผนก
const headsByDept = {};
for (const u of all) {
  if (u.roleType !== 'HEAD') continue;
  const lv = Number(u.approvalLevel || 0);
  if (lv < 2 || lv > 8) continue;
  const key = norm(u.department);
  if (!headsByDept[key]) headsByDept[key] = [];
  headsByDept[key].push(u);
}
// Sort heads by Lv. (lowest first = highest position)
for (const k in headsByDept) {
  headsByDept[k].sort((a, b) => (Number(a.approvalLevel) || 99) - (Number(b.approvalLevel) || 99));
}

// แยกพนักงาน (Lv.9, EMPLOYEE)
const employees = all.filter(u => u.roleType !== 'HEAD' && u.role !== 'GA' && u.role !== 'DRIVER' && u.role !== 'ADMIN' && u.role !== 'SECURITY');

// Group employees by dept
const empByDept = {};
for (const e of employees) {
  const dept = e.department || '(ไม่ระบุ)';
  if (!empByDept[dept]) empByDept[dept] = [];
  empByDept[dept].push(e);
}

// Match each dept to heads
const findHeadsForDept = (dept) => {
  const target = norm(dept);
  if (headsByDept[target]) return headsByDept[target];
  // Try fuzzy match — EEE matches EMPLOYEEEXPERIENCEENGAGEMENT
  const short = target.split(/[\s()]/).filter(Boolean)[0];
  for (const k in headsByDept) {
    if (k === target) return headsByDept[k];
    if (short && (k.startsWith(short) || target.startsWith(k))) return headsByDept[k];
    if ((short === 'EEE' && k.startsWith('EMPLOYEEEXPERIENCE')) ||
        (k === 'EEE' && target.startsWith('EMPLOYEEEXPERIENCE'))) return headsByDept[k];
  }
  return [];
};

// Output
console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
console.log('║  📋 พนักงาน → แผนก → หัวหน้า (ระบบจะส่ง email ให้)                          ║');
console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

const sortedDepts = Object.keys(empByDept).sort();
let totalEmp = 0;
let totalNoHead = 0;

const csvRows = ['รหัสพนักงาน,ชื่อ-นามสกุล,Email,แผนก,Lv.,หัวหน้าจะอนุมัติให้ (ทุกคน),จำนวนหัวหน้า'];

for (const dept of sortedDepts) {
  const heads = findHeadsForDept(dept);
  const empList = empByDept[dept].sort((a, b) => (a.id || '').localeCompare(b.id || ''));

  console.log(`\n🏢 ${dept}  (พนักงาน ${empList.length} คน · หัวหน้า ${heads.length} คน)`);
  console.log('─'.repeat(78));

  if (heads.length === 0) {
    console.log(`   ⚠️  ไม่มีหัวหน้า Lv.2-8 ในแผนกนี้ — ระบบจะส่งใบให้ admin จัดการ`);
    totalNoHead += empList.length;
  } else {
    console.log(`   👨‍💼 หัวหน้าที่อนุมัติให้:`);
    heads.forEach(h => {
      console.log(`      • Lv.${h.approvalLevel}  ${h.name || h.displayName} ${h.email ? `(${h.email})` : '(ไม่มี email)'}`);
    });
  }

  console.log(`   👥 พนักงานในแผนก:`);
  empList.slice(0, 8).forEach(e => {
    console.log(`      ${(e.id || '').padEnd(10)} ${(e.name || e.displayName || '-').padEnd(28)} ${e.email || ''}`);
  });
  if (empList.length > 8) {
    console.log(`      ... และอีก ${empList.length - 8} คน`);
  }

  // CSV row per employee
  const headNames = heads.map(h => `${h.name} (Lv.${h.approvalLevel})`).join(' / ') || '(ไม่มีหัวหน้า)';
  for (const e of empList) {
    csvRows.push([
      `"${e.id || ''}"`,
      `"${e.name || e.displayName || ''}"`,
      `"${e.email || ''}"`,
      `"${dept}"`,
      `"${e.approvalLevel || ''}"`,
      `"${headNames}"`,
      `"${heads.length}"`,
    ].join(','));
  }

  totalEmp += empList.length;
}

console.log('\n' + '═'.repeat(78));
console.log(`📊 พนักงาน ${totalEmp} คน · ${sortedDepts.length} แผนก`);
if (totalNoHead > 0) console.log(`⚠️  พนักงาน ${totalNoHead} คนใน ${sortedDepts.filter(d => findHeadsForDept(d).length === 0).length} แผนก ไม่มีหัวหน้า`);
console.log('═'.repeat(78));

// Save CSV
writeFileSync('./employee-head-mapping.csv', '﻿' + csvRows.join('\n'), 'utf-8');
console.log(`\n💾 บันทึก CSV: employee-head-mapping.csv (${csvRows.length - 1} แถว)`);
console.log(`    → เปิดด้วย Excel → เห็นพนักงานทุกคนพร้อมหัวหน้าที่จะอนุมัติให้`);
console.log('\n');
process.exit(0);
