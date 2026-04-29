// ตั้ง 4 คนนี้เป็น GA Team (ดูแล Vehicle Booking)
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
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

const team = [
  { id: '01905', email: 'benjamas_k@tbkk.co.th',  name: 'เบญจมาศ แก้วมงคล' },
  { id: '01861', email: 'narongsak_p@tbkk.co.th', name: 'ณรงค์ศักดิ์ เพชรชนะ' },
  { id: '01583', email: 'chanachai_j@tbkk.co.th', name: 'ชนะชัย แจ่มชัยภูมิ' },
  { id: '00406', email: 'tongjit@tbkk.co.th',     name: 'ต้องจิต เจริญยิ่ง' },
];

for (const t of team) {
  const ref = doc(db, 'artifacts', appId, 'public', 'data', 'users', t.id);
  const existing = (await getDoc(ref)).data() || {};
  // Backup ของเดิม
  const updates = {
    role: 'GA',
    roleType: 'GA',
    department: 'GA',
    position: 'GA Officer (ดูแลรถ)',
    email: t.email,
    active: true,
    isVehicleGATeam: true,
    originalDepartment: existing.originalDepartment || existing.department || 'EMPLOYEE EXPERIENCE ENGAGEMENT',
    originalRole: existing.originalRole || existing.role || 'EMPLOYEE',
  };
  await setDoc(ref, updates, { merge: true });
  console.log(`✓ ${t.id}  ${t.name}  (${t.email})  → GA Team`);
}
console.log('\n=== GA Team พร้อมรับ Vehicle Booking ===');
console.log('Login รหัสเดิม (ถ้ารหัสผ่าน 1234 ไม่ได้ บอกผมจะ reset ให้)');
process.exit(0);
