/**
 * Backup Firestore — Export ข้อมูลทุก collection เป็นไฟล์ JSON
 *
 * วิธีใช้:
 *   node scripts/backup-firestore.js
 *
 * จะได้ไฟล์:  backups/backup-YYYY-MM-DD-HHmm.json
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
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

// รายชื่อ collection ทั้งหมดในระบบ
const COLLECTIONS = [
  'users',
  'approval_workflows',
  'employee_logs',
  'appointments',
  'equipment_requests',
  'equipment_stock',
  'equipment_categories',
  'vehicles',
  'drivers',
  'vehicle_bookings',
  'login_attempts',
  'audit_logs',
  'companies',
  'support_tickets',
];

const backupDir = resolve(__dirname, '..', 'backups');
if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });

const now = new Date();
const stamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
const fileName = `backup-${stamp}.json`;
const filePath = resolve(backupDir, fileName);

const backup = {
  metadata: {
    timestamp: now.toISOString(),
    project: env.VITE_FIREBASE_PROJECT_ID,
    appId,
    collections: COLLECTIONS.length,
  },
  data: {},
};

console.log(`\n🔄 กำลัง backup Firestore project: ${env.VITE_FIREBASE_PROJECT_ID}`);
console.log(`   appId: ${appId}\n`);

let totalDocs = 0;
for (const coll of COLLECTIONS) {
  try {
    const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', coll));
    const docs = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
    backup.data[coll] = docs;
    totalDocs += docs.length;
    console.log(`  ✓ ${coll.padEnd(25)} ${docs.length} docs`);
  } catch (e) {
    backup.data[coll] = [];
    console.log(`  ⚠ ${coll.padEnd(25)} ไม่สามารถอ่านได้: ${e.message}`);
  }
}

writeFileSync(filePath, JSON.stringify(backup, null, 2), 'utf-8');

console.log(`\n✅ Backup สำเร็จ — รวม ${totalDocs} เอกสาร`);
console.log(`📦 ไฟล์: ${filePath}`);
console.log(`💾 ขนาด: ${(JSON.stringify(backup).length / 1024).toFixed(1)} KB\n`);
console.log(`💡 ส่งไฟล์นี้ให้ IT เก็บไว้ — ถ้าข้อมูลหายสามารถใช้ restore-firestore.js กู้กลับมาได้`);

process.exit(0);
