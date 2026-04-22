// --- Shared Constants สำหรับทั้งระบบ ---

export const DEPARTMENTS = [
  'EEE (Employee Experience Engagement)',
  'SOC (ศูนย์ปฏิบัติการ)',
  'HR (ทรัพยากรบุคคล)',
  'IT (เทคโนโลยีสารสนเทศ)',
  'Production (ฝ่ายผลิต)',
  'Accounting (บัญชี)',
  'Sales (ฝ่ายขาย)',
  'Maintenance (ซ่อมบำรุง)',
  'Other (อื่นๆ)',
  'Shop (ร้านค้า)',
];

export const HR_DEPARTMENT = 'HR (ทรัพยากรบุคคล)';
export const SHOP_DEPARTMENT = 'Shop (ร้านค้า)';
export const SECURITY_DEPARTMENT = 'SECURITY';
export const COFFEE_SHOP = 'COFFEE_SHOP';
export const OT_FOOD_SHOP = 'OT_FOOD_SHOP';

export const STATUS = {
  PENDING: 'pending',
  INSIDE: 'inside',
  APPROVED_OUT: 'approved_out',
  COMPLETED: 'completed',
};

export const ROLES = {
  HOST: 'HOST',
  EMPLOYEE: 'EMPLOYEE',
  SECURITY: 'SECURITY',
  GUEST: 'GUEST',
  ADMIN: 'ADMIN',
};

// Workflow routing ตามประเภทเอกสาร
// Prepare (พนักงาน) → Check (หัวหน้าแผนก) → Approve (ผจก./HR/EEE) → รปภ.
export const WORKFLOW_ROUTES = {
  // ขอใช้รถ: Prepare → Check(หัวหน้า) → GA จัดรถ+คนขับ → แจ้งพนักงาน
  VEHICLE_BOOKING: { steps: 2, step1Label: 'Check (หัวหน้าแผนก)', step2: 'GA', step2Label: 'GA จัดรถ' },
  // ขอออกข้างนอก: Prepare → Check(หัวหน้า) → Approve(HR/EEE) → รปภ.
  OUTING_REQUEST: { steps: 3, step1Label: 'Check (หัวหน้าแผนก)', step2: 'HR', step2Label: 'Approve (ผจก./HR/EEE)', step3: 'SECURITY', step3Label: 'รปภ. รับทราบ' },
  // นำของเข้า/ออก: Prepare → Check(หัวหน้า) → Approve(HR/EEE) → รปภ.
  GOODS_IN_OUT: { steps: 3, step1Label: 'Check (หัวหน้าแผนก)', step2: 'HR', step2Label: 'Approve (ผจก./HR/EEE)', step3: 'SECURITY', step3Label: 'รปภ. รับทราบ' },
  // ผู้มาติดต่อ: Prepare → Check(หัวหน้า) → Approve(HR/EEE) → รปภ.
  VISITOR: { steps: 3, step1Label: 'Check (หัวหน้าแผนก)', step2: 'HR', step2Label: 'Approve (ผจก./HR/EEE)', step3: 'SECURITY', step3Label: 'รปภ. รับทราบ' },
  // สั่งเครื่องดื่ม: Prepare → GA รับออเดอร์ (ไม่ผ่านหัวหน้า)
  DRINK_ORDER: { steps: 1, step1: 'GA', step1Label: 'GA รับออเดอร์', targetType: 'GA', sendShopImmediately: true },
  // สั่งอาหาร: Prepare → GA รับออเดอร์ (ไม่ผ่านหัวหน้า)
  FOOD_ORDER: { steps: 1, step1: 'GA', step1Label: 'GA รับออเดอร์', targetType: 'GA', sendShopImmediately: true },
  // สั่งเครื่องดื่ม+อาหาร (รวมเป็นใบเดียว): Prepare → GA รับออเดอร์ (ไม่ผ่านหัวหน้า)
  DRINK_FOOD_ORDER: { steps: 1, step1: 'GA', step1Label: 'GA รับออเดอร์', targetType: 'GA', sendShopImmediately: true },
  // เบิกอุปกรณ์: Prepare → Check(หัวหน้า) → จบ
  EQUIPMENT_REQUEST: { steps: 1, step1Label: 'Check (หัวหน้าแผนก)' },
};

// Email สำหรับปลายทางพิเศษ (เปลี่ยนได้ทีหลัง)
export const SPECIAL_EMAILS = {
  SECURITY: 'intern_attachai.k@tbkk.co.th',  // TODO: เปลี่ยนเป็น email รปภ. จริง
  COFFEE_SHOP: 'intern_attachai.k@tbkk.co.th', // TODO: เปลี่ยนเป็น email ร้านกาแฟจริง
  OT_FOOD_SHOP: 'intern_attachai.k@tbkk.co.th', // TODO: เปลี่ยนเป็น email ร้านข้าว OT จริง
  GA: 'intern_attachai.k@tbkk.co.th', // TODO: เปลี่ยนเป็น email GA จริง
};

export const STEP_LABEL = {
  1: 'หัวหน้าแผนกผู้ส่ง',
  2: 'หัวหน้าแผนก HR',
  3: 'ร้านค้า / จัดซื้อ',
};

export const DEPT_ALIAS = {
  EEE: 'EEE',
  SOC: 'SOC',
  HR: 'HR',
  IT: 'IT',
  PRODUCTION: 'PRODUCTION',
  ACCOUNTING: 'ACCOUNTING',
  SALES: 'SALES',
  MAINTENANCE: 'MAINTENANCE',
  OTHER: 'OTHER',
  SHOP: 'SHOP',
};

export function normalizeDepartment(value) {
  const raw = (value || '').toString().trim().toUpperCase();
  if (!raw) return '';
  const short = raw.split(' ')[0].replace(/[^A-Z]/g, '');
  return DEPT_ALIAS[short] || short || raw;
}

export function resolveQueueDepartment(raw) {
  const n = normalizeDepartment(raw);
  if (!n) return 'Other (อื่นๆ)';
  const found = DEPARTMENTS.find((d) => normalizeDepartment(d) === n);
  return found || 'Other (อื่นๆ)';
}
