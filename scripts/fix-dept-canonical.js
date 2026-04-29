import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
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

const TARGET = 'EMPLOYEE EXPERIENCE ENGAGEMENT';

console.log('=== ปรับ dept ทุกคนให้ตรงกัน ===\n');

// 1) SD553
await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', 'SD553'), { department: TARGET }, { merge: true });
console.log(`✓ SD553 → ${TARGET}`);

// 2) Benjamas + Mongkon (อาจจะ revert มาเป็น EMPLOYEE EXPERIENCE ENGAGEMENT)
for (const id of ['01905', '01941']) {
  await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', id), { department: TARGET }, { merge: true });
  console.log(`✓ ${id} → ${TARGET}`);
}

// 3) แก้ workflows ที่มี dept เก่าให้ตรงด้วย
console.log('\n=== แก้ workflows ที่ค้างอยู่ ===');
const wfs = (await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows'))).docs;
let fixed = 0;
for (const d of wfs) {
  const w = d.data();
  if (w.requesterId === 'SD553' && w.department !== TARGET) {
    await setDoc(d.ref, { department: TARGET, requesterDepartment: TARGET }, { merge: true });
    fixed++;
    console.log(`  ✓ Fix workflow [${d.id.slice(0,12)}] → ${TARGET}`);
  }
}
console.log(`  รวม: ${fixed} workflow`);

// 4) Verify
console.log('\n=== Verify ===');
for (const id of ['SD553', '01905', '01941']) {
  const d = (await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', id))).data();
  console.log(`  ${id}: "${d.department}" ${d.department === TARGET ? '✓' : '❌'}`);
}
process.exit(0);
