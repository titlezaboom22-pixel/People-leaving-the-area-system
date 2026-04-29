// แสดงตำแหน่ง + สมาชิกของแต่ละ level จาก HR Excel
import * as XLSX from 'xlsx/xlsx.mjs';
import * as fs from 'fs';
XLSX.set_fs(fs);

const path = String.raw`C:\Users\intern_attachai.k\Desktop\Projiect6\รายชื่อพนักงาน Email.xlsx`;
const wb = XLSX.readFile(path);
const rows = XLSX.utils.sheet_to_json(wb.Sheets['TBKK'], { defval: '', raw: false });

const byLevel = {};
for (const r of rows) {
  const lv = String(r['ระดับ'] || '').trim();
  if (!byLevel[lv]) byLevel[lv] = [];
  byLevel[lv].push(r);
}

const targetLevels = ['3', '4', '5', '6', '7', '8'];

for (const lv of targetLevels) {
  const list = byLevel[lv] || [];
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📊 LEVEL ${lv} — รวม ${list.length} คน`);
  console.log('='.repeat(70));

  // จัดกลุ่มตำแหน่ง (PositionNameT)
  const positions = {};
  for (const r of list) {
    const pos = (r['PositionNameT'] || r['PositionNameE'] || '-').trim();
    if (!positions[pos]) positions[pos] = [];
    positions[pos].push(r);
  }

  for (const [pos, members] of Object.entries(positions)) {
    console.log(`\n  📌 ${pos} (${members.length} คน):`);
    for (const m of members) {
      const name = `${m['FnameT'] || ''} ${m['LnameT'] || ''}`.trim();
      const dept = m['DepartmentName'] || '-';
      const code = m['PersonCode'] || '-';
      const email = m['E-mail พนักงาน'] || '';
      const emailShort = email && email !== '0' ? ` 📧 ${email}` : '';
      console.log(`     • ${code}  ${name}  [${dept}]${emailShort}`);
    }
  }
}
