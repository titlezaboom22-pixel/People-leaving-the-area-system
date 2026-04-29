// แสดงรายชื่อหัวหน้าแผนกในระบบ + แผนกที่ยังไม่มีหัวหน้า
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

const heads = [];      // role HOST + roleType HEAD
const hosts = [];      // role HOST
const departments = {};// dept -> { total, head: [], host: [] }

for (const d of snap.docs) {
  const u = { id: d.id, ...d.data() };
  const dept = u.department || '(ไม่ระบุ)';
  if (!departments[dept]) departments[dept] = { total: 0, heads: [], hosts: [], emails: 0 };
  departments[dept].total++;
  if (u.email && u.email.trim()) departments[dept].emails++;

  if (u.roleType === 'HEAD') {
    heads.push(u);
    departments[dept].heads.push(u);
  } else if (u.role === 'HOST') {
    hosts.push(u);
    departments[dept].hosts.push(u);
  }
}

console.log('\n========== หัวหน้าทั้งหมดในระบบ ==========');
console.log(`HEAD (roleType): ${heads.length} คน`);
console.log(`HOST (role): ${hosts.length} คน\n`);

console.log('========== แผนก/หัวหน้า ==========');
const sortedDepts = Object.entries(departments).sort((a, b) => b[1].total - a[1].total);
for (const [dept, info] of sortedDepts) {
  const headInfo = info.heads.length > 0
    ? `✓ ${info.heads.map(h => `${h.id} ${h.name || h.displayName || ''}`).join(', ')}`
    : info.hosts.length > 0
      ? `⚠ HOST แต่ยังไม่ใช่ HEAD: ${info.hosts.map(h => h.id).join(', ')}`
      : '❌ ยังไม่มีหัวหน้า!';
  console.log(`\n[${dept}] (${info.total} คน · มีอีเมล ${info.emails})`);
  console.log(`  หัวหน้า: ${headInfo}`);
}

process.exit(0);
