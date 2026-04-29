/**
 * อัปเดตทะเบียนรถ BYD EV → "6ขศ1703"
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
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

const vRef = collection(db, 'artifacts', appId, 'public', 'data', 'vehicles');
const snap = await getDocs(vRef);
const all = snap.docs.map(d => ({ _docId: d.id, ...d.data() }));

console.log('\n📋 รายการรถในระบบ:\n');
for (const v of all) {
  console.log(`  ${(v.id || v._docId).padEnd(10)} ${(v.brand || '-').padEnd(20)} ${(v.model || '').padEnd(15)} ทะเบียน: "${v.plate || '(ว่าง)'}"`);
}

// หา BYD
const byd = all.find(v => (v.brand || '').toUpperCase().includes('BYD'));
if (!byd) {
  console.log('\n❌ ไม่พบรถ BYD ในระบบ');
  process.exit(1);
}

console.log(`\n🎯 พบ BYD:  ${byd._docId}  ${byd.brand} ${byd.model || ''}`);
console.log(`   ทะเบียนเดิม: "${byd.plate || '(ว่าง)'}"`);
console.log(`   ทะเบียนใหม่: "6ขศ1703"`);

await updateDoc(doc(vRef, byd._docId), {
  plate: '6ขศ1703',
  updatedAt: new Date().toISOString(),
});

console.log('\n✅ อัปเดตทะเบียน BYD สำเร็จ!\n');
process.exit(0);
