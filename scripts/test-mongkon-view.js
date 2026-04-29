import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
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

// จำลอง Mongkon login
const m = (await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', '01941'))).data();
console.log('=== Mongkon (01941) ที่ login ===');
console.log(`  ชื่อ: ${m.name || m.displayName}`);
console.log(`  แผนก: "${m.department}"`);
console.log(`  role: ${m.role}/${m.roleType}  Lv.${m.approvalLevel}`);

// ทำเหมือน getPendingNotificationsByDepartment
const norm = (s) => (s || '').toString().trim().toUpperCase().split(' ')[0].replace(/[^A-Z]/g, '');
const target = norm(m.department);
console.log(`\n  normalized dept: "${target}"`);

const wfSnap = await getDocs(query(collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows'), where('status', '==', 'pending')));
const allPending = wfSnap.docs.map(d => ({ ...d.data() }));
console.log(`\n=== Pending workflows ทั้งหมด (status=pending): ${allPending.length} ===`);
allPending.forEach(w => {
  const wNorm = norm(w.department);
  const match = wNorm === target;
  console.log(`  [${(w.id || '').slice(0,12)}]  dept="${w.department}"  norm="${wNorm}"  match=${match ? '✓' : '❌'}  step=${w.step}`);
});

const filtered = allPending.filter(w => norm(w.department) === target);
console.log(`\n=== Mongkon ควรเห็น ${filtered.length} ใบ ===`);
if (filtered.length === 0) {
  console.log('❌ ปัญหา: ไม่มีใบที่ dept ตรง');
} else {
  filtered.forEach(w => console.log(`  ✓ [${(w.id || '').slice(0,12)}] จาก ${w.requesterName || w.requesterId}`));
}
process.exit(0);
