import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
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
const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', '02007'));
const d = snap.data();
console.log(`ID: 02007`);
console.log(`ชื่อ: ${d.name || d.displayName}`);
console.log(`EN: ${d.fnameE} ${d.lnameE}`);
console.log(`แผนก: ${d.department}`);
console.log(`role: ${d.role}`);
console.log(`roleType: ${d.roleType}`);
console.log(`approvalLevel: ${d.approvalLevel}`);
console.log(`email: ${d.email}`);
process.exit(0);
