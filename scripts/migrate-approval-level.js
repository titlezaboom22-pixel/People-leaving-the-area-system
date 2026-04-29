/**
 * Migration: เพิ่ม field approvalLevel ให้ users ที่เป็น HEAD ใน Firestore
 *
 * ใช้ครั้งเดียวหลัง deploy feature "approval level filter"
 * - ไล่ users ทั้งหมดที่ roleType = 'HEAD'
 * - ถ้ายังไม่มี approvalLevel → set เป็น 7 (หัวหน้าแผนก) + flag approvalLevelSetBy = 'auto'
 * - ถ้ามีอยู่แล้ว → ข้าม (ไม่ทับของจริง)
 *
 * ⚠️ TBKK level system: เลขน้อย = ตำแหน่งสูง (3=GM, 9=พนักงาน)
 * Default = 7 ('หัวหน้าแผนก') → ผ่าน threshold (≤ 8) → อนุมัติได้ทันที
 * Admin ค่อยปรับ level จริงทีหลังในหน้า Admin Panel
 *
 * วิธีใช้:
 *   node scripts/migrate-approval-level.js
 *
 *   # ทดสอบก่อน (dry-run, ไม่เขียนจริง):
 *   node scripts/migrate-approval-level.js --dry-run
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_LEVEL = 7; // TBKK level 7 = "หัวหน้าแผนก" (ผ่าน threshold ≤ 8)
const TARGET_ROLE_TYPE = 'HEAD';

function loadEnv() {
  const envPath = resolve(__dirname, '..', '.env');
  const content = readFileSync(envPath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
  return env;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const env = loadEnv();
  const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
  const appIdValue = env.VITE_APP_ID || 'visitor-soc-001';

  if (!firebaseConfig.apiKey) {
    console.error('❌ ไม่พบ VITE_FIREBASE_API_KEY ใน .env');
    process.exit(1);
  }

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const auth = getAuth(app);
  await signInAnonymously(auth);

  console.log('');
  console.log('🔧 Migration: approvalLevel for HEAD users');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Project:  ${firebaseConfig.projectId}`);
  console.log(`App ID:   ${appIdValue}`);
  console.log(`Mode:     ${dryRun ? '🟡 DRY-RUN (ไม่เขียนจริง)' : '🟢 WRITE'}`);
  console.log(`Default:  approvalLevel = ${DEFAULT_LEVEL} (หัวหน้าแผนก — TBKK)`);
  console.log('');

  const usersRef = collection(db, 'artifacts', appIdValue, 'public', 'data', 'users');
  const snap = await getDocs(usersRef);

  let totalHeads = 0;
  let updated = 0;
  let skipped = 0;
  const updatedList = [];
  const skippedList = [];

  for (const docSnap of snap.docs) {
    const u = docSnap.data();
    if (u.roleType !== TARGET_ROLE_TYPE) continue;

    totalHeads++;
    const id = docSnap.id;
    const currentLevel = u.approvalLevel;

    if (currentLevel != null && Number(currentLevel) > 0) {
      skipped++;
      skippedList.push(`${id} (level=${currentLevel}, setBy=${u.approvalLevelSetBy || 'manual'})`);
      continue;
    }

    if (!dryRun) {
      const userDocRef = doc(usersRef, id);
      await setDoc(userDocRef, {
        approvalLevel: DEFAULT_LEVEL,
        approvalLevelSetBy: 'auto',
      }, { merge: true });
    }

    updated++;
    updatedList.push(`${id} (${u.displayName || '-'}, dept=${u.department || '-'})`);
  }

  console.log(`พบ HEAD ทั้งหมด: ${totalHeads} คน`);
  console.log('');

  if (updatedList.length > 0) {
    console.log(`✅ ${dryRun ? 'จะ' : ''}อัพเดต ${updated} คน → approvalLevel = ${DEFAULT_LEVEL}:`);
    for (const line of updatedList) console.log(`   • ${line}`);
    console.log('');
  }

  if (skippedList.length > 0) {
    console.log(`⏭️  ข้าม ${skipped} คน (มี approvalLevel อยู่แล้ว):`);
    for (const line of skippedList) console.log(`   • ${line}`);
    console.log('');
  }

  if (dryRun) {
    console.log('🟡 Dry-run เสร็จสิ้น — ไม่ได้เขียนจริง');
    console.log('   ถ้าผลตรงตามต้องการ รันใหม่โดยไม่ใส่ --dry-run');
  } else {
    console.log('✅ Migration เสร็จสิ้น');
    console.log('   หมายเหตุ: HEAD ทุกคนถูกตั้งเป็นระดับ "หัวหน้าแผนก" (7) แบบ auto');
    console.log('   ⚠️ TBKK level: เลขน้อย = ตำแหน่งสูง (3=GM, 9=พนักงาน)');
    console.log('   → admin ควรเข้า Admin Panel ปรับระดับจริงของแต่ละคน (ตามตำแหน่งใน HR Excel)');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
