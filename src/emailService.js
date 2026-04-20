/**
 * Email Service — ส่ง email ผ่าน SMTP server
 * ถ้า server ไม่พร้อม จะ fallback เป็น mailto:
 */

const EMAIL_API = import.meta.env.VITE_EMAIL_API || 'http://localhost:3001';

async function checkServer() {
  try {
    const res = await fetch(`${EMAIL_API}/api/health`, { signal: AbortSignal.timeout(2000) });
    const data = await res.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
}

// ส่ง email ทั่วไป
export async function sendEmail({ to, subject, body, html }) {
  const serverOk = await checkServer();

  if (serverOk) {
    const res = await fetch(`${EMAIL_API}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, body, html }),
    });
    const data = await res.json();
    if (data.success) return { sent: true, demo: data.demo || false };
    throw new Error(data.error || 'ส่ง email ไม่สำเร็จ');
  }

  // Fallback: เปิด mailto
  const mailtoUrl = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body || '')}`;
  window.open(mailtoUrl, '_self');
  return { sent: false, fallback: 'mailto' };
}

// ส่ง email อนุมัติ (HTML สวย + ปุ่มกด)
export async function sendApprovalEmail({ to, approverName, documentTitle, requesterName, department, date, approveUrl }) {
  const serverOk = await checkServer();

  if (serverOk) {
    const res = await fetch(`${EMAIL_API}/api/send-approval-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, approverName, documentTitle, requesterName, department, date, approveUrl }),
    });
    const data = await res.json();
    if (data.success) return { sent: true, demo: data.demo || false };
    throw new Error(data.error || 'ส่ง email ไม่สำเร็จ');
  }

  // Fallback: เปิด mailto
  const subject = `[SOC] ${documentTitle} รอเซ็นอนุมัติ - ${requesterName}`;
  const body = `มีเอกสาร "${documentTitle}" รอเซ็นอนุมัติ\nผู้ขอ: ${requesterName}\nแผนก: ${department}\nวันที่: ${date}\n\nกดลิงก์เพื่อเซ็นอนุมัติ:\n${approveUrl}`;
  window.open(`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_self');
  return { sent: false, fallback: 'mailto' };
}

// ส่ง email นัดหมาย (ลิงก์ลงทะเบียน)
export async function sendInviteEmail({ to, visitorName, date, staffId, department, refCode, guestLink }) {
  const serverOk = await checkServer();

  if (serverOk) {
    const res = await fetch(`${EMAIL_API}/api/send-invite-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, visitorName, date, staffId, department, refCode, guestLink }),
    });
    const data = await res.json();
    if (data.success) return { sent: true, demo: data.demo || false };
    throw new Error(data.error || 'ส่ง email ไม่สำเร็จ');
  }

  // Fallback: เปิด mailto
  const subject = `[SOC] นัดหมายเข้าพบ ${date} - รหัส ${refCode}`;
  const body = `สวัสดีครับ คุณ${visitorName}\n\nคุณมีนัดหมายเข้าพบที่ TBKK\nวันที่: ${date}\nพบ: ${staffId} (${department})\nรหัส: ${refCode}\n\nกดลิงก์ลงทะเบียน:\n${guestLink}\n\n--\nSOC Systems`;
  window.open(`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_self');
  return { sent: false, fallback: 'mailto' };
}
