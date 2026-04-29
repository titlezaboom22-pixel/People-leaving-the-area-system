import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { readFileSync } from 'fs';

const env = {};
for (const line of readFileSync('.env', 'utf-8').split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('='); if (i === -1) continue;
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
const app = initializeApp({ apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET, messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID });
const db = getFirestore(app);
await signInAnonymously(getAuth(app));
const appId = env.VITE_APP_ID || 'visitor-soc-001';

const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
const ga = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.department === 'GA');

console.log('\n=== GA Team ===\n');
for (const u of ga) {
  console.log(`${u.id}  ${u.name}`);
  console.log(`   Email: ${u.email}`);
  console.log(`   Role: ${u.role}/${u.roleType}`);
  console.log(`   Active: ${u.active !== false}`);
  console.log(`   Has Password: ${!!u.passwordHash || !!u.password}`);
  console.log('');
}
process.exit(0);
