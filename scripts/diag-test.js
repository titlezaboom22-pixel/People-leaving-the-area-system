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

console.log('=== ตรวจ depart ของ user ===\n');
const ids = ['SD553', '01905', '01941'];
for (const id of ids) {
  const d = (await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', id))).data();
  console.log(`  ${id}: "${d?.department}"`);
}

console.log('\n=== ตรวจ approval_workflows ที่มีอยู่ ===');
const wfs = (await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows'))).docs;
wfs.forEach(d => {
  const w = d.data();
  console.log(`  [${d.id.slice(0,12)}] requester=${w.requesterId} dept="${w.department}" status=${w.status} step=${w.step}`);
});

console.log('\n=== แก้: ตั้ง Benjamas + Mongkon ให้ dept ตรงกับ SD553 ===');
const sd = (await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', 'SD553'))).data();
const targetDept = sd.department;
console.log(`  Target: "${targetDept}"`);
for (const id of ['01905', '01941']) {
  await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', id), { department: targetDept }, { merge: true });
  console.log(`  ✓ ${id} → ${targetDept}`);
}

console.log('\n=== แก้ workflows ที่มี dept ผิด ===');
let fixed = 0;
for (const d of wfs) {
  const w = d.data();
  if (w.requesterId === 'SD553' && w.department !== targetDept) {
    await setDoc(d.ref, { department: targetDept, requesterDepartment: targetDept }, { merge: true });
    fixed++;
    console.log(`  ✓ Fixed workflow ${d.id.slice(0,12)} → dept = "${targetDept}"`);
  }
}
console.log(`  รวม fix: ${fixed} workflow`);

process.exit(0);
