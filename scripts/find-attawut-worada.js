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

console.log('\n=== ค้นด้วย email "attawut" ===');
all.filter(u => (u.email || '').toLowerCase().includes('attawut'))
   .forEach(u => console.log(`  ${u.id}  ${u.fnameE} ${u.lnameE}  (${u.name || u.displayName})  ${u.email}  Lv.${u.approvalLevel}  ${u.role}/${u.roleType}`));

console.log('\n=== ค้นด้วย "ATTAWUT" ใน fnameE/name ===');
all.filter(u => /ATTAWUT|อรรถวุฒิ|อัตวุฒิ|อาทวุฒิ/i.test(`${u.fnameE} ${u.name} ${u.displayName} ${u.fnameT}`))
   .slice(0, 10)
   .forEach(u => console.log(`  ${u.id}  ${u.fnameE} ${u.lnameE}  (${u.name || u.displayName})  ${u.email}  Lv.${u.approvalLevel}`));

console.log('\n=== ค้นด้วย email "worada" ===');
all.filter(u => (u.email || '').toLowerCase().includes('worada'))
   .forEach(u => console.log(`  ${u.id}  ${u.fnameE} ${u.lnameE}  (${u.name || u.displayName})  ${u.email}  Lv.${u.approvalLevel}  ${u.role}/${u.roleType}`));

console.log('\n=== ค้นด้วย "WORADA" / "CHAMNANPUECH" ใน fnameE/name ===');
all.filter(u => /WORADA|CHAMNANPUECH|วรดา|ชำนาญ|จำนัน/i.test(`${u.fnameE} ${u.lnameE} ${u.name} ${u.displayName} ${u.fnameT} ${u.lnameT}`))
   .slice(0, 10)
   .forEach(u => console.log(`  ${u.id}  ${u.fnameE} ${u.lnameE}  (${u.name || u.displayName})  ${u.email}  Lv.${u.approvalLevel}`));

process.exit(0);
