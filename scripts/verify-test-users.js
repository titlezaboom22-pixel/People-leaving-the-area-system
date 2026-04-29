/**
 * ตรวจสอบ users ในแผนกที่ "ไม่มีหัวหน้า" — เป็น test users จริงหรือไม่?
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

const targetDepts = [
  'Accounting (บัญชี)',
  'EEE (Employee Experience Engagement)',
  'HR (ทรัพยากรบุคคล)',
  'IT (เทคโนโลยีสารสนเทศ)',
  'Maintenance (ซ่อมบำรุง)',
  'Production (ฝ่ายผลิต)',
  'Sales (ฝ่ายขาย)',
  'SOC (ศูนย์ปฏิบัติการ)',
  'Shop (ร้านค้า)',
  'TOOLING',
  '(ไม่ระบุ)',
];

const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
const all = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.active !== false);

console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
console.log('║  🔍 ตรวจสอบ users ในแผนกที่ไม่มีหัวหน้า                                ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

for (const dept of targetDepts) {
  const users = all.filter(u => (u.department || '(ไม่ระบุ)') === dept);
  if (users.length === 0) continue;

  console.log(`\n🏢 ${dept}  (${users.length} คน)`);
  console.log('─'.repeat(72));

  for (const u of users) {
    const isTestUser = (
      (u.id || '').startsWith('EMP-') ||
      (u.id || '').startsWith('TEST-') ||
      (u.name || '').includes('test') ||
      (u.name || '').includes('TEST') ||
      (u.name || '').includes('ทดสอบ') ||
      !u.email ||
      (u.email || '').includes('test') ||
      (u.email || '').includes('intern_attachai')
    );

    const tag = isTestUser ? '🧪 TEST' : '✅ พนักงานจริง';
    console.log(`  ${tag}  ${(u.id || '').padEnd(12)} ${(u.name || u.displayName || '-').padEnd(28)} Lv.${u.approvalLevel || '-'}`);
    console.log(`              role: ${u.role || '-'}/${u.roleType || '-'}  email: ${u.email || '(ไม่มี)'}`);
    if (u.position) console.log(`              ตำแหน่ง: ${u.position}`);
    if (u.createdAt) console.log(`              สร้างเมื่อ: ${u.createdAt}`);
  }
}

console.log('\n');
console.log('═'.repeat(72));
console.log('💡 สรุป:');
console.log('  🧪 TEST  = น่าจะเป็น user ทดสอบ (สร้างจาก seed-users / dev)');
console.log('  ✅ จริง  = พนักงานจริง — ถ้าไม่มีหัวหน้า ต้องเพิ่มให้');
console.log('═'.repeat(72));
console.log('');

process.exit(0);
