// ดูตัวอย่าง users ของ STU_K และ STM
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
const stu = [], stm = [];
for (const d of snap.docs) {
  const c = d.data().company;
  const data = d.data();
  if (c === 'STU_K') stu.push({ id: d.id, name: data.name || data.displayName, dept: data.department, role: data.role });
  else if (c === 'STM') stm.push({ id: d.id, name: data.name || data.displayName, dept: data.department, role: data.role });
}

console.log(`\n=== STU_K (${stu.length} คน) — 10 ตัวอย่างแรก ===`);
stu.slice(0, 10).forEach(u => console.log(`  ${u.id} | ${u.name} | dept: ${u.dept} | role: ${u.role}`));

console.log(`\n=== STM (${stm.length} คน) — 10 ตัวอย่างแรก ===`);
stm.slice(0, 10).forEach(u => console.log(`  ${u.id} | ${u.name} | dept: ${u.dept} | role: ${u.role}`));

// Prefix breakdown
const stuPrefix = {};
const stmPrefix = {};
stu.forEach(u => { const p = u.id.match(/^[A-Z]+/)?.[0] || u.id[0]; stuPrefix[p] = (stuPrefix[p] || 0) + 1; });
stm.forEach(u => { const p = u.id.match(/^[A-Z]+/)?.[0] || u.id[0]; stmPrefix[p] = (stmPrefix[p] || 0) + 1; });

console.log(`\n=== STU_K prefix breakdown ===`);
Object.entries(stuPrefix).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k}: ${v}`));
console.log(`\n=== STM prefix breakdown ===`);
Object.entries(stmPrefix).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k}: ${v}`));

process.exit(0);
