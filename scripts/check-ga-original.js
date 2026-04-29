/**
 * ตรวจ GA team 4 คน — ดูว่าจริงๆ อยู่แผนกไหน (originalDepartment)
 */
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
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
});
const db = getFirestore(app);
await signInAnonymously(getAuth(app));
const appId = env.VITE_APP_ID || 'visitor-soc-001';

const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

const gaTeam = all.filter(u => u.department === 'GA' && (u.role === 'GA' || u.roleType === 'GA'));

console.log('\n📋 GA Team — ปัจจุบัน 4 คน\n');
for (const u of gaTeam) {
  console.log(`${u.id}  ${u.name || u.displayName}`);
  console.log(`  • แผนกปัจจุบัน:    ${u.department}`);
  console.log(`  • แผนกจริง (HR):   ${u.originalDepartment || '(ไม่มีข้อมูล)'}`);
  console.log(`  • ตำแหน่ง:        ${u.position || '-'}`);
  console.log(`  • Lv.:           ${u.approvalLevel || '-'}`);
  console.log(`  • role:          ${u.role}`);
  console.log(`  • roleType:      ${u.roleType}`);
  console.log(`  • Email:         ${u.email}`);
  console.log('');
}

process.exit(0);
