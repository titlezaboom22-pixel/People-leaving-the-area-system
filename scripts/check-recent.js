// ดูข้อมูลล่าสุดที่เข้ามาในระบบ
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

const COLLS = ['approval_workflows', 'appointments', 'employee_logs', 'equipment_requests', 'audit_logs', 'login_attempts'];
const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hr ago

console.log(`\n=== ข้อมูลที่เข้ามาใน 24 ชั่วโมงล่าสุด ===\n`);

for (const c of COLLS) {
  const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', c));
  const recent = snap.docs
    .map(d => ({ _id: d.id, ...d.data() }))
    .filter(d => {
      const t = d.createdAt || d.timestamp || d.startedAt || d.acknowledgedAt;
      if (!t) return false;
      return new Date(t) > since;
    })
    .sort((a, b) => String(b.createdAt || b.timestamp || '').localeCompare(String(a.createdAt || a.timestamp || '')));

  if (recent.length === 0) {
    console.log(`  ${c.padEnd(22)} ─ ไม่มีของใหม่`);
    continue;
  }
  console.log(`\n📁 ${c} (${recent.length} ใหม่):`);
  for (const r of recent.slice(0, 8)) {
    const t = r.createdAt || r.timestamp || r.startedAt || r.acknowledgedAt;
    const time = t ? new Date(t).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-';
    if (c === 'approval_workflows') {
      console.log(`  • ${time} | ${r.sourceForm || '-'} | ผู้ขอ: ${r.requesterName || '-'} (${r.requesterId || '-'}) | สถานะ: ${r.status || '-'} | step ${r.step || '?'}/${r.stepLabel || ''}`);
    } else if (c === 'appointments') {
      console.log(`  • ${time} | ${r.visitorName || '-'} → ${r.host?.name || r.hostName || '-'} | ${r.status || '-'}`);
    } else if (c === 'employee_logs') {
      console.log(`  • ${time} | ${r.staffId || '-'} ${r.name || '-'} | ${r.action || '-'}`);
    } else if (c === 'audit_logs') {
      console.log(`  • ${time} | ${r.action || '-'} | ${r.userId || r.user || '-'} | ${r.detail || ''}`.slice(0, 120));
    } else if (c === 'login_attempts') {
      console.log(`  • ${time} | ${r.userId || '-'} | ${r.success ? '✓' : '✗'} | ${r.ip || ''}`);
    } else {
      console.log(`  • ${time} | ${r._id.slice(0, 12)}... | ${JSON.stringify(r).slice(0, 100)}`);
    }
  }
}

console.log('\n');
process.exit(0);
