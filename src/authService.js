import { doc, getDoc, setDoc, collection, Timestamp } from 'firebase/firestore';
import { db, firebaseReady, appId } from './firebase';

function getUsersCollRef() {
  if (!db) throw new Error('ระบบยังไม่พร้อม กรุณารอสักครู่แล้วลองใหม่');
  return collection(db, 'artifacts', appId, 'public', 'data', 'users');
}

function getAttemptsCollRef() {
  if (!db) throw new Error('ระบบยังไม่พร้อม');
  return collection(db, 'artifacts', appId, 'public', 'data', 'login_attempts');
}

async function hashPassword(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

async function checkLockout(staffId) {
  try {
    const attemptRef = doc(getAttemptsCollRef(), staffId);
    const snap = await getDoc(attemptRef);
    if (!snap.exists()) return false;

    const data = snap.data();
    if (data.count >= MAX_ATTEMPTS && data.lockedUntil) {
      const lockedUntil = data.lockedUntil.toDate ? data.lockedUntil.toDate() : new Date(data.lockedUntil);
      if (new Date() < lockedUntil) {
        const mins = Math.ceil((lockedUntil - new Date()) / 60000);
        throw new Error(`บัญชีถูกล็อค กรุณารอ ${mins} นาที`);
      }
      // Lockout expired, reset
      await setDoc(attemptRef, { count: 0, lockedUntil: null });
    }
  } catch (err) {
    if (err.message.includes('ล็อค')) throw err;
  }
  return false;
}

async function recordFailedAttempt(staffId) {
  try {
    const attemptRef = doc(getAttemptsCollRef(), staffId);
    const snap = await getDoc(attemptRef);
    const current = snap.exists() ? snap.data().count || 0 : 0;
    const newCount = current + 1;

    const update = { count: newCount, lastAttempt: Timestamp.now() };
    if (newCount >= MAX_ATTEMPTS) {
      update.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60000).toISOString();
    }
    await setDoc(attemptRef, update);

    const remaining = MAX_ATTEMPTS - newCount;
    if (remaining > 0) {
      throw new Error(`รหัสผ่านไม่ถูกต้อง (เหลือ ${remaining} ครั้งก่อนล็อค)`);
    } else {
      throw new Error(`บัญชีถูกล็อค ${LOCKOUT_MINUTES} นาที เนื่องจากใส่รหัสผิดเกินกำหนด`);
    }
  } catch (err) {
    if (err.message.includes('รหัสผ่าน') || err.message.includes('ล็อค')) throw err;
    throw new Error('รหัสผ่านไม่ถูกต้อง');
  }
}

async function clearAttempts(staffId) {
  try {
    const attemptRef = doc(getAttemptsCollRef(), staffId);
    await setDoc(attemptRef, { count: 0, lockedUntil: null });
  } catch {}
}

export async function authenticateUser(staffId, password) {
  const normalizedId = (staffId || '').trim().toUpperCase();
  if (!normalizedId) throw new Error('กรุณากรอกรหัสพนักงาน');
  if (!password) throw new Error('กรุณากรอกรหัสผ่าน');
  if (password.length < 4) throw new Error('รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร');

  if (!firebaseReady || !db) {
    throw new Error('ระบบยังไม่พร้อม กรุณาตั้งค่า Firebase ก่อนใช้งาน');
  }

  // เช็คล็อคบัญชี
  await checkLockout(normalizedId);

  // หา user
  const userDocRef = doc(getUsersCollRef(), normalizedId);
  const userSnap = await getDoc(userDocRef);

  if (!userSnap.exists()) {
    throw new Error('ไม่พบรหัสพนักงานนี้ในระบบ');
  }

  const userData = userSnap.data();

  if (userData.active === false) {
    throw new Error('บัญชีนี้ถูกปิดใช้งาน');
  }

  // ตรวจรหัสผ่าน
  const inputHash = await hashPassword(password);
  if (inputHash !== userData.passwordHash) {
    await recordFailedAttempt(normalizedId);
    return; // recordFailedAttempt always throws
  }

  // Login สำเร็จ → ล้างจำนวนครั้งที่ผิด
  await clearAttempts(normalizedId);

  // สร้าง session token
  const sessionToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try { sessionStorage.setItem('soc_session', sessionToken); } catch {}

  return {
    staffId: normalizedId,
    displayName: userData.displayName || normalizedId,
    role: userData.role || 'EMPLOYEE',
    roleType: userData.roleType || 'EMPLOYEE',
    department: userData.department || '',
    sessionToken,
  };
}

/**
 * 🔑 เปลี่ยนรหัสผ่านตัวเอง — ต้องระบุรหัสเก่าด้วย
 */
export async function changeMyPassword(staffId, oldPassword, newPassword) {
  if (!firebaseReady || !db) throw new Error('ระบบยังไม่พร้อม');
  if (!staffId) throw new Error('ไม่พบรหัสพนักงาน');
  if (!newPassword || newPassword.length < 4) throw new Error('รหัสผ่านใหม่ต้องอย่างน้อย 4 ตัวอักษร');
  if (newPassword === oldPassword) throw new Error('รหัสผ่านใหม่ต้องต่างจากรหัสเก่า');

  const normalizedId = staffId.toUpperCase().trim();
  const userDocRef = doc(getUsersCollRef(), normalizedId);
  const userSnap = await getDoc(userDocRef);
  if (!userSnap.exists()) throw new Error('ไม่พบผู้ใช้');

  const u = userSnap.data();

  // ตรวจรหัสเก่าก่อน
  const oldHash = await hashPassword(oldPassword);
  if (oldHash !== u.passwordHash) {
    throw new Error('รหัสผ่านเก่าไม่ถูกต้อง');
  }

  // อัปเดตเป็นรหัสใหม่
  const newHash = await hashPassword(newPassword);
  const { updateDoc } = await import('firebase/firestore');
  await updateDoc(userDocRef, {
    passwordHash: newHash,
    passwordChangedAt: new Date().toISOString(),
    passwordChangedBy: 'self',
  });
  return { success: true };
}

/**
 * 🔑 ตั้งรหัสผ่านครั้งแรก (สำหรับ user ที่ยังไม่ได้ตั้ง — ใช้รหัส default)
 */
export async function setFirstPassword(staffId, defaultPassword, newPassword) {
  return changeMyPassword(staffId, defaultPassword, newPassword);
}

export async function getUserById(staffId) {
  if (!firebaseReady || !db) return null;

  const normalizedId = (staffId || '').trim().toUpperCase();
  const userDocRef = doc(getUsersCollRef(), normalizedId);
  const userSnap = await getDoc(userDocRef);

  if (!userSnap.exists()) return null;
  return { staffId: normalizedId, ...userSnap.data() };
}

export { hashPassword };
