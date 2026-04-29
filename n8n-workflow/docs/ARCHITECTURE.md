# 🏗️ Architecture - TBKK SOC Auto Approval System

> รายละเอียดเชิงลึกของสถาปัตยกรรม workflow

---

## 1. ภาพรวมระบบ (System Overview)

```mermaid
flowchart LR
    subgraph FE[Frontend Layer]
        A[👤 พนักงาน] --> B[React App<br/>tbkk-system.web.app]
    end
    
    subgraph N8N[n8n Automation Layer]
        WF1[Workflow 1<br/>New Approval]
        WF2[Workflow 2<br/>Approval Response]
    end
    
    subgraph EXT[External Services]
        E[📧 SMTP Server]
        L[💬 LINE API]
    end
    
    subgraph DB[Data Layer]
        F[(🔥 Firestore)]
    end
    
    B -->|webhook| WF1
    WF1 --> E & L & F
    E -->|email| H[👨‍💼 หัวหน้า]
    L -->|line| H
    H -->|approve| B
    B -->|webhook| WF2
    WF2 --> E & L & F
    E -->|notify| A
    L -->|notify| A
```

---

## 2. Workflow 1: New Approval Notification

**Trigger:** Webhook `POST /webhook/soc-new-approval`

```mermaid
flowchart TD
    Start([📨 Webhook Trigger]) --> Extract[🔧 Extract Payload<br/>Set Node]
    Extract --> Sw{🔀 Switch:<br/>documentType}
    
    Sw -->|vehicle| T1[📋 Tpl: Vehicle<br/>🚗 ใบขอใช้รถ]
    Sw -->|outing| T2[📋 Tpl: Outing<br/>🚶 ออกนอก]
    Sw -->|goods| T3[📋 Tpl: Goods<br/>📦 ของเข้า/ออก]
    Sw -->|visitor| T4[📋 Tpl: Visitor<br/>👤 แขก]
    Sw -->|drink| T5[📋 Tpl: Drink<br/>☕ เครื่องดื่ม]
    Sw -->|food| T6[📋 Tpl: Food<br/>🍱 อาหาร]
    Sw -->|fallback| T7[📋 Tpl: Other]
    
    T1 & T2 & T3 & T4 & T5 & T6 & T7 --> M[🔗 Merge]
    
    M --> P1[📧 Send Email<br/>SMTP Node]
    M --> P2[💬 LINE Push<br/>HTTP Request]
    
    P1 --> U[🔥 Update Firestore<br/>notificationSentAt]
    P2 --> U
    
    U --> R([📤 Webhook Response<br/>200 OK])
    
    style Start fill:#EA4B71,color:#fff
    style R fill:#10b981,color:#fff
    style Sw fill:#f59e0b,color:#fff
    style M fill:#8b5cf6,color:#fff
```

### ขั้นตอนการทำงาน

| # | Node | หน้าที่ | Output |
|---|------|--------|--------|
| 1 | Webhook | รับ HTTP POST จาก React App | raw body |
| 2 | Extract Payload | แตก payload เป็น variables | `documentId`, `requesterName`, ... |
| 3 | Switch | แยกเส้นทางตามประเภทเอกสาร (6 + fallback) | route ที่ตรง |
| 4 | Tpl: * | ตั้ง email subject + emoji + title ตามประเภท | `emailSubject`, `emoji`, `docTitle` |
| 5 | Merge | รวมเส้นทางทั้งหมด (number of inputs = 7) | unified payload |
| 6a | Email Send | ส่งอีเมล HTML ไปยังหัวหน้า | message ID |
| 6b | LINE Push | ส่งข้อความเข้า LINE Group ผ่าน Messaging API | LINE response |
| 7 | Update Firestore | PATCH `approval_workflows/{id}` | updated doc |
| 8 | Respond | ส่ง 200 + JSON กลับให้ React App | success response |

### Input Schema (Webhook Body)

```json
{
  "documentId": "WF-2026-04-25-001",
  "documentType": "vehicle",
  "requesterName": "อรรถชัย กิตติมโนรักษ์",
  "requesterDept": "EEE",
  "requesterEmail": "intern_attachai.k@tbkk.co.th",
  "approverEmail": "sarayut_r@tbkk.co.th",
  "approveUrl": "https://tbkk-system.web.app/approve?id=WF-2026-04-25-001",
  "details": "ขอใช้รถไปประชุมที่บริษัทคู่ค้า"
}
```

### Output Schema (Webhook Response)

```json
{
  "success": true,
  "documentId": "WF-2026-04-25-001",
  "message": "Notifications sent via Email + LINE",
  "timestamp": "2026-04-25T10:30:00.000Z"
}
```

---

## 3. Workflow 2: Approval Response Notification

**Trigger:** Webhook `POST /webhook/soc-approval-response`

```mermaid
flowchart TD
    Start([📨 Webhook Trigger]) --> Ext[🔧 Extract Response]
    Ext --> Sw{🔀 Switch:<br/>status}
    
    Sw -->|approved| EA[✅ Email: Approved<br/>เขียว]
    Sw -->|rejected| ER[❌ Email: Rejected<br/>แดง]
    
    EA --> LN[💬 LINE Result]
    ER --> LN
    
    LN --> UF[🔥 Update Firestore<br/>finalStatus]
    UF --> Resp([📤 Webhook Response])
    
    style Start fill:#EA4B71,color:#fff
    style EA fill:#10b981,color:#fff
    style ER fill:#ef4444,color:#fff
    style Sw fill:#f59e0b,color:#fff
```

### Input Schema

```json
{
  "documentId": "WF-2026-04-25-001",
  "documentType": "vehicle",
  "status": "approved",
  "approverName": "นายสารยุทธ ระวังวงค์",
  "requesterEmail": "intern_attachai.k@tbkk.co.th",
  "requesterName": "อรรถชัย กิตติมโนรักษ์",
  "comment": "อนุมัติ ใช้ระวังบนถนนด้วย"
}
```

---

## 4. การไหลของข้อมูล (Data Flow)

```mermaid
sequenceDiagram
    participant U as 👤 พนักงาน
    participant R as React App
    participant N as n8n
    participant F as 🔥 Firestore
    participant S as 📧 SMTP
    participant L as 💬 LINE
    participant H as 👨‍💼 หัวหน้า
    
    U->>R: กรอกฟอร์มขอใช้รถ
    R->>F: บันทึก approval_workflows
    R->>N: POST /soc-new-approval
    Note over N: Workflow 1 ทำงาน
    par Parallel notify
        N->>S: Send Email
        S->>H: 📧 อีเมลขออนุมัติ
    and
        N->>L: Push Message
        L->>H: 💬 LINE แจ้งทีม
    end
    N->>F: Update notificationSentAt
    N-->>R: 200 OK
    
    H->>R: คลิกลิงก์ใน Email
    H->>R: เซ็นชื่อ + อนุมัติ
    R->>F: Update finalStatus
    R->>N: POST /soc-approval-response
    Note over N: Workflow 2 ทำงาน
    par Parallel notify
        N->>S: Send Email "อนุมัติแล้ว"
        S->>U: 📧 ผลการพิจารณา
    and
        N->>L: Push Message
        L->>U: 💬 LINE แจ้งผล
    end
    N->>F: Update resultNotifiedAt
    N-->>R: 200 OK
```

---

## 5. Firestore Schema

**Collection:** `artifacts/{appId}/public/data/approval_workflows/{documentId}`

```typescript
{
  // เดิมจาก React App
  documentId: string,
  documentType: "vehicle" | "outing" | "goods" | "visitor" | "drink" | "food",
  requesterName: string,
  requesterDept: string,
  status: "pending" | "approved" | "rejected",
  createdAt: Timestamp,
  
  // ✨ เพิ่มจาก n8n
  notificationSentAt: Timestamp,        // workflow 1 อัพเดต
  notificationChannels: ["email", "line"],
  finalStatus: "approved" | "rejected", // workflow 2 อัพเดต
  decidedAt: Timestamp,
  resultNotifiedAt: Timestamp
}
```

---

## 6. ทำไมเลือก n8n?

| ✅ ข้อดี | คำอธิบาย |
|---------|---------|
| **Open-source** | ใช้ฟรี self-host ได้ ไม่มี vendor lock-in |
| **Visual** | ลาก-วาง node เห็นภาพ workflow ทันที |
| **400+ integrations** | มี node สำเร็จรูปสำหรับ Gmail, LINE, Firebase, Slack ฯลฯ |
| **Custom code** | เขียน JavaScript ใน Code node ได้ถ้าต้องการ |
| **Webhook native** | สร้าง endpoint รับ HTTP ได้เลย ไม่ต้องเขียน server |
| **Error retry** | retry อัตโนมัติเมื่อ node fail |
| **Audit log** | เก็บประวัติทุก execution ดู debug ได้ |

---

## 7. การขยายระบบในอนาคต (Future Extension)

🔮 สามารถเพิ่มได้:

1. **Slack/Teams notification** — เพิ่ม HTTP node อีก 1 ตัวขนานกับ LINE
2. **SMS แจ้งเตือนฉุกเฉิน** — Twilio API
3. **Auto-escalation** — ถ้าหัวหน้าไม่อนุมัติใน 4 ชั่วโมง → แจ้ง CEO
4. **AI summary** — เพิ่ม OpenAI node สรุปเอกสารยาวให้สั้น
5. **Daily digest** — Cron Trigger ส่งสรุปรายงาน 17:00 ทุกวัน
6. **Document OCR** — ถ้าผู้ขออัพโหลดรูปเอกสาร → ใช้ Google Vision อ่านอัตโนมัติ
