import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
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

console.log('=== สถานะ GA Team 4 คนปัจจุบัน ===\n');
const TEAM = [
  { id: '01905', email: 'benjamas_k@tbkk.co.th',  name: 'เบญจมาศ' },
  { id: '01861', email: 'narongsak_p@tbkk.co.th', name: 'ณรงค์ศักดิ์' },
  { id: '01583', email: 'chanachai_j@tbkk.co.th', name: 'ชนะชัย' },
  { id: '00406', email: 'tongjit@tbkk.co.th',     name: 'ต้องจิต' },
];
for (const t of TEAM) {
  const d = (await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', t.id))).data();
  console.log(`${t.id}  ${t.name.padEnd(15)}  role=${d?.role}/${d?.roleType}  dept="${d?.department}"  email=${d?.email}`);
}

console.log('\n=== Query ที่ระบบใช้: where dept="GA" AND role="GA" ===');
const usersSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
const gaMatches = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  .filter(u => u.department === 'GA' && u.role === 'GA' && u.email);
console.log(`พบ ${gaMatches.length} คน:`);
gaMatches.forEach(u => console.log(`  ${u.id}  ${u.name || u.displayName}  ${u.email}`));

console.log('\n=== แก้: ตั้ง 4 GA Team ให้ตรง spec (dept=GA, role=GA) ===');
for (const t of TEAM) {
  await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', t.id), {
    department: 'GA',
    role: 'GA',
    roleType: 'GA',
    email: t.email,
    isVehicleGATeam: true,
    active: true,
  }, { merge: true });
  console.log(`  ✓ ${t.id} ${t.name} → dept=GA, role=GA`);
}

// Verify ใหม่
console.log('\n=== Verify ใหม่ ===');
const after = (await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'))).docs
  .map(d => ({ id: d.id, ...d.data() }))
  .filter(u => u.department === 'GA' && u.role === 'GA' && u.email);
console.log(`Query "dept=GA AND role=GA" พบ ${after.length} คน:`);
after.forEach(u => console.log(`  ${u.id}  ${u.name || u.displayName}  ${u.email}`));

process.exit(0);
