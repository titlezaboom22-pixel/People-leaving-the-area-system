/**
 * แก้ไข OUTING_REQUEST ที่ department ผิด → ย้ายมา EEE
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const content = readFileSync(resolve(__dirname, '..', '.env'), 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  });
  const db = getFirestore(app);
  const auth = getAuth(app);
  await signInAnonymously(auth);

  const appId = env.VITE_APP_ID || 'visitor-soc-001';
  const collRef = collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows');

  // Fix OUTING_REQUEST with wrong department
  const q = query(collRef, where('sourceForm', '==', 'OUTING_REQUEST'));
  const snap = await getDocs(q);

  const TARGET_DEPT = 'EEE (วิศวกรรมไฟฟ้า)';
  let fixed = 0;

  for (const d of snap.docs) {
    const data = d.data();
    const dept = data.department || '';
    const reqDept = data.requesterDepartment || '';

    // Fix documents with wrong/empty department
    if (dept !== TARGET_DEPT || reqDept !== TARGET_DEPT) {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'approval_workflows', d.id);
      await updateDoc(docRef, {
        department: data.status === 'pending' && data.step === 1 ? TARGET_DEPT : dept,
        requesterDepartment: TARGET_DEPT,
      });
      fixed++;
      console.log(`  ✓ Fixed: ${d.id} (step ${data.step}, status: ${data.status}, dept: "${dept}" → "${TARGET_DEPT}")`);
    }
  }

  console.log(`\nDone! Fixed ${fixed}/${snap.docs.length} OUTING_REQUEST documents`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
