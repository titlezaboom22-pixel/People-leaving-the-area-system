/**
 * Seed script: สร้างข้อมูล vehicles ลง Firestore
 *
 * วิธีใช้:
 *   1. ตั้งค่า .env ให้ถูกต้องก่อน
 *   2. รัน: node scripts/seed-vehicles.js
 *
 * หมายเหตุ: ใช้ Firebase client SDK (ไม่ใช่ Admin SDK)
 *   ต้องเปิด Firestore rules ให้ write ได้ก่อนรัน
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, Timestamp } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read .env file manually (no dotenv dependency)
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

const vehicles = [
  { id: 'V001', plate: 'ขพ-7100', brand: 'ISUZU', type: 'รถกระบะ', color: '-', seats: 5, status: 'available' },
  { id: 'V002', plate: 'กพ-8060', brand: 'ISUZU', type: 'รถกระบะ', color: '-', seats: 5, status: 'available' },
  { id: 'V003', plate: 'กพ-2272', brand: 'MITSUBISHI', type: 'รถกระบะ', color: '-', seats: 5, status: 'available' },
  { id: 'V004', plate: 'ผจ-2452', brand: 'MITSUBISHI', type: 'รถกระบะ', color: '-', seats: 5, status: 'available' },
  { id: 'V005', plate: 'ถย-4625', brand: 'MITSUBISHI', type: 'รถกระบะ', color: '-', seats: 5, status: 'available' },
  { id: 'V006', plate: '9กธ-4153', brand: 'MITSUBISHI Xpander', type: 'MPV', color: '-', seats: 7, status: 'available' },
  { id: 'V007', plate: 'เมจ-3102', brand: 'TOYOTA VAN', type: 'รถตู้', color: '-', seats: 12, status: 'available' },
  { id: 'V008', plate: 'เมจ-6388', brand: 'TOYOTA VAN', type: 'รถตู้', color: '-', seats: 12, status: 'available' },
  { id: 'V009', plate: 'ขม-3748', brand: 'ISUZU MU-X', type: 'SUV', color: '-', seats: 7, status: 'available' },
  { id: 'V010', plate: 'รอใส่ทะเบียน', brand: 'BYD EV', type: 'รถยนต์ไฟฟ้า', color: '-', seats: 5, status: 'available' },
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

  console.log('กำลัง seed vehicles ลง Firestore...');
  console.log(`App ID: ${appIdValue}`);
  console.log(`Project: ${firebaseConfig.projectId}`);
  console.log(`จำนวนรายการ: ${vehicles.length}`);
  console.log('');

  for (const vehicle of vehicles) {
    const docRef = doc(db, 'artifacts', appIdValue, 'public', 'data', 'vehicles', vehicle.id);
    await setDoc(docRef, {
      ...vehicle,
      createdAt: Timestamp.now(),
    });
    const statusText = vehicle.status === 'available' ? 'ว่าง' : vehicle.status === 'maintenance' ? 'ซ่อม' : 'ไม่พร้อมใช้';
    console.log(`  ✓ ${vehicle.id} - ${vehicle.plate} (${vehicle.brand}) [${statusText}]`);
  }

  console.log('');
  console.log(`Seed เสร็จ! (${vehicles.length} vehicles)`);
  console.log('');
  console.log('สถานะรถ:');
  console.log('  V001-V010: available (ว่าง)');

  process.exit(0);
}

main().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
