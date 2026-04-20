/**
 * รีเซ็ตรหัสผ่านของ user คนเดียว
 * ใช้: node scripts/reset-password.js <STAFF_ID> <NEW_PASSWORD>
 * เช่น: node scripts/reset-password.js SEC001 sec1234
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = resolve(__dirname, '..', '.env');
  const content = readFileSync(envPath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
  return env;
}

async function hashPassword(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function main() {
  const [, , staffIdArg, newPwArg] = process.argv;
  if (!staffIdArg || !newPwArg) {
    console.error('ใช้: node scripts/reset-password.js <STAFF_ID> <NEW_PASSWORD>');
    process.exit(1);
  }

  const staffId = staffIdArg.trim().toUpperCase();
  const newPw = newPwArg;

  const env = loadEnv();
  const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
  const appIdValue = env.VITE_APP_ID || 'visitor-soc-001';

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const auth = getAuth(app);
  await signInAnonymously(auth);

  const userRef = doc(db, 'artifacts', appIdValue, 'public', 'data', 'users', staffId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    console.error(`ไม่พบ user: ${staffId}`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(newPw);
  await setDoc(userRef, { passwordHash }, { merge: true });

  // ล้าง lockout ด้วย
  const attemptRef = doc(db, 'artifacts', appIdValue, 'public', 'data', 'login_attempts', staffId);
  await setDoc(attemptRef, { count: 0, lockedUntil: null });

  console.log(`✓ รีเซ็ตรหัสผ่านของ ${staffId} เป็น "${newPw}" เรียบร้อย`);
  console.log(`✓ ล้าง lockout ของ ${staffId} แล้ว`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
