/**
 * SMTP Email Service
 *
 * ใช้ส่ง email อัตโนมัติผ่าน SMTP server ของบริษัท
 *
 * ตั้งค่าใน .env:
 *   VITE_SMTP_HOST=smtp.office365.com
 *   VITE_SMTP_PORT=587
 *   VITE_SMTP_USER=noreply@tbkk.co.th
 *   VITE_SMTP_PASS=password
 *
 * หมายเหตุ: SMTP ส่งจาก browser โดยตรงไม่ได้
 * ต้องใช้ผ่าน backend (Firebase Cloud Functions หรือ proxy server)
 * ตอนนี้เตรียมโครงสร้างไว้ก่อน
 */

const SMTP_CONFIG = {
  host: import.meta.env.VITE_SMTP_HOST || '',
  port: import.meta.env.VITE_SMTP_PORT || '587',
  user: import.meta.env.VITE_SMTP_USER || '',
  pass: import.meta.env.VITE_SMTP_PASS || '',
};

export function isSmtpConfigured() {
  return !!(SMTP_CONFIG.host && SMTP_CONFIG.user && SMTP_CONFIG.pass);
}

/**
 * สร้าง HTML email สวย พร้อมปุ่มกดอนุมัติ
 */
export function buildHtmlEmail({ subject, formType, data, approveUrl, requesterName, department, date }) {
  const formLabel = {
    VEHICLE_BOOKING: 'ใบขออนุญาตใช้รถ/จองรถ',
    DRINK_ORDER: 'แบบการสั่งเครื่องดื่ม',
    FOOD_ORDER: 'แบบการสั่งอาหาร',
    OUTING_REQUEST: 'ใบขออนุญาตออกนอกสถานที่',
    GOODS_IN_OUT: 'ใบนำของเข้า-ออกบริษัท',
    VISITOR: 'แบบลงทะเบียนผู้มาติดต่อ',
  }[formType] || 'เอกสาร';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <div style="max-width:600px;margin:20px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:#2563eb;padding:24px 32px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:18px;letter-spacing:2px;">SOC SYSTEMS</h1>
      <p style="color:#93c5fd;margin:4px 0 0;font-size:12px;">ระบบอนุมัติเอกสารอัตโนมัติ</p>
    </div>

    <!-- Content -->
    <div style="padding:32px;">
      <h2 style="font-size:20px;color:#1e293b;margin:0 0 20px;text-align:center;">${formLabel}</h2>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          <td style="padding:10px 16px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:700;width:140px;font-size:14px;">ผู้ขอ</td>
          <td style="padding:10px 16px;border:1px solid #e2e8f0;font-size:14px;">${requesterName || '-'}</td>
        </tr>
        <tr>
          <td style="padding:10px 16px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:700;font-size:14px;">แผนก</td>
          <td style="padding:10px 16px;border:1px solid #e2e8f0;font-size:14px;">${department || '-'}</td>
        </tr>
        <tr>
          <td style="padding:10px 16px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:700;font-size:14px;">วันที่</td>
          <td style="padding:10px 16px;border:1px solid #e2e8f0;font-size:14px;">${date || new Date().toLocaleDateString('th-TH')}</td>
        </tr>
        ${data.destination ? `<tr>
          <td style="padding:10px 16px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:700;font-size:14px;">ปลายทาง</td>
          <td style="padding:10px 16px;border:1px solid #e2e8f0;font-size:14px;">${data.destination}</td>
        </tr>` : ''}
        ${data.timeStart ? `<tr>
          <td style="padding:10px 16px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:700;font-size:14px;">เวลา</td>
          <td style="padding:10px 16px;border:1px solid #e2e8f0;font-size:14px;">${data.timeStart} - ${data.timeEnd || '-'}</td>
        </tr>` : ''}
      </table>

      <!-- Approve Button -->
      <div style="text-align:center;margin:32px 0;">
        <a href="${approveUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:16px 48px;border-radius:12px;text-decoration:none;font-size:18px;font-weight:900;letter-spacing:1px;">
          ✓ กดเพื่อเซ็นอนุมัติ
        </a>
      </div>

      <p style="text-align:center;color:#94a3b8;font-size:12px;">
        กดปุ่มด้านบนเพื่อดูเอกสารเต็มและลงลายเซ็นอนุมัติ
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;padding:16px 32px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="color:#94a3b8;font-size:11px;margin:0;">ส่งจากระบบ SOC Systems อัตโนมัติ | TBKK</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * ส่ง email ผ่าน SMTP (ต้องมี backend proxy)
 *
 * TODO: เมื่อได้ข้อมูล SMTP จาก IT แล้ว:
 * 1. สร้าง Firebase Cloud Function หรือ Express server
 * 2. Function รับ { to, subject, html } แล้วส่งผ่าน nodemailer
 * 3. เปลี่ยน URL ด้านล่างเป็น endpoint ของ function
 */
export async function sendEmailViaSMTP({ to, subject, html }) {
  if (!isSmtpConfigured()) {
    console.warn('SMTP not configured, falling back to mailto:');
    return false;
  }

  try {
    // TODO: เปลี่ยน URL เป็น Firebase Cloud Function endpoint
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, html }),
    });

    if (!response.ok) throw new Error('Failed to send email');
    return true;
  } catch (err) {
    console.warn('SMTP send failed:', err);
    return false;
  }
}
