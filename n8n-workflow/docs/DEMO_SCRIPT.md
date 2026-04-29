# 🎬 สคริปต์อัด VDO นำเสนอ (5 คะแนน)

> **เวลาแนะนำ: 7-10 นาที** (อย่าเกิน 12 นาทีเด็ดขาด)
> 
> 🎯 **Tip:** ใช้ OBS Studio (ฟรี) หรือ Loom อัด screen + กล้องหน้า

---

## 🎤 โครงสร้าง VDO (4 Sections)

| Section | เวลา | เนื้อหา |
|---------|-----|---------|
| 1. Intro & Problem | 1:30 | แนะนำกลุ่ม + ปัญหาที่จะแก้ |
| 2. Architecture Walkthrough | 2:00 | อธิบาย workflow diagram |
| 3. Live Demo | 4:00 | สาธิตระบบทำงานจริง |
| 4. Outro | 1:00 | สรุป + future work |

---

## 📋 Section 1: Intro & Problem (1:30)

### 🎬 Scene 1.1 - หน้าจอเปิด (15s)
**แสดง:** Slide / หน้าปก พร้อมโลโก้ TBKK + n8n

**สคริปต์:**
> "สวัสดีครับ/ค่ะ พวกเรากลุ่ม [ชื่อกลุ่ม] วันนี้จะมานำเสนอโปรเจคงานกลุ่มวิชา Workflow Automation นั่นคือระบบ **TBKK SOC Auto Approval Notification System** ที่สร้างด้วย **n8n** ครับ/ค่ะ"

### 🎬 Scene 1.2 - แนะนำสมาชิก (15s)
**แสดง:** Slide รายชื่อสมาชิก + บทบาท

**สคริปต์:**
> "สมาชิกในกลุ่มมี [ชื่อ 1] หน้าที่ Workflow Designer, [ชื่อ 2] Frontend Integration, [ชื่อ 3] n8n Configuration, [ชื่อ 4] Firebase API, [ชื่อ 5] Documentation ครับ"

### 🎬 Scene 1.3 - Problem Statement (60s)
**แสดง:** Slide รูปคนเดินไปหาหัวหน้า / รูปคน confused

**สคริปต์:**
> "ที่ TBK Group มีระบบจัดการเอกสารภายในชื่อ **TBKK SOC** ที่พนักงานต้องยื่นเอกสารหลายประเภท เช่น ขอใช้รถ ออกนอกสถานที่ นำของเข้า-ออก หรือนัดหมายผู้มาติดต่อ"
> 
> "แต่ปัญหาคือ — **เมื่อพนักงานยื่นเอกสารแล้ว หัวหน้าไม่รู้ทันที** ต้องเปิดเว็บเช็คเอง บางครั้งเอกสารด่วนรอนาน 2-3 ชั่วโมง"
> 
> "และเมื่อหัวหน้าอนุมัติแล้ว ผู้ขอก็ไม่รู้ผล ต้องโทรถามอีก กลายเป็นคอขวดของกระบวนการทำงาน"
> 
> "พวกเราจึงนำ **n8n** มาแก้ปัญหา โดยทำให้ระบบส่ง **Email + LINE** อัตโนมัติทุกครั้งที่มีเหตุการณ์เกิดขึ้น เปลี่ยนจากรอ 2-3 ชั่วโมงเหลือไม่ถึง **2 วินาที**"

---

## 📋 Section 2: Architecture Walkthrough (2:00)

### 🎬 Scene 2.1 - System Overview Diagram (60s)
**แสดง:** เปิด `README.md` ที่ Mermaid diagram (หรือ export เป็นรูป)

**สคริปต์:**
> "ภาพรวมระบบครับ — เริ่มจากซ้าย พนักงานยื่นเอกสารผ่าน **React App** ที่ deploy บน Firebase Hosting"
> 
> "เมื่อ submit ฟอร์ม ระบบจะทำ 2 สิ่งพร้อมกัน — บันทึกลง **Firestore** และยิง **Webhook** ไปที่ n8n"
> 
> "n8n จะรับ payload เข้ามา แล้วใช้ **Switch node** แตกตามประเภทเอกสาร 6 ประเภท ทำให้แต่ละประเภทมี template อีเมลที่ตรงกับงานของตัวเอง"
> 
> "จากนั้นส่ง **Email** ไปยังหัวหน้า + **LINE Push Message** เข้า Group ทีม **พร้อมกัน** เป็น parallel processing"
> 
> "เมื่อหัวหน้าคลิกลิงก์อนุมัติ → ทำงาน Workflow ที่ 2 → แจ้งกลับผู้ขอ → จบ loop"

### 🎬 Scene 2.2 - Sequence Diagram (60s)
**แสดง:** เปิด `docs/ARCHITECTURE.md` ส่วน sequence diagram

**สคริปต์:**
> "เห็นลำดับการทำงานเป็น sequence ครับ — ทุกการกระทำมี timestamp และ audit trail บน Firestore"
> 
> "จุดเด่นคือ **bi-directional communication** — ทั้งแจ้งหัวหน้าและแจ้งกลับผู้ขอ ผ่าน 2 workflows ที่แยกกัน เพื่อให้ดูแลและ debug ง่าย"

---

## 📋 Section 3: Live Demo (4:00) ⭐

### 🎬 Scene 3.1 - เปิด n8n และโชว์ Workflow (40s)
**แสดง:** เบราว์เซอร์ → http://localhost:5678/workflows

**สคริปต์:**
> "เปิด n8n editor ครับ จะเห็น workflow ทั้ง 2 ตัวที่เราสร้าง"
> 
> "เปิด workflow แรก **'New Approval Notification'** จะเห็น node ทั้งหมด **9 ตัว** ตั้งแต่ Webhook trigger → Set → Switch → Email + LINE → Update Firestore → Response"

### 🎬 Scene 3.2 - อธิบาย Switch Node (30s)
**แสดง:** ดับเบิลคลิกที่ Switch node

**สคริปต์:**
> "หัวใจของ workflow คือ **Switch node** ตัวนี้ ดูเงื่อนไข `documentType` ของ payload แตกออกเป็น 6 ทาง — vehicle, outing, goods, visitor, drink, food — แต่ละทางมี template เฉพาะของตัวเอง"

### 🎬 Scene 3.3 - สาธิตการยื่นเอกสาร (90s)
**แสดง:** เปิด React app → ฟอร์มขอใช้รถ

**สคริปต์:**
> "ตอนนี้สมมติว่าผมเป็นพนักงานแผนก EEE ต้องการขอใช้รถไปประชุม"
> 
> "กรอกฟอร์ม — ปลายทาง: บริษัทคู่ค้า, เวลา: 14:00, จำนวนคน: 3 — กด Submit"
> 
> "**สังเกต** — ภายในไม่ถึงวินาที..."

**[หยุดนิดหนึ่งให้กล้องจับ]**

> "เปิดมาดู n8n → **Executions** → เห็น workflow ทำงานเสร็จเรียบร้อย สถานะเขียวทุก node"
> 
> "เปิดอีเมลหัวหน้า → **อีเมลเข้าแล้ว** พร้อม subject ที่ระบุประเภทเอกสารและชื่อผู้ขออย่างชัดเจน มีปุ่ม 'คลิกเพื่อพิจารณาอนุมัติ' สีเขียวเด่นชัด"
> 
> "เปิด LINE Group → **มีข้อความเข้ามา** บอกประเภทเอกสาร ผู้ขอ และลิงก์อนุมัติพร้อมกันด้วย"

### 🎬 Scene 3.4 - หัวหน้าอนุมัติ (60s)
**แสดง:** คลิกลิงก์ในอีเมล → ApprovePage

**สคริปต์:**
> "คลิกลิงก์ในอีเมล → ระบบพาเข้ามาที่ ApprovePage โดยไม่ต้อง login เพราะเป็น public approve URL"
> 
> "เห็นรายละเอียดเอกสารครบ — ผู้ขอ, ประเภท, รายละเอียด — เซ็นชื่อด้วยลายเซ็นดิจิทัล → กด **อนุมัติ**"
> 
> "**จับไปที่ workflow 2** ใน n8n → Execution ใหม่เด้งขึ้นมา"
> 
> "เช็ค Email ผู้ขอ → **ได้รับอีเมลแจ้งผล 'อนุมัติแล้ว'** สีเขียวพร้อมชื่อหัวหน้าและเวลา"
> 
> "LINE Group ก็มีข้อความสรุปผลเข้ามาเช่นกัน"

### 🎬 Scene 3.5 - โชว์ Firestore Update (40s)
**แสดง:** Firebase Console → Firestore → approval_workflows collection

**สคริปต์:**
> "เปิด Firestore เช็ค → document ของเอกสารนี้มี field ที่ n8n เพิ่มเข้าไปอัตโนมัติ:"
> 
> "- `notificationSentAt` — เวลาที่ส่งแจ้งเตือนรอบแรก"
> "- `notificationChannels` — ['email', 'line']"
> "- `finalStatus` — 'approved'"
> "- `decidedAt` — เวลาที่อนุมัติ"
> "- `resultNotifiedAt` — เวลาที่แจ้งผู้ขอ"
> 
> "**ทุก step มี audit trail** ครับ ไม่ต้องเดาว่าระบบทำอะไรไปแล้วบ้าง"

---

## 📋 Section 4: Outro (1:00)

### 🎬 Scene 4.1 - สรุปจุดเด่น (40s)
**แสดง:** Slide สรุป (icon list)

**สคริปต์:**
> "สรุปจุดเด่นของระบบครับ:"
> 
> "🔌 **Multi-service Integration** — เชื่อม 5 บริการ: Webhook, Firestore, SMTP, LINE API, React App"
> 
> "⚡ **Real-time** — แจ้งเตือนภายใน 2 วินาที จากเดิมรอ 2-3 ชั่วโมง"
> 
> "🔀 **Smart Routing** — Switch node แตก 6 ประเภทเอกสาร แต่ละประเภทมี template เฉพาะ"
> 
> "🔁 **Bi-directional** — แจ้งทั้งขาไป (หัวหน้า) และขากลับ (ผู้ขอ)"
> 
> "📊 **Audit Trail** — บันทึกทุก step บน Firestore"
> 
> "🧩 **Modular** — เพิ่ม Slack/Teams ได้ใน 5 นาทีโดยไม่แก้โค้ดหลัก"

### 🎬 Scene 4.2 - Future Work (15s)
**สคริปต์:**
> "ในอนาคตเราวางแผนต่อยอด — เพิ่ม **AI summary** ด้วย OpenAI สรุปเอกสารยาว, **Auto-escalation** ถ้าหัวหน้าไม่อนุมัติใน 4 ชม., และ **Daily digest** สรุปรายวันส่งให้ผู้บริหาร"

### 🎬 Scene 4.3 - Closing (10s)
**แสดง:** Slide สุดท้าย — GitHub URL + ขอบคุณ

**สคริปต์:**
> "โค้ดทั้งหมด รวมถึงไฟล์ JSON ของ n8n อยู่ใน GitHub repo ลิงก์ที่แสดงบนหน้าจอครับ"
> 
> "ขอบคุณอาจารย์และเพื่อนๆ ที่รับชมครับ"

---

## 🎥 เคล็ดลับการอัด VDO

### ก่อนอัด
- ✅ เปิด **2 หน้าจอ** ถ้ามี — จอ 1 ใช้ดูสคริปต์ จอ 2 ใช้สาธิต
- ✅ ปิด notification ทุกอย่าง (LINE PC, Slack, Email popup)
- ✅ ปรับ resolution เป็น **1080p (1920x1080)**
- ✅ Zoom เบราว์เซอร์ **125-150%** ให้เห็นชัด
- ✅ เตรียมข้อมูลทดสอบไว้พร้อม (อย่ากรอกสด — เสียเวลา)
- ✅ ทดลอง flow 1 รอบเต็มก่อนอัดจริง

### ระหว่างอัด
- 🎙️ ใช้ไมค์ใกล้ปาก — เสียงชัดสำคัญมาก
- 🐭 เลื่อน mouse ช้าๆ — อย่ากระตุก
- ⏯️ ถ้าพลาดให้หยุดและตัดทีหลัง อย่าเริ่มใหม่ทั้งหมด
- 🎯 พูดให้ **เนื้อเสียงนิ่ง** — ฝึก 2-3 รอบก่อน

### หลังอัด
- ✂️ ตัดด้วย **DaVinci Resolve** (ฟรี) หรือ **CapCut**
- 🎵 ใส่เพลงพื้นหลังเบาๆ (ห้ามดังกว่าเสียงพูด)
- 🔤 เพิ่ม **subtitle** ภาษาไทย (ช่วยอาจารย์เข้าใจง่ายตอนรีวิว)
- 📤 Export เป็น **MP4 1080p** → upload OneDrive → ตั้ง share link "Anyone with the link"

---

## ✅ Checklist ก่อนส่ง

- [ ] VDO ความยาว 7-12 นาที
- [ ] เสียงชัด ดูสคริปต์ครบทุก section
- [ ] โชว์ workflow diagram ใน n8n editor ชัดเจน
- [ ] สาธิต live demo ทำงานจริง (ไม่ใช่แค่พูด)
- [ ] Email และ LINE notification ปรากฏชัดในจอ
- [ ] โชว์ Firestore update ของจริง
- [ ] อัพ OneDrive + share link เปิดสาธารณะ
- [ ] ส่งลิงก์ใน LTAS

---

## 🎯 Grading Tips

อาจารย์น่าจะให้คะแนนตาม:

| เกณฑ์ | คะแนน |
|------|------|
| Real-world use case ชัดเจน | ⭐⭐⭐ |
| จำนวน integration ที่ใช้ (5+ services) | ⭐⭐⭐ |
| Live demo ทำงานจริง | ⭐⭐⭐ |
| คำอธิบาย architecture เข้าใจง่าย | ⭐⭐ |
| Production quality (audit log, error handling) | ⭐⭐ |
| ความซับซ้อน workflow (Switch + Merge + Parallel) | ⭐⭐ |

**Total: 5 คะแนนเต็ม** ✨
