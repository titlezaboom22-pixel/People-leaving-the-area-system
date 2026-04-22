// ============================================================================
// Bot Detection & Anti-Spam helpers — Layer 2
// ============================================================================
// ใช้กับ public forms (Guest registration, Approve page)
//
//  1. Honeypot     — hidden input ที่ bot จะกรอก (มนุษย์มองไม่เห็น)
//  2. Timing       — bot submit เร็วกว่ามนุษย์ (< 2 วินาที)
//  3. localStorage — จำกัดจำนวน submit ต่ออุปกรณ์ต่อชั่วโมง
//  4. IP rate limit — ส่ง request ไป email-server /api/public-submit-check
// ============================================================================

const MIN_SUBMIT_SECONDS = 2;       // bot = submit ภายใน 2 วิ
const LS_PREFIX = '__tbkk_submit__';
const DEFAULT_MAX_PER_HOUR = 5;

/**
 * สร้างค่าเริ่มต้นของ honeypot state — เรียกตอน mount ฟอร์ม
 */
export function createHoneypotState() {
  return {
    formStartedAt: Date.now(),
    honeypot: '',              // <-- ต้องว่างตลอด
    humanChecked: false,       // reserved for future CAPTCHA integration
  };
}

/**
 * ตรวจว่าฟอร์มน่าจะส่งมาจาก bot หรือไม่
 * @returns { isBot: boolean, reason: string|null }
 */
export function detectBotSubmission({ formStartedAt, honeypot }) {
  if (honeypot && honeypot.length > 0) {
    return { isBot: true, reason: 'honeypot-filled' };
  }
  if (!formStartedAt) {
    return { isBot: false, reason: null };
  }
  const elapsedMs = Date.now() - formStartedAt;
  if (elapsedMs < MIN_SUBMIT_SECONDS * 1000) {
    return { isBot: true, reason: `too-fast:${Math.round(elapsedMs)}ms` };
  }
  return { isBot: false, reason: null };
}

/**
 * ตรวจ client-side rate limit (localStorage-based)
 * @param {string} key — unique ต่อฟอร์ม เช่น 'guest-submit'
 * @returns { allowed: boolean, count: number, resetAt: number }
 */
export function checkLocalRateLimit(key, maxPerHour = DEFAULT_MAX_PER_HOUR) {
  try {
    const storageKey = `${LS_PREFIX}${key}`;
    const raw = localStorage.getItem(storageKey);
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    let entries = [];
    if (raw) {
      try {
        entries = JSON.parse(raw).filter(t => t > oneHourAgo);
      } catch {
        entries = [];
      }
    }

    if (entries.length >= maxPerHour) {
      const oldest = Math.min(...entries);
      return {
        allowed: false,
        count: entries.length,
        resetAt: oldest + 60 * 60 * 1000,
      };
    }

    return { allowed: true, count: entries.length, resetAt: 0 };
  } catch {
    // localStorage ใช้ไม่ได้ — ยอม (fail-open)
    return { allowed: true, count: 0, resetAt: 0 };
  }
}

/**
 * บันทึก submit ลง localStorage (เรียกหลัง submit สำเร็จ)
 */
export function recordLocalSubmit(key) {
  try {
    const storageKey = `${LS_PREFIX}${key}`;
    const raw = localStorage.getItem(storageKey);
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    let entries = [];
    if (raw) {
      try { entries = JSON.parse(raw).filter(t => t > oneHourAgo); } catch {}
    }
    entries.push(now);
    localStorage.setItem(storageKey, JSON.stringify(entries));
  } catch {
    // ignore
  }
}

/**
 * คำนวณวินาทีที่เหลือจนถึง reset
 */
export function secondsUntilReset(resetAt) {
  if (!resetAt) return 0;
  const s = Math.ceil((resetAt - Date.now()) / 1000);
  return Math.max(0, s);
}

/**
 * Format "อีก X นาที"
 */
export function formatResetTime(resetAt) {
  const sec = secondsUntilReset(resetAt);
  if (sec <= 0) return '';
  if (sec < 60) return `อีก ${sec} วินาที`;
  const min = Math.ceil(sec / 60);
  return `อีก ${min} นาที`;
}

/**
 * CSS inline สำหรับ honeypot input (ซ่อนจากมนุษย์ + screen reader)
 *
 * ใช้ในฟอร์ม:
 *   <input
 *     type="text"
 *     name="__contact_phone_extra"
 *     tabIndex={-1}
 *     autoComplete="off"
 *     aria-hidden="true"
 *     style={HONEYPOT_STYLE}
 *     value={state.honeypot}
 *     onChange={e => setState(s => ({ ...s, honeypot: e.target.value }))}
 *   />
 */
export const HONEYPOT_STYLE = {
  position: 'absolute',
  left: '-10000px',
  top: 'auto',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  opacity: 0,
  pointerEvents: 'none',
};
