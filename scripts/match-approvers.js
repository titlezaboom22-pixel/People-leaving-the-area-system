// จับคู่รายชื่อ Manager/Section Chief 28 คน กับ user ในระบบ
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, setDoc, doc } from 'firebase/firestore';
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

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
});
const db = getFirestore(app);
await signInAnonymously(getAuth(app));
const appId = env.VITE_APP_ID || 'visitor-soc-001';

// 28 คนจากภาพที่พี่ส่งมา
const APPROVERS = [
  'CHANNARONG THONGYU',
  'CHINNAKORN WANGYANGNOK',
  'JIRA KRIDKRAY',
  'LERKCHAI WANICHPRAPHAPORN',
  'NARONGCHAI PRAKATPORN',
  'NATTAPOL KWANGKEN',
  'NIPON PINATANO',
  'NOPPADOL WANACHAROENTI',
  'PACHARA MANPIAN',
  'PORNCHAI KRITSANARUEANG',
  'SIROTE SUKHIRANWAT',
  'TANASUB JANSONGKLOD',
  'TEERATORN KASHEMSANTA',
  'THANACHAI CHAROENSAP',
  'THANAVUT PATCHASUB',
  'THANINNUTH CHIRAHWIBHUN',
  'UTIS ONSRI',
  'VIROJ SAMNAOKLANG',
  'VIVEK BIBHISHAN MORE',
  'WATCHARAKORN KONGYEON',
  'WEERAWAT SUPAWATTANAPANI',
  'WISIT THAMMAMETHA',
  'AKSARAPAK DAOTAISONG',
  'JULARAT MUNGKALA',
  'PANISARA PRATOOM',
  'PORNPUN VIJIT-UKSORN',
  'SAVITTAR THAMPRAKIT',
  'SUTHATHIP INYA',
];

const norm = (s) => (s || '').toString().toUpperCase()
  .replace(/[\s.\-_]/g, '')
  .replace(/^MR|^MS|^MRS|^MISS/i, '');

const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
const allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));

const matches = [];
const unmatched = [];

for (const target of APPROVERS) {
  const tgtNorm = norm(target);
  // หาใน fnameE + lnameE หรือ name อังกฤษอื่น
  // ลองจับคู่ด้วยภาษาอังกฤษก่อน (fname + lname)
  const found = allUsers.find(u => {
    const en = norm(`${u.fnameE || ''}${u.lnameE || ''}`);
    if (!en || en.length < 4) return false;  // ข้าม empty
    if (en === tgtNorm) return true;
    // ตรวจ first name + last name แยก
    const fn = norm(u.fnameE || '');
    const ln = norm(u.lnameE || '');
    if (fn && ln && tgtNorm.startsWith(fn) && tgtNorm.endsWith(ln)) return true;
    return false;
  });
  if (found) {
    matches.push({ target, id: found.id, name: found.name || found.displayName, role: found.role, roleType: found.roleType, dept: found.department });
  } else {
    unmatched.push(target);
  }
}

console.log(`\n=== จับคู่ได้ ${matches.length}/${APPROVERS.length} ===\n`);
matches.forEach(m => {
  const flag = m.roleType === 'HEAD' ? '✓ HEAD' : '⚠️ ยังไม่เป็น HEAD';
  console.log(`  [${flag}] ${m.id.padEnd(8)} ${m.name?.padEnd(35) || ''} ← ${m.target}  (${m.dept})`);
});

if (unmatched.length > 0) {
  console.log(`\n=== ไม่พบ ${unmatched.length} คน ===`);
  unmatched.forEach(t => console.log(`  ❌ ${t}`));
}

console.log(`\nสรุป:`);
console.log(`  ✓ พบ + เป็น HEAD แล้ว: ${matches.filter(m => m.roleType === 'HEAD').length}`);
console.log(`  ⚠️ พบ แต่ยังไม่เป็น HEAD: ${matches.filter(m => m.roleType !== 'HEAD').length}`);
console.log(`  ❌ หาไม่พบ: ${unmatched.length}`);

process.exit(0);
