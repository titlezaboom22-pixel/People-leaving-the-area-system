# 🐳 TBKK SOC Systems — Docker Setup

เปิดระบบบนเครื่องตัวเองด้วย Docker — ใช้ Firestore cloud ต่อ (ฟรี, ไม่ต้องแก้ data)

## ⚡ Quick Start (3 นาที)

### 1. ติดตั้ง Docker Desktop
- Windows: https://www.docker.com/products/docker-desktop
- เปิดโปรแกรม → รอ status เป็น "Engine running"

### 2. Clone โปรเจค + เข้าโฟลเดอร์
```bash
cd C:\Projiect6
```

### 3. สร้างไฟล์ `.env` (ถ้ายังไม่มี)
ไฟล์ `.env` ต้องมีค่า Firebase + SMTP — ตัวอย่าง:
```env
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=tbkk-system.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tbkk-system
VITE_FIREBASE_STORAGE_BUCKET=tbkk-system.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...

# SMTP (Office365)
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=intern_attachai.k@tbkk.co.th
SMTP_PASS=<password ของคุณ>
SMTP_FROM=no-reply@tbkk.co.th

# URLs (สำคัญ! เปลี่ยนเป็น localhost)
VITE_PUBLIC_URL=http://localhost:3000
VITE_EMAIL_API=http://localhost:3001
```

### 4. Build + Run
```bash
docker-compose up -d --build
```

รอ 2-3 นาที (ครั้งแรก) → เปิด:

🌐 **http://localhost:3000**

---

## 🛠 คำสั่งใช้งาน

| งาน | คำสั่ง |
|-----|--------|
| 🚀 เปิดระบบ | `docker-compose up -d` |
| 🛑 หยุดระบบ | `docker-compose down` |
| 🔄 Rebuild | `docker-compose up -d --build` |
| 📋 ดู log | `docker-compose logs -f` |
| 🐚 เข้า container | `docker exec -it tbkk-soc-system sh` |
| 📊 Status | `docker-compose ps` |

---

## 🌐 URL ทั้งหมดที่ใช้ได้

| URL | ใช้ทำอะไร |
|-----|----------|
| http://localhost:3000 | หน้าหลัก (Login + Dashboard) |
| http://localhost:3000/vehicle.html | ฟอร์มขอใช้รถ |
| http://localhost:3000/outing.html | ฟอร์มขอออกนอก |
| http://localhost:3000/goods.html | ฟอร์มนำของเข้า/ออก |
| http://localhost:3000/food.html | ฟอร์มสั่งอาหาร |
| http://localhost:3000/drink.html | ฟอร์มสั่งเครื่องดื่ม |
| http://localhost:3000/employee.html | พนักงานเข้า-ออก |
| http://localhost:3000/api/health | Email server health |

---

## 🎯 ข้อดี-ข้อเสีย

### ✅ ข้อดี
- 🚀 เปิดได้บน PC ใดก็ได้ (Win/Mac/Linux)
- 🔒 ทดสอบ offline ได้ (ใช้กับ network ภายในเท่านั้น)
- 📦 Deploy ง่าย — ส่งไฟล์ Docker image ให้ IT
- 🎯 ไม่ต้อง expose ไปอินเทอร์เน็ต (เป็น intranet)

### ⚠️ ข้อเสีย
- ☁️ ยังต้องมี internet เชื่อม Firestore
- 🌐 URL ที่ส่งให้หัวหน้าใน email ต้องชี้กลับมาเครื่องนี้
  - ถ้าใช้แค่ภายในบริษัท → ใช้ IP ของ server
  - ถ้าใช้นอกบริษัท → ต้องมี public IP / domain

---

## 🏢 ถ้าจะเปิดให้คนทั้งบริษัทใช้

1. รัน Docker บน server บริษัท (Windows/Linux)
2. Set IP static (เช่น 192.168.1.100)
3. แก้ `.env`:
   ```env
   VITE_PUBLIC_URL=http://192.168.1.100:3000
   VITE_EMAIL_API=http://192.168.1.100:3001
   ```
4. Rebuild: `docker-compose up -d --build`
5. แจ้ง user เข้าผ่าน `http://192.168.1.100:3000`

---

## 🆘 ปัญหาที่พบบ่อย

### Build ล้มเหลว: "EACCES: permission denied"
```bash
# Windows: เปิด Docker Desktop ก่อน
# Mac/Linux:
sudo docker-compose up -d --build
```

### Port 3000 ใช้อยู่แล้ว
แก้ `docker-compose.yml`:
```yaml
ports:
  - "3030:3000"  # เปลี่ยนเป็น 3030
```
แล้วเปิด http://localhost:3030

### Firebase connection error
ตรวจ `.env` — ต้องมีค่า `VITE_FIREBASE_*` ครบ + ดูว่า Firestore rules อนุญาต

---

## 🚀 Production Deploy (Server บริษัท)

```bash
# 1. ดึง code มา
git clone <repo>

# 2. ตั้ง .env บน server

# 3. Build + run
docker-compose up -d --build

# 4. ตั้ง systemd / Windows Service ให้ auto-start
```
