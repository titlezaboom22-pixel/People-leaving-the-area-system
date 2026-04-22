# 📧 EmailJS Setup Guide — ส่ง email อัตโนมัติ (ไม่ต้องเปิด Outlook)

## ⏱️ ใช้เวลา: 10 นาที
## 💰 ค่าใช้จ่าย: ฟรี (200 ฉบับ/เดือน)
## 🎯 ผลลัพธ์: ปุ่มเขียวใหญ่กดได้ + ส่งอัตโนมัติ ไม่ต้องกด Send เอง

---

## Step 1: สมัคร EmailJS (2 นาที)

1. ไปที่ https://www.emailjs.com
2. คลิก **"Sign Up"** มุมขวาบน
3. สมัครด้วย Gmail (ง่ายสุด)
4. ยืนยัน email

---

## Step 2: เชื่อม Email Service (3 นาที)

1. เข้า Dashboard → **Email Services** (แถบซ้าย)
2. คลิก **"Add New Service"**
3. เลือก **Gmail** (แนะนำ) หรือ Outlook
4. คลิก **Connect Account** → เข้าด้วย email ของคุณ
5. ตั้งชื่อ Service (เช่น "TBKK Approval")
6. คลิก **Create Service**
7. **คัดลอก Service ID** (เช่น `service_abc1234`)

---

## Step 3: สร้าง Email Template (3 นาที)

1. Dashboard → **Email Templates** (แถบซ้าย)
2. คลิก **"Create New Template"**
3. ตั้งชื่อ Template เช่น "SOC Approval"
4. ใส่ **Subject**:
   ```
   {{subject}}
   ```
5. ใส่ **Content** (เลือก tab "Code" เพื่อใส่ HTML):
   ```
   {{{html_content}}}
   ```
   > ⚠️ สำคัญ! ต้องใช้ **3 ปีกกา** `{{{...}}}` (ไม่ใช่ 2) เพื่อให้ render HTML

6. **Settings** → **To Email**: `{{to_email}}`
7. **Settings** → **From Name**: `{{from_name}}`
8. คลิก **Save**
9. **คัดลอก Template ID** (เช่น `template_xyz5678`)

---

## Step 4: เอา Public Key (1 นาที)

1. Dashboard → **Account** → **General**
2. เลื่อนหา **Public Key**
3. **คัดลอก Public Key** (เช่น `aBc1D2e3F4g5H6i7`)

---

## Step 5: ใส่ Keys ในโปรเจค (1 นาที)

เปิดไฟล์ `C:\Projiect6\.env` แก้ 3 บรรทัดนี้:

```env
VITE_EMAILJS_SERVICE_ID=service_abc1234
VITE_EMAILJS_TEMPLATE_ID=template_xyz5678
VITE_EMAILJS_PUBLIC_KEY=aBc1D2e3F4g5H6i7
```

---

## Step 6: Build + Deploy

```bash
cd C:\Projiect6
npm run build
npx firebase-tools deploy
```

---

## 🎉 เสร็จแล้ว! ทดสอบ

1. Login เป็นพนักงาน → สั่งน้ำ+ข้าว → กด **ส่ง**
2. **ไม่มี Outlook เปิด** ✅ (ส่งจากหลังบ้านเลย)
3. หัวหน้าเปิด Inbox → เห็นอีเมล HTML สวย ๆ มี**ปุ่มเขียวใหญ่กดได้** ✅
4. กดปุ่ม → เปิดหน้าเว็บ → เซ็น → จบ

---

## 🔄 Fallback

- ถ้ายังไม่ตั้ง 3 keys → **ใช้ mailto เปิด Outlook เหมือนเดิม**
- ถ้า EmailJS quota หมด (เกิน 200/เดือน) → error, แต่ browser console จะ log warning

---

## 📊 Monitoring

- เช็คยอดการส่งได้ที่ Dashboard → **History** ของ EmailJS
- ดูว่าส่งไปถึงใครบ้าง / ล้มเหลวกี่ครั้ง

---

## ❓ ปัญหาที่อาจเจอ

### Email ไม่ถึงปลายทาง → อยู่ใน Spam
- บอกผู้รับเปิด Spam folder ครั้งแรก → "Not Spam"
- หรือใน EmailJS Dashboard ตั้งค่า **Sender Name** ให้เป็น "SOC Systems"

### Template ไม่ render HTML (เห็น tag `<div>` ในเมล)
- กลับไปแก้ Template ใช้ **3 ปีกกา** `{{{html_content}}}` (ไม่ใช่ 2)

### Quota หมด (200/เดือน)
- Upgrade เป็น paid plan (~$15/เดือน = ~500฿) → 10,000 ฉบับ
- หรือย้ายไปใช้ SMTP ของ TBKK (ฟรี แต่ต้องขอ credentials จาก IT)

---

## 💡 ข้อดีของ EmailJS vs mailto

| Feature | mailto (เดิม) | EmailJS (ใหม่) |
|---------|--------------|-----------------|
| ลิงก์กดได้ | ❌ ตัวดำ ก๊อปเอา | ✅ **ปุ่มเขียวใหญ่** |
| ส่งอัตโนมัติ | ❌ ต้องเปิด Outlook กด Send | ✅ **auto-send** |
| ต้องเปิด Outlook | ❌ ใช่ | ✅ **ไม่ต้อง** |
| Email สวย | ❌ plain text | ✅ **HTML + สีสัน** |
| มือถือ | ❌ ต้องมี Outlook app | ✅ **Gmail/any app** |
| ค่าใช้จ่าย | ฟรี | ✅ **ฟรี 200/เดือน** |
