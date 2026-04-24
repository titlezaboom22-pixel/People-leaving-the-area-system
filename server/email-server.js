/**
 * SMTP Email Server สำหรับ SOC Systems
 *
 * วิธีใช้:
 *   1. ใส่ SMTP credentials ใน .env
 *   2. รัน: node server/email-server.js
 *   3. Server จะรันที่ port 3001
 *
 * Security:
 *   - Rate limit per IP (general + email + public-form)
 *   - API key (x-api-key header) — optional (set env.API_KEY)
 *   - Recipient domain allowlist (@tbkk.co.th by default)
 *   - Request size limits
 *   - Abuse logging to Firestore (security_alerts/)
 */

import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import rateLimit from 'express-rate-limit';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ========== Firebase Admin SDK (สำหรับส่ง FCM push) ==========
let fcmAdmin = null;
try {
  const keyPath = resolve(__dirname, 'firebase-admin-key.json');
  if (existsSync(keyPath) && getApps().length === 0) {
    const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf-8'));
    initializeApp({ credential: cert(serviceAccount) });
    fcmAdmin = getMessaging();
    console.log('✅ Firebase Admin SDK พร้อมส่ง FCM push');
  } else if (!existsSync(keyPath)) {
    console.log('ℹ️  ไม่พบ server/firebase-admin-key.json — FCM push ปิดใช้งาน');
  }
} catch (err) {
  console.warn('⚠️ Firebase Admin init failed:', err.message);
}

// โหลด config — รองรับทั้ง
//   1. Cloud environment (Render/Railway/Fly) — อ่านจาก process.env
//   2. Local dev — อ่านจาก .env file
function loadEnv() {
  const env = { ...process.env }; // Cloud env vars มาก่อน
  try {
    const envPath = resolve(__dirname, '..', '.env');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      // ถ้า process.env ยังไม่มี ให้ใช้จาก .env
      if (!env[key]) env[key] = val;
    }
  } catch {
    // ไม่มี .env ก็ไม่เป็นไร (บน cloud ใช้ process.env)
  }
  return env;
}

const env = loadEnv();
const PORT = process.env.PORT || env.EMAIL_SERVER_PORT || 3001;

// ========== Security Config ==========
const API_KEY = env.API_KEY || '';
const RECIPIENT_ALLOWLIST = (env.RECIPIENT_DOMAIN_ALLOWLIST || 'tbkk.co.th,tbk.co.th,anthropic.com')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const MAX_SUBJECT_LEN = 300;
const MAX_BODY_LEN = 500_000; // 500 KB (HTML body)
const MAX_RECIPIENTS = 20;

// ตั้งค่า SMTP transporter — รองรับทั้ง .env และ Admin UI (runtime reload)
let smtpConfig = {
  host: env.SMTP_HOST || 'smtp.office365.com',
  port: parseInt(env.SMTP_PORT || '587'),
  secure: env.SMTP_SECURE === 'true',
  auth: {
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
  },
};
let smtpFrom = env.SMTP_FROM || env.SMTP_USER || 'noreply@tbkk.co.th';
let smtpFromName = env.SMTP_FROM_NAME || 'SOC Systems - TBKK Group';
let smtpSource = 'env'; // 'env' | 'firestore' | 'runtime'

let transporter = null;

function buildTransporter() {
  if (smtpConfig.auth.user && smtpConfig.auth.pass) {
    try {
      transporter = nodemailer.createTransport(smtpConfig);
      console.log(`✅ SMTP พร้อมใช้งาน (${smtpConfig.auth.user} → ${smtpConfig.host}:${smtpConfig.port}) [source=${smtpSource}]`);
      return true;
    } catch (err) {
      transporter = null;
      console.error('❌ สร้าง transporter ล้มเหลว:', err.message);
      return false;
    }
  } else {
    transporter = null;
    console.warn('⚠️ ยังไม่ได้ตั้งค่า SMTP_USER / SMTP_PASS');
    console.warn('   ระบบจะจำลองการส่ง email (Demo mode)');
    return false;
  }
}

buildTransporter();

// ========== Firestore REST helper (สำหรับ abuse log + SMTP config) ==========
let cachedIdToken = null;
let cachedIdTokenAt = 0;

async function getFirestoreIdToken() {
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  const apiKey = env.VITE_FIREBASE_API_KEY;
  if (!projectId || !apiKey) return null;
  // Cache 45 min (tokens live 1 hour)
  if (cachedIdToken && Date.now() - cachedIdTokenAt < 45 * 60 * 1000) return cachedIdToken;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) }
    );
    const j = await res.json();
    if (j.idToken) {
      cachedIdToken = j.idToken;
      cachedIdTokenAt = Date.now();
      return j.idToken;
    }
  } catch {}
  return null;
}

// Log abuse attempts to Firestore `security_alerts` collection
async function logAbuse(req, type, details = {}) {
  const ip = (req.ip || req.headers['x-forwarded-for'] || '-').toString().split(',')[0].trim();
  const ua = (req.headers['user-agent'] || '-').toString().slice(0, 300);
  const origin = (req.headers.origin || '-').toString().slice(0, 200);
  console.warn(`🚨 ABUSE [${type}] ip=${ip} path=${req.path} origin=${origin}`);
  try {
    const projectId = env.VITE_FIREBASE_PROJECT_ID;
    const appId = env.VITE_APP_ID || 'visitor-soc-001';
    if (!projectId) return;
    const idToken = await getFirestoreIdToken();
    if (!idToken) return;
    const docPath = `artifacts/${appId}/public/data/security_alerts`;
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${docPath}`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({
        fields: {
          type: { stringValue: String(type).slice(0, 80) },
          ip: { stringValue: ip.slice(0, 64) },
          userAgent: { stringValue: ua },
          origin: { stringValue: origin },
          path: { stringValue: (req.path || '-').slice(0, 120) },
          method: { stringValue: req.method || '-' },
          details: { stringValue: JSON.stringify(details).slice(0, 800) },
          at: { timestampValue: new Date().toISOString() },
          resolved: { booleanValue: false },
          severity: { stringValue: ['invalid-api-key', 'recipient-not-allowed', 'payload-too-large'].includes(type) ? 'high' : 'medium' },
        },
      }),
    });
  } catch (err) {
    // non-blocking
  }
}

// พยายามโหลด SMTP config จาก Firestore REST API (ถ้าตั้งค่าไว้)
async function loadSmtpFromFirestore() {
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  const apiKey = env.VITE_FIREBASE_API_KEY;
  const appId = env.VITE_APP_ID || 'visitor-soc-001';
  if (!projectId || !apiKey) return;

  try {
    const idToken = await getFirestoreIdToken();
    if (!idToken) {
      console.log('ℹ️  ไม่สามารถ sign in anonymous เพื่อโหลด SMTP จาก Firestore (ข้ามไปใช้ .env)');
      return;
    }

    const docPath = `artifacts/${appId}/public/data/smtp_settings/default`;
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${docPath}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
    if (!res.ok) {
      if (res.status === 404) {
        console.log('ℹ️  ยังไม่มี SMTP settings ใน Firestore (ใช้จาก .env)');
      } else {
        console.log(`ℹ️  ไม่สามารถโหลด SMTP จาก Firestore: HTTP ${res.status} (ใช้จาก .env)`);
      }
      return;
    }
    const json = await res.json();
    const fields = json.fields || {};
    const g = (k) => {
      const v = fields[k];
      if (!v) return undefined;
      if (v.stringValue !== undefined) return v.stringValue;
      if (v.integerValue !== undefined) return parseInt(v.integerValue);
      if (v.booleanValue !== undefined) return v.booleanValue;
      return undefined;
    };
    const enabled = g('enabled');
    if (!enabled) {
      console.log('ℹ️  SMTP settings ใน Firestore ปิดใช้งาน (enabled=false) — ใช้จาก .env');
      return;
    }
    const host = g('host');
    const port = g('port');
    const user = g('user');
    const pass = g('pass');
    if (host && user && pass) {
      smtpConfig = {
        host,
        port: parseInt(port) || 587,
        secure: !!g('secure'),
        auth: { user, pass },
      };
      smtpFrom = g('from') || user;
      smtpFromName = g('fromName') || 'SOC Systems - TBKK Group';
      smtpSource = 'firestore';
      buildTransporter();
    }
  } catch (err) {
    console.log('ℹ️  โหลด SMTP จาก Firestore ไม่สำเร็จ:', err.message);
  }
}

loadSmtpFromFirestore();

const app = express();
app.set('trust proxy', 1); // Render/Cloudflare/Proxy-aware IP

// CORS — อนุญาตเฉพาะ localhost + domain ของ TBKK
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://tbkk-system.web.app',
  'https://tbkk-system.firebaseapp.com',
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // curl, mobile apps, same-origin
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    console.warn(`⚠️ CORS blocked: ${origin}`);
    return cb(new Error('Not allowed by CORS'));
  },
}));
app.use(express.json({ limit: '5mb' }));

// ========== Rate limiters ==========
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1 นาที
  max: 120,                    // 120 req/min/IP ทั่วไป (health + config)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
  handler: (req, res) => {
    logAbuse(req, 'rate-limit-general', { limit: 120, window: '1min' });
    res.status(429).json({ error: 'Too many requests — รอสักครู่' });
  },
});
const emailLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1 นาที
  max: 15,                     // 15 email/min/IP (ถ้าส่งเอกสารพร้อมกัน 5 ใบ × 3 คน = 15 พอดี)
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logAbuse(req, 'rate-limit-email', { limit: 15, window: '1min' });
    res.status(429).json({ error: 'ส่งอีเมลบ่อยเกินไป — รอ 1 นาที' });
  },
});
const publicFormLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,   // 1 ชั่วโมง
  max: 5,                      // 5 submit/ชม/IP (guest form)
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logAbuse(req, 'rate-limit-public-form', { limit: 5, window: '1hour' });
    res.status(429).json({ error: 'ลงทะเบียนบ่อยเกินไป — ลองใหม่ในอีก 1 ชั่วโมง' });
  },
});

// ========== Middleware: API key ==========
function requireApiKey(req, res, next) {
  if (!API_KEY) return next(); // ปิดใช้งานถ้าไม่ได้ตั้ง env.API_KEY
  const key = req.headers['x-api-key'];
  if (key !== API_KEY) {
    logAbuse(req, 'invalid-api-key', { provided: key ? `${String(key).slice(0, 4)}...` : 'missing' });
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// ========== Validation helpers ==========
function validateRecipient(to) {
  if (!to || typeof to !== 'string') return { ok: false, reason: 'recipient-missing' };
  const emails = to.split(/[,;]/).map(e => e.trim()).filter(Boolean);
  if (emails.length === 0) return { ok: false, reason: 'recipient-empty' };
  if (emails.length > MAX_RECIPIENTS) return { ok: false, reason: 'too-many-recipients' };
  for (const email of emails) {
    const m = email.match(/^[^@\s]+@([^@\s]+\.[^@\s]+)$/);
    if (!m) return { ok: false, reason: `invalid-format:${email}` };
    const domain = m[1].toLowerCase();
    const allowed = RECIPIENT_ALLOWLIST.some(d => domain === d || domain.endsWith('.' + d));
    if (!allowed) return { ok: false, reason: `domain-not-allowed:${domain}` };
  }
  return { ok: true };
}

function validateBodySize({ subject, html, body }) {
  if (subject && subject.length > MAX_SUBJECT_LEN) return { ok: false, reason: 'subject-too-long' };
  const totalLen = (html || '').length + (body || '').length;
  if (totalLen > MAX_BODY_LEN) return { ok: false, reason: 'body-too-large' };
  return { ok: true };
}

// ========== Apply rate limiters ==========
app.use(generalLimiter);

// Health check (ไม่ต้องใช้ API key + ไม่ rate limit)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    smtp: !!transporter,
    hasSMTP: !!transporter,
    source: smtpSource,
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    user: smtpConfig.auth.user ? smtpConfig.auth.user.replace(/^(.).+(@.+)$/, '$1***$2') : '',
    from: smtpFrom,
    security: {
      apiKey: !!API_KEY,
      allowlist: RECIPIENT_ALLOWLIST,
    },
  });
});

// Public form rate limit check — client (GuestView) calls นี้ก่อน submit
app.post('/api/public-submit-check', publicFormLimiter, (req, res) => {
  res.json({ ok: true });
});

// รับการ reload SMTP config จาก Admin UI (runtime only — ไม่เขียน .env)
app.post('/api/config/smtp', requireApiKey, (req, res) => {
  const { host, port, secure, user, pass, from, fromName, enabled } = req.body || {};
  if (enabled === false) {
    transporter = null;
    smtpSource = 'runtime-disabled';
    console.log('🔌 SMTP ถูกปิดใช้งานจาก Admin UI (ใช้ Demo mode)');
    return res.json({ success: true, message: 'SMTP ปิดใช้งานแล้ว', hasSMTP: false });
  }
  if (!host || !user || !pass) {
    return res.status(400).json({ error: 'ต้องระบุ host, user, pass' });
  }
  smtpConfig = {
    host: String(host).trim(),
    port: parseInt(port) || 587,
    secure: !!secure,
    auth: { user: String(user).trim(), pass: String(pass) },
  };
  smtpFrom = (from && String(from).trim()) || smtpConfig.auth.user;
  smtpFromName = (fromName && String(fromName).trim()) || 'SOC Systems - TBKK Group';
  smtpSource = 'runtime';
  const ok = buildTransporter();
  res.json({ success: ok, hasSMTP: !!transporter, host: smtpConfig.host, port: smtpConfig.port });
});

// ========== Security-wrapped email endpoint factory ==========
function sendEmailEndpoint(handler) {
  return [emailLimiter, requireApiKey, async (req, res) => {
    const { to, subject, html, body } = req.body || {};
    // 1) recipient validation
    const rcp = validateRecipient(to);
    if (!rcp.ok) {
      logAbuse(req, 'recipient-not-allowed', { to, reason: rcp.reason });
      return res.status(403).json({ error: `recipient validation failed: ${rcp.reason}` });
    }
    // 2) size validation
    const size = validateBodySize({ subject, html, body });
    if (!size.ok) {
      logAbuse(req, 'payload-too-large', { reason: size.reason });
      return res.status(413).json({ error: `payload too large: ${size.reason}` });
    }
    return handler(req, res);
  }];
}

// ส่ง email (generic)
app.post('/api/send-email', ...sendEmailEndpoint(async (req, res) => {
  const { to, subject, body, html } = req.body;

  if (!to || !subject) {
    return res.status(400).json({ error: 'ต้องระบุ to และ subject' });
  }

  const mailOptions = {
    from: smtpFromName ? `"${smtpFromName}" <${smtpFrom}>` : smtpFrom,
    to,
    subject,
    text: body || req.body.text || '',
    html: html || undefined,
  };

  if (!transporter) {
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
}));

// ส่ง email พร้อมลิงก์อนุมัติ (HTML สวย + ปุ่มกด)
app.post('/api/send-approval-email', ...sendEmailEndpoint(async (req, res) => {
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
    from: smtpFromName ? `"${smtpFromName}" <${smtpFrom}>` : smtpFrom,
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
}));

// ส่ง email นัดหมาย (พร้อมลิงก์ลงทะเบียน)
app.post('/api/send-invite-email', ...sendEmailEndpoint(async (req, res) => {
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
    from: smtpFromName ? `"${smtpFromName}" <${smtpFrom}>` : smtpFrom,
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
}));

// =================== FCM Push ===================
// POST /api/send-push — ส่ง push notification ไปยัง FCM tokens
// body: { tokens: [...], title, body, data: { clickUrl, ... } }
app.post('/api/send-push', emailLimiter, requireApiKey, async (req, res) => {
  if (!fcmAdmin) {
    return res.status(503).json({ error: 'FCM Admin ยังไม่พร้อม — ตรวจ server/firebase-admin-key.json' });
  }
  const { tokens, title, body, data } = req.body || {};
  const tokenList = Array.isArray(tokens) ? tokens.filter(Boolean) : (tokens ? [tokens] : []);
  if (tokenList.length === 0) return res.status(400).json({ error: 'ต้องระบุ tokens (array หรือ string)' });
  if (!title || !body) return res.status(400).json({ error: 'ต้องระบุ title และ body' });
  if (tokenList.length > 100) return res.status(400).json({ error: 'ส่งได้ไม่เกิน 100 tokens ต่อครั้ง' });

  // data values ต้องเป็น string (FCM requirement)
  const dataStr = {};
  for (const [k, v] of Object.entries(data || {})) {
    dataStr[k] = v == null ? '' : String(v);
  }

  try {
    const result = await fcmAdmin.sendEachForMulticast({
      tokens: tokenList,
      notification: { title: String(title).slice(0, 120), body: String(body).slice(0, 500) },
      data: dataStr,
      webpush: {
        notification: {
          icon: '/images/icon-192.png',
          badge: '/images/icon-192.png',
          requireInteraction: true,
          vibrate: [200, 100, 200],
        },
        fcmOptions: dataStr.clickUrl ? { link: dataStr.clickUrl } : undefined,
      },
    });
    console.log(`📲 Push: success=${result.successCount} fail=${result.failureCount}`);

    // เก็บ tokens ที่ใช้งานไม่ได้เพื่อคืนให้ client ลบออก
    const invalidTokens = [];
    result.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code || '';
        if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
          invalidTokens.push(tokenList[i]);
        }
      }
    });

    res.json({
      success: true,
      sent: result.successCount,
      failed: result.failureCount,
      invalidTokens,
    });
  } catch (err) {
    console.error('❌ FCM send failed:', err.message);
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
app.post('/api/send-sms', emailLimiter, requireApiKey, async (req, res) => {
  const { to, message } = req.body;
  if (!to || !message) return res.status(400).json({ error: 'ต้องระบุ to และ message' });
  if (!/^\+?\d{9,15}$/.test(to)) {
    logAbuse(req, 'invalid-phone', { to });
    return res.status(400).json({ error: 'เบอร์โทรศัพท์ไม่ถูกต้อง' });
  }
  if (message.length > 500) {
    return res.status(400).json({ error: 'ข้อความยาวเกินไป' });
  }

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
app.post('/api/send-approval-sms', emailLimiter, requireApiKey, async (req, res) => {
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
app.post('/api/send-visitor-sms', emailLimiter, requireApiKey, async (req, res) => {
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

// ========== Error handler — don't leak stack traces ==========
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Email+SMS Server รันที่ http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`\n🔒 Security:`);
  console.log(`   API key: ${API_KEY ? '✅ enabled' : '⚠️  disabled (set env.API_KEY to enable)'}`);
  console.log(`   Allowed recipient domains: ${RECIPIENT_ALLOWLIST.join(', ')}`);
  console.log(`   Rate limits: general=120/min · email=15/min · public-form=5/hour`);
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
