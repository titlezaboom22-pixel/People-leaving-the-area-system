/**
 * แก้ไขชื่อ "ทองจิต" → "ต้องจิต" ในทุก workflow record
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';
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

const collRef = collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows');
const snap = await getDocs(collRef);

let count = 0;
for (const d of snap.docs) {
  const data = d.data();
  const updates = {};
  // approvedBy
  if (data.approvedBy && data.approvedBy.includes('ทองจิต')) {
    updates.approvedBy = data.approvedBy.replace(/ทองจิต/g, 'ต้องจิต');
  }
  // requestPayload (nested)
  if (data.requestPayload) {
    const rpStr = JSON.stringify(data.requestPayload);
    if (rpStr.includes('ทองจิต')) {
      updates.requestPayload = JSON.parse(rpStr.replace(/ทองจิต/g, 'ต้องจิต'));
    }
  }

  if (Object.keys(updates).length > 0) {
    await updateDoc(doc(collRef, d.id), updates);
    console.log(`✓ แก้ ${d.id.slice(0, 16)}…  approvedBy: ${updates.approvedBy || '(no change)'}`);
    count++;
  }
}

// Also fix vehicle_bookings
const vbRef = collection(db, 'artifacts', appId, 'public', 'data', 'vehicle_bookings');
const vbSnap = await getDocs(vbRef);
for (const d of vbSnap.docs) {
  const data = d.data();
  const updates = {};
  if (data.driverName && data.driverName.includes('ทองจิต')) {
    updates.driverName = data.driverName.replace(/ทองจิต/g, 'ต้องจิต');
  }
  if (Object.keys(updates).length > 0) {
    await updateDoc(doc(vbRef, d.id), updates);
    console.log(`✓ แก้ vehicle_booking ${d.id.slice(0, 16)}…`);
    count++;
  }
}

console.log(`\n✅ แก้ไขทั้งหมด ${count} records`);
process.exit(0);
