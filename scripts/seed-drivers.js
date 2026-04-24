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

async function hashPassword(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

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

// ข้อมูลคนขับจริง TBKK — 10 คน (ทีมรถส่วนกลาง)
// phone = เบอร์โทรหลัก, nickname = ชื่อเล่น
const drivers = [
  { id: 'DRV001', name: 'ณรงค์ศักดิ์ เพชรชนะ',     nickname: 'เอ็ม',  phone: '085-821-0160', licenseType: 'ท2', status: 'available' },
  { id: 'DRV002', name: 'สุวิทย์ ประสัพแพงศรี',    nickname: 'วิทย์', phone: '085-818-7740', licenseType: 'ท2', status: 'available' },
  { id: 'DRV003', name: 'ณัฐกิต เดชอุดม',          nickname: 'ต้น',   phone: '094-847-1623', licenseType: 'ท2', status: 'available' },
  { id: 'DRV004', name: 'ประเมษฐ์ ไทยธรรมฐิติกุล', nickname: 'แหบ',   phone: '095-492-4109', licenseType: 'ท2', status: 'available' },
  { id: 'DRV005', name: 'วัฒนา ภูเกษ',              nickname: 'แจ๊ค',  phone: '098-403-5357', licenseType: 'ท2', status: 'available' },
  { id: 'DRV006', name: 'วิชาญ อุปทัง',             nickname: 'ชาญ',   phone: '061-438-1108', licenseType: 'ท2', status: 'available' },
  { id: 'DRV007', name: 'นพชัย ทองนุ่ม',            nickname: 'นพ',    phone: '098-290-7453', licenseType: 'ท2', status: 'available' },
  { id: 'DRV008', name: 'ด่วน อินทนาม',             nickname: 'ด่วน',  phone: '096-841-3811', licenseType: 'ท2', status: 'available' },
  { id: 'DRV009', name: 'สุริโย ใจแปง',             nickname: 'โย',    phone: '063-128-8896', licenseType: 'ท2', status: 'available' },
  { id: 'DRV010', name: 'ลือชัย ด่านขุดทด',         nickname: 'เติ้ล', phone: '065-563-9488', licenseType: 'ท2', status: 'available' },
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

  // Password สำหรับคนขับทุกคน (เหมือน EMP/HEAD = TBK@2026)
  const driverPassword = await hashPassword('TBK@2026');

  for (const driver of drivers) {
    // 1. บันทึกข้อมูลคนขับใน drivers/
    const docRef = doc(db, 'artifacts', appIdValue, 'public', 'data', 'drivers', driver.id);
    await setDoc(docRef, {
      ...driver,
      statusNote: '',
      statusUntil: null,
      createdAt: Timestamp.now(),
    });

    // 2. สร้าง user account ใน users/ เพื่อให้ login ได้
    const userRef = doc(db, 'artifacts', appIdValue, 'public', 'data', 'users', driver.id);
    await setDoc(userRef, {
      id: driver.id,
      displayName: `${driver.nickname} (${driver.name})`,
      role: 'DRIVER',
      roleType: 'DRIVER',
      department: 'GA',
      passwordHash: driverPassword,
      active: true,
      driverId: driver.id,  // link กลับไปที่ drivers/
    });

    console.log(`  ✓ ${driver.id} - ${driver.name} (${driver.phone}) [${driver.status}]`);
  }

  console.log('');
  console.log(`Seed เสร็จ! (${drivers.length} drivers + ${drivers.length} user accounts)`);
  console.log('');
  console.log('รหัสผ่านคนขับทุกคน: TBK@2026');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
