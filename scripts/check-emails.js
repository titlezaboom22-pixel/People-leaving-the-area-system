// ตรวจสถิติ email ใน users collection
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

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
});
const db = getFirestore(app);
await signInAnonymously(getAuth(app));
const appId = env.VITE_APP_ID || 'visitor-soc-001';

const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'));

let withEmail = 0, withoutEmail = 0;
const byCompany = {};
const samples = [];

for (const d of snap.docs) {
  const data = d.data();
  const c = data.company || '(empty)';
  if (!byCompany[c]) byCompany[c] = { with: 0, without: 0 };
  if (data.email && data.email.trim()) {
    withEmail++;
    byCompany[c].with++;
    if (samples.length < 8) samples.push({ id: d.id, name: data.name || data.displayName, email: data.email });
  } else {
    withoutEmail++;
    byCompany[c].without++;
  }
}

console.log(`\n=== Email Stats — Total ${snap.docs.length} users ===`);
console.log(`  มีอีเมล:    ${withEmail}`);
console.log(`  ไม่มีอีเมล: ${withoutEmail}`);

console.log(`\n=== แยกตามบริษัท ===`);
Object.entries(byCompany).forEach(([c, v]) => {
  console.log(`  ${c.padEnd(15)} มีอีเมล ${v.with}/${v.with + v.without} (ไม่มี ${v.without})`);
});

console.log(`\n=== ตัวอย่างคนที่มี email ===`);
samples.forEach(s => console.log(`  ${s.id} | ${s.name} | ${s.email}`));

process.exit(0);
