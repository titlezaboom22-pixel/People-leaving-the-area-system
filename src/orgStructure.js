// โครงสร้างองค์กร TBKK — ใช้ใน Admin user management
// แก้ไขเพิ่ม/ลบรายการได้ที่นี่

export const COMPANIES = [
  'TBKK',    // ID ขึ้นต้นด้วยเลข เช่น 00004, 01001
  'Win',     // ID ขึ้นต้นด้วย W เช่น W0937, W1143
  'STU_K',   // ID ขึ้นต้นด้วย S เช่น S0313, SD553, SS001
];

// Auto-detect บริษัทจาก ID prefix
export const getCompanyByStaffId = (id) => {
  const v = (id || '').toString().trim().toUpperCase();
  if (!v) return '';
  if (v.startsWith('W')) return 'Win';
  if (v.startsWith('S')) return 'STU_K';
  if (/^\d/.test(v)) return 'TBKK';
  return '';  // EMP-, HEAD-, ADMIN, SEC, GA — auto-detect ไม่ได้
};

export const DIVISIONS = [
  'ฝ่ายผลิต (Production)',
  'ฝ่ายวิศวกรรม (Engineering)',
  'ฝ่ายคุณภาพ (Quality)',
  'ฝ่ายบัญชีและการเงิน (Accounting & Finance)',
  'ฝ่ายทรัพยากรบุคคล (HR)',
  'ฝ่ายเทคโนโลยีสารสนเทศ (IT)',
  'ฝ่ายขายและการตลาด (Sales & Marketing)',
  'ฝ่ายซัพพลายเชน (SCM)',
  'ฝ่ายธุรการ (Admin)',
  'ฝ่ายความปลอดภัย (Safety)',
];

// แผนก — sync กับ DEPARTMENTS ใน constants.js
export const DEPARTMENT_LIST = [
  'EEE (Employee Experience Engagement)',
  'SOC (Safety & Operations Center)',
  'HR (Human Resources)',
  'IT (Information Technology)',
  'Production',
  'Accounting',
  'Sales',
  'Maintenance',
  'Engineering',
  'Quality Assurance',
  'Quality Control',
  'Warehouse',
  'Logistics',
  'Purchasing',
  'GA (General Affairs)',
  'Shop',
  'Other',
];

export const SECTIONS = [
  'ส่วนงานวางแผน (Planning)',
  'ส่วนงานผลิตชิ้นส่วน (Parts Production)',
  'ส่วนงานประกอบ (Assembly)',
  'ส่วนงานตรวจสอบ (Inspection)',
  'ส่วนงานบรรจุภัณฑ์ (Packaging)',
  'ส่วนงานบำรุงรักษา (Maintenance)',
  'ส่วนงานสนับสนุน (Support)',
  'ส่วนงานพัฒนา (Development)',
  'ส่วนงานบริการ (Service)',
  'ส่วนงานบริหาร (Management)',
];

export const POSITIONS = [
  'ผู้จัดการทั่วไป (General Manager)',
  'ผู้จัดการฝ่าย (Division Manager)',
  'ผู้จัดการแผนก (Department Manager)',
  'ผู้ช่วยผู้จัดการ (Assistant Manager)',
  'หัวหน้าส่วน (Section Head)',
  'หัวหน้างาน (Supervisor)',
  'หัวหน้าทีม (Team Leader)',
  'วิศวกรอาวุโส (Senior Engineer)',
  'วิศวกร (Engineer)',
  'เจ้าหน้าที่อาวุโส (Senior Officer)',
  'เจ้าหน้าที่ (Officer)',
  'ช่างเทคนิค (Technician)',
  'ช่าง (Operator)',
  'พนักงาน (Staff)',
  'พนักงานทั่วไป (General Staff)',
];
