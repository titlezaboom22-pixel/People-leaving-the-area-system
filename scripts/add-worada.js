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

async function hashPassword(plain) {
  const data = new TextEncoder().encode(plain);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const ref = doc(db, 'artifacts', appId, 'public', 'data', 'users', '00309');
const snap = await getDoc(ref);

const data = {
  fnameE: 'WORADA',
  lnameE: 'CHAMNANPUECH',
  displayNameEn: 'WORADA CHAMNANPUECH',
  name: 'วรดา ชำนาญพืช',
  displayName: 'วรดา ชำนาญพืช',
  email: 'worada@tbkk.co.th',
  department: 'EXECUTIVE',
  role: 'HOST',
  roleType: 'HEAD',
  approvalLevel: 2,  // Director
  approvalLevelSetBy: 'admin-script-2026',
  active: true,
  company: 'TBKK',
  position: 'DIRECTOR',
};

if (!snap.exists()) {
  data.passwordHash = await hashPassword('1234');
  data.createdAt = new Date();
  console.log('สร้าง user ใหม่ 00309...');
} else {
  const existing = snap.data();
  console.log('พบ 00309 แล้ว — ปัจจุบัน:', existing.name || existing.displayName);
}

await setDoc(ref, data, { merge: true });
const verify = (await getDoc(ref)).data();
console.log('\n✓ เรียบร้อย — 00309 WORADA CHAMNANPUECH');
console.log(`  ชื่อ: ${verify.name}`);
console.log(`  แผนก: ${verify.department}`);
console.log(`  ตำแหน่ง: ${verify.position}`);
console.log(`  Email: ${verify.email}`);
console.log(`  Role: ${verify.role} / ${verify.roleType}`);
console.log(`  Lv: ${verify.approvalLevel} (Director)`);
console.log(`  รหัสผ่าน: 1234`);
process.exit(0);
