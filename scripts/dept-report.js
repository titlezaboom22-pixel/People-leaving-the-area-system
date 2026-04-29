/**
 * รายงานแผนก: สำหรับแต่ละแผนก แสดงหัวหน้า + พนักงาน — แบบสะอาดอ่านง่าย
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
const all = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.active !== false);

// Group by department
const byDept = {};
for (const u of all) {
  const dept = u.department || '(ไม่ระบุ)';
  if (!byDept[dept]) byDept[dept] = { heads: [], employees: [] };
  const lv = Number(u.approvalLevel || 0);
  if (u.roleType === 'HEAD' && lv >= 2 && lv <= 8) byDept[dept].heads.push(u);
  else if (u.role !== 'GA' && u.role !== 'DRIVER' && u.role !== 'ADMIN' && u.role !== 'SECURITY') byDept[dept].employees.push(u);
}

// Sort heads by Lv. (lowest first)
for (const d in byDept) {
  byDept[d].heads.sort((a, b) => (Number(a.approvalLevel) || 99) - (Number(b.approvalLevel) || 99));
  byDept[d].employees.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
}

const sortedDepts = Object.keys(byDept).sort();

// Markdown output
let md = '# 📋 รายงานแผนก TBKK SOC\n\n';
md += `> สรุป ณ วันที่ ${new Date().toLocaleString('th-TH')}\n`;
md += `> แผนก: ${sortedDepts.length} · พนักงาน: ${all.length}\n\n`;
md += '---\n\n';

let txt = '';

for (const dept of sortedDepts) {
  const { heads, employees } = byDept[dept];
  if (heads.length === 0 && employees.length === 0) continue;

  md += `## 🏢 ${dept}\n\n`;
  md += `**หัวหน้า ${heads.length} คน · พนักงาน ${employees.length} คน**\n\n`;

  txt += `\n${'═'.repeat(78)}\n`;
  txt += `🏢 ${dept}\n`;
  txt += `   หัวหน้า ${heads.length} คน · พนักงาน ${employees.length} คน\n`;
  txt += `${'─'.repeat(78)}\n`;

  // หัวหน้า
  if (heads.length === 0) {
    md += `> ⚠️ **ไม่มีหัวหน้า Lv.2-8** — ระบบจะส่งให้ admin จัดการ\n\n`;
    txt += `\n   ⚠️  ไม่มีหัวหน้า Lv.2-8 ในแผนกนี้!\n`;
  } else {
    md += `### 👨‍💼 หัวหน้า (ระบบส่ง email หาคนเหล่านี้)\n\n`;
    md += '| Lv. | ชื่อ-นามสกุล | รหัส | Email |\n';
    md += '|-----|------------|------|-------|\n';
    for (const h of heads) {
      md += `| ${h.approvalLevel} | ${h.name || h.displayName || '-'} | \`${h.id}\` | \`${h.email || '-'}\` |\n`;
    }
    md += '\n';

    txt += `\n   👨‍💼 หัวหน้า:\n`;
    for (const h of heads) {
      txt += `      Lv.${h.approvalLevel}  ${(h.id || '').padEnd(10)} ${(h.name || h.displayName || '-').padEnd(30)} ${h.email || ''}\n`;
    }
  }

  // พนักงาน
  if (employees.length > 0) {
    md += `### 👥 พนักงาน (${employees.length})\n\n`;
    md += '| รหัส | ชื่อ-นามสกุล | Email | Lv. |\n';
    md += '|------|-----------|-------|-----|\n';
    for (const e of employees) {
      md += `| \`${e.id}\` | ${e.name || e.displayName || '-'} | \`${e.email || '-'}\` | ${e.approvalLevel || '-'} |\n`;
    }
    md += '\n';

    txt += `\n   👥 พนักงาน (${employees.length}):\n`;
    for (const e of employees) {
      txt += `      ${(e.id || '').padEnd(10)} ${(e.name || e.displayName || '-').padEnd(30)} ${e.email || ''}\n`;
    }
  }

  md += '\n---\n\n';
}

// Save files
writeFileSync('./รายงานแผนก.md', md, 'utf-8');
writeFileSync('./รายงานแผนก.txt', txt, 'utf-8');

console.log('\n✅ สร้างรายงานแผนกเรียบร้อย!\n');
console.log('📂 ไฟล์ที่สร้าง:');
console.log('   📄 รายงานแผนก.md   (Markdown — เปิดด้วย editor / Github / Notion)');
console.log('   📄 รายงานแผนก.txt  (Text — เปิดด้วย Notepad)');
console.log(`\n📊 สรุป:`);
console.log(`   • แผนกทั้งหมด: ${sortedDepts.length}`);
console.log(`   • พนักงาน: ${all.length}`);
console.log(`   • แผนกที่มีหัวหน้า: ${sortedDepts.filter(d => byDept[d].heads.length > 0).length}`);
console.log(`   • แผนกที่ไม่มีหัวหน้า: ${sortedDepts.filter(d => byDept[d].heads.length === 0).length}`);
console.log('');

process.exit(0);
