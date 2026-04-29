// จับคู่ GM 15 คนกับ user ในระบบ
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
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

const GMS = [
  'ATTAWUT LEEWUTTINAN',
  'CHAWALIT SUPOTJANARD',
  'NATTAPONG KUNAKONTHA',
  'NOPPADOL WANACHAREON',
  'SURACHET PRAKOBKAEW',
  'SUTHEP NOK-IN',
  'SUWIT THUADHOY',
  'TAKASHI TAKAHASHI',
  'THANINNUTH CHIRAHWIBHUN',
  'VIVEK BIBHISHAN MORE',
  'YUJI HORIKOSHI',
  'WANDEE POOLROS',
  'WORADA CHAMNANPUECI',
  'NATCHANAN MAROMP',
  'WORANAN PANCHANATE',
];

const norm = (s) => (s || '').toString().toUpperCase().replace(/[\s.\-_]/g, '');

const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
const allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));

const matches = [];
const unmatched = [];

for (const target of GMS) {
  const tgtNorm = norm(target);
  // ลอง 1: ตรงกันเป๊ะ first+last
  let found = allUsers.find(u => {
    const en = norm(`${u.fnameE || ''}${u.lnameE || ''}`);
    return en && (en === tgtNorm);
  });
  // ลอง 2: เริ่มด้วย first name หรือ ลงท้ายด้วย last name
  if (!found) {
    found = allUsers.find(u => {
      const fn = norm(u.fnameE || '');
      const ln = norm(u.lnameE || '');
      if (!fn || !ln) return false;
      return tgtNorm.startsWith(fn) || tgtNorm.endsWith(ln);
    });
  }
  // ลอง 3: ค้น displayNameEn
  if (!found) {
    found = allUsers.find(u => {
      const en = norm(u.displayNameEn || '');
      return en && (en.includes(tgtNorm) || tgtNorm.includes(en));
    });
  }
  if (found) matches.push({ target, ...found });
  else unmatched.push(target);
}

console.log(`\n=== จับคู่ได้ ${matches.length}/${GMS.length} ===\n`);
matches.forEach(m => {
  const lv = m.approvalLevel;
  const flag = (m.role === 'HOST' && m.roleType === 'HEAD' && lv >= 3 && lv <= 8) ? '✅ พร้อม' : '⚠️ ต้องตั้งค่า';
  console.log(`  [${flag}] ${m.id.padEnd(8)} ${(m.name || m.displayName || '').padEnd(28)} role=${m.role} type=${m.roleType} Lv=${lv} | ${m.department || ''} ← ${m.target}`);
});

if (unmatched.length > 0) {
  console.log(`\n=== ไม่พบ ${unmatched.length} คน — ลองค้นในชื่อไทย ===`);
  unmatched.forEach(t => {
    console.log(`\n  ${t}`);
    // ลองค้นชื่อแรกใน firstname
    const firstWord = t.split(' ')[0];
    const candidates = allUsers.filter(u => {
      const fn = norm(u.fnameE || '');
      return fn && fn.startsWith(norm(firstWord).slice(0, 5));
    }).slice(0, 5);
    if (candidates.length) {
      candidates.forEach(c => console.log(`    ⮕ ${c.id} ${c.fnameE} ${c.lnameE} (${c.name || c.displayName}) | ${c.department}`));
    } else {
      console.log('    ไม่เจอผู้สมัยใกล้เคียง');
    }
  });
}

process.exit(0);
