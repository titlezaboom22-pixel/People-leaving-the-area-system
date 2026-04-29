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
  DRIVER: 'DRIVER',
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
  // สั่งเครื่องดื่ม: Prepare → Check(หัวหน้า) → GA รับออเดอร์ (GA ส่งรูปทาง LINE ให้ร้าน)
  DRINK_ORDER: { steps: 2, step1Label: 'Check (หัวหน้าแผนก)', step2: 'GA', step2Label: 'GA รับออเดอร์' },
  // สั่งอาหาร: Prepare → Check(หัวหน้า) → GA รับออเดอร์ (GA ส่งรูปทาง LINE ให้ร้าน)
  FOOD_ORDER: { steps: 2, step1Label: 'Check (หัวหน้าแผนก)', step2: 'GA', step2Label: 'GA รับออเดอร์' },
  // สั่งเครื่องดื่ม+อาหาร: Prepare → Check(หัวหน้า) → GA รับออเดอร์
  DRINK_FOOD_ORDER: { steps: 2, step1Label: 'Check (หัวหน้าแผนก)', step2: 'GA', step2Label: 'GA รับออเดอร์' },
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

// --- Approval Level (ตามระบบ HR จริงของ TBKK: ระดับ 3-9) ---
// ⚠️ TBKK กลับด้าน: เลขน้อย = ตำแหน่งสูง
// 3 = GM (สูงสุด)         → 5 คนในบริษัท
// 4 = Asst. GM            → 7 คน
// 5 = ผู้จัดการฝ่าย       → 14 คน
// 6 = ผู้ช่วยผู้จัดการฝ่าย  → 12 คน
// 7 = หัวหน้าแผนก         → 10 คน
// 8 = Supervisor (หัวหน้างาน) → 25 คน  ← ขั้นต่ำที่อนุมัติใบขอใช้รถได้
// 9 = พนักงาน (ต่ำสุด)    → 804 คน
export const VEHICLE_MAX_APPROVAL_LEVEL = 8; // <= 8 ถึงจะอนุมัติได้ (Supervisor)
export const VEHICLE_MIN_APPROVAL_LEVEL = 3; // >= 3 (GM, Asst.GM, ...) — Lv.2 Director ไม่อนุมัติงานประจำ

// Label สำหรับแสดงในหน้า admin / ApproverPicker (ตามระบบจริง TBKK)
export const APPROVAL_LEVEL_LABELS = {
  1: 'President (ประธานบริษัท)',
  2: 'Director (ผู้อำนวยการ)',
  3: 'GM (ผู้จัดการทั่วไป)',
  4: 'Asst. GM (ผู้ช่วย ผจ.ทั่วไป)',
  5: 'ผู้จัดการฝ่าย',
  6: 'ผู้ช่วยผู้จัดการฝ่าย',
  7: 'หัวหน้าแผนก',
  8: 'Supervisor (หัวหน้างาน)',
  9: 'พนักงาน',
};

// ตรวจว่า user มีสิทธิ์อนุมัติเอกสารประเภทนี้หรือไม่
// Inverted: level น้อยกว่า = ตำแหน่งสูงกว่า → ใช้ <= ในการเช็คขั้นต่ำ
export function canApproveVehicle(user) {
  const level = Number(user?.approvalLevel || 0);
  if (level < VEHICLE_MIN_APPROVAL_LEVEL) return false; // ไม่ได้ตั้ง level
  return level <= VEHICLE_MAX_APPROVAL_LEVEL;
}

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
  // ถ้าหาไม่เจอใน DEPARTMENTS list → คืนค่าดิบ ไม่ทับเป็น "Other"
  // (กัน workflow ติดที่ Other เมื่อ dept ของ user ไม่ตรง canonical list)
  return found || (raw || '').toString().trim() || 'Other (อื่นๆ)';
}
