/**
 * Quick seed: เพิ่ม GA001 user ลง Firestore
 * รัน: node scripts/seed-ga-user.js
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, Timestamp } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const envPath = resolve(__dirname, '..', '.env');
    const content = readFileSync(envPath, 'utf-8');
    const env = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
    return env;
  } catch {
    console.error('ไม่พบไฟล์ .env');
    process.exit(1);
  }
}

async function hashPassword(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function main() {
  const env = loadEnv();
  const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
  const appIdValue = env.VITE_APP_ID || 'visitor-soc-001';

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const authInstance = getAuth(app);
  await signInAnonymously(authInstance);
  console.log('✓ Login anonymous สำเร็จ');

  const passwordHash = await hashPassword('1234');

  const docRef = doc(db, 'artifacts', appIdValue, 'public', 'data', 'users', 'GA001');
  await setDoc(docRef, {
    id: 'GA001',
    displayName: 'เจ้าหน้าที่ GA',
    role: 'GA',
    roleType: 'GA',
    department: 'GA',
    email: 'intern_attachai.k@tbkk.co.th',
    passwordHash,
    active: true,
    createdAt: Timestamp.now(),
  });

  console.log('✓ เพิ่ม GA001 สำเร็จ (password: 1234)');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
