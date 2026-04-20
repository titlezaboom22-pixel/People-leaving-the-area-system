/**
 * Seed script: สร้างข้อมูล equipment_stock ลง Firestore
 *
 * วิธีใช้:
 *   1. ตั้งค่า .env ให้ถูกต้องก่อน
 *   2. รัน: node scripts/seed-equipment-stock.js
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

// All items from EquipmentForm.jsx (data1 + data2 + data3)
const ALL_ITEMS = [
  // data1: A01-A13, B01-B08
  ["A01", "กระดาษสีฟ้า"],
  ["A02", "กระดาษสีเขียว"],
  ["A03", "กระดาษสีชมพู"],
  ["A04", "กระดาษสีเหลือง"],
  ["A05", "กระดาษ A4"],
  ["A06", "กระดาษ A3"],
  ["A07", "กระดาษการ์ดขาวหน้าบาง"],
  ["A08", "กระดาษการ์ดขาวหน้าหนา"],
  ["A09", "กระดาษคาร์บอน"],
  ["A10", "สมุดปกแข็ง"],
  ["A11", "สมุดปกอ่อน"],
  ["A12", "กระดาษกาวบ่น"],
  ["A13", "กระดาษบันทึก"],
  ["B01", "แฟ้ม 125 F"],
  ["B02", "แฟ้ม 120 F"],
  ["B03", "แฟ้ม No 210 F"],
  ["B04", "แฟ้มพลาสติก"],
  ["B05", "แฟ้มกระดาษ"],
  ["B06", "แฟ้มหูรู"],
  ["B07", "สันแฟ้มพลาสติก"],
  ["B08", "สันแฟ้มทองเหลือง"],
  // data2: C01-C15, D01-D06
  ["C01", "ตาไก่"],
  ["C02", "คลิปเบอร์ 1"],
  ["C03", "คลิปหนีบกระดาษ 2 ขา 108"],
  ["C04", "คลิปหนีบกระดาษ 2 ขา 111"],
  ["C05", "คลิปหนีบกระดาษ 2 ขา 112"],
  ["C06", "ลูกแม็ก No. 10"],
  ["C07", "ลูกแม็ก No. 35"],
  ["C08", "สก๊อตเทปใส เล็ก"],
  ["C09", "สก๊อตเทปใส ใหญ่"],
  ["C10", "กาวรูบี้"],
  ["C11", "เทปผ้า"],
  ["C12", "ถ่านไฟฉาย Size C"],
  ["C13", "ถ่านไฟฉาย Size D"],
  ["C14", "ถ่านไฟฉาย Size AAA"],
  ["C15", "ถ่านไฟฉาย Size AA"],
  ["D01", "ปากกาสีดำ"],
  ["D02", "ปากกาสีแดง"],
  ["D03", "ปากกาสีน้ำเงิน"],
  ["D04", "ปากกาเน้นข้อความ สีเหลือง"],
  ["D05", "ปากกาเน้นข้อความ สีเขียว"],
  ["D06", "ปากกาเน้นข้อความ สีชมพู"],
  // data3: D07-D19, E01-E08
  ["D07", "ปากกาเน้นข้อความ สีส้ม"],
  ["D08", "ดินสอ"],
  ["D09", "ไส้ดินสอ"],
  ["D10", "ลิควิดเปเปอร์"],
  ["D11", "ปากกาไวท์บอร์ด สีดำ"],
  ["D12", "ปากกาไวท์บอร์ด สีแดง"],
  ["D13", "ปากกาไวท์บอร์ด สีน้ำเงิน"],
  ["D14", "หมึกเติมแท่นแสตมป์ สีน้ำเงิน"],
  ["D15", "หมึกเติมแท่นแสตมป์ สีแดง"],
  ["D16", "หมึกเติมแท่นแสตมป์ สีดำ"],
  ["D17", "ปากกาดำ Hybrid 0.5mm"],
  ["D18", "ยางลบ"],
  ["D19", "ซองออร์ก้า A4"],
  ["E01", "พลาสติกเคลือบบัตร A4"],
  ["E02", "แท่นประทับตรา"],
  ["E03", "แผ่นเคลือบบัตร A3"],
  ["E04", "คัตเตอร์"],
  ["E05", "ใบมีดคัตเตอร์ใหญ่"],
  ["E06", "ใบมีดคัตเตอร์เล็ก"],
  ["E07", "ไม้บรรทัด"],
  ["E08", "แปรงลบกระดาษ"],
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

  console.log('กำลัง seed equipment_stock ลง Firestore...');
  console.log(`App ID: ${appIdValue}`);
  console.log(`Project: ${firebaseConfig.projectId}`);
  console.log(`จำนวนรายการ: ${ALL_ITEMS.length}`);
  console.log('');

  for (const [code, name] of ALL_ITEMS) {
    const group = code.charAt(0); // A, B, C, D, E
    const docRef = doc(db, 'artifacts', appIdValue, 'public', 'data', 'equipment_stock', code);
    await setDoc(docRef, {
      code,
      name,
      group,
      available: true,
      updatedAt: Timestamp.now(),
    });
    console.log(`  ✓ ${code} - ${name} (Group ${group})`);
  }

  console.log('');
  console.log(`Seed เสร็จ! (${ALL_ITEMS.length} items)`);
  console.log('ทุกรายการตั้งค่า available: true (มีของ)');

  process.exit(0);
}

main().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
