// Analyze HR level distribution + sample positions per level
import * as XLSX from 'xlsx/xlsx.mjs';
import * as fs from 'fs';
XLSX.set_fs(fs);

const path = String.raw`C:\Users\intern_attachai.k\Desktop\Projiect6\รายชื่อพนักงาน Email.xlsx`;
const wb = XLSX.readFile(path);
const ws = wb.Sheets['TBKK'];
const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });

console.log(`=== Total employees: ${rows.length} ===\n`);

// Level distribution
const byLevel = {};
for (const r of rows) {
  const lv = String(r['ระดับ'] || '').trim();
  if (!byLevel[lv]) byLevel[lv] = [];
  byLevel[lv].push(r);
}

console.log('=== Level Distribution ===');
const levelKeys = Object.keys(byLevel).sort();
for (const lv of levelKeys) {
  console.log(`Level ${lv}: ${byLevel[lv].length} คน`);
}
console.log('');

// Sample positions per level (top 5 unique positions)
console.log('=== Sample positions per level ===');
for (const lv of levelKeys) {
  const positions = {};
  for (const r of byLevel[lv]) {
    const pos = (r['PositionNameT'] || r['PositionNameE'] || '-').trim();
    positions[pos] = (positions[pos] || 0) + 1;
  }
  const sorted = Object.entries(positions).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log(`\nLevel ${lv} (${byLevel[lv].length} คน) — top positions:`);
  for (const [pos, cnt] of sorted) {
    console.log(`  ${cnt}× ${pos}`);
  }
}

// Find managers/heads
console.log('\n=== Position Names containing MANAGER / HEAD / SUPERVISOR ===');
const heads = rows.filter(r => {
  const p = ((r['PositionNameT'] || '') + ' ' + (r['PositionNameE'] || '')).toUpperCase();
  return p.includes('MANAGER') || p.includes('HEAD') || p.includes('SUPERVISOR') ||
         p.includes('CHIEF') || p.includes('DIRECTOR') || p.includes('GM') ||
         p.includes('หัวหน้า') || p.includes('ผู้จัดการ') || p.includes('ผู้อำนวยการ');
});
console.log(`Total: ${heads.length} คน\n`);

const headLevels = {};
for (const h of heads) {
  const lv = String(h['ระดับ'] || '').trim();
  headLevels[lv] = (headLevels[lv] || 0) + 1;
}
console.log('Distribution by level:');
for (const lv of Object.keys(headLevels).sort()) {
  console.log(`  Level ${lv}: ${headLevels[lv]} คน`);
}

// Show 10 random heads with their level
console.log('\n=== Sample 15 managers/heads ===');
const sample = heads.slice(0, 15);
for (const h of sample) {
  const name = `${h['FnameT'] || ''} ${h['LnameT'] || ''}`.trim();
  const pos = h['PositionNameT'] || h['PositionNameE'] || '-';
  const lv = h['ระดับ'] || '-';
  const dept = h['DepartmentName'] || '-';
  console.log(`  Lv.${lv} | ${pos} | ${name} | ${dept}`);
}
