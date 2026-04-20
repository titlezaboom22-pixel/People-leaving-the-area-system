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

// === ใบขออนุญาตใช้รถ ===
export function printVehicleBooking(data) {
  const docNo = genDocNo('VHC');
  const checkboxes = [
    { label: 'ต้องการขับเอง', key: 'selfDrive' },
    { label: 'ต้องการใช้พนักงานขับรถให้', key: 'needDriver' },
    { label: 'ติดต่องานบริษัท', key: 'business' },
    { label: 'ธุระส่วนตัว', key: 'personal' },
    { label: 'บริเวณในโรงงาน', key: 'inFactory' },
    { label: 'เคยมีผู้ร่วมเดินทาง ดังนี้', key: 'hasPassengers' },
  ];

  const html = `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><title>ใบขออนุญาตใช้รถ - ${docNo}</title>${baseStyle}</head><body>
    <div class="btn-bar no-print">
      <button class="btn-print" onclick="window.print()">พิมพ์ / Save PDF</button>
      <button class="btn-close" onclick="window.close()">ปิด</button>
    </div>
    <div class="doc">
      <div class="doc-header">
        <h1>ใบขออนุญาตใช้รถ/จองรถ เพื่อปฏิบัติงาน</h1>
        <h2>(Vehicle Request Form)</h2>
      </div>
      <div class="doc-body">
        <div class="field-row"><span class="label">ชื่อ-นามสกุล (Name):</span><span class="value">${data.name || '-'}</span></div>
        <div class="field-row">
          <span class="label">วันที่ขอใช้รถ (Date):</span><span class="value">${formatVehicleDate(data.date)}</span>
          <span class="label" style="min-width:100px">เวลา (Time):</span><span class="value">${data.timeStart || '-'} น. ถึง ${data.timeEnd || '-'} น.</span>
        </div>
        <div class="field-row">
          <span class="label">ผู้ขออนุญาต รหัส (ID):</span><span class="value">${data.requesterId || '-'}</span>
          <span class="label" style="min-width:130px">แผนก (Department):</span><span class="value">${data.department || '-'}</span>
        </div>

        <div class="section">
          <div class="checkbox-grid">
            ${checkboxes.map((cb, i) => `<div class="checkbox-item"><span class="box">${i === 0 ? '✓' : ''}</span> ${i + 1}. ${cb.label}</div>`).join('')}
          </div>
        </div>

        <div class="section">
          <div class="section-title">วัตถุประสงค์ในการใช้รถ (ให้ระบุรายละเอียดเพื่อให้ทราบเหตุผล)</div>
          <div style="min-height:40px; padding:8px; border:1px solid #ddd; border-radius:4px; font-size:14px;">${data.purpose || data.destination || '-'}</div>
        </div>

        <div class="section">
          <div class="section-title">บริเวณที่ไป</div>
          <div style="min-height:40px; padding:8px; border:1px solid #ddd; border-radius:4px; font-size:14px;">${data.destination || '-'}</div>
        </div>

        ${data.approvedCarNo ? `<div class="field-row" style="margin-top:12px"><span class="label">ทะเบียนรถที่อนุมัติ:</span><span class="value">${data.approvedCarNo}</span></div>` : ''}
        ${data.driver ? `<div class="field-row"><span class="label">พนักงานขับรถ:</span><span class="value">${data.driver}</span></div>` : ''}

        ${(Array.isArray(data.passengers) && data.passengers.length > 0) ? `
        <div class="section">
          <div class="section-title">ผู้ร่วมเดินทาง (Passengers) — ${data.passengers.length} คน</div>
          <table class="items">
            <thead><tr><th style="width:30px">#</th><th>ชื่อ-นามสกุล</th><th>รหัสพนักงาน</th><th>แผนก</th></tr></thead>
            <tbody>
              ${data.passengers.map((p, i) => `<tr><td style="text-align:center">${i+1}</td><td>${p.name || '-'}</td><td style="text-align:center;font-family:monospace">${p.empId || '-'}</td><td>${p.dept || '-'}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>` : ''}

        <div class="sign-area">
          <div class="sign-box">
            ${data.sigUser ? `<img src="${data.sigUser}" alt="ลายเซ็นผู้ขอ" style="max-height:55px;max-width:180px;display:block;margin:0 auto 4px;object-fit:contain" />` : ''}
            <div class="line"></div>
            <div class="title">ผู้ขออนุญาต (Pos)</div>
          </div>
          <div class="sign-box">
            ${data.sigManager ? `<img src="${data.sigManager}" alt="ลายเซ็นหัวหน้า" style="max-height:55px;max-width:180px;display:block;margin:0 auto 4px;object-fit:contain" />` : ''}
            <div class="line"></div>
            <div class="title">หน.แผนก/ผู้จัดการฝ่าย<br>(Section chief/Dept manager)</div>
          </div>
        </div>
      </div>
    </div>
    <div class="btn-bar no-print" style="margin-top:10px; font-size:12px; color:#888;">เลขที่เอกสาร: ${docNo} | วันที่: ${today()}</div>
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

// === ใบสั่งเครื่องดื่ม + อาหาร (รวม) ===
export function printCombinedOrder(drinkData, foodData) {
  const docNo = genDocNo('ORD');
  const drinkRows = (drinkData?.rows || []).filter(r => r.details);
  const foodRows = (foodData?.rows || []).filter(r => r.details);
  const info = drinkData || foodData || {};
  const ordererSign = drinkData?.ordererSign || foodData?.ordererSign || info.ordererSign || '';

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

        ${drinkRows.length > 0 ? `
        <div class="section">
          <p style="font-weight:bold; margin:12px 0 4px;">☕ เครื่องดื่ม</p>
          <table class="items">
            <thead><tr><th>ลำดับ</th><th>รายการ</th><th>จำนวน</th><th>เงื่อนไข</th></tr></thead>
            <tbody>
              ${drinkRows.map((r, i) => `<tr><td style="text-align:center">${i + 1}</td><td>${r.details || '-'}</td><td style="text-align:center">${r.count || '-'}</td><td>${r.condition || '-'}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>` : ''}

        ${drinkRows.length > 0 && drinkData.note ? `<div class="field-row" style="margin-top:4px"><span class="label">หมายเหตุ (น้ำ):</span><span class="value">${drinkData.note || '-'}</span></div>` : ''}

        ${foodRows.length > 0 ? `
        <div class="section">
          <p style="font-weight:bold; margin:12px 0 4px;">🍛 อาหาร</p>
          <table class="items">
            <thead><tr><th>ลำดับ</th><th>รายการ</th><th>จำนวน</th><th>เงื่อนไข</th></tr></thead>
            <tbody>
              ${foodRows.map((r, i) => `<tr><td style="text-align:center">${i + 1}</td><td>${r.details || '-'}</td><td style="text-align:center">${r.count || '-'}</td><td>${r.condition || '-'}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>` : ''}

        ${foodRows.length > 0 && foodData.note ? `<div class="field-row" style="margin-top:4px"><span class="label">หมายเหตุ (ข้าว):</span><span class="value">${foodData.note || '-'}</span></div>` : ''}

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
