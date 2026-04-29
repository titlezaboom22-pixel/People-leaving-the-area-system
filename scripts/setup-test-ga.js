// สร้าง/อัปเดต GA Team 5 คน + ตั้งรหัสผ่าน 1234
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

async function hashPassword(plain) {
  const data = new TextEncoder().encode(plain);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const pw = await hashPassword('1234');

const team = [
  { id: 'GA001', name: 'GA สมชาย (เจ้าหน้าที่ GA หลัก)', email: 'ga001@tbkk.co.th' },
  { id: 'GA002', name: 'GA สมหญิง', email: 'ga002@tbkk.co.th' },
  { id: 'GA003', name: 'GA วิภา', email: 'ga003@tbkk.co.th' },
  { id: 'GA004', name: 'GA ประพันธ์', email: 'ga004@tbkk.co.th' },
  { id: 'GA005', name: 'GA สุดา', email: 'ga005@tbkk.co.th' },
];

for (const t of team) {
  const ref = doc(db, 'artifacts', appId, 'public', 'data', 'users', t.id);
  const snap = await getDoc(ref);
  const data = {
    name: t.name,
    displayName: t.name,
    email: t.email,
    department: 'GA',
    role: 'GA',
    roleType: 'GA',
    approvalLevel: 5,  // ให้ approve ได้
    company: 'TBKK',
    position: 'GA Officer',
    active: true,
  };
  if (!snap.exists()) {
    data.passwordHash = pw;
    data.createdAt = new Date();
  }
  await setDoc(ref, data, { merge: true });
  console.log(`✓ ${t.id} ${t.name}`);
}
console.log('\nรหัสผ่านทุก GA: 1234');
process.exit(0);
