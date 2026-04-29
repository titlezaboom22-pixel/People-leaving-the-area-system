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
const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

const emails = ['benjamas_k', 'narongsak_p', 'chanachai_j', 'tongjit'];
console.log('\n=== ค้นทั้ง 4 emails ===');
for (const em of emails) {
  console.log(`\n--- ${em}@tbkk.co.th ---`);
  const matches = all.filter(u => (u.email || '').toLowerCase().includes(em.toLowerCase()));
  if (matches.length === 0) {
    console.log('  ❌ ไม่พบ');
  } else {
    matches.forEach(m => console.log(`  ✓ ${m.id}  ${m.fnameE} ${m.lnameE} (${m.name || m.displayName})  role=${m.role}/${m.roleType}  Lv.${m.approvalLevel}  | ${m.department}`));
  }
}
process.exit(0);
