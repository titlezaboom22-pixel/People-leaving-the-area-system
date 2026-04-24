// List users with random/orphan doc IDs (not matching standard patterns)
// รัน: node scripts/list-orphan-users.js
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const env = {};
  for (const line of readFileSync(resolve(__dirname, '..', '.env'), 'utf-8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const env = loadEnv();
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
});
const db = getFirestore(app);
await signInAnonymously(getAuth(app));
const appId = env.VITE_APP_ID || 'visitor-soc-001';

const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
const users = snap.docs.map(d => ({ docId: d.id, ...d.data() }));

const validPattern = /^(EMP|HEAD|DRV|GA|SEC|ADMIN|SD|SHOP|HR)[-_0-9A-Z]*$/i;
const orphans = users.filter(u => !validPattern.test(u.docId));
const valid = users.filter(u => validPattern.test(u.docId));

console.log(`\n📊 สรุป users ทั้งหมด: ${users.length} คน`);
console.log(`  ✅ รหัสถูกต้อง: ${valid.length}`);
console.log(`  ⚠️  รหัสผิดรูปแบบ: ${orphans.length}\n`);

if (orphans.length > 0) {
  console.log(`⚠️  Users ที่มีรหัสสุ่ม/ไม่ตรงรูปแบบ:\n`);
  orphans.forEach((u, i) => {
    console.log(`${i + 1}. docId: "${u.docId}"`);
    console.log(`   ชื่อ: ${u.name || u.displayName || '-'}`);
    console.log(`   Role: ${u.role || '-'} | แผนก: ${u.department || '-'}`);
    console.log(`   Email: ${u.email || '-'}`);
    console.log('');
  });
  console.log(`\n💡 ต้องย้ายไปรหัสที่ถูกต้องเอง (หรือลบทิ้ง)`);
  console.log(`    ใช้: node scripts/rename-user.js <old_id> <new_id>`);
}
process.exit(0);
