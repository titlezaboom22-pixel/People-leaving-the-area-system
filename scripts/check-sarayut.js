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

const s = (await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', '02081'))).data();
console.log('=== ศรายุทธ (02081) สถานะปัจจุบัน ===');
console.log(`  ชื่อ: ${s.name || s.displayName}`);
console.log(`  แผนก: "${s.department}"`);
console.log(`  role: ${s.role}/${s.roleType}  Lv.${s.approvalLevel}`);
console.log(`  email: ${s.email}`);
console.log(`  active: ${s.active}`);

// ปลด lockout
await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'login_attempts', '02081'), { count: 0, lockedUntil: null }, { merge: true });
console.log('  ✓ ปลด lockout');

// reset password 1234
async function hashPw(p) { const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p)); return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''); }
await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', '02081'), { passwordHash: await hashPw('1234') }, { merge: true });
console.log('  ✓ password = 1234');

// ตรวจ pending workflows ที่ Sarayut ควรเห็น
const norm = (str) => (str || '').toString().trim().toUpperCase().split(' ')[0].replace(/[^A-Z]/g, '');
const target = norm(s.department);
const wfs = (await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows'))).docs.map(d => ({ ...d.data() }));
const pending = wfs.filter(w => w.status === 'pending' && norm(w.department) === target);
console.log(`\n=== Pending ที่ Sarayut ควรเห็น: ${pending.length} ใบ ===`);
pending.forEach(w => console.log(`  ✓ [${(w.id || '').slice(0,12)}]  จาก ${w.requesterName} (${w.requesterId})  step=${w.step}`));
process.exit(0);
