import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
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

console.log('=== 1. SD553 department ===');
const sd = (await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', 'SD553'))).data();
console.log(`  department: "${sd.department}"`);

console.log('\n=== 2. หา approvers (Lv.4-5 HEAD ใน dept เดียวกัน) ===');
const usersSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
const approvers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  .filter(u => u.active !== false && u.roleType === 'HEAD' && [4, 5].includes(Number(u.approvalLevel)) && u.department === sd.department);
console.log(`  พบ ${approvers.length} คน:`);
approvers.forEach(u => console.log(`    ${u.id}  Lv.${u.approvalLevel}  ${u.name || u.displayName}  email=${u.email || '-'}`));

console.log('\n=== 3. Workflows ที่สร้างจาก SD553 ===');
const wfs = (await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows'))).docs
  .map(d => ({ _id: d.id, ...d.data() }))
  .filter(w => w.requesterId === 'SD553');
if (wfs.length === 0) console.log('  (ไม่มี workflow)');
wfs.forEach(w => console.log(`  [${w._id.slice(0,12)}] dept="${w.department}" status=${w.status} step=${w.step} sourceForm=${w.sourceForm}`));

console.log('\n=== 4. ตรวจ login_attempts ของ Benjamas/Mongkon (lockout?) ===');
for (const id of ['01905', '01941']) {
  const att = (await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'login_attempts', id))).data();
  console.log(`  ${id}: count=${att?.count || 0}  lockedUntil=${att?.lockedUntil || 'no lock'}`);
}

process.exit(0);
