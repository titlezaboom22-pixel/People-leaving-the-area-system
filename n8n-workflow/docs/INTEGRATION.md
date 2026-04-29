# 🔗 Integration Guide - เชื่อม n8n กับ React App

> วิธีเรียก webhook จาก React App ของระบบ TBKK SOC

---

## 1. สร้าง Helper File

สร้างไฟล์ใหม่: `src/n8nNotifier.js`

```javascript
// src/n8nNotifier.js
// Helper สำหรับเรียก n8n webhooks

const N8N_BASE_URL =
  import.meta.env.VITE_N8N_WEBHOOK_BASE ||
  'http://localhost:5678/webhook';

/**
 * เรียกเมื่อมีเอกสารใหม่ส่งเข้าระบบ
 * Workflow 1 จะส่ง Email + LINE ให้หัวหน้า
 */
export async function notifyNewApproval(payload) {
  const url = `${N8N_BASE_URL}/soc-new-approval`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId:     payload.documentId,
        documentType:   payload.documentType,    // vehicle/outing/goods/visitor/drink/food
        requesterName:  payload.requesterName,
        requesterDept:  payload.requesterDept,
        requesterEmail: payload.requesterEmail,
        approverEmail:  payload.approverEmail,
        approveUrl:     payload.approveUrl,      // https://tbkk-system.web.app/approve?id=...
        details:        payload.details,
      }),
    });
    if (!res.ok) throw new Error(`n8n webhook failed: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('[n8n] notifyNewApproval failed:', err);
    // ไม่ throw — ไม่ให้ block การบันทึก Firestore
    return { success: false, error: err.message };
  }
}

/**
 * เรียกเมื่อหัวหน้าอนุมัติ/ปฏิเสธ
 * Workflow 2 จะแจ้งกลับผู้ขอ
 */
export async function notifyApprovalResponse(payload) {
  const url = `${N8N_BASE_URL}/soc-approval-response`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId:     payload.documentId,
        documentType:   payload.documentType,
        status:         payload.status,         // 'approved' | 'rejected'
        approverName:   payload.approverName,
        requesterEmail: payload.requesterEmail,
        requesterName:  payload.requesterName,
        comment:        payload.comment || '-',
      }),
    });
    if (!res.ok) throw new Error(`n8n webhook failed: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('[n8n] notifyApprovalResponse failed:', err);
    return { success: false, error: err.message };
  }
}
```

---

## 2. ตั้งค่า Environment Variable

เพิ่มใน `.env.local`:

```bash
VITE_N8N_WEBHOOK_BASE=https://your-n8n-domain.com/webhook
```

ถ้าทดสอบใน local:

```bash
VITE_N8N_WEBHOOK_BASE=http://localhost:5678/webhook
```

---

## 3. เรียกใช้ในฟอร์มต่างๆ

### ตัวอย่าง: VehicleBookingForm.jsx

```javascript
// src/VehicleBookingForm.jsx
import { addDoc, collection } from 'firebase/firestore';
import { db } from './firebase';
import { notifyNewApproval } from './n8nNotifier';   // ← เพิ่มบรรทัดนี้

const handleSubmit = async (e) => {
  e.preventDefault();
  
  // 1. บันทึก Firestore เหมือนเดิม
  const docRef = await addDoc(
    collection(db, `artifacts/${appId}/public/data/approval_workflows`),
    {
      documentType: 'vehicle',
      requesterName: currentUser.name,
      requesterDept: currentUser.dept,
      details: formData.purpose,
      status: 'pending',
      createdAt: new Date(),
    }
  );

  // 2. ✨ NEW: เรียก n8n webhook ส่งแจ้งเตือน
  await notifyNewApproval({
    documentId: docRef.id,
    documentType: 'vehicle',
    requesterName: currentUser.name,
    requesterDept: currentUser.dept,
    requesterEmail: currentUser.email,
    approverEmail: getApproverEmail(currentUser.dept),  // จาก lookup table
    approveUrl: `https://tbkk-system.web.app/approve?id=${docRef.id}`,
    details: formData.purpose,
  });

  alert('ส่งคำขอเรียบร้อย หัวหน้าได้รับการแจ้งเตือนแล้ว');
};
```

### ตัวอย่าง: ApprovePage.jsx (เมื่อหัวหน้าอนุมัติ)

```javascript
// src/ApprovePage.jsx
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { notifyApprovalResponse } from './n8nNotifier';   // ← เพิ่ม

const handleApprove = async (decision) => {  // decision = 'approved' | 'rejected'
  // 1. Update Firestore เหมือนเดิม
  await updateDoc(
    doc(db, `artifacts/${appId}/public/data/approval_workflows`, documentId),
    {
      status: decision,
      approverSignature: signatureDataUrl,
      decidedAt: new Date(),
    }
  );

  // 2. ✨ NEW: เรียก n8n แจ้งผู้ขอ
  await notifyApprovalResponse({
    documentId: documentId,
    documentType: workflow.documentType,
    status: decision,
    approverName: currentUser.name,
    requesterEmail: workflow.requesterEmail,
    requesterName: workflow.requesterName,
    comment: comment,
  });

  alert(decision === 'approved' ? 'อนุมัติแล้ว' : 'ปฏิเสธแล้ว');
};
```

---

## 4. ทำ Lookup Table หา Approver Email

แนะนำเพิ่มใน `src/constants.js`:

```javascript
// src/constants.js
export const APPROVER_EMAIL_BY_DEPT = {
  EEE:         'sarayut_r@tbkk.co.th',
  SOC:         'soc-head@tbkk.co.th',
  HR:          'hr-head@tbkk.co.th',
  IT:          'it-head@tbkk.co.th',
  Production:  'prod-head@tbkk.co.th',
  Accounting:  'acc-head@tbkk.co.th',
  Sales:       'sales-head@tbkk.co.th',
  Maintenance: 'maint-head@tbkk.co.th',
  Other:       'intern_attachai.k@tbkk.co.th',
  Shop:        'shop@tbkk.co.th',
};

export function getApproverEmail(dept) {
  return APPROVER_EMAIL_BY_DEPT[dept] || APPROVER_EMAIL_BY_DEPT.Other;
}
```

---

## 5. ทดสอบ End-to-End

1. เปิด React app `npm run dev` → http://localhost:5173
2. Login เป็น EMPLOYEE → กรอกฟอร์มขอใช้รถ → submit
3. ดูใน n8n → **Executions** → เห็น workflow run
4. เช็ค Email หัวหน้า → ควรได้รับอีเมลพร้อมปุ่มอนุมัติ
5. คลิกปุ่ม → ไปหน้า ApprovePage → เซ็น + อนุมัติ
6. กลับมาเช็ค Email ผู้ขอ → ได้รับแจ้งผลการอนุมัติ

---

## 6. CORS Setup (ถ้าเจอ error)

ถ้า React app เรียก n8n แล้วเจอ CORS error เพิ่มใน docker-compose:

```yaml
environment:
  - N8N_PUSH_BACKEND=websocket
  - N8N_DISABLE_PRODUCTION_MAIN_PROCESS=false
```

หรือใส่ reverse proxy ของ Nginx:

```nginx
location /webhook/ {
  add_header Access-Control-Allow-Origin "https://tbkk-system.web.app";
  add_header Access-Control-Allow-Methods "POST, OPTIONS";
  add_header Access-Control-Allow-Headers "Content-Type";
  proxy_pass http://localhost:5678;
}
```

---

## 7. Best Practices

✅ **Don't block UI** — ใช้ `await` แต่ catch error ไม่ให้ throw  
✅ **Retry logic** — ถ้า webhook fail ลอง retry 3 ครั้ง (n8n เองมี retry mechanism ภายใน)  
✅ **Idempotency** — ใส่ `documentId` ทุกครั้ง n8n จะ update doc เดิม ไม่ duplicate  
✅ **Log everything** — เก็บ webhook response ลง audit_logs collection  
✅ **Secret management** — อย่า commit `.env.local` ขึ้น git
