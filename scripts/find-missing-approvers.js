// ค้นหา 5 คนที่จับคู่ไม่ได้ ลองเช็คชื่อไทย
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

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
});
const db = getFirestore(app);
await signInAnonymously(getAuth(app));
const appId = env.VITE_APP_ID || 'visitor-soc-001';

// ที่หาไม่เจอ — ลองเดาชื่อไทย
const SEARCH_PATTERNS = [
  { en: 'NOPPADOL WANACHAROENTI',     thaiHints: ['นพดล', 'วนาเจริญ', 'วนเจริญ'] },
  { en: 'PORNCHAI KRITSANARUEANG',    thaiHints: ['พรชัย', 'กฤษณ', 'กิตติศักดิ์'] },
  { en: 'TEERATORN KASHEMSANTA',      thaiHints: ['ธีรธร', 'เกษมสันต์', 'ธีรธร'] },
  { en: 'THANINNUTH CHIRAHWIBHUN',    thaiHints: ['ธนินนัทธ์', 'จิรวิบูรณ์', 'ธนินทร์'] },
  { en: 'WEERAWAT SUPAWATTANAPANI',   thaiHints: ['วีระวัฒน์', 'สุภาวัฒน', 'วีรวัฒน์'] },
];

const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
const allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));

for (const { en, thaiHints } of SEARCH_PATTERNS) {
  console.log(`\n=== ${en} ===`);
  for (const hint of thaiHints) {
    const matches = allUsers.filter(u => {
      const nm = (u.name || u.displayName || '').toString();
      const fnT = (u.fnameT || '').toString();
      const lnT = (u.lnameT || '').toString();
      return nm.includes(hint) || fnT.includes(hint) || lnT.includes(hint);
    });
    if (matches.length > 0) {
      console.log(`  ค้นด้วย "${hint}":`);
      matches.slice(0, 5).forEach(m => {
        console.log(`    ${m.id.padEnd(8)} ${m.name || m.displayName || ''} | role: ${m.role} | ${m.roleType || ''} | ${m.department || ''}`);
      });
    }
  }
}

process.exit(0);
