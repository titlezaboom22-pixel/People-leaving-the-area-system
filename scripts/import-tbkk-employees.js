/**
 * Import TBKK Employees จาก Excel HR (877 คน) → Firestore
 *
 * ⚠️ TBKK Level System (กลับด้าน):
 *   3 = GM (สูงสุด)        7 = หัวหน้าแผนก
 *   4 = Asst. GM           8 = Supervisor (หัวหน้างาน)
 *   5 = ผู้จัดการฝ่าย       9 = พนักงาน (ต่ำสุด)
 *   6 = ผู้ช่วย ผจฝ.
 *
 * Mapping:
 *   - User ID = PersonCode (เช่น "01173", "S0772")
 *   - displayName = FnameT + LnameT
 *   - email = "E-mail พนักงาน" (skip ถ้า = "0" หรือไม่มี @)
 *   - department = DepartmentName
 *   - position = PositionNameT
 *   - approvalLevel = ระดับ (3-9)
 *   - role: HOST ถ้า level ≤ 8, EMPLOYEE ถ้า level 9
 *   - roleType: HEAD ถ้า HOST, EMPLOYEE ถ้าไม่
 *   - passwordHash = SHA-256("1234")
 *   - approvalLevelSetBy = 'hr-import'
 *   - personCode = PersonCode (เก็บต้นฉบับ)
 *   - imported = true
 *   - active = true
 *
 * วิธีใช้:
 *   node scripts/import-tbkk-employees.js --dry-run    # ทดสอบ ไม่เขียนจริง
 *   node scripts/import-tbkk-employees.js              # เขียนจริง
 *   node scripts/import-tbkk-employees.js --overwrite  # ทับของเดิมด้วย
 */

import * as XLSX from 'xlsx/xlsx.mjs';
import * as fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, collection, getDocs } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

XLSX.set_fs(fs);

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXCEL_PATH = String.raw`C:\Users\intern_attachai.k\Desktop\Projiect6\รายชื่อพนักงาน Email.xlsx`;
const DEFAULT_PASSWORD = '1234';

function loadEnv() {
  const envPath = resolve(__dirname, '..', '.env');
  const content = readFileSync(envPath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

async function hashPassword(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function sanitizeId(raw) {
  // Firestore doc ID ห้ามว่าง / มี '/' — clean ให้
  return String(raw || '').trim().toUpperCase().replace(/[\s\/]/g, '_');
}

function isValidEmail(s) {
  if (!s) return false;
  const t = String(s).trim();
  if (!t || t === '0') return false;
  return /@/.test(t);
}

function buildUserDoc(row, passwordHash) {
  const personCode = sanitizeId(row['PersonCode']);
  if (!personCode) return null;

  const fnameT = String(row['FnameT'] || '').trim();
  const lnameT = String(row['LnameT'] || '').trim();
  const fnameE = String(row['FnameE'] || '').trim();
  const lnameE = String(row['LnameE'] || '').trim();
  const displayName = (fnameT && lnameT) ? `${fnameT} ${lnameT}` : `${fnameE} ${lnameE}`.trim() || personCode;

  const email = isValidEmail(row['E-mail พนักงาน']) ? String(row['E-mail พนักงาน']).trim().toLowerCase() : '';
  const department = String(row['DepartmentName'] || '').trim();
  const position = String(row['PositionNameT'] || row['PositionNameE'] || '').trim();
  const sectionName = String(row['SectionName'] || '').trim();
  const company = String(row['Company'] || '').trim();
  const phase = String(row['Phase'] || '').trim();

  const lvRaw = String(row['ระดับ'] || '').trim();
  const lv = Number(lvRaw);
  const approvalLevel = (Number.isFinite(lv) && lv >= 3 && lv <= 9) ? lv : 0;

  const isHead = approvalLevel >= 3 && approvalLevel <= 8;

  return {
    docId: personCode,
    data: {
      personCode,
      displayName,
      name: displayName,
      fnameT, lnameT, fnameE, lnameE,
      email,
      department,
      position,
      sectionName,
      company,
      phase,
      approvalLevel,
      approvalLevelSetBy: approvalLevel > 0 ? 'hr-import' : 'none',
      role: isHead ? 'HOST' : 'EMPLOYEE',
      roleType: isHead ? 'HEAD' : 'EMPLOYEE',
      passwordHash,
      active: true,
      imported: true,
      importedAt: new Date().toISOString(),
    },
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const overwrite = process.argv.includes('--overwrite');

  console.log('');
  console.log('🔧 Import TBKK Employees (HR Excel → Firestore)');
  console.log('━'.repeat(60));
  console.log(`Excel:     ${EXCEL_PATH}`);
  console.log(`Mode:      ${dryRun ? '🟡 DRY-RUN (ไม่เขียนจริง)' : '🟢 WRITE'}`);
  console.log(`Overwrite: ${overwrite ? '⚠️ YES — ทับของเดิม' : '✅ NO — ข้ามถ้ามีอยู่แล้ว'}`);
  console.log('');

  // 1. Read Excel
  if (!fs.existsSync(EXCEL_PATH)) {
    console.error(`❌ ไม่พบไฟล์: ${EXCEL_PATH}`);
    process.exit(1);
  }
  const wb = XLSX.readFile(EXCEL_PATH);
  if (!wb.SheetNames.includes('TBKK')) {
    console.error(`❌ ไม่พบ sheet "TBKK" ใน Excel`);
    process.exit(1);
  }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['TBKK'], { defval: '', raw: false });
  console.log(`📊 อ่าน Excel: ${rows.length} แถว`);

  // 2. Setup Firebase
  const env = loadEnv();
  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  });
  const db = getFirestore(app);
  await signInAnonymously(getAuth(app));
  const appIdValue = env.VITE_APP_ID || 'visitor-soc-001';
  const usersRef = collection(db, 'artifacts', appIdValue, 'public', 'data', 'users');

  // 3. Check existing users (เพื่อข้ามถ้ามีแล้ว — ยกเว้น overwrite)
  console.log(`📥 อ่าน users ปัจจุบันใน Firestore...`);
  const existingSnap = await getDocs(usersRef);
  const existingIds = new Set(existingSnap.docs.map(d => d.id));
  console.log(`   พบ users อยู่แล้ว ${existingIds.size} คน`);
  console.log('');

  // 4. Hash password ครั้งเดียว (ใช้ทุกคน)
  const passwordHash = await hashPassword(DEFAULT_PASSWORD);

  // 5. Process each row
  const stats = {
    total: rows.length,
    skippedNoCode: 0,
    skippedExisting: 0,
    skippedNoLevel: 0,
    written: 0,
    byLevel: {},
    byRole: { HOST: 0, EMPLOYEE: 0 },
  };
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const built = buildUserDoc(row, passwordHash);
    if (!built) {
      stats.skippedNoCode++;
      continue;
    }
    const { docId, data } = built;

    // ข้ามถ้ามี user เดิมอยู่แล้ว (ยกเว้น overwrite mode)
    if (!overwrite && existingIds.has(docId)) {
      stats.skippedExisting++;
      continue;
    }

    // นับสถิติ
    stats.byLevel[data.approvalLevel] = (stats.byLevel[data.approvalLevel] || 0) + 1;
    stats.byRole[data.role]++;

    // เขียนจริง
    if (!dryRun) {
      try {
        await setDoc(doc(usersRef, docId), data);
        stats.written++;
        if (stats.written % 50 === 0) {
          console.log(`   ...${stats.written}/${rows.length}`);
        }
      } catch (err) {
        errors.push({ docId, error: err.message });
      }
    } else {
      stats.written++;
    }
  }

  // 6. Summary
  console.log('');
  console.log('━'.repeat(60));
  console.log('📊 สรุป:');
  console.log(`  อ่านจาก Excel:      ${stats.total} แถว`);
  console.log(`  ข้าม (ไม่มีรหัส):    ${stats.skippedNoCode}`);
  console.log(`  ข้าม (มีอยู่แล้ว):    ${stats.skippedExisting}`);
  console.log(`  ${dryRun ? 'จะเขียน' : 'เขียนแล้ว'}:           ${stats.written}`);
  console.log(`  Errors:             ${errors.length}`);
  console.log('');
  console.log('  แยกตาม Level:');
  for (const lv of Object.keys(stats.byLevel).sort()) {
    const role = (Number(lv) >= 3 && Number(lv) <= 8) ? '(HOST)' : '(EMPLOYEE)';
    console.log(`    Level ${lv}: ${stats.byLevel[lv]} คน ${role}`);
  }
  console.log('');
  console.log(`  แยกตาม Role:`);
  console.log(`    HOST:     ${stats.byRole.HOST} คน (อนุมัติได้)`);
  console.log(`    EMPLOYEE: ${stats.byRole.EMPLOYEE} คน`);

  if (errors.length > 0) {
    console.log('');
    console.log('❌ Errors:');
    for (const e of errors.slice(0, 10)) {
      console.log(`  ${e.docId}: ${e.error}`);
    }
    if (errors.length > 10) console.log(`  ...อีก ${errors.length - 10} errors`);
  }

  console.log('');
  if (dryRun) {
    console.log('🟡 Dry-run เสร็จ — ไม่ได้เขียนจริง');
    console.log('   ถ้าผลดูถูก → รันใหม่โดยไม่ใส่ --dry-run');
  } else {
    console.log('✅ Import เสร็จสิ้น!');
    console.log(`   พนักงานทุกคน login ด้วยรหัสผ่าน: "${DEFAULT_PASSWORD}"`);
    console.log(`   รหัสพนักงาน = PersonCode (เช่น "01173", "S0772")`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
