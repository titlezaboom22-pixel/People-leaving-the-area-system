/**
 * เปิดหน้าพิมพ์เอกสารเป็น HTML สวย ในแท็บใหม่
 * หัวหน้าสามารถพิมพ์ / Save PDF / หรือลงลายเซ็นดิจิตอลได้
 */

function genDocNo(prefix) {
  const d = new Date();
  const yy = d.getFullYear().toString().slice(-2);
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const seq = Math.floor(Math.random() * 9000 + 1000);
  return `${prefix}-${yy}${mm}-${seq}`;
}

function today() {
  return new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
}

const baseStyle = `
  <style>
    @media print { .no-print { display: none !important; } body { margin: 0; } }
    body { font-family: 'Sarabun', 'Segoe UI', sans-serif; margin: 20px; color: #1a1a1a; }
    .doc { max-width: 750px; margin: 0 auto; border: 2px solid #333; padding: 0; }
    .doc-header { text-align: center; padding: 20px; border-bottom: 2px solid #333; }
    .doc-header h1 { font-size: 22px; font-weight: 900; margin: 0 0 4px; }
    .doc-header h2 { font-size: 14px; font-weight: 400; color: #555; margin: 0; }
    .doc-body { padding: 20px 24px; }
    .field-row { display: flex; gap: 12px; margin-bottom: 8px; font-size: 14px; }
    .field-row .label { font-weight: 700; min-width: 180px; }
    .field-row .value { border-bottom: 1px dotted #999; flex: 1; padding-bottom: 2px; }
    .section { margin-top: 16px; padding-top: 12px; border-top: 1px solid #ccc; }
    .section-title { font-weight: 900; font-size: 13px; margin-bottom: 8px; background: #f0f0f0; padding: 6px 10px; }
    table.items { width: 100%; border-collapse: collapse; font-size: 13px; margin: 8px 0; }
    table.items th, table.items td { border: 1px solid #999; padding: 6px 10px; text-align: left; }
    table.items th { background: #f5f5f5; font-weight: 700; text-align: center; }
    .checkbox-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 10px 0; font-size: 13px; }
    .checkbox-item { display: flex; align-items: center; gap: 6px; }
    .checkbox-item .box { width: 16px; height: 16px; border: 2px solid #333; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; }
    .checkbox-item .box.checked { background: #2563eb; color: white; border-color: #2563eb; }
    .sign-area { display: flex; justify-content: space-around; margin-top: 30px; padding-top: 20px; border-top: 2px solid #333; }
    .sign-box { text-align: center; width: 200px; }
    .sign-box .line { border-bottom: 1px solid #333; height: 50px; margin-bottom: 4px; }
    .sign-box .title { font-size: 12px; font-weight: 700; }
    .btn-bar { text-align: center; padding: 20px; }
    .btn-bar button { padding: 12px 32px; font-size: 16px; font-weight: 700; border: none; border-radius: 8px; cursor: pointer; margin: 0 8px; }
    .btn-print { background: #2563eb; color: white; }
    .btn-close { background: #e5e7eb; color: #333; }
  </style>
`;

function openDocWindow(html) {
  const w = window.open('', '_blank');
  if (!w) {
    alert('กรุณาอนุญาตให้เปิด popup เพื่อดูเอกสาร');
    return;
  }
  w.document.write(html);
  w.document.close();
}

function formatVehicleDate(isoYmd) {
  if (!isoYmd || !/^\d{4}-\d{2}-\d{2}$/.test(isoYmd)) return isoYmd || '-';
  const [y, m, d] = isoYmd.split('-');
  return `${d}/${m}/${String(y).slice(-2)}`;
}

// === ใบขออนุญาตใช้รถ (ใหม่ — ตรงกับฟอร์ม section 1-6) ===
export function printVehicleBooking(data) {
  const docNo = genDocNo('VHC');
  const passengers = Array.isArray(data.passengers) ? data.passengers : [];
  const routes = Array.isArray(data.routes) && data.routes.length > 0
    ? data.routes
    : (data.destination ? [{ origin: '-', destination: data.destination }] : []);

  const purposeOptions = [
    { code: '5.1', label: 'ติดต่องานบริษัท' },
    { code: '5.2', label: 'ไปต่างจังหวัด' },
    { code: '5.3', label: 'รับ-ส่งลูกค้า' },
    { code: '5.4', label: 'บริเวณในโรงงาน' },
    { code: '5.5', label: 'อื่นๆ' },
  ];
  const selectedPurposeCode = (data.purpose || '').toString().trim().slice(0, 3);
  const purposeDetail = (data.purpose || '').toString().includes(':')
    ? (data.purpose || '').split(':').slice(1).join(':').trim()
    : '';

  const drivingOpt = data.drivingOption || '';

  const styleExtra = `
    <style>
      /* === Force one-page A4 — content + signatures fully visible === */
      @page { size: A4 portrait; margin: 8mm; }
      * { box-sizing: border-box; }
      @media print {
        html, body { width: auto !important; height: auto !important; min-height: 0 !important; }
        body { margin: 0 !important; padding: 0 !important; }
        .btn-bar { display: none !important; }
        .v-doc-wrap {
          box-sizing: border-box !important;
          box-shadow: none !important;
          border: 1.5px solid #475569 !important;
          max-width: none !important;
          width: 100% !important;
          height: calc(297mm - 16mm) !important;  /* A4 - top/bottom @page margins (8mm × 2) */
          display: flex !important;
          flex-direction: column !important;
          margin: 0 !important;
          border-radius: 0 !important;
          overflow: hidden !important;
        }
        .v-head { padding: 16px 24px !important; flex-shrink: 0; }
        .v-head h1 { font-size: 24px !important; }
        .v-head h2 { font-size: 13px !important; }
        .v-inner {
          flex: 1 !important;
          display: flex !important;
          flex-direction: column !important;
          padding: 14px 20px !important;
          overflow: hidden !important;
        }
        .v-content-grow {
          flex: 1 !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: space-between !important;  /* ← กระจาย sections ให้เต็มสม่ำเสมอ */
        }
        .v-section { page-break-inside: avoid; break-inside: avoid; margin: 0 !important; padding: 10px 16px !important; }
        .v-section-head { margin-bottom: 7px !important; padding-bottom: 5px !important; }
        .v-badge { width: 26px !important; height: 26px !important; font-size: 13px !important; }
        .v-sec-title { font-size: 15px !important; }
        .v-cell label { font-size: 11px !important; margin-bottom: 3px !important; }
        .v-cell .val { padding: 6px 11px !important; font-size: 14px !important; min-height: 17px !important; }
        .v-route { padding: 6px 12px !important; font-size: 14px !important; margin-bottom: 5px !important; }
        .v-chk-item { padding: 5px 12px !important; font-size: 13px !important; }
        .v-ptable { font-size: 13px !important; }
        .v-ptable th, .v-ptable td { padding: 5px 8px !important; }
        .sig-block { page-break-inside: avoid; break-inside: avoid; margin-top: 12px !important; padding-top: 10px !important; gap: 12px !important; flex-shrink: 0 !important; }
        .sig-block > div { padding: 11px 10px !important; }
        .sig-block > div > div:first-child { font-size: 12px !important; margin-bottom: 6px !important; }
        .sig-block .sig-img-area { height: 60px !important; }
        .sig-block .sig-img-area img { max-height: 56px !important; }
        .sig-block .sig-name { font-size: 13px !important; }
        .sig-block .sig-meta { font-size: 11px !important; }
      }
      body { font-size: 15px; margin: 12px; }
      .v-head { background:linear-gradient(135deg,#4f46e5 0%,#6366f1 100%); color:#fff; padding:14px 22px; border-radius:0; }
      .v-head h1 { font-size:22px; font-weight:900; margin:0 0 3px; color:#fff; }
      .v-head h2 { font-size:12px; font-weight:400; margin:0; color:#e0e7ff; }
      .v-section { margin:8px 0; padding:10px 14px; border:1px solid #e2e8f0; border-radius:7px; background:#fff; }
      .v-section-head { display:flex; align-items:center; gap:8px; margin-bottom:6px; padding-bottom:4px; border-bottom:1.5px solid #eef2ff; }
      .v-badge { width:24px; height:24px; border-radius:50%; background:#4f46e5; color:#fff; font-weight:900; display:inline-flex; align-items:center; justify-content:center; font-size:12px; }
      .v-sec-title { font-size:14px; font-weight:800; color:#1e293b; }
      .v-grid { display:grid; grid-template-columns:1fr 1fr; gap:9px; }
      .v-grid-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:9px; }
      .v-grid-4 { display:grid; grid-template-columns:1fr 1.5fr 1.5fr 1.5fr; gap:9px; }
      .v-cell label { display:block; font-size:10.5px; font-weight:700; color:#64748b; text-transform:uppercase; margin-bottom:2px; }
      .v-cell .val { padding:6px 10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:5px; font-size:13px; min-height:16px; line-height:1.35; }
      .v-route { display:flex; align-items:center; gap:9px; padding:6px 11px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:5px; margin-bottom:4px; font-size:13px; }
      .v-route .arrow { color:#6366f1; font-weight:900; }
      .v-ptable { width:100%; border-collapse:collapse; font-size:12.5px; }
      .v-ptable th, .v-ptable td { border:1px solid #e2e8f0; padding:4px 7px; }
      .v-ptable th { background:#eef2ff; color:#3730a3; font-weight:700; text-align:center; }
      .v-chk { display:flex; gap:9px; flex-wrap:wrap; }
      .v-chk-item { padding:4px 11px; border:1px solid #e2e8f0; border-radius:5px; font-size:12.5px; background:#fff; }
      .v-chk-item.on { background:#4f46e5; color:#fff; border-color:#4f46e5; font-weight:700; }
      .v-doc-wrap { max-width:820px; margin:0 auto; border:1px solid #cbd5e1; border-radius:10px; overflow:hidden; background:#fff; box-shadow:0 2px 8px rgba(15,23,42,0.06); }
      .v-inner { padding:12px 16px; background:#fbfbfd; }
    </style>
  `;

  const html = `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><title>ใบขอใช้รถ - ${docNo}</title>${baseStyle}${styleExtra}</head><body>
    <div class="btn-bar no-print">
      <button class="btn-print" onclick="window.print()">พิมพ์ / Save PDF</button>
      <button class="btn-close" onclick="window.close()">ปิด</button>
    </div>
    <div class="v-doc-wrap">
      <div class="v-head">
        <h1>ใบขออนุญาตใช้รถ / จองรถ เพื่อปฏิบัติงาน</h1>
        <h2>Vehicle Request Form — เลขที่ ${docNo} | วันที่ ${today()}</h2>
      </div>
      <div class="v-inner">
       <div class="v-content-grow">

        <!-- 1. ผู้ขอใช้รถ — 4 columns -->
        <div class="v-section">
          <div class="v-section-head"><span class="v-badge">1</span><span class="v-sec-title">ผู้ขอใช้รถ (Requester)</span></div>
          <div class="v-grid-4">
            <div class="v-cell"><label>รหัสพนักงาน / ID</label><div class="val">${data.requesterId || '-'}</div></div>
            <div class="v-cell"><label>ชื่อ-นามสกุล / Name</label><div class="val">${data.name || '-'}</div></div>
            <div class="v-cell"><label>แผนก / Department</label><div class="val">${data.department || '-'}</div></div>
            <div class="v-cell"><label>อีเมล / Email</label><div class="val" style="font-family:monospace;font-size:11px">${data.email || '-'}</div></div>
          </div>
        </div>

        <!-- 2. ผู้ร่วมเดินทาง -->
        <div class="v-section">
          <div class="v-section-head"><span class="v-badge">2</span><span class="v-sec-title">ผู้ร่วมเดินทาง (Passengers) — ${passengers.length} คน</span></div>
          ${passengers.length === 0 ? `<div style="color:#94a3b8;font-size:12px;text-align:center;padding:10px;">— ไม่มีผู้ร่วมเดินทาง —</div>` : `
          <table class="v-ptable">
            <thead><tr><th style="width:30px">#</th><th style="width:110px">รหัสพนักงาน</th><th>ชื่อ-นามสกุล</th><th style="width:140px">แผนก</th><th style="width:160px">อีเมล</th></tr></thead>
            <tbody>
              ${passengers.map((p, i) => `<tr><td style="text-align:center">${i+1}</td><td style="text-align:center;font-family:monospace">${p.empId || '-'}</td><td>${p.name || '-'}</td><td>${p.dept || '-'}</td><td style="font-family:monospace;font-size:10px">${p.email || '-'}</td></tr>`).join('')}
            </tbody>
          </table>`}
        </div>

        <!-- 3. วัน-เวลา -->
        <div class="v-section">
          <div class="v-section-head"><span class="v-badge">3</span><span class="v-sec-title">วันและเวลา (Date & Time)</span></div>
          <div class="v-grid-3">
            <div class="v-cell"><label>วันที่ขอใช้รถ</label><div class="val">${formatVehicleDate(data.date)}</div></div>
            <div class="v-cell"><label>เวลาออก</label><div class="val">${data.timeStart || '-'} น.</div></div>
            <div class="v-cell"><label>เวลากลับ</label><div class="val">${data.timeEnd || '-'} น.</div></div>
          </div>
        </div>

        <!-- 4. เส้นทาง -->
        <div class="v-section">
          <div class="v-section-head"><span class="v-badge">4</span><span class="v-sec-title">เส้นทาง (Routes)</span></div>
          ${routes.length === 0 ? `<div style="color:#94a3b8;font-size:12px;text-align:center;padding:10px;">— ไม่ระบุเส้นทาง —</div>` : routes.map((r) => `
            <div class="v-route">
              <span style="color:#16a34a">🟢 ${r.origin || '-'}</span>
              <span class="arrow">→</span>
              <span style="color:#dc2626">🔴 ${r.destination || '-'}</span>
            </div>`).join('')}
        </div>

        <!-- 5. วัตถุประสงค์ -->
        <div class="v-section">
          <div class="v-section-head"><span class="v-badge">5</span><span class="v-sec-title">วัตถุประสงค์การใช้รถ (Purpose)</span></div>
          <div class="v-chk">
            ${purposeOptions.map((o) => {
              const isOn = selectedPurposeCode === o.code;
              return `<div class="v-chk-item ${isOn ? 'on' : ''}"><b>${o.code}</b> ${o.label}</div>`;
            }).join('')}
          </div>
          ${purposeDetail ? `<div style="margin-top:10px;padding:10px;background:#eef2ff;border-left:3px solid #6366f1;border-radius:6px;font-size:13px;"><b>รายละเอียด:</b> ${purposeDetail}</div>` : ''}
        </div>

        <!-- 6. ขับเอง / ใช้พนักงานขับ -->
        <div class="v-section">
          <div class="v-section-head"><span class="v-badge">6</span><span class="v-sec-title">การขับรถ (Driving)</span></div>
          <div class="v-chk">
            <div class="v-chk-item ${drivingOpt === '6.1' ? 'on' : ''}">🚗 <b>6.1</b> ต้องการขับเอง</div>
            <div class="v-chk-item ${drivingOpt === '6.2' ? 'on' : ''}">👤 <b>6.2</b> ต้องการใช้พนักงานขับรถให้</div>
          </div>
          ${drivingOpt === '6.1' && data.easyPass ? `
          <div style="margin-top:10px;padding:10px;background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;">
            <div style="font-size:11px;font-weight:900;color:#92400e;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">💳 Easy Pass</div>
            <div class="v-chk">
              <div class="v-chk-item ${data.easyPass === '6.1.1' ? 'on' : ''}" style="${data.easyPass === '6.1.1' ? 'background:#16a34a;border-color:#16a34a;' : ''}">✓ <b>6.1.1</b> ต้องการ Easy Pass</div>
              <div class="v-chk-item ${data.easyPass === '6.1.2' ? 'on' : ''}" style="${data.easyPass === '6.1.2' ? 'background:#dc2626;border-color:#dc2626;' : ''}">✕ <b>6.1.2</b> ไม่ต้องการ Easy Pass</div>
            </div>
          </div>` : ''}
        </div>

        ${(data.approvedCarNo || data.gaPlate) ? `
        <div class="v-section" style="background:#ecfdf5;border-color:#6ee7b7;">
          <div class="v-section-head" style="border-color:#a7f3d0"><span class="v-badge" style="background:#059669">🚗</span><span class="v-sec-title" style="color:#065f46">ผลจัดรถ${data.refCode ? ` <span style="font-size:9px;font-family:monospace;background:#fff;padding:1px 6px;border-radius:999px;border:1px solid #6ee7b7;color:#15803d;margin-left:6px;">REF: ${data.refCode}</span>` : ''}</span></div>
          <div style="background:rgba(255,255,255,0.7);border-radius:4px;padding:4px 8px;font-size:10.5px;line-height:1.4;">
            <p style="margin:0;"><b>รถ:</b> ${data.gaBrand || ''} ${data.gaModel || ''} <b style="margin-left:4px;">ทะเบียน:</b> <span style="font-family:monospace;font-weight:700;">${data.gaPlate || data.approvedCarNo || '-'}</span></p>
            ${(data.gaDriverName || data.driver) ? `<p style="margin:0;"><b>คนขับ:</b> ${data.gaDriverName || data.driver || '-'}${data.gaDriverPhone ? ` <b style="margin-left:4px;">โทร:</b> <span style="font-family:monospace;">${data.gaDriverPhone}</span>` : ''}</p>` : ''}
          </div>
        </div>` : ''}
        ${data.gaNoVehicle ? `
        <div class="v-section" style="background:#fef2f2;border-color:#fca5a5;">
          <div class="v-section-head" style="border-color:#fecaca"><span class="v-badge" style="background:#dc2626">!</span><span class="v-sec-title" style="color:#991b1b">ผลจัดรถ</span></div>
          <p style="margin:2px 0 0;font-size:11px;font-weight:bold;color:#991b1b;">⚠️ ไม่มีรถให้ใช้งาน — ท่านสามารถเอารถของคุณไปใช้</p>
        </div>` : ''}

       </div><!-- /v-content-grow -->

        <!-- ลายเซ็น 3 คน: ผู้ขอ + หัวหน้าแผนก + GA — readable + fills width -->
        <div class="sig-block" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:10px;padding-top:8px;border-top:2px dashed #cbd5e1;">
          <!-- 1. ผู้ขอใช้รถ -->
          <div style="text-align:center;background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:8px;padding:10px 8px;">
            <div style="font-size:11px;color:#1e40af;font-weight:bold;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:5px;">👤 ผู้ขอใช้รถ</div>
            <div class="sig-img-area" style="height:60px;display:flex;align-items:center;justify-content:center;">
              ${data.sigUser ? `<img src="${data.sigUser}" alt="ลายเซ็น" style="max-height:56px;max-width:100%;object-fit:contain;" />` : '<span style="color:#cbd5e1;font-style:italic;font-size:12px;">(ลายเซ็น)</span>'}
            </div>
            <div style="border-top:1px solid #bfdbfe;margin-top:5px;padding-top:5px;">
              <div class="sig-name" style="font-size:13px;font-weight:bold;color:#0f172a;line-height:1.3;">${data.name || '-'}</div>
              <div class="sig-meta" style="font-size:11px;color:#64748b;margin-top:2px;">${data.staffId || ''}</div>
            </div>
          </div>

          <!-- 2. หัวหน้าแผนก (Check) -->
          <div style="text-align:center;background:#f0fdf4;border:1.5px solid #86efac;border-radius:8px;padding:10px 8px;">
            <div style="font-size:11px;color:#15803d;font-weight:bold;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:5px;">👨‍💼 หัวหน้าแผนก</div>
            <div class="sig-img-area" style="height:60px;display:flex;align-items:center;justify-content:center;">
              ${data.headSign ? `<img src="${data.headSign}" alt="ลายเซ็นหัวหน้า" style="max-height:56px;max-width:100%;object-fit:contain;" />` : '<span style="color:#cbd5e1;font-style:italic;font-size:12px;">(รออนุมัติ)</span>'}
            </div>
            <div style="border-top:1px solid #86efac;margin-top:5px;padding-top:5px;">
              <div class="sig-name" style="font-size:13px;font-weight:bold;color:#0f172a;line-height:1.3;">${data.headName || '-'}</div>
              <div class="sig-meta" style="font-size:11px;color:#15803d;margin-top:2px;">${data.headApprovedAt || ''}</div>
            </div>
          </div>

          <!-- 3. GA จัดรถ -->
          <div style="text-align:center;background:#f0fdf4;border:1.5px solid #86efac;border-radius:8px;padding:10px 8px;">
            <div style="font-size:11px;color:#15803d;font-weight:bold;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:5px;">🚗 GA จัดรถ</div>
            <div class="sig-img-area" style="height:60px;display:flex;align-items:center;justify-content:center;">
              ${data.gaSign ? `<img src="${data.gaSign}" alt="ลายเซ็น GA" style="max-height:56px;max-width:100%;object-fit:contain;" />` : '<span style="color:#cbd5e1;font-style:italic;font-size:12px;">(รอ GA จัดรถ)</span>'}
            </div>
            <div style="border-top:1px solid #86efac;margin-top:5px;padding-top:5px;">
              <div class="sig-name" style="font-size:13px;font-weight:bold;color:#0f172a;line-height:1.3;">${data.gaName || '-'}</div>
              <div class="sig-meta" style="font-size:11px;color:#15803d;margin-top:2px;">${data.gaApprovedAt || ''}</div>
            </div>
          </div>
        </div>

      </div>
    </div>
    <div class="btn-bar no-print" style="margin-top:10px; font-size:12px; color:#888;">ขั้นตอน 7-10 (Manager / GM / EEE / GA) จะถูกบันทึกเมื่อผู้อนุมัติเซ็นผ่านลิงก์อีเมล</div>
  </body></html>`;

  openDocWindow(html);
}

// === ใบสั่งเครื่องดื่ม ===
export function printDrinkOrder(data) {
  const docNo = genDocNo('DRK');
  const rows = (data.rows || []).filter(r => r.details);

  const html = `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><title>ใบสั่งเครื่องดื่ม - ${docNo}</title>${baseStyle}</head><body>
    <div class="btn-bar no-print">
      <button class="btn-print" onclick="window.print()">พิมพ์ / Save PDF</button>
      <button class="btn-close" onclick="window.close()">ปิด</button>
    </div>
    <div class="doc">
      <div class="doc-header">
        <h1>แบบการสั่งเครื่องดื่มเพื่อลูกค้า</h1>
        <h2>(Drink Order Form)</h2>
      </div>
      <div class="doc-body">
        <div class="field-row"><span class="label">ผู้รับผิดชอบ:</span><span class="value">${data.responsiblePerson || '-'}</span></div>
        <div class="field-row"><span class="label">รหัสพนักงาน:</span><span class="value">${data.employeeId || '-'}</span><span class="label" style="min-width:80px">แผนก:</span><span class="value">${data.department || '-'}</span></div>
        <div class="field-row"><span class="label">วันที่สั่ง:</span><span class="value">${data.orderDate || '-'}</span><span class="label" style="min-width:80px">เวลา:</span><span class="value">${data.orderTime || '-'}</span></div>

        <div class="section">
          <table class="items">
            <thead><tr><th>ลำดับ</th><th>รายการ</th><th>จำนวน</th><th>เงื่อนไข</th></tr></thead>
            <tbody>
              ${rows.map((r, i) => `<tr><td style="text-align:center">${i + 1}</td><td>${r.details || '-'}</td><td style="text-align:center">${r.count || '-'}</td><td>${r.condition || '-'}</td></tr>`).join('')}
              ${rows.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:#999;">ไม่มีรายการ</td></tr>' : ''}
            </tbody>
          </table>
        </div>

        <div class="field-row" style="margin-top:12px"><span class="label">หมายเหตุ:</span><span class="value">${data.note || '-'}</span></div>

        <div class="sign-area">
          <div class="sign-box"><div class="line"></div><div class="title">ผู้สั่ง</div></div>
          <div class="sign-box"><div class="line"></div><div class="title">หัวหน้าแผนก</div></div>
        </div>
      </div>
    </div>
    <div class="btn-bar no-print" style="margin-top:10px; font-size:12px; color:#888;">เลขที่: ${docNo} | ${today()}</div>
  </body></html>`;

  openDocWindow(html);
}

// === ใบสั่งอาหาร ===
export function printFoodOrder(data) {
  const docNo = genDocNo('FOOD');
  const rows = (data.rows || []).filter(r => r.details);

  const html = `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><title>ใบสั่งอาหาร - ${docNo}</title>${baseStyle}</head><body>
    <div class="btn-bar no-print">
      <button class="btn-print" onclick="window.print()">พิมพ์ / Save PDF</button>
      <button class="btn-close" onclick="window.close()">ปิด</button>
    </div>
    <div class="doc">
      <div class="doc-header">
        <h1>แบบการสั่งอาหารเพื่อรับรองลูกค้า</h1>
        <h2>(Food Order Form)</h2>
      </div>
      <div class="doc-body">
        <div class="field-row"><span class="label">ผู้รับผิดชอบ:</span><span class="value">${data.responsiblePerson || '-'}</span></div>
        <div class="field-row"><span class="label">รหัสพนักงาน:</span><span class="value">${data.employeeId || '-'}</span><span class="label" style="min-width:80px">แผนก:</span><span class="value">${data.department || '-'}</span></div>
        <div class="field-row"><span class="label">วันที่สั่ง:</span><span class="value">${data.orderDate || '-'}</span><span class="label" style="min-width:80px">เวลา:</span><span class="value">${data.orderTime || '-'}</span></div>

        <div class="section">
          <table class="items">
            <thead><tr><th>ลำดับ</th><th>รายการ</th><th>จำนวน</th><th>เงื่อนไข</th></tr></thead>
            <tbody>
              ${rows.map((r, i) => `<tr><td style="text-align:center">${i + 1}</td><td>${r.details || '-'}</td><td style="text-align:center">${r.count || '-'}</td><td>${r.condition || '-'}</td></tr>`).join('')}
              ${rows.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:#999;">ไม่มีรายการ</td></tr>' : ''}
            </tbody>
          </table>
        </div>

        <div class="field-row" style="margin-top:12px"><span class="label">หมายเหตุ:</span><span class="value">${data.note || '-'}</span></div>

        <div class="sign-area">
          <div class="sign-box"><div class="line"></div><div class="title">ผู้สั่ง</div></div>
          <div class="sign-box"><div class="line"></div><div class="title">หัวหน้าแผนก</div></div>
        </div>
      </div>
    </div>
    <div class="btn-bar no-print" style="margin-top:10px; font-size:12px; color:#888;">เลขที่: ${docNo} | ${today()}</div>
  </body></html>`;

  openDocWindow(html);
}

// === ใบสั่งเครื่องดื่ม + อาหาร (รวมตารางเดียว) ===
export function printCombinedOrder(drinkData, foodData) {
  const docNo = genDocNo('ORD');
  const drinkRows = (drinkData?.rows || []).filter(r => r.details).map(r => ({ ...r, _type: 'drink' }));
  const foodRows = (foodData?.rows || []).filter(r => r.details).map(r => ({ ...r, _type: 'food' }));
  const allRows = [...drinkRows, ...foodRows];
  const info = drinkData || foodData || {};
  const ordererSign = drinkData?.ordererSign || foodData?.ordererSign || info.ordererSign || '';

  // ยอดรวม
  const drinkTotal = typeof drinkData?.totalAmount === 'number'
    ? drinkData.totalAmount
    : drinkRows.reduce((s, r) => s + (r.lineTotal || 0), 0);
  const foodTotal = typeof foodData?.totalAmount === 'number'
    ? foodData.totalAmount
    : foodRows.reduce((s, r) => s + (r.lineTotal || 0), 0);
  const hasFoodUnpriced = foodRows.some(r => r.lineTotal == null);
  const grandTotal = drinkTotal + foodTotal;

  // รวมหมายเหตุ
  const notes = [];
  if (drinkData?.note) notes.push(`น้ำ: ${drinkData.note}`);
  if (foodData?.note) notes.push(`ข้าว: ${foodData.note}`);
  const combinedNote = notes.join(' | ');

  const fmtMoney = (n) => n != null ? `฿${Number(n).toLocaleString()}` : '-';

  const html = `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><title>ใบสั่งเครื่องดื่มและอาหาร - ${docNo}</title>${baseStyle}</head><body>
    <div class="btn-bar no-print">
      <button class="btn-print" onclick="window.print()">พิมพ์ / Save PDF</button>
      <button class="btn-close" onclick="window.close()">ปิด</button>
    </div>
    <div class="doc">
      <div class="doc-header">
        <h1>แบบการสั่งเครื่องดื่มและอาหาร</h1>
        <h2>(Drink & Food Order Form)</h2>
      </div>
      <div class="doc-body">
        <div class="field-row"><span class="label">ผู้รับผิดชอบ:</span><span class="value">${info.responsiblePerson || '-'}</span></div>
        <div class="field-row"><span class="label">รหัสพนักงาน:</span><span class="value">${info.employeeId || '-'}</span><span class="label" style="min-width:80px">แผนก:</span><span class="value">${info.department || '-'}</span></div>
        <div class="field-row"><span class="label">วันที่สั่ง:</span><span class="value">${info.orderDate || '-'}</span><span class="label" style="min-width:80px">เวลา:</span><span class="value">${info.orderTime || '-'}</span></div>

        ${allRows.length > 0 ? `
        <div class="section">
          <p style="font-weight:bold; margin:12px 0 4px;">🧾 รายการที่สั่ง</p>
          <table class="items">
            <thead>
              <tr>
                <th>ลำดับ</th>
                <th>ประเภท</th>
                <th>รายการ</th>
                <th>เงื่อนไข</th>
                <th>จำนวน</th>
                <th>ราคา/หน่วย</th>
                <th>รวม</th>
              </tr>
            </thead>
            <tbody>
              ${allRows.map((r, i) => `<tr>
                <td style="text-align:center">${i + 1}</td>
                <td style="text-align:center">${r._type === 'drink' ? '☕ น้ำ' : '🍛 ข้าว'}</td>
                <td>${r.details || '-'}</td>
                <td>${r.condition || '-'}</td>
                <td style="text-align:center">${r.count || '-'}</td>
                <td style="text-align:right">${fmtMoney(r.unitPrice)}</td>
                <td style="text-align:right;font-weight:bold">${fmtMoney(r.lineTotal)}</td>
              </tr>`).join('')}
              <tr style="background:#f7f7f7;font-weight:bold;">
                <td colspan="6" style="text-align:right">💰 รวมทั้งหมด</td>
                <td style="text-align:right;font-size:14px;color:#b45309">${hasFoodUnpriced && foodTotal === 0 ? `${fmtMoney(drinkTotal)} + อาหาร` : fmtMoney(grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>` : ''}

        ${combinedNote ? `<div class="field-row" style="margin-top:10px"><span class="label">หมายเหตุ:</span><span class="value">${combinedNote}</span></div>` : ''}

        <div class="sign-area">
          <div class="sign-box">${ordererSign ? `<img src="${ordererSign}" style="width:120px;height:50px;object-fit:contain;margin:0 auto;" />` : '<div class="line"></div>'}<div class="title">ผู้สั่ง</div></div>
          <div class="sign-box"><div class="line"></div><div class="title">หัวหน้าแผนก</div></div>
        </div>
      </div>
    </div>
    <div class="btn-bar no-print" style="margin-top:10px; font-size:12px; color:#888;">เลขที่: ${docNo} | ${today()}</div>
  </body></html>`;

  openDocWindow(html);
}

// === ใบขอออกนอกสถานที่ ===
export function printOutingRequest(data) {
  const docNo = genDocNo('OUT');
  const rows = (data.rows || []).filter(r => r.name);

  const html = `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><title>ใบขอออกนอกสถานที่ - ${docNo}</title>${baseStyle}</head><body>
    <div class="btn-bar no-print">
      <button class="btn-print" onclick="window.print()">พิมพ์ / Save PDF</button>
      <button class="btn-close" onclick="window.close()">ปิด</button>
    </div>
    <div class="doc">
      <div class="doc-header">
        <h1>ใบขออนุญาตออกนอกสถานที่</h1>
        <h2>(Outing Request Form)</h2>
      </div>
      <div class="doc-body">
        <div class="field-row"><span class="label">ประเภท:</span><span class="value">${data.type || '-'}</span></div>
        <div class="field-row"><span class="label">วันที่:</span><span class="value">${data.date || '-'}</span><span class="label" style="min-width:100px">จำนวนคน:</span><span class="value">${data.totalCount || '-'}</span></div>
        <div class="field-row"><span class="label">ผู้อนุมัติ:</span><span class="value">${data.managerName || '-'}</span><span class="label" style="min-width:100px">ตำแหน่ง:</span><span class="value">${data.approverTitle || '-'}</span></div>

        <div class="section">
          <table class="items">
            <thead>
              <tr>
                <th rowspan="2">ลำดับ</th><th rowspan="2">ชื่อ-นามสกุล</th><th rowspan="2">สถานที่ไป</th>
                <th colspan="2" style="text-align:center">เวลา</th>
                <th rowspan="2">รับทราบ</th>
              </tr>
              <tr><th style="text-align:center">ไป</th><th style="text-align:center">กลับ</th></tr>
            </thead>
            <tbody>
              ${rows.map((r, i) => `<tr>
                <td style="text-align:center">${i + 1}</td>
                <td>${r.name || '-'}</td>
                <td>${r.destination || '-'}</td>
                <td style="text-align:center;min-width:70px;font-weight:bold;color:#ef4444;">${r.timeOut || ''}</td>
                <td style="text-align:center;min-width:70px;font-weight:bold;color:#22c55e;">${r.timeIn || ''}</td>
                <td style="text-align:center;min-width:80px;">${r.acknowledgeSign || ''}</td>
              </tr>`).join('')}
              ${rows.length === 0 ? '<tr><td colspan="6" style="text-align:center;color:#999;">ไม่มีรายชื่อ</td></tr>' : ''}
            </tbody>
          </table>
        </div>

        <div class="field-row" style="margin-top:12px"><span class="label">หมายเหตุ:</span><span class="value">${data.note || '-'}</span></div>

        <div class="sign-area">
          <div class="sign-box">${data.managerSign ? `<img src="${data.managerSign}" style="width:120px;height:50px;object-fit:contain;margin:0 auto;" />` : '<div class="line"></div>'}<div class="title">ผู้ขออนุญาต</div><div style="font-size:11px;margin-top:2px;">${data.managerName || ''}</div></div>
          <div class="sign-box">${data.approverSign ? `<img src="${data.approverSign}" style="width:120px;height:50px;object-fit:contain;margin:0 auto;" />` : '<div class="line"></div>'}<div class="title">ผู้อนุมัติ</div><div style="font-size:11px;margin-top:2px;">${data.approverTitle || ''}</div></div>
        </div>
      </div>
    </div>
    <div class="btn-bar no-print" style="margin-top:10px; font-size:12px; color:#888;">เลขที่: ${docNo} | ${today()}</div>
  </body></html>`;

  openDocWindow(html);
}

// === ใบนำของเข้า/ออก ===
export function printGoodsInOut(data) {
  const docNo = genDocNo('GDS');
  const lines = (data.lines || []).filter(l => l.description);

  const html = `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><title>ใบนำของเข้า-ออก - ${docNo}</title>${baseStyle}</head><body>
    <div class="btn-bar no-print">
      <button class="btn-print" onclick="window.print()">พิมพ์ / Save PDF</button>
      <button class="btn-close" onclick="window.close()">ปิด</button>
    </div>
    <div class="doc">
      <div class="doc-header">
        <h1>ใบนำของเข้า-ออกบริษัท</h1>
        <h2>(Goods In/Out Form) - ${data.direction === 'IN' ? 'นำเข้า' : 'นำออก'}</h2>
      </div>
      <div class="doc-body">
        <div class="field-row"><span class="label">ประเภท:</span><span class="value">${data.direction === 'IN' ? 'นำของเข้า' : 'นำของออก'}</span><span class="label" style="min-width:80px">ประตู:</span><span class="value">${data.gate || '-'}</span></div>
        <div class="field-row"><span class="label">เลขที่เอกสาร:</span><span class="value">${data.docNo || '-'}</span><span class="label" style="min-width:80px">เลขซีล:</span><span class="value">${data.sealNo || '-'}</span></div>
        <div class="field-row"><span class="label">ผู้นำของ:</span><span class="value">${data.carrierName || '-'}</span></div>
        <div class="field-row"><span class="label">รหัสพนักงาน:</span><span class="value">${data.staffId || '-'}</span><span class="label" style="min-width:80px">แผนก:</span><span class="value">${data.dept || '-'}</span></div>
        <div class="field-row"><span class="label">ทะเบียนรถ:</span><span class="value">${data.vehiclePlate || '-'}</span></div>
        <div class="field-row"><span class="label">วันที่รับ/ส่งสินค้า:</span><span class="value">${data.deliveryDate || '-'}</span><span class="label" style="min-width:80px">เวลา:</span><span class="value">${data.deliveryTime || '-'}</span></div>

        <div class="section">
          <table class="items">
            <thead><tr><th>ลำดับ</th><th>รายการ</th><th>จำนวน</th><th>หน่วย</th></tr></thead>
            <tbody>
              ${lines.map((l, i) => `<tr><td style="text-align:center">${i + 1}</td><td>${l.description || '-'}</td><td style="text-align:center">${l.qty || '-'}</td><td style="text-align:center">${l.unit || '-'}</td></tr>`).join('')}
              ${lines.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:#999;">ไม่มีรายการ</td></tr>' : ''}
            </tbody>
          </table>
        </div>

        ${lines.some(l => (l.photos || []).length > 0) ? `<div style="margin-top:14px;border-top:1px solid #999;padding-top:10px;">
          <div style="font-weight:bold;font-size:14px;margin-bottom:8px;">รูปชิ้นงาน</div>
          ${lines.map((l, i) => {
            const photos = (l.photos || []);
            if (photos.length === 0) return '';
            return `<div style="margin-bottom:10px;">
              <div style="font-size:12px;color:#555;margin-bottom:4px;">รายการ ${i+1}: ${l.description || '-'}</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">${photos.map(p => {
                const src = typeof p === 'string' ? p : (p.dataUrl || '');
                return `<img src="${src}" style="width:140px;height:140px;object-fit:cover;border:1px solid #ccc;border-radius:4px;" />`;
              }).join('')}</div>
            </div>`;
          }).join('')}
        </div>` : ''}

        <div class="field-row" style="margin-top:12px"><span class="label">หมายเหตุ:</span><span class="value">${data.note || '-'}</span></div>

        <div class="sign-area">
          <div class="sign-box">${data.carrierSign ? `<img src="${data.carrierSign}" style="width:120px;height:50px;object-fit:contain;margin:0 auto;" />` : '<div class="line"></div>'}<div class="title">ผู้นำของ</div></div>
          <div class="sign-box"><div class="line"></div><div class="title">หัวหน้าแผนก</div></div>
          <div class="sign-box"><div class="line"></div><div class="title">รปภ.</div></div>
        </div>
      </div>
    </div>
    <div class="btn-bar no-print" style="margin-top:10px; font-size:12px; color:#888;">เลขที่: ${docNo} | ${today()}</div>
  </body></html>`;

  openDocWindow(html);
}
