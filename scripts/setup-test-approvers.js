import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
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

async function hashPw(p) { const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p)); return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''); }
const pw = await hashPw('1234');

// 1) ค้นหา Mongkon
const all = (await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'))).docs.map(d => ({ id: d.id, ...d.data() }));
const mongkon = all.find(u => /mongkon/i.test(u.email || ''));
console.log('=== ค้น Mongkon ===');
if (mongkon) {
  console.log(`  ✓ พบ: ${mongkon.id}  ${mongkon.fnameE} ${mongkon.lnameE}  (${mongkon.name})  ${mongkon.email}`);
} else {
  console.log('  ❌ ไม่พบ — ค้นเพิ่มด้วยชื่อ');
  const m2 = all.filter(u => /MONGKON|มงคล/i.test(`${u.fnameE} ${u.name} ${u.fnameT}`));
  m2.forEach(u => console.log(`    ${u.id}  ${u.fnameE} ${u.lnameE} (${u.name}) email=${u.email} dept=${u.department}`));
}

// 2) ตั้ง Benjamas (01905) เป็น HEAD Lv.4
console.log('\n=== ตั้ง Benjamas 01905 เป็น HEAD Lv.4 ===');
await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', '01905'), {
  role: 'HOST', roleType: 'HEAD', approvalLevel: 4,
  position: 'Asst.GM (ทดสอบ)', email: 'benjamas_k@tbkk.co.th',
  passwordHash: pw, active: true,
}, { merge: true });
const b = (await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', '01905'))).data();
console.log(`  ✓ ${b.name} | ${b.role}/${b.roleType} | Lv.${b.approvalLevel} | ${b.department} | ${b.email}`);

// 3) ตั้ง Mongkon เป็น HEAD Lv.5
if (mongkon) {
  console.log(`\n=== ตั้ง ${mongkon.id} ${mongkon.name} เป็น HEAD Lv.5 ===`);
  await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', mongkon.id), {
    role: 'HOST', roleType: 'HEAD', approvalLevel: 5,
    position: 'ผู้จัดการฝ่าย (ทดสอบ)',
    department: b.department,  // ให้แผนกเดียวกับ Benjamas เพื่อทดสอบ
    passwordHash: pw, active: true,
  }, { merge: true });
  const m = (await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', mongkon.id))).data();
  console.log(`  ✓ ${m.name} | ${m.role}/${m.roleType} | Lv.${m.approvalLevel} | ${m.department} | ${m.email}`);
}

console.log('\n✅ พร้อมทดสอบแล้ว');
console.log('Login รหัส 1234 ทั้งคู่');
process.exit(0);
