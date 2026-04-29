/**
 * เอาออกจาก approver: 01941 มงคล, 02081 ศรายุทธ
 *   วิธี: เปลี่ยน approvalLevel → 0 (ไม่ใช่ approver)
 *        เก็บ approvalLevelOriginal ไว้สำหรับ reference
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, updateDoc } from 'firebase/firestore';
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

const TARGETS = ['01941', '02081'];

console.log('\n🔧 เอาออกจาก approver: 01941 มงคล, 02081 ศรายุทธ\n');

for (const id of TARGETS) {
  const ref = doc(db, 'artifacts', appId, 'public', 'data', 'users', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    console.log(`❌ ${id} — ไม่พบ`);
    continue;
  }
  const u = snap.data();
  console.log(`📋 ${id} ${u.name}`);
  console.log(`   เดิม: Lv.${u.approvalLevel}, roleType=${u.roleType}, role=${u.role}`);

  await updateDoc(ref, {
    approvalLevelOriginal: u.approvalLevel,  // เก็บค่าเดิมไว้ reference
    approvalLevel: 0,
    approvalLevelSetBy: 'admin-disabled',
    roleType: 'EMPLOYEE',  // เปลี่ยนจาก HEAD เป็น EMPLOYEE → ไม่ถูกคิวรี่เป็น approver
    role: 'EMPLOYEE',
    excludedFromApproval: true,
    excludedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  console.log(`   ✅ ใหม่: Lv.0, roleType=EMPLOYEE  (ไม่ใช่ approver)`);
  console.log(`      💾 approvalLevelOriginal=${u.approvalLevel} (เก็บค่าเดิมไว้)`);
  console.log('');
}

console.log('═'.repeat(70));
console.log('✅ เสร็จสิ้น — EEE Approver ตอนนี้เหลือ 3 คน:');
console.log('   • Lv.4 วรณัน ปัณณ์ชเนศ (02007)');
console.log('   • Lv.5 ธีรธร เกษมสันต์ (01396)');
console.log('   • Lv.8 ประกายกุล จูแย้ม (01955)');
console.log('═'.repeat(70));
console.log('');

console.log('💡 ถ้าจะเอากลับ:');
console.log('   ใช้ admin web → เปลี่ยน approvalLevel ของ 01941, 02081 กลับเป็น 5');
console.log('   หรือ: node scripts/restore-approver.js 01941 02081');
console.log('');

process.exit(0);
