/**
 * Seed script: สร้างข้อมูลคนขับรถ (drivers) ลง Firestore
 *
 * วิธีใช้:
 *   1. ตั้งค่า .env ให้ถูกต้องก่อน
 *   2. รัน: node scripts/seed-drivers.js
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
    console.error('ไม่พบไฟล์ .env กรุณาสร้างจาก .env.example ก่อน');
    process.exit(1);
  }
}

// ข้อมูลคนขับ — เปลี่ยนเป็นข้อมูลจริงได้ที่ Admin หรือแก้ไฟล์นี้
// phone = เบอร์หลัก, phoneBackup = เบอร์สำรอง (เผื่อติดต่อไม่ได้)
const drivers = [
  { id: 'DRV001', name: 'สมชาย ใจดี',     phone: '081-234-5678', phoneBackup: '02-111-2222', licenseType: 'ท2', status: 'available' },
  { id: 'DRV002', name: 'สมปอง มีสุข',    phone: '082-345-6789', phoneBackup: '02-111-2233', licenseType: 'ท2', status: 'available' },
  { id: 'DRV003', name: 'วิชัย ขยันขัน',  phone: '083-456-7890', phoneBackup: '02-111-2244', licenseType: 'ท3', status: 'available' },
  { id: 'DRV004', name: 'ประยุทธ์ สุขสันต์', phone: '084-567-8901', phoneBackup: '02-111-2255', licenseType: 'ท2', status: 'available' },
  { id: 'DRV005', name: 'อนุชา รักการงาน', phone: '085-678-9012', phoneBackup: '02-111-2266', licenseType: 'ท2', status: 'available' },
];

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

  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'your-api-key') {
    console.error('กรุณาตั้งค่า Firebase config ใน .env ก่อน');
    process.exit(1);
  }

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const authInstance = getAuth(app);
  await signInAnonymously(authInstance);
  console.log('✓ Login anonymous สำเร็จ');

  console.log('กำลัง seed drivers ลง Firestore...');
  console.log(`App ID: ${appIdValue}`);
  console.log(`จำนวนคนขับ: ${drivers.length}`);
  console.log('');

  for (const driver of drivers) {
    const docRef = doc(db, 'artifacts', appIdValue, 'public', 'data', 'drivers', driver.id);
    await setDoc(docRef, {
      ...driver,
      createdAt: Timestamp.now(),
    });
    console.log(`  ✓ ${driver.id} - ${driver.name} (${driver.phone}) [${driver.status}]`);
  }

  console.log('');
  console.log(`Seed เสร็จ! (${drivers.length} drivers)`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
