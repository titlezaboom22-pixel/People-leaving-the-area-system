import { collection, query, where, getDocs } from 'firebase/firestore';
import emailjs from '@emailjs/browser';
import { db, firebaseReady, appId } from './firebase';
import { normalizeDepartment } from './constants';

// Backend SMTP server endpoint (optional — run `node server/email-server.js`)
const EMAIL_API = import.meta.env.VITE_EMAIL_API || 'http://localhost:3001';
const API_KEY = import.meta.env.VITE_API_KEY || '';

function authHeaders(extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  if (API_KEY) headers['x-api-key'] = API_KEY;
  return headers;
}

async function checkEmailServer() {
  try {
    const res = await fetch(`${EMAIL_API}/api/health`, { signal: AbortSignal.timeout(3500) });
    const data = await res.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
}

async function sendViaBackendServer({ to, subject, html, text }) {
  const res = await fetch(`${EMAIL_API}/api/send-email`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ to, subject, html, body: text }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Backend email failed');
  // 🚨 Demo mode = SMTP creds ไม่ได้ตั้ง — ระบบไม่ได้ส่งจริง! ต้อง throw เพื่อ fallback ไป mailto:
  if (data.demo === true) {
    throw new Error('SMTP_NOT_CONFIGURED: Server is in demo mode (no SMTP credentials)');
  }
  return data;
}

/**
 * ส่ง FCM push ไปยังผู้ใช้ตาม staffId — อ่าน fcmTokens จาก users/{staffId}
 * @param {string} staffId — รหัสผู้รับ
 * @param {string} title — หัวข้อ notification
 * @param {string} body — เนื้อหา notification
 * @param {string} clickUrl — URL เปิดเมื่อกด notification
 */
export async function sendPushToUser(staffId, { title, body, clickUrl }) {
  if (!staffId || !firebaseReady || !db) return { ok: false, reason: 'no-staff-or-db' };
  try {
    // อ่าน fcmTokens จาก Firestore
    const { doc, getDoc } = await import('firebase/firestore');
    const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', staffId);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return { ok: false, reason: 'user-not-found' };
    const tokens = snap.data().fcmTokens || [];
    if (tokens.length === 0) return { ok: false, reason: 'no-tokens' };

    const res = await fetch(`${EMAIL_API}/api/send-push`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ tokens, title, body, data: { clickUrl: clickUrl || '' } }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, reason: `http-${res.status}` };
    const data = await res.json();

    // ลบ invalid tokens ออกจาก user doc
    if (data.invalidTokens?.length > 0) {
      try {
        const { updateDoc, arrayRemove } = await import('firebase/firestore');
        await updateDoc(userRef, { fcmTokens: arrayRemove(...data.invalidTokens) });
      } catch {}
    }

    return { ok: data.success, sent: data.sent, failed: data.failed };
  } catch (err) {
    return { ok: false, reason: 'error', error: err?.message };
  }
}

/**
 * ตรวจ rate limit สำหรับ public form (guest)
 * Returns true = ยอมให้ submit, false = เกิน limit แล้ว
 */
export async function checkPublicFormRate() {
  try {
    const res = await fetch(`${EMAIL_API}/api/public-submit-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 429) return { ok: false, reason: 'rate-limit', message: 'ลงทะเบียนบ่อยเกินไป — ลองใหม่ในอีก 1 ชั่วโมง' };
    const data = await res.json().catch(() => ({}));
    return { ok: !!data.ok, reason: data.ok ? null : 'unknown' };
  } catch (err) {
    // ถ้า server ไม่ตอบ — ยอมให้ submit (fail-open) เพื่อไม่ให้ระบบใช้ไม่ได้
    console.warn('rate check failed, allowing submit:', err?.message);
    return { ok: true, reason: 'server-unreachable' };
  }
}

// ========== EmailJS Config ==========
// ถ้าตั้งค่าครบ = ส่งผ่าน EmailJS (HTML, clickable, auto-send, ไม่ต้องเปิด Outlook)
// ถ้าไม่ครบ = fallback กลับไป mailto (เปิด Outlook ให้พนักงานกด Send เอง)
const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID || '';
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || '';
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || '';
const emailjsReady = !!(EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_PUBLIC_KEY);

if (emailjsReady) {
  try { emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY }); } catch (e) { console.warn('EmailJS init failed:', e); }
}

function formatIsoDateThaiShort(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '-';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${String(y).slice(-2)}`;
}

function formatTimeThai(hm) {
  if (!hm) return '-';
  return `${hm.replace(':', '.')} น.`;
}

/**
 * ดึง email หัวหน้าแผนกจาก Firestore
 * @param {string} department - ชื่อแผนก เช่น "SOC (ศูนย์ปฏิบัติการ)"
 * @returns {Promise<string|null>} email หรือ null ถ้าไม่พบ
 */
export async function getHeadEmail(department) {
  if (!firebaseReady || !db) return null;
  if (!department) return null;

  const normalizedInput = normalizeDepartment(department);

  try {
    // ดึงหัวหน้าทั้งหมด แล้วเทียบแผนกแบบ normalize
    const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
    const q = query(usersRef, where('roleType', '==', 'HEAD'));
    const snap = await getDocs(q);

    for (const doc of snap.docs) {
      const data = doc.data();
      if (normalizeDepartment(data.department) === normalizedInput && data.email) {
        return data.email;
      }
    }

    // ถ้าไม่เจอ HEAD ที่ตรงแผนก → ไม่ส่ง (ไม่ fallback ไป HEAD อื่น)
  } catch (err) {
    console.warn('getHeadEmail error:', err);
  }
  return null;
}

/**
 * เปิด Outlook ด้วย mailto: link
 * @param {object} options
 * @param {string} options.to - email ผู้รับ
 * @param {string} options.subject - หัวข้อ
 * @param {string} options.body - เนื้อหา
 */
export function openOutlook({ to, subject, body }) {
  const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailtoUrl;
}

const LINE = '════════════════════════════════════════';
const THIN = '────────────────────────────────────────';
const today = () => new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });

function getAppUrl() {
  return import.meta.env.VITE_PUBLIC_URL || window.location.origin;
}

function docHeader(title, docNo) {
  return (
    `${LINE}\n` +
    `    บริษัท TBKK  |  SOC Systems\n` +
    `${LINE}\n` +
    `    ${title}\n` +
    `    เลขที่: ${docNo}\n` +
    `    วันที่ออกเอกสาร: ${today()}\n` +
    `${THIN}\n\n`
  );
}

function docFooter(approveUrl) {
  return (
    `\n${THIN}\n` +
    `ลงชื่อผู้ขอ: ___________________  วันที่: ___________\n\n` +
    `ลงชื่อผู้อนุมัติ: ___________________  วันที่: ___________\n` +
    `${LINE}\n\n` +
    (approveUrl
      ? `>>> กดลิงก์ด้านล่างเพื่อลงลายเซ็นอนุมัติ (ไม่ต้อง Login) <<<\n\n${approveUrl}\n\n`
      : '') +
    `${LINE}\n` +
    `ส่งจากระบบ SOC Systems อัตโนมัติ`
  );
}

export function buildApproveUrl(workflowId) {
  const url = getAppUrl();
  return `${url}/index.html?approve=${workflowId}`;
}

function genDocNo(prefix) {
  const d = new Date();
  const yy = d.getFullYear().toString().slice(-2);
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const seq = Math.floor(Math.random() * 9000 + 1000);
  return `${prefix}-${yy}${mm}-${seq}`;
}

function row(label, value) {
  return `  ${label.padEnd(20, ' ')}:  ${value || '-'}\n`;
}

// ========== HTML Document Builder (Outlook-compatible inline styles) ==========

const S = {
  doc: 'font-family:Sarabun,Segoe UI,sans-serif;max-width:700px;margin:0 auto;border:2px solid #333;color:#1a1a1a',
  header: 'text-align:center;padding:18px;border-bottom:2px solid #333',
  h1: 'font-size:20px;font-weight:900;margin:0 0 2px',
  h2: 'font-size:13px;font-weight:400;color:#555;margin:0',
  body: 'padding:18px 22px;font-size:14px',
  fieldRow: 'margin-bottom:6px',
  label: 'font-weight:700;display:inline-block;min-width:170px',
  value: 'border-bottom:1px dotted #999;display:inline-block;min-width:150px;padding-bottom:1px',
  section: 'margin-top:14px;padding-top:10px;border-top:1px solid #ccc',
  sectionTitle: 'font-weight:900;font-size:13px;margin-bottom:8px;background:#f0f0f0;padding:5px 10px',
  th: 'border:1px solid #999;padding:5px 8px;background:#f5f5f5;font-weight:700;text-align:center;font-size:13px',
  td: 'border:1px solid #999;padding:5px 8px;font-size:13px',
  cbBox: 'display:inline-block;width:14px;height:14px;border:2px solid #333;text-align:center;font-size:11px;line-height:14px;margin-right:4px;vertical-align:middle',
  cbChecked: 'display:inline-block;width:14px;height:14px;border:2px solid #2563eb;background:#2563eb;color:#fff;text-align:center;font-size:11px;line-height:14px;margin-right:4px;vertical-align:middle',
  signArea: 'margin-top:28px;padding-top:16px;border-top:2px solid #333',
  signBox: 'display:inline-block;width:45%;text-align:center;vertical-align:bottom',
  signLine: 'border-bottom:1px solid #333;height:50px;margin-bottom:3px',
  signTitle: 'font-size:12px;font-weight:700',
  approveBox: 'margin-top:18px;padding:14px;background:#eff6ff;border:2px solid #3b82f6;text-align:center',
  approveBtn: 'display:inline-block;padding:10px 28px;background:#2563eb;color:#fff;text-decoration:none;font-weight:bold;font-size:14px',
};

function fld(label, value) {
  return `<div style="${S.fieldRow}"><span style="${S.label}">${label}:</span> <span style="${S.value}">${value || '-'}</span></div>`;
}

function fld2(l1, v1, l2, v2) {
  return `<div style="${S.fieldRow}"><span style="${S.label}">${l1}:</span> <span style="${S.value}">${v1 || '-'}</span> &nbsp;&nbsp; <span style="font-weight:700">${l2}:</span> <span style="${S.value}">${v2 || '-'}</span></div>`;
}

function itemsTable(headers, rows) {
  return `<table style="width:100%;border-collapse:collapse;margin:8px 0">
    <thead><tr>${headers.map(h => `<th style="${S.th}">${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(cols => `<tr>${cols.map(c => `<td style="${S.td}">${c || '-'}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;
}

function checkbox(checked, label) {
  return `<div style="display:inline-block;width:48%;margin-bottom:4px;font-size:13px"><span style="${checked ? S.cbChecked : S.cbBox}">${checked ? '✓' : ''}</span> ${label}</div>`;
}

function signArea(requesterSign, todayStr) {
  return `<div style="${S.signArea}">
    <div style="${S.signBox}">
      ${requesterSign ? `<img src="${requesterSign}" style="max-width:170px;max-height:55px;display:block;margin:0 auto 3px" alt="sig"/>` : `<div style="${S.signLine}"></div>`}
      <div style="${S.signTitle}">ผู้ขออนุญาต (Pos)</div>
      <div style="font-size:11px;color:#666">วันที่: ${todayStr}</div>
    </div>
    <div style="${S.signBox}">
      <div style="${S.signLine}"></div>
      <div style="${S.signTitle}">หน.แผนก/ผู้จัดการฝ่าย</div>
      <div style="font-size:11px;color:#666">วันที่: ___________</div>
    </div>
  </div>`;
}

function approveSection(url) {
  if (!url) return '';
  return `<div style="${S.approveBox}">
    <p style="margin:0 0 8px;font-weight:bold;color:#1e40af;font-size:14px">กดลิงก์ด้านล่างเพื่อลงลายเซ็นอนุมัติ (ไม่ต้อง Login)</p>
    <a href="${url}" style="${S.approveBtn}">คลิกเพื่อเซ็นอนุมัติ</a>
    <p style="margin:6px 0 0;font-size:11px;color:#64748b">${url}</p>
  </div>`;
}

function docWrap(title, subtitle, docNo, todayStr, bodyHtml, requesterSign, approveUrl) {
  return `<div style="${S.doc}">
    <div style="${S.header}">
      <h1 style="${S.h1}">${title}</h1>
      ${subtitle ? `<h2 style="${S.h2}">${subtitle}</h2>` : ''}
    </div>
    <div style="${S.body}">
      ${bodyHtml}
      ${signArea(requesterSign, todayStr)}
      ${approveSection(approveUrl)}
      <p style="text-align:center;font-size:10px;color:#999;margin-top:12px">เลขที่: ${docNo} | ส่งจากระบบ SOC Systems อัตโนมัติ</p>
    </div>
  </div>`;
}

export function buildEmailHtml(formType, data, approveUrl, requesterSign) {
  const docNo = genDocNo({ DRINK_ORDER: 'DRK', FOOD_ORDER: 'FOOD', VEHICLE_BOOKING: 'VHC', OUTING_REQUEST: 'OUT', GOODS_IN_OUT: 'GDS', EQUIPMENT: 'EQP' }[formType] || 'DOC');
  const todayStr = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });

  switch (formType) {
    case 'VEHICLE_BOOKING': {
      const passengers = Array.isArray(data.passengers) ? data.passengers : [];
      const routes = Array.isArray(data.routes) && data.routes.length > 0
        ? data.routes
        : (data.destination ? [{ origin: '-', destination: data.destination }] : []);
      const purposeCode = (data.purpose || '').toString().trim().slice(0, 3);
      const purposeDetail = (data.purpose || '').toString().includes(':')
        ? (data.purpose || '').split(':').slice(1).join(':').trim()
        : '';
      const drivingOpt = data.drivingOption || (data.driveSelf ? '6.1' : (data.needDriver ? '6.2' : ''));
      const purposeOpts = [
        { code: '5.1', label: 'ติดต่องานบริษัท' },
        { code: '5.2', label: 'ไปต่างจังหวัด' },
        { code: '5.3', label: 'รับ-ส่งลูกค้า' },
        { code: '5.4', label: 'บริเวณในโรงงาน' },
        { code: '5.5', label: 'อื่นๆ' },
      ];
      const chip = (on, text) => `<span style="display:inline-block;padding:4px 10px;margin:2px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;background:${on ? '#4f46e5' : '#fff'};color:${on ? '#fff' : '#1e293b'};font-weight:${on ? '700' : '400'}">${text}</span>`;
      const badge = (n, title) => `<div style="display:flex;align-items:center;gap:8px;margin:12px 0 8px"><span style="width:24px;height:24px;border-radius:50%;background:#4f46e5;color:#fff;display:inline-block;text-align:center;line-height:24px;font-weight:900;font-size:12px">${n}</span><span style="font-weight:900;color:#1e293b;font-size:14px">${title}</span></div>`;

      const body =
        badge(1, 'ผู้ขอใช้รถ') +
        fld('ชื่อ-นามสกุล', data.name) +
        fld2('รหัสพนักงาน', data.requesterId, 'แผนก', data.department) +

        badge(2, `ผู้ร่วมเดินทาง (${passengers.length} คน)`) +
        (passengers.length === 0
          ? `<div style="color:#94a3b8;font-size:12px;text-align:center;padding:8px">— ไม่มีผู้ร่วมเดินทาง —</div>`
          : itemsTable(['#', 'ชื่อ-นามสกุล', 'รหัส', 'แผนก'], passengers.map((p, i) => [i + 1, p.name || '-', p.empId || '-', p.dept || '-']))) +

        badge(3, 'วันและเวลา') +
        fld('วันที่ขอใช้รถ', formatIsoDateThaiShort(data.date)) +
        fld2('เวลาออก', formatTimeThai(data.timeStart), 'เวลากลับ', formatTimeThai(data.timeEnd)) +

        badge(4, 'เส้นทาง') +
        (routes.length === 0
          ? `<div style="color:#94a3b8;font-size:12px;padding:8px">— ไม่ระบุ —</div>`
          : routes.map((r) => `<div style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:4px;font-size:13px"><span style="color:#16a34a">🟢 ${r.origin || '-'}</span> <span style="color:#6366f1;font-weight:900">→</span> <span style="color:#dc2626">🔴 ${r.destination || '-'}</span></div>`).join('')) +

        badge(5, 'วัตถุประสงค์การใช้รถ') +
        `<div>${purposeOpts.map((o) => chip(purposeCode === o.code, `<b>${o.code}</b> ${o.label}`)).join(' ')}</div>` +
        (purposeDetail ? `<div style="margin-top:8px;padding:8px;background:#eef2ff;border-left:3px solid #6366f1;border-radius:4px;font-size:13px"><b>รายละเอียด:</b> ${purposeDetail}</div>` : '') +

        badge(6, 'การขับรถ') +
        `<div>${chip(drivingOpt === '6.1', '🚗 <b>6.1</b> ต้องการขับเอง')} ${chip(drivingOpt === '6.2', '👤 <b>6.2</b> ต้องการใช้พนักงานขับรถให้')}</div>` +

        (data.approvedCarNo
          ? `<div style="margin-top:14px;padding:10px;background:#ecfdf5;border:1px solid #6ee7b7;border-radius:6px"><p style="margin:0;color:#065f46;font-weight:900;font-size:13px">✓ รถที่อนุมัติแล้ว</p>${fld('ทะเบียนรถ', data.approvedCarNo)}${data.driver ? fld('พนักงานขับรถ', data.driver) : ''}</div>`
          : '');

      return docWrap('ใบขออนุญาตใช้รถ/จองรถ เพื่อปฏิบัติงาน', '(Vehicle Request Form)', docNo, todayStr, body, requesterSign, approveUrl);
    }

    case 'DRINK_ORDER': {
      const rows = (data.rows || []).filter(r => r.details);
      const body =
        fld('ผู้รับผิดชอบ', data.responsiblePerson) +
        fld2('รหัสพนักงาน', data.employeeId, 'แผนก', data.department) +
        fld2('วันที่สั่ง', data.orderDate, 'เวลา', data.orderTime) +
        `<div style="${S.section}">` +
        itemsTable(['ลำดับ', 'รายการ', 'จำนวน', 'เงื่อนไข'], rows.map((r, i) => [i + 1, r.details, r.count, r.condition])) +
        `</div>` +
        fld('หมายเหตุ', data.note);
      return docWrap('แบบการสั่งเครื่องดื่มเพื่อลูกค้า', '(Drink Order Form)', docNo, todayStr, body, requesterSign, approveUrl);
    }

    case 'FOOD_ORDER': {
      const rows = (data.rows || []).filter(r => r.details);
      const body =
        fld('ผู้รับผิดชอบ', data.responsiblePerson) +
        fld2('รหัสพนักงาน', data.employeeId, 'แผนก', data.department) +
        fld2('วันที่สั่ง', data.orderDate, 'เวลา', data.orderTime) +
        `<div style="${S.section}">` +
        itemsTable(['ลำดับ', 'รายการ', 'จำนวน', 'เงื่อนไข'], rows.map((r, i) => [i + 1, r.details, r.count, r.condition])) +
        `</div>` +
        fld('หมายเหตุ', data.note);
      return docWrap('แบบการสั่งอาหารเพื่อรับรองลูกค้า', '(Food Order Form)', docNo, todayStr, body, requesterSign, approveUrl);
    }

    case 'OUTING_REQUEST': {
      const rows = (data.rows || []).filter(r => r.name);
      const body =
        fld('ผู้อนุมัติ', data.managerName) +
        fld2('ตำแหน่ง', data.approverTitle, 'ประเภท', data.type) +
        fld2('วันที่', data.date, 'จำนวนคน', `${data.totalCount || '-'} คน`) +
        `<div style="${S.section}"><div style="${S.sectionTitle}">รายชื่อผู้ออกนอกสถานที่</div>` +
        itemsTable(['ลำดับ', 'ชื่อ', 'ปลายทาง', 'เวลาออก', 'เวลากลับ'], rows.map((r, i) => [i + 1, r.name, r.destination, r.timeOut, r.timeIn])) +
        `</div>` +
        fld('หมายเหตุ', data.note);
      return docWrap('ใบขออนุญาตออกนอกสถานที่', '(Outing Request Form)', docNo, todayStr, body, requesterSign, approveUrl);
    }

    case 'GOODS_IN_OUT': {
      const lines = (data.lines || []).filter(l => l.description);
      const body =
        fld('ประเภท', data.direction === 'IN' ? 'นำของเข้า' : 'นำของออก') +
        fld2('ประตู', data.gate, 'เลขที่เอกสาร', data.docNo) +
        fld2('เลขที่ซีล', data.sealNo, 'ทะเบียนรถ', data.vehiclePlate) +
        fld2('ผู้นำของ', data.carrierName, 'รหัสพนักงาน', data.staffId) +
        fld('แผนก', data.dept) +
        `<div style="${S.section}"><div style="${S.sectionTitle}">รายการของ</div>` +
        itemsTable(['ลำดับ', 'รายการ', 'จำนวน', 'หน่วย'], lines.map((l, i) => [i + 1, l.description, l.qty, l.unit])) +
        `</div>` +
        fld('หมายเหตุ', data.note);
      return docWrap(`ใบนำของ${data.direction === 'IN' ? 'เข้า' : 'ออก'}บริษัท`, '(Goods In/Out Form)', docNo, todayStr, body, requesterSign, approveUrl);
    }

    default: {
      const body = Object.entries(data || {}).map(([k, v]) => fld(k, typeof v === 'object' ? JSON.stringify(v) : String(v))).join('');
      return docWrap('เอกสารรออนุมัติ', '', docNo, todayStr, body, requesterSign, approveUrl);
    }
  }
}

/**
 * สร้าง HTML body สำหรับส่งผ่าน EmailJS — มีปุ่ม clickable + ตาราง + สวยงาม
 *
 * @param {string} formType — ใช้ตัดสินว่ามี "💰 ยอดรวม" แถวหรือไม่
 *                            (food/drink เท่านั้น — ใบขอใช้รถ/ออกนอก/ของเข้า-ออกไม่มียอดเงิน)
 */
function buildEmailJsHtml({ formName, formType, name, dept, rowCount, grandTotal, itemsHtml, approveUrl, dateStr, timeStr }) {
  const hasAmountField = ['DRINK_ORDER', 'FOOD_ORDER', 'DRINK_FOOD_ORDER'].includes(formType);
  const totalDisplay = typeof grandTotal === 'number' ? `฿${grandTotal.toLocaleString()}` : '(รอ GA กำหนดราคา)';
  const totalRowHtml = hasAmountField
    ? `<tr><td style="padding:6px 0;color:#64748b">💰 ยอดรวม</td><td style="padding:6px 0;font-weight:700;color:#b45309;font-size:16px">${totalDisplay}</td></tr>`
    : '';
  return `
<div style="font-family:'Segoe UI',Tahoma,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:24px">
  <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#2563eb 0%,#1e40af 100%);color:#fff;padding:24px;text-align:center">
      <div style="font-size:36px;margin-bottom:4px">🔔</div>
      <h1 style="margin:0;font-size:20px;font-weight:900">มีเอกสารใหม่รอเซ็นอนุมัติ</h1>
      <p style="margin:6px 0 0;opacity:.9;font-size:13px">SOC Systems • TBKK Group</p>
    </div>

    <!-- Summary -->
    <div style="padding:24px">
      <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:14px 16px;border-radius:6px;margin-bottom:16px">
        <div style="font-size:16px;font-weight:700;color:#78350f">📋 ${formName}${rowCount > 0 ? ` • ${rowCount} รายการ` : ''}</div>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#64748b;width:110px">👤 ผู้ขอ</td><td style="padding:6px 0;font-weight:600">${name}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">🏢 แผนก</td><td style="padding:6px 0">${dept}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">📅 ส่งเมื่อ</td><td style="padding:6px 0">${dateStr} ${timeStr} น.</td></tr>
        ${totalRowHtml}
      </table>

      ${itemsHtml || ''}

      <!-- Big CTA Button — table-based for max email client compat -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:28px auto 12px">
        <tr>
          <td align="center" bgcolor="#16a34a" style="background:#16a34a;border-radius:10px">
            <a href="${approveUrl}" target="_blank" style="display:inline-block;padding:18px 48px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:18px;font-family:Arial,sans-serif;background:#16a34a;border-radius:10px;border:2px solid #15803d;line-height:1">
              <span style="color:#ffffff;font-weight:bold">✅ กดเพื่อเซ็นอนุมัติ</span>
            </a>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-top:8px">
            <span style="font-size:13px;color:#64748b;font-family:Arial,sans-serif">👉 Click to Approve Document</span>
          </td>
        </tr>
      </table>

      <div style="text-align:center;font-size:12px;color:#64748b;margin-top:8px">
        ✅ ไม่ต้อง Login &nbsp;•&nbsp; 📱 เปิดจากมือถือได้ &nbsp;•&nbsp; ✍️ เซ็นลายมือบนหน้าจอ
      </div>

      <div style="margin-top:16px;padding:12px;background:#f1f5f9;border-radius:6px;font-size:11px;color:#64748b;text-align:center;word-break:break-all">
        หรือคัดลอกลิงก์: <a href="${approveUrl}" style="color:#2563eb">${approveUrl}</a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;padding:14px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0">
      🏢 SOC Systems • TBKK Group — ระบบอนุมัติเอกสารออนไลน์
    </div>

  </div>
</div>`.trim();
}

function buildItemsHtml(formType, data) {
  const fmtPrice = (v) => v == null ? '-' : `฿${Number(v).toLocaleString()}`;
  const cellStyle = 'border:1px solid #e2e8f0;padding:8px;font-size:13px';
  const thStyle = 'border:1px solid #cbd5e1;padding:8px;font-size:12px;background:#f1f5f9;font-weight:700;text-align:center';

  let rows = [];
  if (formType === 'DRINK_ORDER') {
    rows = (data.rows || []).filter(r => r.details).map(r => ({ icon: '☕', ...r }));
  } else if (formType === 'FOOD_ORDER') {
    rows = (data.rows || []).filter(r => r.details).map(r => ({ icon: '🍛', ...r }));
  } else if (formType === 'DRINK_FOOD_ORDER') {
    const drinks = (data.drinkRows || []).filter(r => r.details).map(r => ({ icon: '☕', ...r }));
    const foods = (data.foodRows || []).filter(r => r.details).map(r => ({ icon: '🍛', ...r }));
    rows = [...drinks, ...foods];
  }
  if (rows.length === 0) return '';

  const rowsHtml = rows.map((r, i) => `
    <tr>
      <td style="${cellStyle};text-align:center;width:40px">${i + 1}</td>
      <td style="${cellStyle};text-align:center;width:50px">${r.icon || ''}</td>
      <td style="${cellStyle}">${r.details}</td>
      <td style="${cellStyle};text-align:center;width:50px">${r.count || '-'}</td>
      <td style="${cellStyle};text-align:right;width:80px">${fmtPrice(r.unitPrice)}</td>
      <td style="${cellStyle};text-align:right;width:80px;font-weight:700">${fmtPrice(r.lineTotal)}</td>
    </tr>`).join('');

  return `
    <div style="margin-top:20px">
      <div style="font-weight:700;font-size:14px;margin-bottom:8px;color:#1e293b">📦 รายการที่สั่ง</div>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr>
            <th style="${thStyle}">#</th>
            <th style="${thStyle}">ประเภท</th>
            <th style="${thStyle}">รายการ</th>
            <th style="${thStyle}">จำนวน</th>
            <th style="${thStyle}">ราคา</th>
            <th style="${thStyle}">รวม</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
}

/**
 * ส่ง email ผ่าน EmailJS — HTML, clickable, auto-send
 */
async function sendViaEmailJs({ to, subject, htmlContent, approveUrl, fromName }) {
  const templateParams = {
    to_email: to,
    subject,
    html_content: htmlContent,
    approve_url: approveUrl,
    from_name: fromName || 'SOC Systems',
  };
  const res = await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams);
  return res;
}

/**
 * คัดลอก HTML เอกสารลง clipboard แล้วเปิด Outlook
 * หรือส่งอัตโนมัติผ่าน EmailJS ถ้าตั้งค่าแล้ว
 */
export async function copyHtmlAndOpenOutlook({ to, subject, formType, data, approveUrl, requesterSign }) {
  const formNames = {
    DRINK_ORDER: 'สั่งเครื่องดื่ม',
    FOOD_ORDER: 'สั่งอาหาร',
    DRINK_FOOD_ORDER: 'สั่งเครื่องดื่ม + อาหาร',
    VEHICLE_BOOKING: 'ขอใช้รถ',
    OUTING_REQUEST: 'ขอออกนอกสถานที่',
    GOODS_IN_OUT: 'นำของเข้า/ออก',
    EQUIPMENT: 'เบิกอุปกรณ์',
  };
  const name = data.name || data.responsiblePerson || data.carrierName || data.requesterName || '-';
  const dept = data.department || data.dept || '-';
  const formName = formNames[formType] || 'เอกสาร';

  // ========== สรุปแบบย่อ — รายละเอียดไปดูที่เว็บ ==========
  let rowCount = 0;
  let grandTotal = null;

  if (formType === 'DRINK_ORDER' || formType === 'FOOD_ORDER') {
    const rows = (data.rows || []).filter(r => r.details);
    rowCount = rows.length;
    grandTotal = typeof data.totalAmount === 'number' ? data.totalAmount : null;
  } else if (formType === 'DRINK_FOOD_ORDER') {
    const drinkRows = (data.drinkRows || []).filter(r => r.details);
    const foodRows = (data.foodRows || []).filter(r => r.details);
    rowCount = drinkRows.length + foodRows.length;
    const dTotal = typeof data.drinkTotalAmount === 'number' ? data.drinkTotalAmount : 0;
    const fTotal = typeof data.foodTotalAmount === 'number' ? data.foodTotalAmount : 0;
    grandTotal = dTotal + fTotal;
  }

  const dateStr = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

  // Build pretty HTML once — reused by backend/EmailJS/clipboard
  const itemsHtml = buildItemsHtml(formType, data);
  const htmlContent = buildEmailJsHtml({
    formName, formType, name, dept, rowCount, grandTotal, itemsHtml, approveUrl, dateStr, timeStr,
  });

  // ตรวจว่าเป็นการส่งหลายคนไหม (จะใส่ note "ใครก่อนก็ได้")
  const isMultiRecipient = (to || '').split(',').filter(s => s.trim()).length > 1;

  // Icon ตามประเภทเอกสาร
  const formIcon = {
    VEHICLE_BOOKING: '🚗',
    DRINK_ORDER: '☕',
    FOOD_ORDER: '🍱',
    DRINK_FOOD_ORDER: '🍱',
    OUTING_REQUEST: '🚪',
    GOODS_IN_OUT: '📦',
    EQUIPMENT: '🔧',
  }[formType] || '📋';

  // Clean plain-text version — URL at very end, alone on line, NO emoji/char adjacent
  // This maximizes Outlook's auto-linkify detection chance
  const plainBody =
    `${formIcon} TBKK ระบบ${formName} — รอท่านอนุมัติ\r\n` +
    `═══════════════════════════════════════\r\n\r\n` +
    `สวัสดีครับ/ค่ะ\r\n\r\n` +
    `มี"ใบ${formName}"จากพนักงานในแผนกของท่าน รอท่านพิจารณาอนุมัติครับ\r\n\r\n` +
    (isMultiRecipient ? `⚠️ อีเมลนี้ส่งให้หัวหน้าหลายท่านพร้อมกัน — ใครเห็นก่อนกดอนุมัติได้เลย ไม่ต้องรอกัน\r\n\r\n` : '') +
    `┌─ รายละเอียด ─────────────────────┐\r\n` +
    `│ ประเภทเอกสาร: ${formName}\r\n` +
    `│ ผู้ขอ: ${name}\r\n` +
    `│ แผนก: ${dept}\r\n` +
    `│ ส่งเมื่อ: ${dateStr} ${timeStr} น.\r\n` +
    (rowCount > 0 ? `│ รายการ: ${rowCount} รายการ\r\n` : '') +
    (typeof grandTotal === 'number' ? `│ ยอดรวม: ${grandTotal.toLocaleString()} บาท\r\n` : '') +
    `└──────────────────────────────────┘\r\n` +
    `\r\n═══════════════════════════════════════\r\n` +
    `📌 TBKK SOC Systems — ระบบจัดการเอกสารออนไลน์\r\n` +
    `   no-reply@tbkk.co.th\r\n` +
    (approveUrl
      ? `\r\n👇 กดลิงก์ด้านล่างเพื่อเซ็นอนุมัติทันที (ไม่ต้อง Login)\r\n\r\n${approveUrl}`
      : '');
  // ↑ URL is the LAST thing, alone on its own line, with blank line before
  // Outlook auto-linkify REQUIRES clear URL boundaries (whitespace/newline on both sides)

  // ========== (1) Backend SMTP server — ส่งอัตโนมัติ HTML ปุ่มกดได้ (ดีที่สุด) ==========
  try {
    if (await checkEmailServer()) {
      await sendViaBackendServer({ to, subject, html: htmlContent, text: plainBody });
      console.log('✅ Email sent via backend SMTP server');
      showToast({
        title: '✅ ส่ง Email อัตโนมัติเรียบร้อย!',
        msg: `ส่งไปที่ <b>${to}</b> แล้ว หัวหน้าจะได้ HTML email พร้อมปุ่มกดได้ทันที`,
        color: '#16a34a',
      });
      return { ok: true, method: 'backend-smtp' };
    }
  } catch (err) {
    console.warn('⚠️ Backend SMTP failed, trying next:', err);
  }

  // ========== (2) EmailJS — ถ้า config ครบ ส่งอัตโนมัติ HTML ปุ่มกดได้ ==========
  if (emailjsReady && approveUrl) {
    try {
      await sendViaEmailJs({ to, subject, htmlContent, approveUrl, fromName: name });
      console.log('✅ Email sent via EmailJS');
      showToast({
        title: '✅ ส่ง Email อัตโนมัติเรียบร้อย!',
        msg: `ส่งผ่าน EmailJS ไปที่ <b>${to}</b> แล้ว`,
        color: '#16a34a',
      });
      return { ok: true, method: 'emailjs' };
    } catch (err) {
      console.warn('⚠️ EmailJS failed, falling back to mailto:', err);
    }
  }

  // ========== (3) Fallback: เปิด Outlook ของผู้ขอเองด้วย mailto: ==========
  // ผู้ขอจะเห็น Outlook เด้งขึ้น พร้อมเนื้อหา email ที่กรอกไว้แล้ว
  // เพียงกด "Send" ใน Outlook → email ออกจาก email ของผู้ขอเอง (From: คนที่กรอกฟอร์ม)
  console.warn('📧 ทุก auto-channel ล้ม — เปิด Outlook ให้ผู้ขอกด Send เองแทน');
  console.warn(`   Target: ${to}`);

  try {
    // คัดลอก HTML ลง clipboard ก่อน — เผื่อ user ต้อง paste ใน Outlook
    if (navigator.clipboard && window.ClipboardItem) {
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const textBlob = new Blob([plainBody], { type: 'text/plain' });
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'text/html': blob, 'text/plain': textBlob })]);
      } catch {
        // Fallback: just text
        await navigator.clipboard.writeText(plainBody);
      }
    }

    // เปิด Outlook ด้วย mailto: link — body เป็น plain text (Outlook จะใช้ default formatting)
    const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(plainBody)}`;
    // ใช้ window.location.href แทน window.open — กัน popup blocker
    window.location.href = mailtoUrl;

    showToast({
      title: '📧 เปิด Outlook ให้แล้ว — กด Send ใน Outlook',
      msg: `เนื้อหาคัดลอกไว้ใน clipboard แล้ว ถ้า Outlook ไม่เด้งขึ้น สามารถ paste (Ctrl+V) ลง email ใหม่ก็ได้<br><br>ส่งจาก: <b>email ของคุณเอง</b><br>ถึง: ${to}`,
      color: '#2563eb',
      duration: 10000,
    });
    return { ok: true, method: 'mailto-outlook' };
  } catch (err) {
    console.error('❌ Even mailto: fallback failed:', err);
    showToast({
      title: '⚠️ เอกสารบันทึกแล้ว แต่ส่งอีเมลไม่สำเร็จ',
      msg: `เปิด Outlook ไม่ได้<br>เอกสารยังอยู่ในระบบ → ผู้อนุมัติเปิดหน้าเว็บได้ตรงๆ`,
      color: '#dc2626',
      duration: 8000,
    });
    return { ok: false, method: 'failed', reason: 'all-channels-failed' };
  }
}

// Reusable toast helper
function showToast({ title, msg, color = '#1e40af', duration = 6000 }) {
  try {
    const toast = document.createElement('div');
    toast.style.cssText = `position:fixed;top:20px;right:20px;z-index:99999;background:${color};color:#fff;padding:16px 24px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.25);font-family:Sarabun,sans-serif;font-size:14px;max-width:380px;line-height:1.5;transition:opacity 1s`;
    toast.innerHTML = `
      <div style="font-weight:900;font-size:15px;margin-bottom:6px">${title}</div>
      <div style="font-size:13px;opacity:.95">${msg}</div>`;
    document.body.appendChild(toast);
    setTimeout(() => (toast.style.opacity = '0'), duration);
    setTimeout(() => toast.remove(), duration + 1000);
  } catch {}
}

/**
 * สร้างเนื้อหา email เป็นรูปแบบใบเอกสารทางการ (plain text fallback)
 */
export function buildEmailBody(formType, data, approveUrl) {
  switch (formType) {
    case 'DRINK_ORDER':
      return docHeader('ใบสั่งเครื่องดื่มเพื่อรับรองลูกค้า', genDocNo('DRK')) +
        `เรียน  หัวหน้าแผนก ${data.department || '-'}\n\n` +
        `ข้าพเจ้าขออนุมัติสั่งเครื่องดื่มตามรายละเอียดด้านล่าง:\n\n` +
        row('ผู้รับผิดชอบ', data.responsiblePerson) +
        row('รหัสพนักงาน', data.employeeId) +
        row('แผนก', data.department) +
        row('วันที่สั่ง', data.orderDate) +
        row('เวลา', data.orderTime) +
        `\n  รายการสั่ง:\n` +
        ((data.rows || []).filter(r => r.details).map((r, i) =>
          `    ${i + 1}. ${r.details || '-'}  |  จำนวน: ${r.count || '-'}  |  เงื่อนไข: ${r.condition || '-'}`
        ).join('\n') || '    (ไม่มีรายการ)') +
        `\n\n` + row('หมายเหตุ', data.note) +
        docFooter(approveUrl);

    case 'FOOD_ORDER':
      return docHeader('ใบสั่งอาหารเพื่อรับรองลูกค้า', genDocNo('FOOD')) +
        `เรียน  หัวหน้าแผนก ${data.department || '-'}\n\n` +
        `ข้าพเจ้าขออนุมัติสั่งอาหารตามรายละเอียดด้านล่าง:\n\n` +
        row('ผู้รับผิดชอบ', data.responsiblePerson) +
        row('รหัสพนักงาน', data.employeeId) +
        row('แผนก', data.department) +
        row('วันที่สั่ง', data.orderDate) +
        row('เวลา', data.orderTime) +
        `\n  รายการสั่ง:\n` +
        ((data.rows || []).filter(r => r.details).map((r, i) =>
          `    ${i + 1}. ${r.details || '-'}  |  จำนวน: ${r.count || '-'}  |  เงื่อนไข: ${r.condition || '-'}`
        ).join('\n') || '    (ไม่มีรายการ)') +
        `\n\n` + row('หมายเหตุ', data.note) +
        docFooter(approveUrl);

    case 'VEHICLE_BOOKING':
      return docHeader('ใบขออนุญาตใช้รถบริษัท', genDocNo('VHC')) +
        `เรียน  หัวหน้าแผนก ${data.department || '-'}\n\n` +
        `ข้าพเจ้าขออนุญาตใช้รถบริษัทตามรายละเอียดด้านล่าง:\n\n` +
        row('ผู้ขอใช้รถ', data.name) +
        row('รหัสพนักงาน', data.requesterId) +
        row('แผนก', data.department) +
        row('วันที่ใช้รถ', formatIsoDateThaiShort(data.date)) +
        row('เวลาออก', formatTimeThai(data.timeStart)) +
        row('เวลากลับ', formatTimeThai(data.timeEnd)) +
        row('ปลายทาง', data.destination) +
        row('ทะเบียนรถ', data.approvedCarNo) +
        row('พนักงานขับรถ', data.driver) +
        docFooter(approveUrl);

    case 'OUTING_REQUEST':
      return docHeader('ใบขออนุญาตออกนอกสถานที่', genDocNo('OUT')) +
        `เรียน  หัวหน้าแผนก\n\n` +
        `ข้าพเจ้าขออนุญาตออกนอกสถานที่ตามรายละเอียดด้านล่าง:\n\n` +
        row('ผู้อนุมัติ', data.managerName) +
        row('ตำแหน่ง', data.approverTitle) +
        row('ประเภท', data.type) +
        row('วันที่', data.date) +
        row('จำนวนคน', `${data.totalCount || '-'} คน`) +
        `\n  รายชื่อผู้ออกนอกสถานที่:\n` +
        ((data.rows || []).filter(r => r.name).map((r, i) =>
          `    ${i + 1}. ${r.name || '-'}  |  ไป: ${r.destination || '-'}  |  ออก: ${r.timeOut || '-'}  |  กลับ: ${r.timeIn || '-'}`
        ).join('\n') || '    (ไม่มีรายชื่อ)') +
        `\n\n` + row('หมายเหตุ', data.note) +
        docFooter(approveUrl);

    case 'GOODS_IN_OUT':
      return docHeader('ใบนำของเข้า-ออกบริษัท', genDocNo('GDS')) +
        `เรียน  หัวหน้าแผนก ${data.dept || '-'}\n\n` +
        `ขออนุมัตินำของ${data.direction === 'IN' ? 'เข้า' : 'ออก'}บริษัทตามรายละเอียด:\n\n` +
        row('ประเภท', data.direction === 'IN' ? 'นำของเข้า' : 'นำของออก') +
        row('ประตู', data.gate) +
        row('เลขที่เอกสาร', data.docNo) +
        row('เลขที่ซีล', data.sealNo) +
        row('ผู้นำของ', data.carrierName) +
        row('รหัสพนักงาน', data.staffId) +
        row('แผนก', data.dept) +
        row('ทะเบียนรถ', data.vehiclePlate) +
        `\n  รายการของ:\n` +
        ((data.lines || []).filter(l => l.description).map((l, i) =>
          `    ${i + 1}. ${l.description || '-'}  |  จำนวน: ${l.qty || '-'}  |  หน่วย: ${l.unit || '-'}`
        ).join('\n') || '    (ไม่มีรายการ)') +
        `\n\n` + row('หมายเหตุ', data.note) +
        docFooter(approveUrl);

    case 'EQUIPMENT':
      return docHeader('ใบเบิกอุปกรณ์สำนักงาน', genDocNo('EQP')) +
        `เรียน  หัวหน้าแผนก ${data.department || '-'}\n\n` +
        `ข้าพเจ้าขอเบิกอุปกรณ์ตามรายละเอียด:\n\n` +
        row('ผู้ขอเบิก', data.requesterName) +
        row('แผนก', data.department) +
        row('รายการ', data.items) +
        docFooter(approveUrl);

    default:
      return docHeader('เอกสารรออนุมัติ', genDocNo('DOC')) +
        JSON.stringify(data, null, 2) +
        docFooter(approveUrl);
  }
}

// =================== SMS Helper ===================
const SMS_SERVER = import.meta.env.VITE_SMS_SERVER_URL || 'http://localhost:3001';

/**
 * ส่ง SMS แจ้งหัวหน้าให้อนุมัติเอกสาร
 * @param {string} phone - เบอร์โทรศัพท์ เช่น 0812345678
 * @param {string} requesterName
 * @param {string} documentTitle
 * @param {string} approveUrl
 */
export async function sendApprovalSms({ phone, requesterName, documentTitle, approveUrl }) {
  if (!phone) return { skipped: true, reason: 'ไม่มีเบอร์โทรศัพท์' };
  try {
    const res = await fetch(`${SMS_SERVER}/api/send-approval-sms`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ to: phone, requesterName, documentTitle, approveUrl }),
    });
    return await res.json();
  } catch {
    console.warn('SMS server ไม่ได้รัน — ข้าม SMS');
    return { skipped: true, reason: 'server offline' };
  }
}

/**
 * ส่ง SMS แจ้งพนักงานเจ้าของนัดว่าผู้มาติดต่อมาถึงแล้ว
 * @param {string} phone
 * @param {string} visitorName
 * @param {string} company
 * @param {string} gate
 */
export async function sendVisitorArrivalSms({ phone, visitorName, company, gate }) {
  if (!phone) return { skipped: true };
  try {
    const res = await fetch(`${SMS_SERVER}/api/send-visitor-sms`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ to: phone, visitorName, company, gate }),
    });
    return await res.json();
  } catch {
    console.warn('SMS server ไม่ได้รัน — ข้าม SMS');
    return { skipped: true };
  }
}
