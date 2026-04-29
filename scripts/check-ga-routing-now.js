/**
 * ตรวจ GA routing ล่าสุด — ใครได้ email ตอนเอกสารส่งหา GA?
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
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

const norm = (s) => (s || '').toString().toUpperCase().replace(/[^A-Z0-9ก-๙]/g, '');

const usersSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.active !== false);

console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
console.log('║  📋 GA Team — ทุกคนที่ "ควร" ได้ email เมื่อเอกสารส่งหา GA                  ║');
console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

// Logic เลียนแบบ getUsersByDepartment สำหรับ GA
const target = norm('GA');

const gaTeamRouting = allUsers.filter(u => {
  const primaryMatch = norm(u.department) === target;
  const additionalDepts = Array.isArray(u.headOfAlsoDepartments) ? u.headOfAlsoDepartments : [];
  const additionalMatch = additionalDepts.some(d => norm(d) === target);
  if (!primaryMatch && !additionalMatch) return false;
  // Filter by role = GA
  if ((u.role || '').toUpperCase() !== 'GA') return false;
  return true;
});

console.log(`พบ ${gaTeamRouting.length} คนใน GA team\n`);

if (gaTeamRouting.length === 0) {
  console.log('❌ ไม่มี user ที่ role=GA และอยู่ใน department=GA หรือ headOfAlsoDepartments มี GA\n');
} else {
  gaTeamRouting.forEach((u, i) => {
    const inGA = norm(u.department) === target;
    const additionalDepts = Array.isArray(u.headOfAlsoDepartments) ? u.headOfAlsoDepartments : [];
    const tagAlso = additionalDepts.length ? ` + ดูแล [${additionalDepts.join(',')}]` : '';
    console.log(`  ${i + 1}. 👤 ${u.name || u.displayName || u.id}`);
    console.log(`     🆔 ${u.id} · role: ${u.role}/${u.roleType || '-'} · Lv.${u.approvalLevel || '-'}`);
    console.log(`     🏢 dept หลัก: ${u.department || '-'}${tagAlso}`);
    console.log(`     📧 ${u.email || '⚠️ ไม่มี email — ส่งให้ไม่ได้!'}`);
    console.log(`     ✅ จะได้ email: ${u.email ? 'YES' : 'NO (ไม่มี email)'}`);
    console.log('');
  });
}

// Bonus: ดูว่ามีคน role=GA แต่ไม่ผ่าน filter ไหม
const allGA = allUsers.filter(u => (u.role || '').toUpperCase() === 'GA');
console.log(`\n━━━ 🔍 รวมคนที่ role=GA ทั้งหมดในระบบ: ${allGA.length} คน ━━━\n`);
allGA.forEach((u, i) => {
  const target = norm('GA');
  const primaryMatch = norm(u.department) === target;
  const additionalDepts = Array.isArray(u.headOfAlsoDepartments) ? u.headOfAlsoDepartments : [];
  const additionalMatch = additionalDepts.some(d => norm(d) === target);
  const willGet = primaryMatch || additionalMatch;
  const icon = willGet ? '✅' : '❌';
  console.log(`  ${icon} ${u.id} ${u.name || u.displayName || '-'} · dept=${u.department || '-'}`);
  if (additionalDepts.length) console.log(`     ➕ headOfAlsoDepartments: [${additionalDepts.join(', ')}]`);
  if (!willGet) {
    console.log(`     ⚠️ ไม่จะได้ email!  (dept ไม่ใช่ GA และ headOfAlsoDepartments ไม่มี GA)`);
  }
  console.log(`     📧 ${u.email || '(ไม่มี email)'}`);
  console.log('');
});

console.log('═'.repeat(76));
console.log('💡 ถ้า GA ขึ้นแค่คนเดียว — เกิดได้ 2 กรณี:');
console.log('   1. คนอื่นที่ role=GA แต่ department ไม่ตรงและไม่มี GA ใน headOfAlsoDepartments');
console.log('   2. คนอื่นที่ role=GA แต่ active=false (ปิดใช้งาน)');
console.log('═'.repeat(76));
console.log('');

process.exit(0);
