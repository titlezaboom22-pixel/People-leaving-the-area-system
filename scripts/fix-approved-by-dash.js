// แก้ไข approval_workflows ที่ approvedBy = '-' หรือว่าง
// → หาชื่อจริงจาก step.approver หรือ recipientEmails เทียบกับ users
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { readFileSync } from 'fs';
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

// โหลด users mapping (email → user, id → user)
const usersSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
const byEmail = {};
const byId = {};
for (const d of usersSnap.docs) {
  const u = { id: d.id, ...d.data() };
  if (u.email) byEmail[u.email.toLowerCase()] = u;
  byId[u.id] = u;
}

const wfSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows'));
const fixes = [];
for (const d of wfSnap.docs) {
  const w = d.data();
  const approvedBy = (w.approvedBy || '').toString().trim();
  // เป้าหมาย: '-' / ว่าง / ขึ้นต้น # / ชื่อ stepLabel แทนที่จะเป็นชื่อจริง
  const isPlaceholder = !approvedBy || approvedBy === '-' || approvedBy === 'หัวหน้าแผนก' ||
    approvedBy === 'ผู้อนุมัติ' || /^Step\s/i.test(approvedBy);

  if (w.status !== 'approved' || !isPlaceholder) continue;

  // หาคนเซ็น: ลอง match ผ่าน recipientEmails (ครั้งล่าสุด) หรือใช้ field อื่น
  let resolved = null;

  // 1. ถ้ามี approverEmail ที่บันทึกไว้
  if (w.approverEmail) {
    resolved = byEmail[w.approverEmail.toLowerCase()];
  }

  // 2. ถ้ามี approvedBy เป็น staff ID (เช่น "01396") → เทียบ
  if (!resolved && approvedBy && byId[approvedBy]) {
    resolved = byId[approvedBy];
  }
  if (!resolved && approvedBy.startsWith('#')) {
    const id = approvedBy.slice(1);
    if (byId[id]) resolved = byId[id];
  }

  // 3. ถ้ามี recipientEmails (มีหลายคน — ไม่รู้ว่าใครเซ็น) → ข้าม
  // ในกรณีนี้ไม่สามารถระบุได้แน่ชัดว่าใครเซ็น ให้ใช้ stepLabel + เพิ่มหมายเหตุ
  if (!resolved) {
    // ตั้งเป็น stepLabel ถ้ามี (ดีกว่า "-")
    if (w.stepLabel && w.stepLabel !== approvedBy) {
      fixes.push({ docId: d.id, name: w.stepLabel, from: approvedBy || '(empty)', reason: 'ใช้ stepLabel' });
    }
    continue;
  }

  const newName = resolved.name || resolved.displayName || `#${resolved.id}`;
  if (newName !== approvedBy) {
    fixes.push({ docId: d.id, name: newName, from: approvedBy || '(empty)', reason: `match user ${resolved.id}` });
  }
}

console.log(`\n=== พบเอกสารที่ต้องแก้: ${fixes.length} รายการ ===`);
for (const f of fixes) {
  console.log(`  ${f.docId.slice(0, 12)}… : "${f.from}" → "${f.name}"  (${f.reason})`);
}

if (fixes.length === 0) {
  console.log('\n✓ ไม่พบเอกสารที่ต้องแก้');
  process.exit(0);
}

// Apply
const dryRun = process.argv.includes('--dry-run');
if (dryRun) {
  console.log('\n[DRY RUN] ไม่ได้แก้จริง — ใช้ "node scripts/fix-approved-by-dash.js" เพื่อ apply');
  process.exit(0);
}

console.log('\n=== กำลังบันทึก... ===');
for (const f of fixes) {
  try {
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'approval_workflows', f.docId), {
      approvedBy: f.name,
    });
    console.log(`  ✓ ${f.docId.slice(0, 12)}… → ${f.name}`);
  } catch (e) {
    console.log(`  ✗ ${f.docId.slice(0, 12)}… : ${e.message}`);
  }
}

console.log('\n✓ เสร็จเรียบร้อย');
process.exit(0);
