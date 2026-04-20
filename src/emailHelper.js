import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, firebaseReady, appId } from './firebase';
import { normalizeDepartment } from './constants';

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
      const body =
        fld('ชื่อ-นามสกุล (Name/Nickname)', data.name) +
        fld2('วันที่ขอใช้รถ (Date)', formatIsoDateThaiShort(data.date), 'เวลา (Time)', `${formatTimeThai(data.timeStart)} ถึง ${formatTimeThai(data.timeEnd)}`) +
        fld2('ผู้ขออนุญาต รหัส (ID)', data.requesterId, 'แผนก (Department)', data.department) +
        `<div style="${S.section}">` +
        checkbox(true, '1. ต้องการขับเอง') + checkbox(false, '3. ติดต่องานบริษัท') +
        checkbox(false, '2. ต้องการใช้พนักงานขับรถให้') + checkbox(false, '4. ธุระส่วนตัว') +
        checkbox(false, '5. บริเวณในโรงงาน') + checkbox(false, '6. เคยมีผู้ร่วมเดินทาง ดังนี้') +
        `</div>` +
        `<div style="${S.section}"><div style="${S.sectionTitle}">วัตถุประสงค์ในการใช้รถ (ให้ระบุรายละเอียดเพื่อให้ทราบเหตุผล)</div><div style="padding:8px;border:1px solid #ddd;min-height:35px">${data.purpose || data.destination || '-'}</div></div>` +
        `<div style="${S.section}"><div style="${S.sectionTitle}">บริเวณที่ไป</div><div style="padding:8px;border:1px solid #ddd;min-height:35px">${data.destination || '-'}</div></div>` +
        (data.approvedCarNo ? fld('ทะเบียนรถที่อนุมัติ', data.approvedCarNo) : '') +
        (data.driver ? fld('พนักงานขับรถ', data.driver) : '');
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
 * คัดลอก HTML เอกสารลง clipboard แล้วเปิด Outlook
 */
export async function copyHtmlAndOpenOutlook({ to, subject, formType, data, approveUrl, requesterSign }) {
  const formNames = {
    DRINK_ORDER: 'สั่งเครื่องดื่ม',
    FOOD_ORDER: 'สั่งอาหาร',
    VEHICLE_BOOKING: 'ขอใช้รถ',
    OUTING_REQUEST: 'ขอออกนอกสถานที่',
    GOODS_IN_OUT: 'นำของเข้า/ออก',
    EQUIPMENT: 'เบิกอุปกรณ์',
  };
  const name = data.name || data.responsiblePerson || data.carrierName || data.requesterName || '-';
  const dept = data.department || data.dept || '-';
  const formName = formNames[formType] || 'เอกสาร';

  const body =
    `══════════════════════════════\n` +
    `   มีเอกสาร "${formName}" รอเซ็นอนุมัติ\n` +
    `══════════════════════════════\n\n` +
    `ผู้ขอ: ${name}\n` +
    `แผนก: ${dept}\n` +
    `วันที่: ${new Date().toLocaleDateString('th-TH')}\n\n` +
    (approveUrl
      ? `══════════════════════════════\n` +
        `   >>> กดที่นี่เพื่อเซ็นอนุมัติ <<<\n` +
        `══════════════════════════════\n\n` +
        `${approveUrl}\n\n` +
        `(กดลิงก์ด้านบน → ดูเอกสาร → ลงลายเซ็น → อนุมัติ)\n\n`
      : '') +
    `──────────────────────────────\n` +
    `SOC Systems | ระบบอนุมัติเอกสารอัตโนมัติ`;

  const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailtoUrl;
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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: phone, visitorName, company, gate }),
    });
    return await res.json();
  } catch {
    console.warn('SMS server ไม่ได้รัน — ข้าม SMS');
    return { skipped: true };
  }
}
