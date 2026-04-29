/**
 * เพิ่ม Channarong (00004) เป็นหัวหน้าของ TOOLING (เพิ่มเติมจากแผนกหลัก QI)
 *
 * แก้ user 00004:
 *   เพิ่ม field: headOfAlsoDepartments: ['TOOLING']
 *   → ระบบจะ route TOOLING มาที่ Channarong นอกเหนือจาก QUALITY IMPROVEMENT
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

const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', '00004');
const snap = await getDoc(userRef);

if (!snap.exists()) {
  console.log('❌ ไม่พบ user 00004 ในระบบ');
  process.exit(1);
}

const u = snap.data();
console.log('\n📋 ข้อมูลปัจจุบัน:');
console.log(`   ชื่อ: ${u.name || u.displayName}`);
console.log(`   แผนกหลัก: ${u.department}`);
console.log(`   Lv.: ${u.approvalLevel}`);
console.log(`   roleType: ${u.roleType}`);
console.log(`   email: ${u.email}`);
console.log(`   headOfAlsoDepartments เดิม: ${JSON.stringify(u.headOfAlsoDepartments || [])}`);

// Update — add TOOLING to headOfAlsoDepartments
const existing = Array.isArray(u.headOfAlsoDepartments) ? u.headOfAlsoDepartments : [];
const newList = [...new Set([...existing, 'TOOLING'])];

await updateDoc(userRef, {
  headOfAlsoDepartments: newList,
  updatedAt: new Date().toISOString(),
});

console.log('\n✅ อัปเดตสำเร็จ!');
console.log(`   ${u.name} เป็นหัวหน้า:`);
console.log(`   • ${u.department} (แผนกหลัก)`);
console.log(`   • TOOLING (เพิ่ม)`);
console.log('\n💡 ระบบจะ route ใบขออนุมัติ TOOLING มาที่ ${u.name} ด้วย');

process.exit(0);
