/**
 * One-off: add user SD553 (อรรถชัย กระแสร์ชล) สำหรับทดลองใช้ระบบ
 *
 * รัน: node scripts/add-user-sd553.js
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
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
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

async function hashPassword(plain) {
  const data = new TextEncoder().encode(plain);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function main() {
  const env = loadEnv();
  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  });
  const db = getFirestore(app);
  const auth = getAuth(app);
  await signInAnonymously(auth);
  const appId = env.VITE_APP_ID || 'visitor-soc-001';

  const user = {
    id: 'SD553',
    displayName: 'อรรถชัย กระแสร์ชล',
    role: 'EMPLOYEE',
    roleType: 'EMPLOYEE',
    department: 'SOC (ศูนย์ปฏิบัติการ)',
    email: 'intern_attachai.k@tbkk.co.th',
    active: true,
    passwordHash: await hashPassword('808450'),
  };

  await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', user.id), user);
  console.log(`✓ เพิ่ม ${user.id} (${user.displayName}) — รหัส 808450 — แผนก ${user.department}`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
