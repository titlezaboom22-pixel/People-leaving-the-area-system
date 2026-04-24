import React, { useState, useMemo } from 'react';
import {
  Bot, Search, ArrowLeft, ArrowRight, Copy, Check, MessageSquare, Sparkles,
  AlertCircle, Lightbulb, FileQuestion,
} from 'lucide-react';

// ====================================================================
// FAQ Knowledge Base
// ====================================================================
const FAQ_DB = [
  {
    id: 'login',
    icon: '🔐',
    label: 'Login & Password',
    color: 'bg-blue-50 border-blue-300 text-blue-700',
    faqs: [
      {
        id: 'forgot-password',
        question: 'ลืมรหัสผ่าน / Reset password',
        keywords: ['ลืม', 'รหัส', 'password', 'reset', 'forgot', 'ลืมรหัส'],
        answer: [
          'รีเซ็ตรหัสผ่านให้พนักงาน:',
          '',
          '**วิธีที่ 1 — ผ่าน Admin Panel (ง่ายสุด)**',
          '1. Login เป็น ADMIN',
          '2. Admin Panel → Tab "Users"',
          '3. ค้นหาด้วยรหัสพนักงาน เช่น EMP-EEE-01',
          '4. กดปุ่มไอคอน 🔑 (Reset Password)',
          '5. ใส่รหัสใหม่ → บันทึก',
          '',
          '**วิธีที่ 2 — Command line (สำหรับคนเทคนิค)**',
          '```',
          'node scripts/reset-password.js EMP-EEE-01 new_password_123',
          '```',
          '',
          '⚠️ รหัสผ่านต้องยาว **6 ตัวอักษรขึ้นไป**',
        ].join('\n'),
      },
      {
        id: 'account-locked',
        question: 'Account ถูกล็อค (ใส่รหัสผิด 5 ครั้ง)',
        keywords: ['ล็อค', 'lock', 'locked', 'ผิด 5', 'ติดล็อค', 'รอ 15'],
        answer: [
          'บัญชีถูกล็อคเมื่อใส่รหัสผิด 5 ครั้ง — จะปลดล็อคเองใน 15 นาที',
          '',
          '**วิธีปลดล็อคทันที:**',
          '1. Admin Panel → Firestore Tools',
          '2. Collection: `login_attempts`',
          '3. ค้นหา document ของ staffId นั้น',
          '4. ลบเอกสารนั้น (หรือแก้ count: 0)',
          '5. พนักงาน login ใหม่ได้ทันที',
          '',
          '**ทางลัด:** รีเซ็ตรหัสผ่าน script จะล้าง lockout ให้ด้วย:',
          '```',
          'node scripts/reset-password.js STAFF_ID new_pass',
          '```',
        ].join('\n'),
      },
      {
        id: 'login-error',
        question: 'Login ไม่ได้ ขึ้น error',
        keywords: ['login', 'error', 'เข้าไม่ได้', 'ไม่พบ', 'not found'],
        answer: [
          'ตรวจตาม error ที่ขึ้น:',
          '',
          '**"ไม่พบรหัสพนักงานนี้ในระบบ"**',
          '→ ยังไม่มี user นี้ใน Firestore',
          '→ Admin Panel → Users → Add User',
          '',
          '**"รหัสผ่านไม่ถูกต้อง"**',
          '→ ใส่รหัสผิด · ลอง reset ดู',
          '',
          '**"รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"**',
          '→ รหัสใน Firestore ยังเป็น 4 ตัว (เช่น 1234)',
          '→ ต้องเปลี่ยนเป็น 6+ ตัว',
          '',
          '**"บัญชีถูกล็อค"**',
          '→ ดูคำถาม "Account ถูกล็อค"',
          '',
          '**"ระบบยังไม่พร้อม"**',
          '→ Firebase config ผิด → ตรวจ .env',
        ].join('\n'),
      },
    ],
  },
  {
    id: 'users',
    icon: '👤',
    label: 'จัดการผู้ใช้ (Users)',
    color: 'bg-purple-50 border-purple-300 text-purple-700',
    faqs: [
      {
        id: 'add-user',
        question: 'เพิ่มพนักงานใหม่',
        keywords: ['เพิ่ม', 'add', 'user', 'ใหม่', 'พนักงาน'],
        answer: [
          '**วิธีเพิ่มพนักงาน (ทีละคน):**',
          '1. Admin Panel → Users → "เพิ่มผู้ใช้ใหม่"',
          '2. กรอก: รหัสพนักงาน · ชื่อ · แผนก · role',
          '3. ตั้งรหัสผ่านเริ่มต้น (6+ ตัว)',
          '4. กดบันทึก',
          '',
          '**Role ที่เลือกได้:**',
          '- EMPLOYEE — พนักงานทั่วไป',
          '- HOST — หัวหน้าแผนก (approve เอกสาร)',
          '- GA — เจ้าหน้าที่ GA',
          '- SECURITY — รปภ.',
          '- ADMIN — ผู้ดูแลระบบ',
          '- DRIVER — คนขับรถ',
          '',
          '**เพิ่มเยอะ (Bulk import):**',
          'รอ Excel จาก HR → แจ้ง Developer ให้ import ให้',
        ].join('\n'),
      },
      {
        id: 'add-head',
        question: 'เพิ่มหัวหน้าแผนก (HEAD)',
        keywords: ['หัวหน้า', 'head', 'approver', 'approve'],
        answer: [
          '**เพิ่มหัวหน้าแผนกให้ approve เอกสารได้:**',
          '1. Admin Panel → Users → Add User',
          '2. รหัส: `HEAD-XXX` (XXX = แผนก เช่น EEE, HR)',
          '3. Role: **HOST**',
          '4. roleType: **HEAD**',
          '5. แผนก: ตามที่จะดูแล',
          '6. Email: อีเมลจริงของหัวหน้า (สำคัญ!)',
          '',
          '**ตรวจว่าเพิ่มสำเร็จ:**',
          '→ ในฟอร์มขอใช้รถ → เลือกหัวหน้า → ต้องเห็นชื่อใหม่',
          '',
          '**ถ้าไม่เห็น:**',
          '- ตรวจ roleType = "HEAD"',
          '- ตรวจ active = true',
          '- ตรวจ department ตรงกับของผู้ขอ',
        ].join('\n'),
      },
      {
        id: 'edit-user',
        question: 'แก้ไขข้อมูลพนักงาน / เปลี่ยน Role',
        keywords: ['แก้', 'edit', 'เปลี่ยน', 'role', 'department'],
        answer: [
          '**Admin Panel → Users → หา user → Edit**',
          '',
          'แก้ได้:',
          '- ชื่อ-สกุล',
          '- แผนก',
          '- Role / roleType',
          '- Email',
          '- Active (เปิด/ปิดการใช้งาน)',
          '',
          '**Disable แทนการลบ (แนะนำ):**',
          '- ถ้าพนักงานลาออก อย่าลบ user เพราะ workflow เก่ายังอ้างถึง',
          '- แค่ set `active: false` → login ไม่ได้ · ข้อมูลเก่ายังอยู่',
        ].join('\n'),
      },
    ],
  },
  {
    id: 'vehicle',
    icon: '🚗',
    label: 'รถ & คนขับ',
    color: 'bg-red-50 border-red-300 text-red-700',
    faqs: [
      {
        id: 'add-vehicle',
        question: 'เพิ่มรถใหม่ในระบบ',
        keywords: ['เพิ่มรถ', 'รถใหม่', 'vehicle', 'ทะเบียน'],
        answer: [
          '**วิธีเพิ่มรถ:**',
          'ตอนนี้ยังไม่มี UI — ต้องใช้ 2 วิธี:',
          '',
          '**วิธี 1 — Firestore Console (ง่ายสุด)**',
          '1. Firebase Console → Firestore',
          '2. `artifacts/visitor-soc-001/public/data/vehicles`',
          '3. กด "Add document"',
          '4. ใส่ข้อมูล: brand, plate, type, seats, status',
          '',
          '**วิธี 2 — Seed Script**',
          '1. แก้ไฟล์ `scripts/seed-vehicles.js`',
          '2. เพิ่มรถใน array',
          '3. รัน: `node scripts/seed-vehicles.js`',
          '',
          '**field ที่ต้องมี:**',
          '- id (เช่น VEH011)',
          '- brand, plate, type, seats',
          '- status: "available" / "maintenance"',
        ].join('\n'),
      },
      {
        id: 'driver-status',
        question: 'คนขับอัปเดตสถานะ (ว่าง/ไม่ว่าง/ลา)',
        keywords: ['คนขับ', 'driver', 'สถานะ', 'ว่าง', 'ลา'],
        answer: [
          '**คนขับ login เองแล้วกดเปลี่ยน:**',
          '1. Login: `DRV001` ถึง `DRV010` / รหัส `TBK@2026`',
          '2. เห็นหน้า DriverView',
          '3. กดปุ่ม: 🟢 ว่าง / 🟡 ไม่ว่าง / 🔴 ลา',
          '4. ถ้า "ไม่ว่าง/ลา" ใส่เหตุผล',
          '5. บันทึก → GA เห็นทันที',
          '',
          '**Admin แทนคนขับได้:**',
          'Admin Panel → Firestore Tools → collection `drivers` → แก้ field `status`, `statusNote`',
        ].join('\n'),
      },
      {
        id: 'vehicle-conflict',
        question: 'รถถูกจองชนกัน / เวลาทับซ้อน',
        keywords: ['ชน', 'ทับ', 'conflict', 'booked', 'จองซ้ำ'],
        answer: [
          '**ระบบเช็คอัตโนมัติแล้ว:**',
          '- ตรวจ booking วันเดียวกัน · ช่วงเวลาทับซ้อน',
          '- ถ้ารถ/คนขับถูกใช้อยู่ → GA เลือกไม่ได้',
          '',
          '**ถ้ายังเจอชน:**',
          '1. ตรวจ `vehicle_bookings` ดูว่ามีรายการซ้ำไหม',
          '2. ลบรายการที่ cancelled ทิ้ง',
          '3. หรือแจ้ง Developer ถ้า bug',
        ].join('\n'),
      },
    ],
  },
  {
    id: 'email',
    icon: '📧',
    label: 'Email & Notification',
    color: 'bg-amber-50 border-amber-300 text-amber-700',
    faqs: [
      {
        id: 'email-not-sent',
        question: 'Email ไม่ถูกส่ง',
        keywords: ['email', 'ส่งไม่', 'ไม่เข้า', 'smtp', 'mail'],
        answer: [
          '**ตรวจตามลำดับ:**',
          '',
          '1. **email-server รันอยู่ไหม?**',
          '   - เปิด terminal → รัน `node server/email-server.js`',
          '   - ต้องเห็น "✅ SMTP พร้อมใช้งาน"',
          '',
          '2. **SMTP Config ถูกต้องไหม?**',
          '   - Admin Panel → SMTP Settings',
          '   - ตรวจ host / port / user / password',
          '',
          '3. **Email ผู้รับถูกต้องไหม?**',
          '   - Admin Panel → Users → เช็ค email ของหัวหน้า',
          '   - ต้องเป็น domain `@tbkk.co.th`',
          '',
          '4. **ดู log ที่ email-server terminal**',
          '   - ถ้า fail จะเห็นสาเหตุ',
        ].join('\n'),
      },
      {
        id: 'push-not-working',
        question: 'Push notification ไม่เด้งบนมือถือ',
        keywords: ['push', 'notification', 'เด้ง', 'แจ้งเตือน', 'fcm'],
        answer: [
          '**iOS:**',
          '- ต้อง iOS 16.4+',
          '- เปิดแอปจาก "ไอคอนหน้าจอ" (PWA) ไม่ใช่ Safari tab',
          '- Settings → Notifications → TBK SOC → Allow',
          '',
          '**Android:**',
          '- ใช้ APK ที่สร้างจาก PWABuilder',
          '- ตอน login แรก → กด "Allow Notification"',
          '',
          '**ตรวจ FCM Token:**',
          '- Firebase Console → Firestore',
          '- `users/{staffId}` → ต้องมี field `fcmTokens` (array)',
          '- ถ้าว่าง → Admin login ใหม่ + allow notification',
        ].join('\n'),
      },
    ],
  },
  {
    id: 'data',
    icon: '💾',
    label: 'ข้อมูล (Firestore)',
    color: 'bg-emerald-50 border-emerald-300 text-emerald-700',
    faqs: [
      {
        id: 'clear-test-data',
        question: 'ล้างข้อมูลทดสอบ',
        keywords: ['ล้าง', 'clear', 'ลบ', 'test', 'reset'],
        answer: [
          '**ล้างข้อมูลทดสอบทั้งหมด:**',
          '```',
          'node scripts/clear-test-data.js',
          '```',
          '',
          '**จะลบ:**',
          '- approval_workflows (เอกสารอนุมัติ)',
          '- appointments (นัดหมาย)',
          '- employee_logs (พนักงานเข้า-ออก)',
          '- equipment_requests',
          '- vehicle_bookings (การจองรถ)',
          '- อื่นๆ',
          '',
          '**จะไม่ลบ (เก็บไว้):**',
          '- ✅ users (ผู้ใช้)',
          '- ✅ vehicles (รถ)',
          '- ✅ drivers (คนขับ)',
          '- ✅ equipment_stock (สต็อก)',
        ].join('\n'),
      },
      {
        id: 'backup',
        question: 'Backup ข้อมูล',
        keywords: ['backup', 'สำรอง', 'export'],
        answer: [
          'Firebase มี **auto backup** ภายในให้ อยู่แล้ว (Point-in-time recovery)',
          '',
          '**Export ด้วยตัวเอง:**',
          '1. Firebase Console → Firestore → Import/Export',
          '2. กด "Export" → เลือก collection',
          '3. ไฟล์ไปที่ Google Cloud Storage',
          '',
          '**แนะนำ export รายสัปดาห์:**',
          '- users, approval_workflows, vehicle_bookings',
          '- เก็บไว้เผื่อกู้คืน',
        ].join('\n'),
      },
    ],
  },
  {
    id: 'workflow',
    icon: '📋',
    label: 'เอกสาร & Workflow',
    color: 'bg-cyan-50 border-cyan-300 text-cyan-700',
    faqs: [
      {
        id: 'workflow-stuck',
        question: 'Workflow ค้าง / ไม่ส่งต่อขั้นถัดไป',
        keywords: ['ค้าง', 'stuck', 'workflow', 'ไม่ส่ง', 'approval'],
        answer: [
          '**ตรวจใน Firestore:**',
          '1. Firebase Console → Firestore',
          '2. `approval_workflows` → หา doc ที่ค้าง',
          '3. ตรวจ field `status`:',
          '   - `pending` = รออนุมัติ (ปกติ)',
          '   - `approved` = ผ่านแล้ว',
          '   - `returned` = ส่งกลับให้แก้',
          '',
          '**ถ้ามี doc ซ้ำ (ขั้นเดียวกันหลายอัน):**',
          'ลบอันเก่าที่ pending ทิ้ง · เหลือแค่อันที่กำลังใช้',
          '',
          '**ถ้าหัวหน้าเซ็นไม่ได้:**',
          '- ตรวจ email ของหัวหน้า',
          '- ให้ link อนุมัติใหม่ (Admin Panel → ดูเอกสาร → copy link)',
        ].join('\n'),
      },
      {
        id: 'signature-not-show',
        question: 'ลายเซ็นไม่ขึ้น / หาย',
        keywords: ['ลายเซ็น', 'signature', 'ไม่ขึ้น', 'หาย'],
        answer: [
          '**ลายเซ็น auto-load จาก localStorage:**',
          '1. หัวหน้าต้องบันทึกลายเซ็นครั้งแรกก่อน',
          '2. ครั้งถัดไปจะ auto-load',
          '',
          '**ถ้าไม่ขึ้น:**',
          '- Clear browser cache ทำให้หาย — ต้องเซ็นใหม่',
          '- ใช้คนละ browser — ไม่ sync กัน (localStorage แยก)',
          '- ใช้ incognito — ไม่เก็บ',
          '',
          '**แนะนำ**: บันทึกลายเซ็นไว้ในเครื่องที่ใช้ประจำ',
        ].join('\n'),
      },
    ],
  },
  {
    id: 'other',
    icon: '❓',
    label: 'อื่นๆ',
    color: 'bg-slate-50 border-slate-300 text-slate-700',
    faqs: [
      {
        id: 'deploy',
        question: 'Deploy ระบบ · Update ใหม่',
        keywords: ['deploy', 'update', 'publish', 'อัปเดต'],
        answer: [
          '**Deploy เว็บขึ้น production:**',
          '```',
          'cd C:\\Projiect6',
          'npm run build',
          'npx firebase-tools deploy',
          '```',
          '',
          '**เห็น:**',
          '"✔ Deploy complete!"',
          '',
          '**Update PWA/APK:**',
          '- PWA อัปเดตอัตโนมัติในครั้งเปิดถัดไป',
          '- APK: ถ้าเป็น TWA จะอัปเดต content แต่ APK shell เหมือนเดิม',
        ].join('\n'),
      },
      {
        id: 'change-password-all',
        question: 'เปลี่ยนรหัสผ่านก่อน go-live',
        keywords: ['รหัส', 'production', 'go-live', 'เปลี่ยนรหัส'],
        answer: [
          '**ก่อนเปิดใช้งานจริง ต้องเปลี่ยน:**',
          '- Test passwords: `1234`, `TBK@2026`, `admin1234`, `ga1234`',
          '- ไปเป็นรหัสจริงของแต่ละคน',
          '',
          '**วิธีเปลี่ยนทั้งหมด:**',
          '1. Admin Panel → Users → รีเซ็ตทีละคน',
          '2. หรือให้พนักงานแต่ละคน reset เอง (ถ้ามีฟีเจอร์ "เปลี่ยนรหัส")',
          '3. หรือใช้ script ทั้งบริษัท → แจ้ง Developer',
        ].join('\n'),
      },
    ],
  },
];

// Flatten all FAQs for searching
const ALL_FAQS = FAQ_DB.flatMap((cat) =>
  cat.faqs.map((f) => ({ ...f, categoryId: cat.id, categoryLabel: cat.label, categoryIcon: cat.icon }))
);

// ====================================================================
// Main Component
// ====================================================================
export default function AdminBot({ onRequestDeveloper, embedded = false }) {
  const [view, setView] = useState('home'); // 'home' | 'category' | 'answer'
  const [activeCategory, setActiveCategory] = useState(null);
  const [activeFaq, setActiveFaq] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return ALL_FAQS
      .map((f) => {
        let score = 0;
        if (f.question.toLowerCase().includes(q)) score += 10;
        f.keywords.forEach((kw) => {
          if (kw.toLowerCase().includes(q) || q.includes(kw.toLowerCase())) score += 5;
        });
        if (f.answer.toLowerCase().includes(q)) score += 1;
        return { ...f, score };
      })
      .filter((f) => f.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [searchQuery]);

  const openCategory = (cat) => { setActiveCategory(cat); setView('category'); };
  const openFaq = (faq) => { setActiveFaq(faq); setView('answer'); };
  const goHome = () => { setView('home'); setActiveCategory(null); setActiveFaq(null); setSearchQuery(''); };

  const copyAnswer = async () => {
    if (!activeFaq) return;
    try {
      await navigator.clipboard.writeText(activeFaq.answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className={`flex flex-col ${embedded ? 'h-full' : 'min-h-[400px]'}`}>
      {/* Header Bar (non-embedded) */}
      {!embedded && (
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3 text-white flex-shrink-0">
          <div className="flex items-center gap-2">
            <Bot size={20} />
            <span className="font-black text-sm">🤖 Admin Bot — ผู้ช่วยแก้ปัญหา</span>
          </div>
        </div>
      )}

      {/* HOME VIEW */}
      {view === 'home' && (
        <div className="overflow-y-auto flex-1 p-3">
          {/* Greeting */}
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-2xl p-3 mb-3">
            <div className="flex items-start gap-2">
              <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
                <Bot size={18} className="text-white" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-indigo-900">สวัสดีครับ 👋</p>
                <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                  ผมช่วยแก้ปัญหาระบบได้ เลือกหมวดหรือพิมพ์คำถามได้เลย
                </p>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="mb-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="พิมพ์คำถาม เช่น ลืมรหัสผ่าน, เพิ่มพนักงาน..."
                className="w-full pl-9 pr-3 py-2.5 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none text-xs"
              />
            </div>
          </div>

          {/* Search results */}
          {searchQuery.trim() && (
            <div className="mb-3">
              <p className="text-[10px] font-black text-slate-500 uppercase mb-1.5 px-1">
                ผลลัพธ์ ({searchResults.length})
              </p>
              {searchResults.length === 0 ? (
                <div className="text-center py-4 bg-slate-50 rounded-xl">
                  <FileQuestion size={28} className="mx-auto text-slate-300 mb-1" />
                  <p className="text-xs text-slate-500">ไม่พบคำตอบ · ลองคำอื่น</p>
                  <button
                    onClick={onRequestDeveloper}
                    className="mt-2 text-[11px] font-bold text-indigo-600 hover:underline"
                  >
                    แจ้ง Developer →
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {searchResults.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => openFaq(f)}
                      className="w-full text-left border border-slate-200 rounded-lg p-2.5 hover:border-indigo-300 hover:bg-indigo-50/40 transition"
                    >
                      <p className="text-[11px] text-slate-400">{f.categoryIcon} {f.categoryLabel}</p>
                      <p className="text-xs font-bold text-slate-800 mt-0.5">{f.question}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Categories */}
          {!searchQuery.trim() && (
            <>
              <p className="text-[10px] font-black text-slate-500 uppercase mb-1.5 px-1">
                🗂️ หมวดปัญหา
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {FAQ_DB.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => openCategory(cat)}
                    className={`border-2 rounded-xl p-2.5 text-left transition hover:scale-[1.02] ${cat.color}`}
                  >
                    <div className="text-lg mb-0.5">{cat.icon}</div>
                    <p className="text-[11px] font-black leading-tight">{cat.label}</p>
                    <p className="text-[9px] opacity-70 mt-0.5">{cat.faqs.length} หัวข้อ</p>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Bottom action */}
          <div className="mt-4 pt-3 border-t border-slate-200">
            <button
              onClick={onRequestDeveloper}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition"
            >
              <MessageSquare size={14} /> ยังแก้ไม่ได้? แจ้ง Developer
            </button>
          </div>
        </div>
      )}

      {/* CATEGORY VIEW */}
      {view === 'category' && activeCategory && (
        <div className="overflow-y-auto flex-1 p-3">
          <button
            onClick={goHome}
            className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700 mb-3"
          >
            <ArrowLeft size={14} /> กลับ
          </button>

          <div className={`border-2 rounded-xl p-3 mb-3 ${activeCategory.color}`}>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{activeCategory.icon}</span>
              <div>
                <p className="font-black text-sm">{activeCategory.label}</p>
                <p className="text-[10px] opacity-70">เลือกหัวข้อด้านล่าง</p>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            {activeCategory.faqs.map((faq, i) => (
              <button
                key={faq.id}
                onClick={() => openFaq(faq)}
                className="w-full text-left border border-slate-200 rounded-lg p-3 hover:border-indigo-300 hover:bg-indigo-50/40 transition flex items-center justify-between gap-2"
              >
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <p className="text-xs font-bold text-slate-800 leading-snug">{faq.question}</p>
                </div>
                <ArrowRight size={14} className="text-slate-400 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ANSWER VIEW */}
      {view === 'answer' && activeFaq && (
        <div className="overflow-y-auto flex-1 p-3">
          <button
            onClick={activeCategory ? () => setView('category') : goHome}
            className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700 mb-3"
          >
            <ArrowLeft size={14} /> กลับ
          </button>

          {/* Question header */}
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-xl p-3 mb-3">
            <div className="flex items-start gap-2">
              <Lightbulb size={18} className="text-indigo-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm font-black text-indigo-900 leading-snug">{activeFaq.question}</p>
            </div>
          </div>

          {/* Answer */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 mb-3">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles size={14} className="text-emerald-600" />
                <p className="text-[10px] font-black text-emerald-700 uppercase">คำตอบ</p>
              </div>
              <button
                onClick={copyAnswer}
                className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md transition ${
                  copied ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {copied ? <Check size={11} /> : <Copy size={11} />}
                {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
              </button>
            </div>
            <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
              {formatAnswer(activeFaq.answer)}
            </div>
          </div>

          {/* Still not working? */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
            <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-black text-amber-900">ยังแก้ไม่ได้?</p>
              <p className="text-[11px] text-amber-700 mt-0.5">แจ้ง Developer ให้เข้ามาดู</p>
              <button
                onClick={onRequestDeveloper}
                className="mt-2 w-full flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-2 rounded-lg transition"
              >
                <MessageSquare size={13} /> แจ้ง Developer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ====================================================================
// Helper: parse markdown-ish text to JSX (bold, code)
// ====================================================================
function formatAnswer(text) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    // Code block
    if (line.startsWith('```')) return null; // handled separately (simplified)
    // Headings with **
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return (
      <div key={i} className={line.trim() === '' ? 'h-2' : ''}>
        {parts.map((p, j) => {
          if (p.startsWith('**') && p.endsWith('**')) {
            return <strong key={j} className="text-slate-900 font-black">{p.slice(2, -2)}</strong>;
          }
          if (p.startsWith('`') && p.endsWith('`')) {
            return <code key={j} className="bg-slate-100 text-indigo-700 px-1.5 py-0.5 rounded text-[11px] font-mono">{p.slice(1, -1)}</code>;
          }
          return <span key={j}>{p}</span>;
        })}
      </div>
    );
  });
}
