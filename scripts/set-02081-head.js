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

async function hashPw(p) { const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p)); return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''); }

const before = (await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', '02081'))).data();
console.log('=== ก่อนแก้ ===');
console.log(`  ชื่อ: ${before?.name || before?.displayName}`);
console.log(`  แผนก: ${before?.department}`);
console.log(`  role: ${before?.role}/${before?.roleType}  Lv.${before?.approvalLevel}`);

await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', '02081'), {
  role: 'HOST',
  roleType: 'HEAD',
  approvalLevel: 5,  // ผู้จัดการฝ่าย
  position: 'ผู้จัดการฝ่าย (ทดสอบ)',
  department: 'EMPLOYEE EXPERIENCE ENGAGEMENT',
  passwordHash: await hashPw('1234'),
  active: true,
}, { merge: true });

const after = (await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', '02081'))).data();
console.log('\n=== หลังแก้ ===');
console.log(`  ชื่อ: ${after.name || after.displayName}`);
console.log(`  แผนก: ${after.department}`);
console.log(`  role: ${after.role}/${after.roleType}  Lv.${after.approvalLevel}`);
console.log(`  email: ${after.email || '-'}`);
console.log(`  password: 1234`);

// ปลด lockout
await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'login_attempts', '02081'), { count: 0, lockedUntil: null }, { merge: true });
console.log('  ✓ ปลด lockout');
process.exit(0);
