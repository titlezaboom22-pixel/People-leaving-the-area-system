import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
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

// แสดง chain ทั้งหมดของ workflow ที่มี approvedBy = "-"
const wfSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows'));
const stuck = wfSnap.docs.filter(d => {
  const w = d.data();
  return w.status === 'approved' && (!w.approvedBy || w.approvedBy === '-');
});

console.log(`\n=== Stuck docs: ${stuck.length} ===`);
for (const d of stuck) {
  const w = d.data();
  console.log(`\n--- ${d.id} ---`);
  console.log(`  step: ${w.step}, stepLabel: ${w.stepLabel}, sourceForm: ${w.sourceForm}`);
  console.log(`  topic: ${w.topic}`);
  console.log(`  recipientEmails: ${JSON.stringify(w.recipientEmails)}`);
  console.log(`  recipientEmail: ${w.recipientEmail}`);
  console.log(`  approverEmail: ${w.approverEmail}`);
  console.log(`  approvedBy: "${w.approvedBy}"`);
  console.log(`  acknowledgedAt: ${w.acknowledgedAt}`);
  console.log(`  chainId: ${w.chainId}`);
  // ดู chain
  if (w.chainId) {
    const chainSnap = await getDocs(query(collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows'), where('chainId', '==', w.chainId)));
    console.log(`  chain steps:`);
    chainSnap.docs.map(d2 => d2.data()).sort((a, b) => (a.step || 0) - (b.step || 0)).forEach(s => {
      console.log(`    step ${s.step} (${s.stepLabel}) | status=${s.status} | approvedBy="${s.approvedBy || '(empty)'}" | recipientEmails=${JSON.stringify(s.recipientEmails)}`);
    });
  }
}

process.exit(0);
