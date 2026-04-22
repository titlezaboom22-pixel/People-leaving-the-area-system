import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
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

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
});
const db = getFirestore(app);
await signInAnonymously(getAuth(app));
const appId = env.VITE_APP_ID || 'visitor-soc-001';

const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows'));
const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  .sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
console.log(`Total workflows: ${items.length}\n`);
for (const w of items.slice(0, 10)) {
  console.log(`[${w.id}]`);
  console.log(`  sourceForm: ${w.sourceForm}`);
  console.log(`  step ${w.step}/${w.totalSteps} | status: ${w.status}`);
  console.log(`  requester: ${w.requesterId} / ${w.requesterName} (${w.requesterDepartment})`);
  console.log(`  target: ${w.targetType || w.department} — ${w.topic}`);
  console.log(`  createdAt: ${w.createdAt}`);
  console.log('');
}
process.exit(0);
