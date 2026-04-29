import { initializeApp } from 'firebase/app';
import { getFirestore, doc, deleteDoc, collection, getDocs } from 'firebase/firestore';
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

// ลบ GA001 (fake test user)
await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', 'GA001'));
console.log('✗ ลบ GA001 (fake account)');

// ลบ workflow ค้างทั้งหมด
const wfs = (await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows'))).docs;
for (const d of wfs) await deleteDoc(d.ref);
console.log(`✗ ลบ workflow ค้าง ${wfs.length} ใบ`);

// Verify GA Team
console.log('\n=== Final GA Team ===');
const all = (await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'))).docs.map(d => ({ id: d.id, ...d.data() }));
const ga = all.filter(u => u.department === 'GA' && u.role === 'GA' && u.email);
ga.forEach(u => console.log(`  ${u.id}  ${u.name || u.displayName}  ${u.email}`));

console.log('\n=== EEE Approvers (Lv.4-5 HEAD) ===');
const approvers = all.filter(u => u.department === 'EMPLOYEE EXPERIENCE ENGAGEMENT' && u.roleType === 'HEAD' && [4,5].includes(Number(u.approvalLevel)));
approvers.forEach(u => console.log(`  ${u.id}  Lv.${u.approvalLevel}  ${u.name || u.displayName}  ${u.email || '-'}`));

process.exit(0);
