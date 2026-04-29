# 📘 คู่มือ Deploy & Backup สำหรับ IT — TBKK SOC Systems

> ระบบ: TBKK SOC (จัดการผู้เยี่ยมชม + เอกสารภายใน)
> URL: https://tbkk-system.web.app
> Firebase Project: `tbkk-system`

---

## 🎯 สรุปสำคัญ — ข้อมูลไม่หาย

**Deploy เว็บ ≠ ลบข้อมูล** เด็ดขาด

| เวลาที่ deploy | กระทบไหม |
|---------------|---------|
| โค้ดเว็บ (HTML/JS/CSS) | ✅ เปลี่ยน |
| ฐานข้อมูล Firestore | ❌ ไม่กระทบ |
| ผู้ใช้ที่ login อยู่ | ❌ ไม่กระทบ |
| รูปลายเซ็น/เอกสาร | ❌ ไม่กระทบ |

---

## 🚀 ขั้นตอน Deploy ปลอดภัย

### 1. Backup ก่อน (ป้องกันไว้ก่อน)
```bash
cd C:\Projiect6
node scripts/backup-firestore.js
```
จะได้ไฟล์ `backups/backup-YYYY-MM-DD-HHmm.json` — เก็บไว้ใน safe location

### 2. Build + ทดสอบ local
```bash
npm run build         # ถ้า error อย่า deploy
npm run preview       # เปิด http://localhost:4173 ทดสอบ
```

### 3. Commit code (มี history ย้อนได้)
```bash
git add .
git commit -m "deploy YYYY-MM-DD: <สรุปการเปลี่ยนแปลง>"
```

### 4. Deploy
```bash
npx firebase-tools deploy --only hosting
```

### 5. ทดสอบหลัง deploy ทันที
- เปิด https://tbkk-system.web.app
- กด **Ctrl + F5** (force refresh — เคลียร์ cache)
- Login ทดสอบ 2-3 user
- ส่งฟอร์มทดสอบ 1 รายการ

---

## 🔄 ถ้า Deploy แล้วพัง — Rollback

### วิธีที่ 1: Rollback hosting (ย้อนเว็บอย่างเดียว)
```bash
npx firebase-tools hosting:releases:list   # ดู releases
npx firebase-tools hosting:rollback        # ย้อน release ก่อนหน้า
```
⏱️ ใช้เวลา 30 วินาที — ข้อมูลไม่กระทบ

### วิธีที่ 2: ย้อน code + redeploy
```bash
git log --oneline -10                # ดูประวัติ commit
git checkout <commit-hash-ที่ดี>     # ย้อน code
npm run build && npx firebase-tools deploy --only hosting
```

---

## 💾 Backup ข้อมูล Firestore

### Backup (Export → JSON)
```bash
node scripts/backup-firestore.js
```

**ทำเมื่อไหร่?**
- ก่อน deploy ใหญ่
- ทุก 1-2 สัปดาห์
- ก่อน migrate ข้อมูล
- ก่อนให้คนนอกเข้ามาแก้

ไฟล์อยู่ที่ `backups/backup-2026-04-28-1430.json` (รวมทุก collection)

### Collections ที่ backup
- `users` — ข้อมูลผู้ใช้ + รหัสผ่าน hash
- `approval_workflows` — เอกสารทุกใบ
- `employee_logs` — log เข้า-ออก
- `appointments` — นัดหมายผู้เยี่ยมชม
- `equipment_requests` / `equipment_stock` — เบิกอุปกรณ์
- `vehicles` / `drivers` / `vehicle_bookings` — ใช้รถ
- `audit_logs` — ประวัติการกระทำ

### Restore (กู้กลับ)
```bash
# 1) ทดสอบก่อน (ไม่บันทึก)
node scripts/restore-firestore.js backups/backup-2026-04-28-1430.json --dry-run

# 2) Restore เฉพาะ collection
node scripts/restore-firestore.js backups/backup-2026-04-28-1430.json --collections=users,vehicles

# 3) Restore ทั้งหมด (overwrite)
node scripts/restore-firestore.js backups/backup-2026-04-28-1430.json

# 4) Restore แบบ merge (ไม่ทับข้อมูลใหม่)
node scripts/restore-firestore.js backups/backup-2026-04-28-1430.json --merge
```

---

## 🔐 Environment Variables ที่ต้องมี (.env)

ไฟล์ `.env` (ห้าม commit) ต้องมี:
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=tbkk-system.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tbkk-system
VITE_FIREBASE_STORAGE_BUCKET=tbkk-system.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_APP_ID=visitor-soc-001
```

ขอจาก Firebase Console: Project Settings → General → Your apps

---

## 🛠️ Tasks ที่ทำได้

| คำสั่ง | ทำอะไร |
|--------|-------|
| `npm install` | ติดตั้ง dependency (ทำครั้งแรก) |
| `npm run dev` | รัน local development (port 5173) |
| `npm run build` | Build เว็บใส่ folder `dist/` |
| `npm run preview` | ดู preview ของ build |
| `node scripts/backup-firestore.js` | Backup ข้อมูล |
| `node scripts/restore-firestore.js <file>` | Restore ข้อมูล |
| `node scripts/seed-users.js` | สร้างผู้ใช้ตัวอย่าง |
| `node scripts/check-heads.js` | ดูว่ามีหัวหน้าครบทุกแผนกไหม |
| `npx firebase-tools deploy --only hosting` | Deploy เว็บ |
| `npx firebase-tools hosting:rollback` | Rollback ย้อนเว็บ |

---

## 🚨 ปัญหาที่เจอบ่อย + วิธีแก้

### 1. Deploy แล้วเห็นเว็บเก่า
**สาเหตุ:** Browser cache
**แก้:** กด `Ctrl + F5` หรือ `Ctrl + Shift + R`

### 2. Login ไม่ได้ "ไม่พบผู้ใช้"
**สาเหตุ:** ข้อมูลใน Firestore ผิด, หรือ password ลืม
**แก้:**
```bash
node scripts/check-heads.js   # ตรวจรายชื่อ user
# ถ้าต้องการ reset password
node scripts/seed-users.js    # สร้าง/รีเซ็ต user ตัวอย่าง
```

### 3. หน้าจอขาว / Error
**สาเหตุ:** Build error / โค้ดพัง
**แก้:** Rollback hosting
```bash
npx firebase-tools hosting:rollback
```

### 4. ข้อมูล "หาย" ใน Dashboard
**สาเหตุที่เป็นไปได้:**
- (a) `localStorage` cleared (ลายเซ็นที่บันทึกไว้ในเครื่อง)
- (b) Filter ผิด (ดูแผนกอื่น)
- (c) Firebase rules block

**ตรวจ:**
1. เปิด Firebase Console → Firestore Database
2. ดู collection ตรงๆ — ถ้ามีข้อมูลอยู่ = ไม่หาย
   👉 https://console.firebase.google.com/project/tbkk-system/firestore

### 5. Email ไม่ส่ง
**สาเหตุ:** ระบบใช้ `mailto:` (เปิด Outlook ของผู้ใช้) — ไม่ใช่ SMTP
**แก้:** ตั้งค่า SMTP server ใน `server/email-server.js` (ต้องการ credentials จาก IT)

---

## 📋 Checklist Pre-Production

- [ ] เปลี่ยนรหัสผ่าน default (admin1234, sec1234, ...) ใน `scripts/seed-users.js`
- [ ] ตั้งค่า SMTP จริง (ปัจจุบันใช้ mailto:)
- [ ] เปลี่ยน `SPECIAL_EMAILS` ใน `src/constants.js` ให้ตรงกับ email จริง
- [ ] ตั้งค่า Firebase Authentication (ถ้าต้องการ login ด้วย Google)
- [ ] เปิด Firebase App Check (กัน spam)
- [ ] Backup ข้อมูล cron weekly (ตั้ง task scheduler)
- [ ] เปิด Firebase Performance Monitoring
- [ ] ตั้ง Firebase Alert เวลามี error

---

## 🆘 ติดต่อ Developer

| เรื่อง | ผู้รับผิดชอบ |
|--------|------------|
| ระบบเว็บ + Firebase | Developer |
| SMTP server | IT Infrastructure |
| Active Directory / SSO | IT Security |
| Domain (tbkk-system.web.app) | Firebase Console (free) |

---

## 📦 Project Structure

```
C:\Projiect6\
├── src/                      # โค้ด React
│   ├── App.jsx              # หน้าหลัก
│   ├── ApprovePage.jsx      # หน้าเซ็นอนุมัติ (จาก email)
│   ├── VehicleBookingForm.jsx
│   ├── ...
│   └── firebase.js          # config Firebase
├── server/
│   └── email-server.js      # SMTP server (รอเปิดใช้)
├── scripts/                  # Utility scripts
│   ├── backup-firestore.js  # ⭐ Backup
│   ├── restore-firestore.js # ⭐ Restore
│   ├── seed-users.js        # สร้าง user ตัวอย่าง
│   ├── check-heads.js       # ตรวจหัวหน้าครบไหม
│   └── ...
├── backups/                  # 📦 ที่เก็บไฟล์ backup
├── dist/                     # Build output (ห้าม commit)
├── .env                      # Environment variables (ห้าม commit)
├── firebase.json             # Firebase config
├── firestore.rules           # ⭐ Security rules
├── package.json
└── DEPLOY_GUIDE_IT.md        # คู่มือนี้
```

---

## ⚙️ Firestore Security Rules (สำคัญ)

ไฟล์ `firestore.rules` กำหนดว่าใครเข้าถึงข้อมูลได้ — **ห้ามแก้ถ้าไม่เข้าใจ**

ปัจจุบัน: ต้อง authenticated + ห้ามลบเอกสาร

Deploy rules:
```bash
npx firebase-tools deploy --only firestore:rules
```

---

_เอกสารนี้สร้างวันที่: 28 เม.ย. 2569_
_สำหรับ: ทีม IT TBKK ที่จะรับช่วงดูแลระบบ_
