/**
 * หาชื่อ user ที่ซ้ำกันใน Firestore
 *
 * เกณฑ์การหา duplicate:
 *   1. displayName ซ้ำ (Thai name) — ปกติชื่อ-นามสกุลควร unique
 *   2. email ซ้ำ
 *   3. PersonCode ซ้ำ
 *
 * ใช้:
 *   node scripts/find-duplicate-users.js          # แสดงรายการที่ซ้ำ
 *   node scripts/find-duplicate-users.js --delete # ลบของซ้ำ (เก็บอันที่ดีที่สุดไว้)
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = resolve(__dirname, '..', '.env');
  const content = readFileSync(envPath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

function normalizeName(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Score ความ "เป็นทางการ" ของ user → เก็บคนที่ score สูงไว้
// (มี email + imported จาก HR + level จริง = สูงสุด)
function scoreUser(u) {
  let s = 0;
  if (u.imported) s += 100;             // มาจาก HR Excel
  if (u.personCode) s += 50;
  if (u.email) s += 20;
  if (u.approvalLevel > 0) s += 10;
  if (u.approvalLevelSetBy === 'hr-import') s += 5;
  if (u.approvalLevelSetBy === 'admin') s += 3;
  return s;
}

async function main() {
  const doDelete = process.argv.includes('--delete');

  console.log('');
  console.log('🔍 หา users ที่ชื่อซ้ำกันใน Firestore');
  console.log('━'.repeat(60));
  console.log(`Mode: ${doDelete ? '🔴 DELETE — ลบของซ้ำจริง' : '🟡 SCAN ONLY — แสดงเฉยๆ'}`);
  console.log('');

  const env = loadEnv();
  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  });
  const db = getFirestore(app);
  await signInAnonymously(getAuth(app));
  const appIdValue = env.VITE_APP_ID || 'visitor-soc-001';
  const usersRef = collection(db, 'artifacts', appIdValue, 'public', 'data', 'users');

  console.log('📥 อ่าน users ทั้งหมด...');
  const snap = await getDocs(usersRef);
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`   พบ ${all.length} คน`);
  console.log('');

  // Group by displayName
  const byName = {};
  for (const u of all) {
    const name = normalizeName(u.displayName || u.name);
    if (!name) continue;
    if (!byName[name]) byName[name] = [];
    byName[name].push(u);
  }

  // Email ที่ใช้เป็น placeholder ทดสอบ — ข้ามไม่ถือเป็น duplicate
  const PLACEHOLDER_EMAILS = new Set([
    'intern_attachai.k@tbkk.co.th',
  ]);

  // Group by email (skip placeholder emails — ไม่ใช่ duplicate จริง)
  const byEmail = {};
  for (const u of all) {
    const e = String(u.email || '').trim().toLowerCase();
    if (!e || e === '0') continue;
    if (PLACEHOLDER_EMAILS.has(e)) continue; // skip placeholder
    if (!byEmail[e]) byEmail[e] = [];
    byEmail[e].push(u);
  }

  // หา dups
  const nameDups = Object.entries(byName).filter(([_, arr]) => arr.length > 1);
  const emailDups = Object.entries(byEmail).filter(([_, arr]) => arr.length > 1);

  console.log(`📊 พบ duplicates:`);
  console.log(`   ชื่อซ้ำ:  ${nameDups.length} กลุ่ม`);
  console.log(`   email ซ้ำ: ${emailDups.length} กลุ่ม`);
  console.log('');

  // รวมเอา ID ที่จะลบ (เก็บคนที่ score สูงสุด)
  const toDelete = new Map(); // id -> reason

  if (nameDups.length > 0) {
    console.log('━'.repeat(60));
    console.log('👥 ชื่อซ้ำกัน:');
    console.log('━'.repeat(60));
    for (const [name, group] of nameDups) {
      console.log(`\n📌 "${group[0].displayName || group[0].name}" (${group.length} คน):`);
      // เรียงตาม score มาก→น้อย
      group.sort((a, b) => scoreUser(b) - scoreUser(a));
      for (let i = 0; i < group.length; i++) {
        const u = group[i];
        const s = scoreUser(u);
        const keep = i === 0 ? '✅ KEEP' : '❌ DELETE';
        const lv = u.approvalLevel ? `Lv.${u.approvalLevel}` : '-';
        const role = u.role || '-';
        const dept = u.department || '-';
        const email = u.email || '-';
        const tag = u.imported ? '[HR]' : (u.id.startsWith('HEAD-') || u.id.startsWith('EMP-') || u.id === 'ADMIN' || u.id.startsWith('GA0') || u.id === 'SEC001' ? '[seed]' : '');
        console.log(`   ${keep} | ${u.id} | score=${s} ${tag} | ${role} ${lv} | ${dept} | ${email}`);
        if (i > 0) toDelete.set(u.id, `name-dup-of-${group[0].id}`);
      }
    }
  }

  if (emailDups.length > 0) {
    console.log('\n━'.repeat(60));
    console.log('📧 email ซ้ำกัน:');
    console.log('━'.repeat(60));
    for (const [email, group] of emailDups) {
      const allIds = group.map(u => u.id);
      const stillKept = group.filter(u => !toDelete.has(u.id));
      if (stillKept.length <= 1) continue; // ถ้าหลังลบ name-dup เหลือแค่ 1 ก็พอ
      console.log(`\n📌 "${email}" (${group.length} คน):`);
      stillKept.sort((a, b) => scoreUser(b) - scoreUser(a));
      for (let i = 0; i < stillKept.length; i++) {
        const u = stillKept[i];
        const s = scoreUser(u);
        const keep = i === 0 ? '✅ KEEP' : '❌ DELETE';
        const lv = u.approvalLevel ? `Lv.${u.approvalLevel}` : '-';
        const role = u.role || '-';
        const tag = u.imported ? '[HR]' : '[seed]';
        console.log(`   ${keep} | ${u.id} | ${u.displayName || '-'} | score=${s} ${tag} | ${role} ${lv}`);
        if (i > 0) toDelete.set(u.id, `email-dup-of-${stillKept[0].id}`);
      }
    }
  }

  console.log('');
  console.log('━'.repeat(60));
  console.log(`📊 สรุป: จะลบ ${toDelete.size} users`);
  console.log('━'.repeat(60));

  if (toDelete.size === 0) {
    console.log('✅ ไม่มี duplicates — Firestore สะอาด');
    process.exit(0);
  }

  if (!doDelete) {
    console.log('');
    console.log('🟡 SCAN-ONLY MODE — ไม่ได้ลบจริง');
    console.log('   ถ้าผลตรงตามต้องการ → รันใหม่ด้วย --delete');
    process.exit(0);
  }

  console.log('');
  console.log('🔴 กำลังลบ duplicates...');
  let deleted = 0;
  let errors = 0;
  for (const [id, reason] of toDelete) {
    try {
      await deleteDoc(doc(usersRef, id));
      deleted++;
      if (deleted % 20 === 0) console.log(`   ...ลบแล้ว ${deleted}/${toDelete.size}`);
    } catch (err) {
      errors++;
      console.error(`   ❌ ${id}: ${err.message}`);
    }
  }
  console.log('');
  console.log(`✅ ลบเสร็จ: ${deleted} | Errors: ${errors}`);
  console.log(`   Users คงเหลือใน Firestore: ${all.length - deleted}`);

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
