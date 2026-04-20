// Input Sanitization — ป้องกัน XSS + script injection

const SCRIPT_PATTERN = /<script[\s>]|javascript:|on\w+\s*=|<iframe|<embed|<object/gi;

export function sanitize(input) {
  if (input === null || input === undefined) return '';
  if (typeof input === 'number') return input;
  if (typeof input === 'boolean') return input;
  if (typeof input !== 'string') return String(input);

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
}

export function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);

  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      clean[key] = sanitize(value);
    } else if (typeof value === 'object' && value !== null) {
      clean[key] = sanitizeObject(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

export function hasScriptInjection(input) {
  if (typeof input !== 'string') return false;
  return SCRIPT_PATTERN.test(input);
}

export function validateInput(input, maxLength = 500) {
  if (typeof input !== 'string') return true;
  if (input.length > maxLength) return false;
  if (hasScriptInjection(input)) return false;
  return true;
}
