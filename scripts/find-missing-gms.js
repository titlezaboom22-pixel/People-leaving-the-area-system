import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
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
const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
const allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));

const search = (terms) => {
  const norm = s => (s || '').toUpperCase();
  return allUsers.filter(u => {
    const all = norm(`${u.fnameE || ''} ${u.lnameE || ''} ${u.name || ''} ${u.displayName || ''} ${u.fnameT || ''} ${u.lnameT || ''}`);
    return terms.some(t => all.includes(norm(t)));
  });
};

console.log('\n=== ATTAWUT LEEWUTTINAN ===');
const t1 = search(['ATTAWUT', 'LEEWUTTINAN', 'อรรถวุฒิ', 'ลีวุฒิ', 'อัตวุฒิ']);
t1.slice(0, 8).forEach(u => console.log(`  ${u.id}  ${u.fnameE} ${u.lnameE} (${u.name || u.displayName})  Lv.${u.approvalLevel}  ${u.department}`));

console.log('\n=== WORADA CHAMNANPUECI ===');
const t2 = search(['WORADA', 'CHAMNAN', 'วรดา', 'จำนรรจ์', 'จำนัน']);
t2.slice(0, 8).forEach(u => console.log(`  ${u.id}  ${u.fnameE} ${u.lnameE} (${u.name || u.displayName})  Lv.${u.approvalLevel}  ${u.department}`));

console.log('\n=== KUNAKONTHA (เช็คว่า NATTAPONG ที่จับคู่ถูกไหม) ===');
const t3 = search(['KUNAKONTHA', 'NATTAPONG', 'กุนาคน', 'คนธา', 'ณัฐพงษ์', 'ณัฐพงศ์']);
t3.slice(0, 12).forEach(u => console.log(`  ${u.id}  ${u.fnameE} ${u.lnameE} (${u.name || u.displayName})  role=${u.role} Lv.${u.approvalLevel}  ${u.department}`));

process.exit(0);
