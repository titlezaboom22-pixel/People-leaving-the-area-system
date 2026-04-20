# SOC Systems - สรุปโปรเจค

## ระบบอะไร
ระบบจัดการผู้เยี่ยมชมและเอกสารภายใน TBK Group (โรงงาน TBKK)
- React 18 + Vite + Firebase Firestore + Tailwind CSS (CDN)
- Deploy ที่: https://tbkk-system.web.app
- Firebase project: tbkk-system

## โครงสร้างไฟล์สำคัญ
```
src/
  App.jsx          - หน้าหลัก (Login, HostView, AdminView, GuestView)
  SecurityGate.jsx - หน้าจอ รปภ. (dashboard, ผู้มาติดต่อ, ของเข้า-ออก, พนักงานออกนอก)
  ApprovePage.jsx  - หน้าเซ็นอนุมัติออนไลน์ (เปิดจากลิงก์ ไม่ต้อง login)
  RobotNotifier.jsx - หุ่นยนต์แจ้งเตือน (ลอยมุมขวาล่าง)
  EquipmentForm.jsx - ฟอร์มเบิกอุปกรณ์สำนักงาน
  VehicleBookingForm.jsx - ใบขอใช้รถ
  DrinkOrderForm.jsx - จองเครื่องดื่ม
  FoodOrderForm.jsx  - จองอาหารแขก
  OutingForm.jsx     - ขอออกนอกสถานที่
  GoodsForm.jsx      - นำของเข้า/ออก
  EmployeeLog.jsx    - พนักงานเข้า-ออกโรงงาน
  firebase.js        - Firebase config (shared module)
  constants.js       - Shared constants (departments, roles, workflow routes)
  authService.js     - Authentication (SHA-256 hash, lockout, audit)
  approvalNotifications.js - Approval workflow (Firestore + localStorage fallback)
  emailHelper.js     - Email helper (mailto: + approve URL)
  auditLog.js        - Audit logging
  sanitize.js        - Input sanitization
  printDocument.js   - Print document helper
scripts/
  seed-users.js      - Seed users ลง Firestore
  seed-equipment-stock.js - Seed อุปกรณ์สำนักงาน
server/
  email-server.js    - SMTP email server (รอ credentials จาก IT)
```

## Roles (5 roles)
| Role | ID ทดสอบ | รหัสผ่าน | หน้าที่ |
|------|---------|---------|--------|
| EMPLOYEE | EMP-EEE-01 | 1234 | กรอกฟอร์ม 6 ใบ, สร้างนัดหมาย |
| HOST (หัวหน้า) | HEAD-EEE | 1234 | อนุมัติเอกสาร, เซ็นลายเซ็น |
| SECURITY (รปภ.) | SEC001 | sec1234 | สแกน QR, รับเข้า/ออก ผู้มาติดต่อ |
| ADMIN | ADMIN | admin1234 | จัดการทุกอย่าง, จัดการสต็อก |
| GUEST | กดปุ่มหน้า login | - | ลงทะเบียนผู้มาติดต่อ |

## แผนก
EEE, SOC, HR, IT, Production, Accounting, Sales, Maintenance, Other, Shop

## Approval Workflow (6 ประเภท)
| เอกสาร | ขั้น 1 | ขั้น 2 | ขั้น 3 |
|--------|--------|--------|--------|
| ขอใช้รถ | หัวหน้าแผนก | HR/EEE | รปภ. |
| ขอออกนอก | หัวหน้าแผนก | HR/EEE | รปภ. |
| นำของเข้า/ออก | หัวหน้าแผนก | HR/EEE | รปภ. |
| ผู้มาติดต่อ | หัวหน้าแผนก | HR/EEE | รปภ. |
| สั่งเครื่องดื่ม | หัวหน้าแผนก | ร้านกาแฟ | จบ |
| สั่งอาหาร | หัวหน้าแผนก | ร้านข้าว OT | จบ |

## Flow ผู้มาติดต่อ
1. พนักงานสร้างนัดหมาย → ส่งลิงก์/QR ให้ผู้มาติดต่อ
2. ผู้มาติดต่อกรอกข้อมูล → ได้ QR Code
3. มาถึงป้อม → รปภ. สแกน QR → ข้อมูลขึ้นจอ → กรอกเลขบัตร → อนุมัติเข้า
4. ผู้มาติดต่อจะกลับ → หัวหน้าเซ็นอนุมัติให้ออก
5. รปภ. เห็นลายเซ็นหัวหน้า → อนุมัติออก → เก็บบัตร

## Firestore Collections
```
artifacts/{appId}/public/data/
  appointments/        - นัดหมายผู้มาติดต่อ
  approval_workflows/  - เอกสารอนุมัติทุกประเภท
  employee_logs/       - พนักงานเข้า-ออก
  users/               - ข้อมูลผู้ใช้
  equipment_requests/  - ฟอร์มเบิกอุปกรณ์
  equipment_stock/     - สต็อกอุปกรณ์ (มี/หมด)
  login_attempts/      - บันทึกการ login ผิด (lockout)
  audit_logs/          - ประวัติการใช้งาน
```

## Security
- รหัสผ่าน SHA-256 hash
- ล็อคบัญชีหลังใส่ผิด 5 ครั้ง (15 นาที)
- Auto logout 30 นาที
- Audit log ทุก action
- Firestore rules: auth required + ห้ามลบ
- Security headers ใน firebase.json
- Input sanitization

## สิ่งที่ยังเหลือ
1. SMTP ส่ง email อัตโนมัติ (รอ credentials จาก IT)
2. เพิ่มข้อมูลผู้ร่วมเดินทาง ใบขอใช้รถ
3. แก้ responsive มือถือบางหน้า
4. เปลี่ยนรหัสผ่านจาก 1234 ก่อนใช้จริง
5. PWA icon โลโก้ TBK

## วิธี Deploy
```bash
cd C:\Projiect6
npm run build && npx firebase-tools deploy
```

## วิธี Seed ข้อมูล
```bash
node scripts/seed-users.js
node scripts/seed-equipment-stock.js
```

## Email หัวหน้า
- HEAD-EEE: sarayut_r@tbkk.co.th
- อื่นๆ: intern_attachai.k@tbkk.co.th (ทดสอบ)
