/**
 * Seed script: สร้างข้อมูล users ลง Firestore
 *
 * วิธีใช้:
 *   1. ตั้งค่า .env ให้ถูกต้องก่อน
 *   2. รัน: node scripts/seed-users.js
 *
 * หมายเหตุ: ใช้ Firebase client SDK (ไม่ใช่ Admin SDK)
 *   ต้องเปิด Firestore rules ให้ write ได้ก่อนรัน
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
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

async function hashPassword(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

const DEPARTMENTS = [
  'EEE (วิศวกรรมไฟฟ้า)',
  'SOC (ศูนย์ปฏิบัติการ)',
  'HR (ทรัพยากรบุคคล)',
  'IT (เทคโนโลยีสารสนเทศ)',
  'Production (ฝ่ายผลิต)',
  'Accounting (บัญชี)',
  'Sales (ฝ่ายขาย)',
  'Maintenance (ซ่อมบำรุง)',
  'Other (อื่นๆ)',
  'Shop (ร้านค้า)',
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

  // รหัสผ่าน production — เปลี่ยนก่อน go-live
  const defaultPassword = await hashPassword('TBK@2026');       // พนักงาน/หัวหน้าทุกคน
  const adminPassword = await hashPassword('TBKAdmin@2026!');   // ADMIN
  const secPassword = await hashPassword('TBKSec@2026!');

  const testEmail = 'intern_attachai.k@tbkk.co.th';
  const eeeHeadEmail = 'sarayut_r@tbkk.co.th';

  const users = [
    // Department heads
    { id: 'HEAD-EEE', displayName: 'หัวหน้า EEE', role: 'HOST', roleType: 'HEAD', department: DEPARTMENTS[0], email: eeeHeadEmail },
    { id: 'HEAD-SOC', displayName: 'หัวหน้า SOC', role: 'HOST', roleType: 'HEAD', department: DEPARTMENTS[1], email: testEmail },
    { id: 'HEAD-HR', displayName: 'หัวหน้า HR', role: 'HOST', roleType: 'HEAD', department: DEPARTMENTS[2], email: testEmail },
    { id: 'HEAD-IT', displayName: 'หัวหน้า IT', role: 'HOST', roleType: 'HEAD', department: DEPARTMENTS[3], email: testEmail },
    { id: 'HEAD-PRD', displayName: 'หัวหน้า Production', role: 'HOST', roleType: 'HEAD', department: DEPARTMENTS[4], email: testEmail },
    { id: 'HEAD-ACC', displayName: 'หัวหน้า Accounting', role: 'HOST', roleType: 'HEAD', department: DEPARTMENTS[5], email: testEmail },
    { id: 'HEAD-SAL', displayName: 'หัวหน้า Sales', role: 'HOST', roleType: 'HEAD', department: DEPARTMENTS[6], email: testEmail },
    { id: 'HEAD-MNT', displayName: 'หัวหน้า Maintenance', role: 'HOST', roleType: 'HEAD', department: DEPARTMENTS[7], email: testEmail },
    { id: 'HEAD-SHOP', displayName: 'หัวหน้า Shop', role: 'HOST', roleType: 'HEAD', department: DEPARTMENTS[9], email: testEmail },
    // Employees
    { id: 'EMP-EEE-01', displayName: 'พนักงาน EEE', role: 'EMPLOYEE', roleType: 'EMPLOYEE', department: DEPARTMENTS[0] },
    { id: 'EMP-SOC-01', displayName: 'พนักงาน SOC', role: 'EMPLOYEE', roleType: 'EMPLOYEE', department: DEPARTMENTS[1] },
    { id: 'EMP-HR-01', displayName: 'พนักงาน HR', role: 'EMPLOYEE', roleType: 'EMPLOYEE', department: DEPARTMENTS[2] },
    { id: 'EMP-IT-01', displayName: 'พนักงาน IT', role: 'EMPLOYEE', roleType: 'EMPLOYEE', department: DEPARTMENTS[3] },
    { id: 'EMP-PRD-01', displayName: 'พนักงาน Production', role: 'EMPLOYEE', roleType: 'EMPLOYEE', department: DEPARTMENTS[4] },
    { id: 'EMP-ACC-01', displayName: 'พนักงาน Accounting', role: 'EMPLOYEE', roleType: 'EMPLOYEE', department: DEPARTMENTS[5] },
    { id: 'EMP-SAL-01', displayName: 'พนักงาน Sales', role: 'EMPLOYEE', roleType: 'EMPLOYEE', department: DEPARTMENTS[6] },
    { id: 'EMP-MNT-01', displayName: 'พนักงาน Maintenance', role: 'EMPLOYEE', roleType: 'EMPLOYEE', department: DEPARTMENTS[7] },
  ];

  const gaPassword = await hashPassword('TBKGA@2026!');

  const specialUsers = [
    { id: 'SEC001', displayName: 'เจ้าหน้าที่ รปภ.', role: 'SECURITY', roleType: 'SECURITY', department: '', passwordHash: secPassword },
    { id: 'GA001', displayName: 'เจ้าหน้าที่ GA', role: 'GA', roleType: 'GA', department: 'GA', email: testEmail, passwordHash: gaPassword },
    { id: 'ADMIN', displayName: 'ผู้ดูแลระบบ', role: 'ADMIN', roleType: 'ADMIN', department: '', passwordHash: adminPassword },
    { id: 'ADMIN001', displayName: 'ผู้ดูแลระบบ 001', role: 'ADMIN', roleType: 'ADMIN', department: '', passwordHash: adminPassword },
  ];

  console.log('กำลัง seed users ลง Firestore...');
  console.log(`App ID: ${appIdValue}`);
  console.log(`Project: ${firebaseConfig.projectId}`);
  console.log('');

  for (const user of users) {
    const docRef = doc(db, 'artifacts', appIdValue, 'public', 'data', 'users', user.id);
    await setDoc(docRef, {
      ...user,
      passwordHash: defaultPassword,
      active: true,
    });
    console.log(`  ✓ ${user.id} (${user.displayName}) - password: TBK@2026`);
  }

  for (const user of specialUsers) {
    const { passwordHash, ...rest } = user;
    const docRef = doc(db, 'artifacts', appIdValue, 'public', 'data', 'users', user.id);
    await setDoc(docRef, {
      ...rest,
      passwordHash,
      active: true,
    });
    const pw = user.role === 'ADMIN' ? 'TBKAdmin@2026!' : user.role === 'GA' ? 'TBKGA@2026!' : 'TBKSec@2026!';
    console.log(`  ✓ ${user.id} (${user.displayName}) - password: ${pw}`);
  }

  console.log('');
  console.log(`Seed เสร็จ! (${users.length + specialUsers.length} users)`);
  console.log('');
  console.log('รหัสผ่าน production:');
  console.log('  พนักงาน/หัวหน้า: TBK@2026');
  console.log('  ADMIN/ADMIN001:   TBKAdmin@2026!');
  console.log('  SEC001:           TBKSec@2026!');
  console.log('  GA001:            TBKGA@2026!');

  process.exit(0);
}

main().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
