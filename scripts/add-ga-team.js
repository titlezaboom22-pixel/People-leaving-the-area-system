/**
 * เพิ่มทีม GA 4 คน — อีเมลทุกคนจะได้ทุกครั้งที่ workflow ส่งหา GA
 *   รัน: node scripts/add-ga-team.js
 *
 * ระบบ notifyEmail.js จะดึง users ทั้งหมดที่ role='GA' department='GA'
 * → ส่งเมลให้ทุกคน โดยไม่ต้องแก้โค้ดเพิ่ม
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const env = {};
  for (const line of readFileSync(resolve(__dirname, '..', '.env'), 'utf-8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

async function hashPassword(plain) {
  const data = new TextEncoder().encode(plain);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const env = loadEnv();
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
});
const db = getFirestore(app);
await signInAnonymously(getAuth(app));
const appId = env.VITE_APP_ID || 'visitor-soc-001';

const gaTeam = [
  { id: 'GA002', displayName: 'Tongjit', email: 'tongjit@tbkk.co.th' },
  { id: 'GA003', displayName: 'Chanachai', email: 'chanachai_j@tbkk.co.th' },
  { id: 'GA004', displayName: 'Benjamas', email: 'benjamas_k@tbkk.co.th' },
  { id: 'GA005', displayName: 'Narongsak', email: 'narongsak_p@tbkk.co.th' },
];

const passwordHash = await hashPassword('1234');

for (const u of gaTeam) {
  await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', u.id), {
    id: u.id,
    displayName: u.displayName,
    role: 'GA',
    roleType: 'GA',
    department: 'GA',
    email: u.email,
    active: true,
    status: 'available',
    passwordHash,
  });
  console.log(`  ✓ ${u.id} ${u.displayName} — ${u.email}`);
}
console.log(`\nเพิ่มทีม GA ${gaTeam.length} คน เรียบร้อย (รหัส 1234 ทุกคน)`);
process.exit(0);
