# SOC Visitor System

ระบบจัดการผู้เยี่ยมชม SOC (Security Intelligence & Operation Center)

## 🚀 การเริ่มต้นใช้งาน

เซิร์ฟเวอร์กำลังทำงานอยู่ที่: **http://localhost:3000**

## ⚙️ การตั้งค่า Firebase

ก่อนใช้งาน คุณต้องตั้งค่า Firebase Configuration ในไฟล์ `index.html`:

1. เปิดไฟล์ `index.html`
2. แก้ไขส่วน Firebase Configuration (บรรทัดประมาณ 10-17):

```javascript
window.__firebase_config = JSON.stringify({
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id"
});
```

3. แทนที่ค่าต่างๆ ด้วยข้อมูล Firebase Project ของคุณ

## 📋 ฟีเจอร์หลัก

- **Host Portal**: สำหรับพนักงานสร้างนัดหมายแขก
- **Security Gate**: สำหรับเจ้าหน้าที่ รปภ. ตรวจสอบและจัดการผู้เยี่ยมชม
- **Guest Registration**: สำหรับแขกลงทะเบียนด้วยตนเอง

## 🔑 การเข้าสู่ระบบ

- **พนักงาน**: ใส่รหัสพนักงาน (เช่น: EMP001)
- **เจ้าหน้าที่ รปภ.**: ใส่ `SEC001` หรือ `SECURITY`
- **แขก**: คลิกปุ่ม "Guest Registration Pass"

## 📦 คำสั่งที่ใช้

- `npm install` - ติดตั้ง dependencies
- `npm run dev` - รัน development server
- `npm run build` - สร้าง production build

## ⚠️ หมายเหตุ

- ต้องตั้งค่า Firebase Firestore Database ก่อนใช้งาน
- ต้องสร้าง Collection Path: `artifacts/{appId}/public/data/appointments`
- ต้องเปิดใช้งาน Anonymous Authentication ใน Firebase Console
