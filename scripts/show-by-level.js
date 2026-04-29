/**
 * แสดง users แยกตาม Lv. (1-9)
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { readFileSync } from 'fs';

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

const byLv = {};
for (const u of all) {
  const lv = Number(u.approvalLevel || 0);
  if (!byLv[lv]) byLv[lv] = [];
  byLv[lv].push(u);
}

const lvMeta = {
  1: { label: 'President', icon: '👑', color: 'red', desc: 'ประธานบริษัท' },
  2: { label: 'Director', icon: '🎩', color: 'red', desc: 'ผู้อำนวยการ' },
  3: { label: 'GM', icon: '⭐', color: 'orange', desc: 'ผู้จัดการทั่วไป' },
  4: { label: 'Asst. GM', icon: '🌟', color: 'amber', desc: 'ผู้ช่วยผู้จัดการทั่วไป' },
  5: { label: 'ผู้จัดการฝ่าย', icon: '💼', color: 'yellow', desc: 'Division Manager' },
  6: { label: 'ผู้ช่วยผู้จัดการฝ่าย', icon: '📋', color: 'lime', desc: 'Asst. Division Manager' },
  7: { label: 'หัวหน้าแผนก', icon: '🏢', color: 'green', desc: 'Department Head' },
  8: { label: 'Supervisor', icon: '🛡', color: 'cyan', desc: 'หัวหน้างาน' },
  9: { label: 'พนักงาน', icon: '👤', color: 'blue', desc: 'Staff' },
  0: { label: 'ไม่กำหนด', icon: '❓', color: 'gray', desc: 'No level set' },
};

console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
console.log('║  📊 รายชื่อ users แยกตาม Approval Level                                ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

const levels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
for (const lv of levels) {
  const list = byLv[lv] || [];
  if (list.length === 0) continue;
  const meta = lvMeta[lv] || { label: `Lv.${lv}`, icon: '?', desc: '' };

  console.log(`\n${meta.icon}  Lv.${lv} — ${meta.label}  (${meta.desc})`);
  console.log(`    👥 จำนวน: ${list.length} คน`);
  console.log('    ' + '─'.repeat(72));

  // แสดง 10 คนแรก ส่วน Lv.9 พนักงานเยอะ
  const showCount = lv === 9 ? 5 : Math.min(20, list.length);
  list.slice(0, showCount).forEach(u => {
    const dept = (u.department || '-').slice(0, 35);
    console.log(`    ${(u.id || '').padEnd(10)} ${(u.name || u.displayName || '-').padEnd(28)} ${dept}`);
  });
  if (list.length > showCount) {
    console.log(`    ... และอีก ${list.length - showCount} คน`);
  }
}

// Summary table
console.log('\n\n' + '═'.repeat(78));
console.log('📊 สรุปจำนวนแต่ละระดับ');
console.log('═'.repeat(78));
console.log('  Lv.   ตำแหน่ง                         จำนวน    Approver?');
console.log('  ' + '─'.repeat(74));
for (const lv of levels) {
  const list = byLv[lv] || [];
  if (list.length === 0) continue;
  const meta = lvMeta[lv];
  const isApprover = lv >= 2 && lv <= 8 ? '✅' : (lv === 1 ? '✅ (Top)' : '❌');
  console.log(`  ${String(lv).padStart(2)}    ${meta.icon} ${meta.label.padEnd(28)}  ${String(list.length).padStart(5)}    ${isApprover}`);
}
console.log('  ' + '─'.repeat(74));
console.log(`  รวมทั้งหมด: ${all.length} คน`);

// Approver count
const approvers = all.filter(u => {
  const lv = Number(u.approvalLevel || 0);
  return u.roleType === 'HEAD' && lv >= 2 && lv <= 8;
});
console.log(`  ✅ Approver จริง (HEAD + Lv.2-8): ${approvers.length} คน`);
console.log('═'.repeat(78));
console.log('');

process.exit(0);
