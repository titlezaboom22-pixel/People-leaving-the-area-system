/**
 * SMTP Email Server สำหรับ SOC Systems
 *
 * วิธีใช้:
 *   1. ใส่ SMTP credentials ใน .env
 *   2. รัน: node server/email-server.js
 *   3. Server จะรันที่ port 3001
 *
 * ทดสอบ:
 *   curl -X POST http://localhost:3001/api/send-email \
 *     -H "Content-Type: application/json" \
 *     -d '{"to":"test@test.com","subject":"test","body":"hello"}'
 */

import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// โหลด .env
function loadEnv() {
  try {
    const envPath = resolve(__dirname, '..', '.env');
    const content = readFileSync(envPath, 'utf-8');
    const env = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
    return env;
  } catch {
    console.error('ไม่พบไฟล์ .env');
    return {};
  }
}

const env = loadEnv();
const PORT = env.EMAIL_SERVER_PORT || 3001;

// ตั้งค่า SMTP transporter
const smtpConfig = {
  host: env.SMTP_HOST || 'smtp.office365.com',
  port: parseInt(env.SMTP_PORT || '587'),
  secure: env.SMTP_SECURE === 'true',
  auth: {
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
  },
};

let transporter = null;

if (smtpConfig.auth.user && smtpConfig.auth.pass) {
  transporter = nodemailer.createTransport(smtpConfig);
  console.log(`✅ SMTP พร้อมใช้งาน (${smtpConfig.auth.user} → ${smtpConfig.host}:${smtpConfig.port})`);
} else {
  console.warn('⚠️ ยังไม่ได้ตั้งค่า SMTP_USER / SMTP_PASS ใน .env');
  console.warn('   ระบบจะจำลองการส่ง email (ไม่ส่งจริง)');
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', smtp: !!transporter });
});

// ส่ง email
app.post('/api/send-email', async (req, res) => {
  const { to, subject, body, html } = req.body;

  if (!to || !subject) {
    return res.status(400).json({ error: 'ต้องระบุ to และ subject' });
  }

  const mailOptions = {
    from: env.SMTP_FROM || env.SMTP_USER || 'noreply@tbkk.co.th',
    to,
    subject,
    text: body || '',
    html: html || undefined,
  };

  if (!transporter) {
    // Demo mode — ไม่ส่งจริง
    console.log('\n📧 [DEMO] ส่ง email (ไม่ได้ส่งจริง):');
    console.log(`   To: ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Body: ${(body || '').substring(0, 100)}...`);
    return res.json({ success: true, demo: true, message: 'Demo mode - ไม่ได้ส่งจริง (ตั้งค่า SMTP ใน .env)' });
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ ส่ง email สำเร็จ → ${to} (${info.messageId})`);
    res.json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error('❌ ส่ง email ล้มเหลว:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ส่ง email พร้อมลิงก์อนุมัติ (HTML สวย + ปุ่มกด)
app.post('/api/send-approval-email', async (req, res) => {
  const { to, approverName, documentTitle, requesterName, department, date, approveUrl } = req.body;

  if (!to || !approveUrl) {
    return res.status(400).json({ error: 'ต้องระบุ to และ approveUrl' });
  }

  const subject = `[SOC] ${documentTitle || 'เอกสาร'} รอเซ็นอนุมัติ - ${requesterName || '-'}`;

  const html = `
    <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 20px;">
      <div style="background: #1e40af; color: white; padding: 24px 32px; border-radius: 16px 16px 0 0; text-align: center;">
        <h2 style="margin: 0; font-size: 18px; letter-spacing: 2px;">SOC SYSTEMS</h2>
        <p style="margin: 4px 0 0; font-size: 12px; opacity: 0.8;">ระบบอนุมัติเอกสารอัตโนมัติ</p>
      </div>
      <div style="background: white; padding: 32px; border-radius: 0 0 16px 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
        <p style="font-size: 14px; color: #334155; margin-bottom: 8px;">เรียน คุณ${approverName || 'ผู้อนุมัติ'},</p>
        <p style="font-size: 14px; color: #334155; margin-bottom: 24px;">มีเอกสาร <strong>"${documentTitle || 'เอกสาร'}"</strong> รอเซ็นอนุมัติ</p>

        <div style="background: #f1f5f9; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
          <table style="width: 100%; font-size: 13px; color: #475569;">
            <tr><td style="padding: 4px 0; font-weight: 600;">ผู้ขอ:</td><td>${requesterName || '-'}</td></tr>
            <tr><td style="padding: 4px 0; font-weight: 600;">แผนก:</td><td>${department || '-'}</td></tr>
            <tr><td style="padding: 4px 0; font-weight: 600;">วันที่:</td><td>${date || '-'}</td></tr>
          </table>
        </div>

        <div style="text-align: center; margin: 32px 0;">
          <a href="${approveUrl}" style="display: inline-block; background: #16a34a; color: white; padding: 16px 48px; border-radius: 12px; text-decoration: none; font-weight: 900; font-size: 16px; letter-spacing: 1px;">
            ✓ กดเพื่อเซ็นอนุมัติ
          </a>
        </div>

        <p style="font-size: 11px; color: #94a3b8; text-align: center;">กดปุ่มด้านบนเพื่อเปิดเอกสารและลงลายเซ็นอนุมัติ</p>
      </div>
      <p style="text-align: center; font-size: 10px; color: #94a3b8; margin-top: 16px;">SOC Systems | TBKK</p>
    </div>
  `;

  const mailOptions = {
    from: env.SMTP_FROM || env.SMTP_USER || 'noreply@tbkk.co.th',
    to,
    subject,
    html,
    text: `มีเอกสาร "${documentTitle}" รอเซ็นอนุมัติ\nผู้ขอ: ${requesterName}\nกดลิงก์: ${approveUrl}`,
  };

  if (!transporter) {
    console.log('\n📧 [DEMO] ส่ง approval email:');
    console.log(`   To: ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Approve URL: ${approveUrl}`);
    return res.json({ success: true, demo: true });
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ ส่ง approval email สำเร็จ → ${to}`);
    res.json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error('❌ ส่ง email ล้มเหลว:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ส่ง email นัดหมาย (พร้อมลิงก์ลงทะเบียน)
app.post('/api/send-invite-email', async (req, res) => {
  const { to, visitorName, date, staffId, department, refCode, guestLink } = req.body;

  if (!to) {
    return res.status(400).json({ error: 'ต้องระบุ to' });
  }

  const subject = `[SOC] นัดหมายเข้าพบ TBKK ${date} - รหัส ${refCode}`;

  const html = `
    <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 20px;">
      <div style="background: #1e40af; color: white; padding: 24px 32px; border-radius: 16px 16px 0 0; text-align: center;">
        <h2 style="margin: 0; font-size: 18px; letter-spacing: 2px;">SOC SYSTEMS</h2>
        <p style="margin: 4px 0 0; font-size: 12px; opacity: 0.8;">ระบบจัดการผู้มาติดต่อ</p>
      </div>
      <div style="background: white; padding: 32px; border-radius: 0 0 16px 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
        <p style="font-size: 14px; color: #334155;">สวัสดีครับ คุณ${visitorName || ''},</p>
        <p style="font-size: 14px; color: #334155; margin-bottom: 24px;">คุณมีนัดหมายเข้าพบที่ TBKK</p>

        <div style="background: #f1f5f9; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
          <table style="width: 100%; font-size: 13px; color: #475569;">
            <tr><td style="padding: 4px 0; font-weight: 600;">วันที่:</td><td>${date || '-'}</td></tr>
            <tr><td style="padding: 4px 0; font-weight: 600;">พบ:</td><td>${staffId || '-'} (${department || '-'})</td></tr>
            <tr><td style="padding: 4px 0; font-weight: 600;">รหัสอ้างอิง:</td><td style="font-weight: 900; color: #1e40af; font-size: 18px;">${refCode || '-'}</td></tr>
          </table>
        </div>

        <div style="text-align: center; margin: 32px 0;">
          <a href="${guestLink}" style="display: inline-block; background: #2563eb; color: white; padding: 16px 48px; border-radius: 12px; text-decoration: none; font-weight: 900; font-size: 16px;">
            📋 กดลงทะเบียนล่วงหน้า
          </a>
        </div>

        <p style="font-size: 12px; color: #64748b; text-align: center; line-height: 1.6;">
          เมื่อลงทะเบียนเสร็จจะได้ QR Code<br/>สำหรับแสดงต่อเจ้าหน้าที่ รปภ. ที่หน้าป้อม
        </p>
      </div>
      <p style="text-align: center; font-size: 10px; color: #94a3b8; margin-top: 16px;">SOC Systems | TBKK</p>
    </div>
  `;

  const mailOptions = {
    from: env.SMTP_FROM || env.SMTP_USER || 'noreply@tbkk.co.th',
    to,
    subject,
    html,
    text: `สวัสดีครับ คุณ${visitorName}\nนัดหมาย: ${date}\nพบ: ${staffId} (${department})\nรหัส: ${refCode}\nลงทะเบียน: ${guestLink}`,
  };

  if (!transporter) {
    console.log('\n📧 [DEMO] ส่ง invite email:');
    console.log(`   To: ${to}`);
    console.log(`   Visitor: ${visitorName}`);
    console.log(`   Link: ${guestLink}`);
    return res.json({ success: true, demo: true });
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ ส่ง invite email สำเร็จ → ${to}`);
    res.json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error('❌ ส่ง email ล้มเหลว:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// =================== SMS ===================
// รองรับ provider: twilio | vonage | thaisms
// ตั้งค่าใน .env:
//   SMS_PROVIDER=twilio          (หรือ vonage / thaisms)
//   TWILIO_ACCOUNT_SID=ACxxx     (Twilio)
//   TWILIO_AUTH_TOKEN=xxx
//   TWILIO_FROM=+1xxxxxxxxxx
//   VONAGE_API_KEY=xxx           (Vonage/Nexmo)
//   VONAGE_API_SECRET=xxx
//   VONAGE_FROM=TBKK
//   THAISMS_USERNAME=xxx         (ThaiSMS.com)
//   THAISMS_PASSWORD=xxx
//   THAISMS_SENDER=TBKK

const SMS_PROVIDER = (env.SMS_PROVIDER || '').toLowerCase();

async function sendSmsViaProvider(to, message) {
  // แปลงเบอร์ไทย 08x → +668x
  const phone = to.startsWith('0') ? `+66${to.slice(1)}` : to;

  if (SMS_PROVIDER === 'twilio') {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) throw new Error('ไม่พบ TWILIO credentials ใน .env');
    const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
    const body = new URLSearchParams({ To: phone, From: env.TWILIO_FROM, Body: message });
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Twilio error');
    return { sid: data.sid };

  } else if (SMS_PROVIDER === 'vonage') {
    if (!env.VONAGE_API_KEY || !env.VONAGE_API_SECRET) throw new Error('ไม่พบ VONAGE credentials ใน .env');
    const res = await fetch('https://rest.nexmo.com/sms/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: env.VONAGE_API_KEY, api_secret: env.VONAGE_API_SECRET, to: phone.replace('+', ''), from: env.VONAGE_FROM || 'TBKK', text: message }),
    });
    const data = await res.json();
    const msg = data.messages?.[0];
    if (msg?.status !== '0') throw new Error(msg?.['error-text'] || 'Vonage error');
    return { id: msg['message-id'] };

  } else if (SMS_PROVIDER === 'thaisms') {
    if (!env.THAISMS_USERNAME || !env.THAISMS_PASSWORD) throw new Error('ไม่พบ THAISMS credentials ใน .env');
    const params = new URLSearchParams({ username: env.THAISMS_USERNAME, password: env.THAISMS_PASSWORD, from: env.THAISMS_SENDER || 'TBKK', to: phone, message });
    const res = await fetch(`https://www.thaisms.com/api/sms?${params}`);
    const text = await res.text();
    if (!text.startsWith('OK')) throw new Error(text);
    return { result: text };

  } else {
    throw new Error(`SMS_PROVIDER ไม่ถูกตั้งค่า (twilio / vonage / thaisms)`);
  }
}

// POST /api/send-sms — ส่ง SMS ทั่วไป
app.post('/api/send-sms', async (req, res) => {
  const { to, message } = req.body;
  if (!to || !message) return res.status(400).json({ error: 'ต้องระบุ to และ message' });

  if (!SMS_PROVIDER) {
    console.log(`\n📱 [DEMO SMS] → ${to}: ${message}`);
    return res.json({ success: true, demo: true, message: 'Demo mode - ตั้งค่า SMS_PROVIDER ใน .env' });
  }
  try {
    const result = await sendSmsViaProvider(to, message);
    console.log(`✅ ส่ง SMS สำเร็จ → ${to}`);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('❌ SMS ล้มเหลว:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/send-approval-sms — แจ้งหัวหน้าให้เปิดลิงก์อนุมัติ
app.post('/api/send-approval-sms', async (req, res) => {
  const { to, requesterName, documentTitle, approveUrl } = req.body;
  if (!to) return res.status(400).json({ error: 'ต้องระบุ to' });

  const message = `[TBK SOC] มีเอกสาร "${documentTitle || 'เอกสาร'}" จาก ${requesterName || '-'} รออนุมัติ\nกดลิงก์: ${approveUrl}`;

  if (!SMS_PROVIDER) {
    console.log(`\n📱 [DEMO SMS] → ${to}: ${message}`);
    return res.json({ success: true, demo: true });
  }
  try {
    const result = await sendSmsViaProvider(to, message);
    console.log(`✅ ส่ง approval SMS → ${to}`);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('❌ SMS ล้มเหลว:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/send-visitor-sms — แจ้งเตือนพนักงานว่าผู้มาติดต่อมาถึงแล้ว
app.post('/api/send-visitor-sms', async (req, res) => {
  const { to, visitorName, company, gate } = req.body;
  if (!to) return res.status(400).json({ error: 'ต้องระบุ to' });

  const message = `[TBK SOC] ${visitorName || 'ผู้มาติดต่อ'} จาก ${company || '-'} มาถึงแล้วที่ป้อม${gate || ''}`;

  if (!SMS_PROVIDER) {
    console.log(`\n📱 [DEMO SMS] → ${to}: ${message}`);
    return res.json({ success: true, demo: true });
  }
  try {
    const result = await sendSmsViaProvider(to, message);
    console.log(`✅ ส่ง visitor SMS → ${to}`);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('❌ SMS ล้มเหลว:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Email+SMS Server รันที่ http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  if (!transporter) {
    console.log('\n📌 SMTP — ใส่ใน .env:');
    console.log('   SMTP_HOST=smtp.office365.com  SMTP_PORT=587');
    console.log('   SMTP_USER=your@tbkk.co.th  SMTP_PASS=xxx');
  }
  if (!SMS_PROVIDER) {
    console.log('\n📌 SMS — เลือก provider แล้วใส่ใน .env:');
    console.log('   SMS_PROVIDER=twilio');
    console.log('   TWILIO_ACCOUNT_SID=ACxxx  TWILIO_AUTH_TOKEN=xxx  TWILIO_FROM=+1xxxxxxxxxx');
    console.log('   — หรือ —');
    console.log('   SMS_PROVIDER=vonage');
    console.log('   VONAGE_API_KEY=xxx  VONAGE_API_SECRET=xxx  VONAGE_FROM=TBKK');
    console.log('   — หรือ —');
    console.log('   SMS_PROVIDER=thaisms');
    console.log('   THAISMS_USERNAME=xxx  THAISMS_PASSWORD=xxx  THAISMS_SENDER=TBKK');
  } else {
    console.log(`✅ SMS พร้อมใช้งาน (provider: ${SMS_PROVIDER})`);
  }
});
