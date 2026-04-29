/**
 * Restore Firestore — กู้คืนข้อมูลจากไฟล์ backup JSON
 *
 * วิธีใช้:
 *   node scripts/restore-firestore.js backups/backup-2026-04-28-1430.json [--dry-run]
 *   node scripts/restore-firestore.js backups/backup-2026-04-28-1430.json --collections users,vehicles
 *
 * --dry-run        : แสดงว่าจะทำอะไรบ้าง ไม่บันทึกจริง
 * --collections X  : เลือก collection ที่จะ restore (คั่นด้วย comma) — default: ทั้งหมด
 * --merge          : merge กับข้อมูลปัจจุบัน (default = overwrite)
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, writeBatch, collection } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const filePath = args.find(a => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const merge = args.includes('--merge');
const collArg = args.find(a => a.startsWith('--collections='));
const onlyColls = collArg ? collArg.split('=')[1].split(',').map(s => s.trim()) : null;

if (!filePath) {
  console.error('❌ ใส่ path ของไฟล์ backup\n');
  console.log('ตัวอย่าง:');
  console.log('  node scripts/restore-firestore.js backups/backup-2026-04-28-1430.json --dry-run');
  console.log('  node scripts/restore-firestore.js backups/backup-2026-04-28-1430.json');
  console.log('  node scripts/restore-firestore.js backups/backup-2026-04-28-1430.json --collections=users,vehicles');
  process.exit(1);
}

const env = {};
for (const line of readFileSync(resolve(__dirname, '..', '.env'), 'utf-8').split('\n')) {
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

const fullPath = resolve(__dirname, '..', filePath);
console.log(`\n📥 กำลังอ่าน backup: ${fullPath}`);
const backup = JSON.parse(readFileSync(fullPath, 'utf-8'));

console.log(`📅 Backup timestamp: ${backup.metadata?.timestamp || '(unknown)'}`);
console.log(`📦 Project: ${backup.metadata?.project || '(unknown)'}`);
console.log(`🔍 Mode: ${dryRun ? 'DRY-RUN (ไม่บันทึกจริง)' : (merge ? 'MERGE' : 'OVERWRITE')}\n`);

const collectionsToRestore = onlyColls || Object.keys(backup.data);
console.log(`📋 จะ restore: ${collectionsToRestore.join(', ')}\n`);

let totalRestored = 0;
for (const coll of collectionsToRestore) {
  const docs = backup.data[coll];
  if (!docs || docs.length === 0) {
    console.log(`  ⏭ ${coll}: ไม่มีข้อมูล — ข้าม`);
    continue;
  }

  if (dryRun) {
    console.log(`  🔍 ${coll.padEnd(25)} จะ restore ${docs.length} docs`);
    totalRestored += docs.length;
    continue;
  }

  // Batch write (ทีละ 500 ตามข้อจำกัด Firestore)
  const collRef = collection(db, 'artifacts', appId, 'public', 'data', coll);
  let written = 0;
  for (let i = 0; i < docs.length; i += 450) {
    const chunk = docs.slice(i, i + 450);
    const batch = writeBatch(db);
    for (const d of chunk) {
      const { _id, ...data } = d;
      const ref = doc(collRef, _id);
      batch.set(ref, data, merge ? { merge: true } : undefined);
    }
    await batch.commit();
    written += chunk.length;
  }
  console.log(`  ✓ ${coll.padEnd(25)} restore ${written} docs`);
  totalRestored += written;
}

console.log(`\n${dryRun ? '🔍 DRY-RUN' : '✅'} รวม ${totalRestored} เอกสาร`);
if (dryRun) console.log('\n💡 ลบ --dry-run เพื่อ restore จริง');
process.exit(0);
