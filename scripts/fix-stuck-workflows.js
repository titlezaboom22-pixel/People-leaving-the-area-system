import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
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

console.log('🧹 ลบ workflow เก่าที่ค้างทั้งหมด (จะได้เริ่มใหม่สด)...\n');
const wfs = (await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows'))).docs;
for (const d of wfs) {
  const w = d.data();
  console.log(`  ลบ [${d.id.slice(0,12)}] ${w.requesterId} dept="${w.department}"`);
  await deleteDoc(d.ref);
}
console.log(`\n✅ ลบ ${wfs.length} workflow แล้ว — พร้อมเริ่มทดสอบใหม่`);
process.exit(0);
