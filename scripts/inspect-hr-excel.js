// Inspect HR Excel file structure
import * as XLSX from 'xlsx/xlsx.mjs';
import * as fs from 'fs';
XLSX.set_fs(fs);

const path = String.raw`C:\Users\intern_attachai.k\Desktop\Projiect6\รายชื่อพนักงาน Email.xlsx`;

const wb = XLSX.readFile(path);
console.log('Sheets:', wb.SheetNames);
console.log('');

for (const sn of wb.SheetNames) {
  const ws = wb.Sheets[sn];
  const json = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
  console.log(`=== Sheet: ${sn} ===`);
  console.log(`Total rows: ${json.length}`);
  if (json.length === 0) { console.log('(empty)\n---\n'); continue; }
  console.log(`Columns (${Object.keys(json[0]).length}):`, Object.keys(json[0]));
  console.log('\nFirst 5 rows:');
  for (let i = 0; i < Math.min(5, json.length); i++) {
    console.log(`Row ${i + 1}:`, JSON.stringify(json[i], null, 2));
  }
  console.log('---\n');
}
