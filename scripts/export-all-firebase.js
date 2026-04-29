/**
 * 📦 Export ข้อมูล Firestore ทั้งหมดเป็นไฟล์ JSON
 * รันครั้งเดียว — ได้ไฟล์ใน folder backups/
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

// Collections ที่จะ export
const COLLECTIONS = [
  'users',
  'approval_workflows',
  'vehicle_bookings',
  'equipment_requests',
  'equipment_stock',
  'appointments',
  'employee_logs',
  'audit_logs',
  'login_attempts',
  'support_tickets',
  'smtp_settings',
  'vehicles',
  'system_settings',
  'security_alerts',
];

// Timestamp folder for backup
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupDir = resolve(__dirname, '..', 'backups', `firestore-${ts}`);
if (!existsSync(resolve(__dirname, '..', 'backups'))) {
  mkdirSync(resolve(__dirname, '..', 'backups'), { recursive: true });
}
mkdirSync(backupDir, { recursive: true });

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  📦 Export Firestore Data — All Collections                      ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
console.log(`\n📂 Backup directory: ${backupDir}\n`);

const summary = {
  exportedAt: new Date().toISOString(),
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId,
  collections: {},
};

let totalDocs = 0;
let totalCollections = 0;

for (const cname of COLLECTIONS) {
  try {
    const ref = collection(db, 'artifacts', appId, 'public', 'data', cname);
    const snap = await getDocs(ref);

    if (snap.size === 0) {
      console.log(`  ✓  ${cname.padEnd(22)}     0 รายการ (ข้าม - ไม่มีข้อมูล)`);
      continue;
    }

    const docs = snap.docs.map(d => {
      const data = d.data();
      // Convert Firestore Timestamps to ISO strings
      const sanitize = (obj) => {
        if (obj === null || obj === undefined) return obj;
        if (obj?.toDate && typeof obj.toDate === 'function') return obj.toDate().toISOString();
        if (Array.isArray(obj)) return obj.map(sanitize);
        if (typeof obj === 'object') {
          const out = {};
          for (const k in obj) out[k] = sanitize(obj[k]);
          return out;
        }
        return obj;
      };
      return { id: d.id, ...sanitize(data) };
    });

    const filename = `${cname}.json`;
    writeFileSync(
      resolve(backupDir, filename),
      JSON.stringify(docs, null, 2),
      'utf-8'
    );

    const sizeKB = (Buffer.byteLength(JSON.stringify(docs)) / 1024).toFixed(1);
    console.log(`  ✅ ${cname.padEnd(22)} ${String(snap.size).padStart(5)} รายการ (${sizeKB} KB) → ${filename}`);

    summary.collections[cname] = { count: snap.size, sizeKB: Number(sizeKB), filename };
    totalDocs += snap.size;
    totalCollections++;
  } catch (err) {
    console.log(`  ❌ ${cname.padEnd(22)} ผิดพลาด: ${err.message}`);
    summary.collections[cname] = { error: err.message };
  }
}

// Save summary
writeFileSync(
  resolve(backupDir, '_SUMMARY.json'),
  JSON.stringify(summary, null, 2),
  'utf-8'
);

// Save README
const readmeContent = `# 📦 Firestore Backup
**Exported at:** ${summary.exportedAt}
**Project:** ${summary.projectId}
**App ID:** ${summary.appId}

## 📊 Collections Exported

${Object.entries(summary.collections).map(([k, v]) =>
  v.error ? `- ❌ \`${k}\` — Error: ${v.error}` : `- ✅ \`${k}\` — ${v.count} records (${v.sizeKB} KB)`
).join('\n')}

## 📁 Files in this folder

- \`_SUMMARY.json\` — รายงานสรุปการ export
- \`<collection>.json\` — ข้อมูลของแต่ละ collection (1 ไฟล์ต่อ 1 collection)

## 🔄 วิธี Import กลับ

\`\`\`bash
node scripts/import-firebase-backup.js backups/firestore-${ts}/
\`\`\`

## 🛡️ ข้อควรระวัง

- ⚠️ ไฟล์นี้มีข้อมูลพนักงานทั้ง 908 คน — เก็บปลอดภัย!
- 🔐 มี password hash + email — ห้าม commit ขึ้น Git
- 📌 ใช้สำหรับ backup, migration, หรือเปิดดูข้อมูล

## 📊 รวมทั้งหมด: ${totalDocs} records ใน ${totalCollections} collections
`;

writeFileSync(resolve(backupDir, 'README.md'), readmeContent, 'utf-8');

console.log('\n' + '═'.repeat(72));
console.log(`✅ Export เสร็จสิ้น!`);
console.log(`📊 รวม ${totalDocs} records ใน ${totalCollections} collections`);
console.log(`📂 อยู่ที่: ${backupDir}`);
console.log('═'.repeat(72));
console.log('\n💡 ไฟล์ที่ได้:');
console.log(`   📄 README.md       — คำอธิบาย`);
console.log(`   📄 _SUMMARY.json   — รายงานสรุป`);
console.log(`   📄 *.json          — ข้อมูลแต่ละ collection`);
console.log('\n');

process.exit(0);
