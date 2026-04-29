import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
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
const app = initializeApp({apiKey:env.VITE_FIREBASE_API_KEY,authDomain:env.VITE_FIREBASE_AUTH_DOMAIN,projectId:env.VITE_FIREBASE_PROJECT_ID,storageBucket:env.VITE_FIREBASE_STORAGE_BUCKET,messagingSenderId:env.VITE_FIREBASE_MESSAGING_SENDER_ID,appId:env.VITE_FIREBASE_APP_ID});
const db = getFirestore(app);
await signInAnonymously(getAuth(app));
const appId = env.VITE_APP_ID || 'visitor-soc-001';

const ref = doc(db, 'artifacts', appId, 'public', 'data', 'users', '01803');
const snap = await getDoc(ref);

if (!snap.exists()) {
  console.log('❌ ไม่พบ 01803 ในฐานข้อมูล');
} else {
  const data = snap.data();
  console.log('=== 01803 ปัจจุบัน ===');
  console.log(`  ชื่อ: ${data.name || data.displayName}`);
  console.log(`  แผนก: ${data.department}`);
  console.log(`  role: ${data.role}`);
  console.log(`  roleType: ${data.roleType}`);
  console.log(`  active: ${data.active}`);

  if (data.roleType !== 'HEAD' || data.role !== 'HOST') {
    console.log('\n⚠️ ยังไม่เป็น HEAD — กำลังตั้งค่าให้...');
    await setDoc(ref, { role: 'HOST', roleType: 'HEAD' }, { merge: true });
    console.log('✓ ตั้งเป็น HEAD เรียบร้อย!');
  } else {
    console.log('\n✓ เป็น HEAD แล้ว');
  }
}
process.exit(0);
