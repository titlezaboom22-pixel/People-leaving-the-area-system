/**
 * Email Notification Service
 * ส่งเมลอัตโนมัติเมื่อมีการสร้าง / อนุมัติ / ส่งกลับ workflow
 *
 * Fire-and-forget: ถ้า email server ไม่พร้อมจะ log และไม่ blocking
 */

import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db, firebaseReady, appId } from './firebase';
import { SPECIAL_EMAILS, normalizeDepartment } from './constants';

const EMAIL_API = import.meta.env.VITE_EMAIL_API || 'http://localhost:3001';
const PUBLIC_URL = import.meta.env.VITE_PUBLIC_URL || window.location.origin;

// --- Simple health check cache (อย่าตรวจทุกครั้ง) ---
let _serverOk = null;
let _serverCheckedAt = 0;

async function ensureServerOk() {
  const now = Date.now();
  if (_serverOk !== null && now - _serverCheckedAt < 30000) return _serverOk;
  try {
    const res = await fetch(`${EMAIL_API}/api/health`, { signal: AbortSignal.timeout(2000) });
    const json = await res.json();
    _serverOk = !!json.hasSMTP;
    _serverCheckedAt = now;
    return _serverOk;
  } catch {
    _serverOk = false;
    _serverCheckedAt = now;
    return false;
  }
}

// --- User / email lookup ---

async function getUserById(userId) {
  if (!firebaseReady || !db || !userId) return null;
  try {
    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'users', String(userId).toUpperCase());
    const snap = await getDoc(ref);
    if (snap.exists()) return { id: snap.id, ...snap.data() };
  } catch {}
  return null;
}

async function getUsersByDepartment(department, { roleType, role } = {}) {
  if (!firebaseReady || !db || !department) return [];
  const target = normalizeDepartment(department);
  try {
    const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
    const out = [];
    snap.forEach(d => {
      const u = { id: d.id, ...d.data() };
      if (u.active === false) return;
      if (normalizeDepartment(u.department) !== target) return;
      if (roleType && (u.roleType || '').toUpperCase() !== roleType.toUpperCase()) return;
      if (role && (u.role || '').toUpperCase() !== role.toUpperCase()) return;
      out.push(u);
    });
    return out;
  } catch (err) {
    console.warn('getUsersByDepartment error:', err.message);
    return [];
  }
}

// Resolve pending approver emails for a workflow step
async function resolveApproverEmails(step) {
  // หากผู้ส่งระบุผู้อนุมัติเฉพาะคน → ส่งไปคนนั้นตรงๆ (ไม่ broadcast ทั้งแผนก)
  if (step?.targetUserEmail) {
    return {
      emails: [step.targetUserEmail],
      label: step.targetUserName || step.targetUserId || 'ผู้อนุมัติ',
    };
  }
  const targetType = step?.targetType;
  const dept = step?.department;

  // Special targets with pre-configured emails
  if (targetType === 'SECURITY' || dept === 'SECURITY') {
    return { emails: [SPECIAL_EMAILS.SECURITY].filter(Boolean), label: 'รปภ.' };
  }
  if (targetType === 'COFFEE_SHOP') {
    return { emails: [SPECIAL_EMAILS.COFFEE_SHOP].filter(Boolean), label: 'ร้านกาแฟ' };
  }
  if (targetType === 'OT_FOOD_SHOP') {
    return { emails: [SPECIAL_EMAILS.OT_FOOD_SHOP].filter(Boolean), label: 'ร้าน OT' };
  }
  if (targetType === 'GA' || dept === 'GA') {
    // พยายามหา GA user ก่อน → fallback ไป SPECIAL
    const gaUsers = await getUsersByDepartment('GA', { role: 'GA' });
    const emails = gaUsers.map(u => u.email).filter(Boolean);
    if (emails.length === 0 && SPECIAL_EMAILS.GA) emails.push(SPECIAL_EMAILS.GA);
    return { emails: [...new Set(emails)], label: 'GA' };
  }

  // ปกติ: หา HOST/HEAD ของแผนกนั้น
  const heads = await getUsersByDepartment(dept, { role: 'HOST' });
  const emails = heads.map(u => u.email).filter(Boolean);
  const names = heads.map(u => u.displayName || u.name || u.id).filter(Boolean);
  return { emails: [...new Set(emails)], label: names[0] || `หัวหน้า ${dept || ''}`, users: heads };
}

// --- Pretty helpers ---

function formNameOf(sourceForm) {
  const MAP = {
    VEHICLE_BOOKING: 'ใบขอใช้รถ',
    OUTING_REQUEST: 'ขอออกนอกสถานที่',
    GOODS_IN_OUT: 'นำของเข้า/ออก',
    VISITOR: 'ผู้มาติดต่อ',
    DRINK_ORDER: 'สั่งเครื่องดื่ม',
    FOOD_ORDER: 'สั่งอาหาร',
    DRINK_FOOD_ORDER: 'สั่งเครื่องดื่ม+อาหาร',
    EQUIPMENT_REQUEST: 'เบิกอุปกรณ์',
  };
  return MAP[sourceForm] || sourceForm || 'เอกสาร';
}

function buildApproveUrl(workflowId) {
  if (!workflowId) return PUBLIC_URL;
  return `${PUBLIC_URL}/index.html?approve=${workflowId}`;
}

function fmtDate(iso) {
  try {
    const d = iso ? new Date(iso) : new Date();
    return d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return '-'; }
}

// --- Backend senders ---

async function postEmail(endpoint, payload) {
  try {
    const ok = await ensureServerOk();
    if (!ok) {
      console.log(`[notifyEmail] server ไม่พร้อมหรือยังไม่ได้ตั้ง SMTP — ข้ามส่ง (${endpoint})`);
      return { sent: false, reason: 'server-not-ready' };
    }
    const res = await fetch(`${EMAIL_API}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn(`[notifyEmail] ${endpoint} HTTP ${res.status}`, json);
      return { sent: false, reason: json.error || `HTTP ${res.status}` };
    }
    return { sent: true, demo: json.demo || false };
  } catch (err) {
    console.warn(`[notifyEmail] ${endpoint} error:`, err.message);
    return { sent: false, reason: err.message };
  }
}

// =========================================================================
// PUBLIC API — เรียกจาก approvalNotifications.js และ App.jsx
// =========================================================================

/** ส่งเมลให้ผู้อนุมัติคนแรก เมื่อพนักงานสร้างคำขอ */
export async function notifyRequestCreated(item) {
  if (!item) return;
  try {
    const { emails, label, users } = await resolveApproverEmails(item);
    if (!emails?.length) {
      console.log('[notifyEmail] ไม่พบอีเมลผู้อนุมัติสำหรับ', item.department, item.targetType);
      return;
    }
    const approveUrl = buildApproveUrl(item.id);
    const formName = formNameOf(item.sourceForm);

    await Promise.all(emails.map(to => postEmail('/api/send-approval-email', {
      to,
      approverName: users?.[0]?.displayName || label,
      documentTitle: formName,
      requesterName: item.requesterName || '-',
      department: item.requesterDepartment || '-',
      date: fmtDate(item.createdAt),
      approveUrl,
    })));
    console.log(`[notifyEmail] แจ้ง ${label} ว่ามีคำขอ ${formName} ใหม่ → ${emails.join(', ')}`);
  } catch (err) {
    console.warn('[notifyEmail] notifyRequestCreated error:', err);
  }
}

/** ส่งเมลให้ผู้อนุมัติ step ถัดไป เมื่อมีการอนุมัติ step ก่อนหน้า */
export async function notifyStepApproved(nextItem, prevItem) {
  if (!nextItem) return;
  try {
    const { emails, label, users } = await resolveApproverEmails(nextItem);
    if (!emails?.length) {
      console.log('[notifyEmail] ไม่พบอีเมลผู้อนุมัติ step ถัดไป');
      return;
    }
    const approveUrl = buildApproveUrl(nextItem.id);
    const formName = formNameOf(nextItem.sourceForm);

    await Promise.all(emails.map(to => postEmail('/api/send-approval-email', {
      to,
      approverName: users?.[0]?.displayName || label,
      documentTitle: `${formName} (ผ่านขั้นที่ ${prevItem?.step || 1} แล้ว)`,
      requesterName: nextItem.requesterName || '-',
      department: nextItem.requesterDepartment || '-',
      date: fmtDate(nextItem.createdAt),
      approveUrl,
    })));
    console.log(`[notifyEmail] แจ้ง ${label} ขั้นถัดไป → ${emails.join(', ')}`);
  } catch (err) {
    console.warn('[notifyEmail] notifyStepApproved error:', err);
  }
}

/** ส่งเมลให้ผู้ขอ เมื่อ workflow เสร็จสมบูรณ์ (step สุดท้ายอนุมัติแล้ว) */
export async function notifyWorkflowCompleted(lastItem) {
  if (!lastItem) return;
  try {
    const requester = await getUserById(lastItem.requesterId);
    const to = requester?.email;
    if (!to) {
      console.log('[notifyEmail] ผู้ขอไม่มีอีเมล, ข้ามแจ้งเตือน completed');
      return;
    }
    const formName = formNameOf(lastItem.sourceForm);
    const subject = `[SOC] ${formName} ของคุณได้รับการอนุมัติแล้ว`;
    const vehicleNote = lastItem.vehicleResult === 'no_vehicle'
      ? '<div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:8px;color:#78350f;font-weight:bold;margin:16px 0">⚠️ GA แจ้ง: ไม่มีรถให้ใช้งาน</div>'
      : (lastItem.vehicleResult === 'assigned' ? '<div style="background:#d1fae5;border-left:4px solid #10b981;padding:12px 16px;border-radius:8px;color:#065f46;font-weight:bold;margin:16px 0">✅ GA จัดรถให้แล้ว</div>' : '');

    const html = `
      <div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:20px">
        <div style="background:#16a34a;color:white;padding:24px 32px;border-radius:16px 16px 0 0;text-align:center">
          <h2 style="margin:0;font-size:20px;letter-spacing:2px">✓ อนุมัติเรียบร้อย</h2>
          <p style="margin:4px 0 0;font-size:12px;opacity:0.9">SOC Systems — TBKK Group</p>
        </div>
        <div style="background:white;padding:32px;border-radius:0 0 16px 16px;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
          <p style="font-size:14px;color:#334155">เรียน คุณ${requester.displayName || requester.name || lastItem.requesterName || '-'}</p>
          <p style="font-size:14px;color:#334155;margin-bottom:16px"><strong>${formName}</strong> ของคุณได้รับการอนุมัติครบทุกขั้นตอนแล้ว</p>
          ${vehicleNote}
          <div style="background:#f1f5f9;border-radius:12px;padding:16px;margin:16px 0">
            <table style="width:100%;font-size:13px;color:#475569">
              <tr><td style="padding:4px 0;font-weight:600">เอกสาร:</td><td>${formName}</td></tr>
              <tr><td style="padding:4px 0;font-weight:600">วันที่ขอ:</td><td>${fmtDate(lastItem.createdAt)}</td></tr>
              <tr><td style="padding:4px 0;font-weight:600">อนุมัติโดย:</td><td>${lastItem.approvedBy || '-'}</td></tr>
              <tr><td style="padding:4px 0;font-weight:600">อนุมัติเมื่อ:</td><td>${fmtDate(lastItem.acknowledgedAt)}</td></tr>
            </table>
          </div>
          <p style="font-size:12px;color:#64748b;text-align:center;line-height:1.6">คุณสามารถตรวจสอบรายละเอียดเพิ่มเติมได้ในระบบ</p>
        </div>
        <p style="text-align:center;font-size:10px;color:#94a3b8;margin-top:16px">SOC Systems | TBKK</p>
      </div>
    `;
    const text = `${formName} ของคุณได้รับการอนุมัติครบทุกขั้นตอนแล้ว\n\nเอกสาร: ${formName}\nวันที่ขอ: ${fmtDate(lastItem.createdAt)}\nอนุมัติโดย: ${lastItem.approvedBy || '-'}\nอนุมัติเมื่อ: ${fmtDate(lastItem.acknowledgedAt)}`;

    await postEmail('/api/send-email', { to, subject, html, text });
    console.log(`[notifyEmail] แจ้งผู้ขอว่าเสร็จแล้ว → ${to}`);
  } catch (err) {
    console.warn('[notifyEmail] notifyWorkflowCompleted error:', err);
  }
}

/** ส่งเมลให้ผู้ขอ เมื่อ workflow ถูกส่งกลับให้แก้ไข */
export async function notifyWorkflowReturned(item, { returnNote, returnedBy } = {}) {
  if (!item) return;
  try {
    const requester = await getUserById(item.requesterId);
    const to = requester?.email;
    if (!to) {
      console.log('[notifyEmail] ผู้ขอไม่มีอีเมล, ข้ามแจ้งเตือน returned');
      return;
    }
    const formName = formNameOf(item.sourceForm);
    const subject = `[SOC] ${formName} ถูกส่งกลับให้แก้ไข`;
    const html = `
      <div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:20px">
        <div style="background:#ea580c;color:white;padding:24px 32px;border-radius:16px 16px 0 0;text-align:center">
          <h2 style="margin:0;font-size:20px;letter-spacing:2px">⚠ ส่งกลับให้แก้ไข</h2>
          <p style="margin:4px 0 0;font-size:12px;opacity:0.9">SOC Systems — TBKK Group</p>
        </div>
        <div style="background:white;padding:32px;border-radius:0 0 16px 16px;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
          <p style="font-size:14px;color:#334155">เรียน คุณ${requester.displayName || requester.name || item.requesterName || '-'}</p>
          <p style="font-size:14px;color:#334155;margin-bottom:16px"><strong>${formName}</strong> ของคุณถูกส่งกลับให้แก้ไข</p>
          ${returnNote ? `<div style="background:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;border-radius:8px;color:#7f1d1d;margin:16px 0"><div style="font-weight:bold;margin-bottom:4px">เหตุผล:</div><div>${returnNote}</div></div>` : ''}
          <div style="background:#f1f5f9;border-radius:12px;padding:16px;margin:16px 0">
            <table style="width:100%;font-size:13px;color:#475569">
              <tr><td style="padding:4px 0;font-weight:600">เอกสาร:</td><td>${formName}</td></tr>
              <tr><td style="padding:4px 0;font-weight:600">วันที่ขอ:</td><td>${fmtDate(item.createdAt)}</td></tr>
              <tr><td style="padding:4px 0;font-weight:600">ส่งกลับโดย:</td><td>${returnedBy || '-'}</td></tr>
            </table>
          </div>
          <p style="font-size:12px;color:#64748b;text-align:center;line-height:1.6">กรุณาเข้าระบบเพื่อแก้ไขและส่งใหม่</p>
        </div>
        <p style="text-align:center;font-size:10px;color:#94a3b8;margin-top:16px">SOC Systems | TBKK</p>
      </div>
    `;
    const text = `${formName} ของคุณถูกส่งกลับให้แก้ไข\n\nเหตุผล: ${returnNote || '-'}\nส่งกลับโดย: ${returnedBy || '-'}\n\nกรุณาเข้าระบบเพื่อแก้ไขและส่งใหม่`;
    await postEmail('/api/send-email', { to, subject, html, text });
    console.log(`[notifyEmail] แจ้งผู้ขอว่าถูกส่งกลับ → ${to}`);
  } catch (err) {
    console.warn('[notifyEmail] notifyWorkflowReturned error:', err);
  }
}
