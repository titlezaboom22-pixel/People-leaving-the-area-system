/**
 * แก้ไข GA Team 4 คน:
 *   department: GA → EMPLOYEE EXPERIENCE ENGAGEMENT (แผนกจริง)
 *   เพิ่ม headOfAlsoDepartments: ['GA'] (ยังอยู่กลุ่ม GA)
 *   keep role: GA, roleType: GA (ทำงาน GA ต่อ)
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

const GA_IDS = ['00406', '01583', '01861', '01905'];

console.log('\n🔧 แก้ไข GA Team — เปลี่ยน dept GA → EEE แต่อยู่ในกลุ่ม GA\n');

for (const id of GA_IDS) {
  const ref = doc(db, 'artifacts', appId, 'public', 'data', 'users', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    console.log(`❌ ${id} — ไม่พบ`);
    continue;
  }
  const u = snap.data();
  console.log(`📋 ${id} ${u.name || u.displayName}`);
  console.log(`   เดิม: dept=${u.department}, role=${u.role}, headOfAlsoDepartments=${JSON.stringify(u.headOfAlsoDepartments || [])}`);

  const existing = Array.isArray(u.headOfAlsoDepartments) ? u.headOfAlsoDepartments : [];
  const newAdditional = [...new Set([...existing, 'GA'])];

  await updateDoc(ref, {
    department: 'EMPLOYEE EXPERIENCE ENGAGEMENT',
    headOfAlsoDepartments: newAdditional,
    // keep role=GA, roleType=GA, isVehicleGATeam=true
    updatedAt: new Date().toISOString(),
  });

  console.log(`   ✅ ใหม่: dept=EMPLOYEE EXPERIENCE ENGAGEMENT, headOfAlsoDepartments=['GA']`);
  console.log('');
}

console.log('═'.repeat(70));
console.log('✅ เสร็จสิ้น — GA Team ทั้ง 4 คน:');
console.log('   • แผนกหลัก: EMPLOYEE EXPERIENCE ENGAGEMENT (แผนกจริง)');
console.log('   • headOfAlsoDepartments: [GA]  (สำหรับ workflow รถ)');
console.log('   • role: GA, isVehicleGATeam: true (ทำงาน GA ต่อ)');
console.log('═'.repeat(70));

console.log('\n💡 ผลลัพธ์:');
console.log('   ✅ EEE filter ใน Admin → จะเห็น 4 คนใน "พนักงาน EEE"');
console.log('   ✅ ใบขอใช้รถจาก EEE → ส่งหา head EEE (ไม่รวม 4 คนนี้ เพราะ role=GA)');
console.log('   ✅ GA workflow → ส่งหา 4 คนนี้ (ผ่าน headOfAlsoDepartments)');
console.log('');

process.exit(0);
