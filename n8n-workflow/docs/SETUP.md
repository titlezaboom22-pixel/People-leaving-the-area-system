# 🛠️ Setup Guide - TBKK SOC n8n Workflow

> คู่มือการติดตั้ง n8n และ import workflows ทีละขั้นตอน

---

## Prerequisites

- **Node.js** 18+ (ถ้าจะรัน n8n แบบ npm)
- **Docker** (แนะนำ — ง่ายกว่า)
- **Firebase project** (TBKK SOC ใช้ `tbkk-system`)
- **Gmail account** หรือ SMTP server
- **LINE Developers account** (สำหรับ Messaging API)

---

## Step 1: ติดตั้ง n8n

### 🐳 Option A: Docker (แนะนำ)

```bash
docker run -d \
  --name n8n \
  --restart unless-stopped \
  -p 5678:5678 \
  -e GENERIC_TIMEZONE="Asia/Bangkok" \
  -e TZ="Asia/Bangkok" \
  -e N8N_SECURE_COOKIE=false \
  -v n8n_data:/home/node/.n8n \
  n8nio/n8n
```

เปิดเบราว์เซอร์ไปที่ → **http://localhost:5678**  
สร้าง account แรก (จะกลายเป็น owner)

### 💻 Option B: npm (Local Dev)

```bash
npm install -g n8n
n8n start
```

### ☁️ Option C: n8n Cloud (เสียเงิน)

ไปที่ https://n8n.io/cloud → สมัคร trial 14 วัน

---

## Step 2: Import Workflows

1. เปิด **n8n** ที่ http://localhost:5678
2. คลิก **Workflows** ที่ sidebar
3. คลิกปุ่ม **⋯ (three dots)** มุมขวาบน → **Import from File**
4. เลือกไฟล์ `workflows/01-new-approval-notification.json`
5. คลิก **Save**
6. ทำซ้ำกับ `workflows/02-approval-response-notification.json`

> ⚠️ ตอน import จะมี warning ว่า credentials ยังไม่ได้ตั้งค่า — เป็นเรื่องปกติ จะตั้งใน Step 3-5

---

## Step 3: ตั้งค่า SMTP Credential (Email)

1. คลิก **Credentials** ที่ sidebar → **Add Credential**
2. เลือก **SMTP**
3. กรอก:

   | Field | Value (Gmail Example) |
   |-------|----------------------|
   | Name | `TBKK SMTP` |
   | User | `your-email@gmail.com` |
   | Password | App Password (ดูวิธีสร้างด้านล่าง) |
   | Host | `smtp.gmail.com` |
   | Port | `465` |
   | SSL/TLS | `true` |

4. คลิก **Save**

### 📌 วิธีสร้าง Gmail App Password

1. ไปที่ https://myaccount.google.com/security
2. เปิด **2-Step Verification** ก่อน
3. ค้นหา **App passwords** → สร้างใหม่ ตั้งชื่อ "n8n"
4. คัดลอกรหัส 16 หลักมาวางใน password ด้านบน

### 🔄 ใส่ Credential เข้า Workflow

1. เปิด workflow `01-new-approval-notification`
2. คลิก node **Send Email to Approver**
3. ใต้ Credential dropdown → เลือก **TBKK SMTP**
4. คลิก **Save**
5. ทำซ้ำกับ node Email ทั้งหมด (Workflow 2 มี Email: Approved + Email: Rejected)

---

## Step 4: ตั้งค่า LINE Messaging API

### 4.1 สร้าง LINE Channel

1. ไปที่ https://developers.line.biz/console/
2. สร้าง **Provider** ใหม่ (ถ้ายังไม่มี)
3. ภายใน Provider → **Create a new channel** → **Messaging API**
4. กรอกข้อมูล channel
5. ในแท็บ **Messaging API** → คัดลอก **Channel access token (long-lived)**

### 4.2 หา LINE Group ID

วิธีที่ง่ายสุด:

1. เพิ่ม LINE Bot ที่สร้างเข้า Group
2. ส่งข้อความใน Group
3. ดู webhook log จาก LINE Developers Console → จะเห็น `groupId` (เริ่มด้วย `C...`)

### 4.3 ใส่ Credential เข้า n8n

1. **Credentials** → **Add Credential** → **Header Auth**
2. กรอก:
   | Field | Value |
   |-------|-------|
   | Name | `LINE Channel Access Token` |
   | Header Name | `Authorization` |
   | Header Value | `Bearer YOUR_CHANNEL_ACCESS_TOKEN` |
3. **Save**

### 4.4 ตั้ง Variable LINE_GROUP_ID

n8n รุ่นใหม่ใช้ **Variables**:

1. **Settings** → **Variables**
2. เพิ่ม:
   - Key: `LINE_GROUP_ID`
   - Value: `C1234567890abcdef...` (Group ID จาก step 4.2)

ถ้า n8n self-host รุ่น Community ไม่มี Variables — ใส่ Group ID ตรงๆ ใน HTTP body แทน `{{ $vars.LINE_GROUP_ID }}`

### 4.5 ใส่ Credential เข้า Workflow

1. เปิด node **LINE Notify Team** (workflow 1)
2. Credential → เลือก **LINE Channel Access Token**
3. ทำซ้ำกับ **LINE Notify Result** (workflow 2)

---

## Step 5: ตั้งค่า Firebase Firestore Credential

### 5.1 สร้าง Service Account

1. ไปที่ https://console.firebase.google.com/project/tbkk-system/settings/serviceaccounts/adminsdk
2. คลิก **Generate new private key** → ดาวน์โหลด JSON

### 5.2 เปิดใช้ Firestore REST API

ไปที่ https://console.cloud.google.com/apis/library/firestore.googleapis.com → **Enable**

### 5.3 ใส่ Credential เข้า n8n

1. **Credentials** → **Add Credential** → **Google Firebase Cloud Firestore OAuth2 API**
2. ทำตาม OAuth2 flow
3. หรือใช้ Service Account JSON: เลือก **Service Account**
4. วาง JSON ที่ดาวน์โหลดมา
5. **Save**

### 5.4 ใส่ Credential เข้า Workflow

1. node **Update Firestore Status** (workflow 1) → เลือก credential ที่สร้าง
2. node **Update Firestore Final** (workflow 2) → เลือก credential ที่สร้าง

---

## Step 6: Activate Workflows

1. เปิด workflow `01-new-approval-notification`
2. มุมขวาบน toggle **Active** ให้เป็นสีเขียว
3. Copy URL จาก Webhook node → จะได้:
   ```
   https://your-n8n-domain/webhook/soc-new-approval
   ```
   (ถ้า local: `http://localhost:5678/webhook/soc-new-approval`)
4. ทำซ้ำกับ workflow 2 → จะได้:
   ```
   https://your-n8n-domain/webhook/soc-approval-response
   ```

---

## Step 7: ทดสอบ

```bash
# Test workflow 1 (new approval)
curl -X POST http://localhost:5678/webhook/soc-new-approval \
  -H "Content-Type: application/json" \
  -d @test/sample-payloads.json
```

ตรวจสอบ:
- ✅ ได้รับ response `{"success": true, ...}`
- ✅ Email ถึงกล่อง inbox ของ approver
- ✅ ข้อความใน LINE Group
- ✅ Firestore document มี `notificationSentAt`
- ✅ ใน n8n → **Executions** เห็น workflow run สีเขียว

```bash
# Test workflow 2 (approval response)
curl -X POST http://localhost:5678/webhook/soc-approval-response \
  -H "Content-Type: application/json" \
  -d '{
    "documentId": "WF-2026-04-25-001",
    "documentType": "vehicle",
    "status": "approved",
    "approverName": "หัวหน้าทดสอบ",
    "requesterEmail": "your-test@email.com",
    "requesterName": "ผู้ขอทดสอบ",
    "comment": "อนุมัติแล้ว"
  }'
```

---

## Step 8: Production Deploy

### Expose ผ่าน internet (สำคัญ — React app ต้องเรียกถึง webhook ได้)

**Option A: ngrok (ทดสอบ/dev)**
```bash
ngrok http 5678
# ได้ URL เช่น https://abc123.ngrok.io
```

**Option B: Cloud (Production)**
- **Render.com** — Free tier รองรับ n8n
- **Railway.app** — $5/month
- **DigitalOcean Droplet** — $4/month
- **Self-host บน server บริษัท** — ฟรี

ตั้ง env var:
```
N8N_HOST=n8n.tbkk.co.th
N8N_PROTOCOL=https
WEBHOOK_URL=https://n8n.tbkk.co.th/
```

---

## ✅ Checklist เสร็จสมบูรณ์

- [ ] n8n รันได้ที่ port 5678
- [ ] Import workflow 1 + 2 สำเร็จ
- [ ] SMTP credential เชื่อมแล้ว (ส่ง email ทดสอบได้)
- [ ] LINE credential + Group ID ตั้งแล้ว (ข้อความเข้า Group)
- [ ] Firebase credential ตั้งแล้ว (อัพเดต doc ได้)
- [ ] Workflow ทั้ง 2 ตัว toggle Active
- [ ] curl test webhook ทั้ง 2 ตัว ได้ 200 OK
- [ ] Webhook URL พร้อมใช้กับ React App (ดู [INTEGRATION.md](INTEGRATION.md))

---

## 🆘 Troubleshooting

| ปัญหา | สาเหตุ | วิธีแก้ |
|------|--------|--------|
| Webhook 404 | workflow ยัง inactive | toggle Active |
| Email ไม่ถึง | App password ผิด / Gmail block | ใช้ Mailtrap.io ทดสอบก่อน |
| LINE 401 | Channel token หมดอายุ | สร้างใหม่ใน LINE Console |
| Firestore 403 | Service Account ไม่มี permission | เพิ่ม role `Cloud Datastore User` |
| `{{ }}` ไม่ replace | `Set` node ตั้งผิด | Reload workflow + check expression |

ดู logs:
```bash
docker logs n8n -f
```
