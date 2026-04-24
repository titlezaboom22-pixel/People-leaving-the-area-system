import React, { useState } from 'react';
import {
  HelpCircle, X, Lightbulb, ArrowLeft, Phone, Mail, MessageCircle, AlertCircle,
} from 'lucide-react';

const LOGIN_FAQS = [
  {
    id: 'forgot-pw',
    icon: '🔑',
    question: 'ลืมรหัสผ่าน',
    answer: [
      'ถ้าลืมรหัสผ่าน ให้ติดต่อ **Admin** ของระบบ',
      '',
      'Admin จะ reset รหัสใหม่ให้ทันที:',
      '- ผ่าน Admin Panel → Users',
      '- หรือ command line: reset-password.js',
      '',
      '💡 ถ้าไม่มั่นใจใครเป็น Admin ติดต่อที่ข้อ "ติดต่อทีมงาน" ด้านล่าง',
    ].join('\n'),
  },
  {
    id: 'wrong-pw',
    icon: '❌',
    question: 'รหัสผ่านไม่ถูกต้อง',
    answer: [
      'ถ้าใส่รหัสผิด:',
      '- **1-4 ครั้ง** = ลองใหม่ได้',
      '- **5 ครั้ง** = บัญชีถูกล็อค **15 นาที**',
      '',
      '**แนะนำ:**',
      '1. ตรวจ Caps Lock · Num Lock',
      '2. ตรวจภาษาคีย์บอร์ด (ไทย/อังกฤษ)',
      '3. พิมพ์รหัสในช่องอื่นก่อน แล้ว copy-paste',
      '',
      '**ยังเข้าไม่ได้?** ติดต่อ Admin reset ให้',
    ].join('\n'),
  },
  {
    id: 'locked',
    icon: '🔒',
    question: 'บัญชีถูกล็อค',
    answer: [
      'ถ้าเห็นข้อความ **"บัญชีถูกล็อค กรุณารอ X นาที"**',
      '',
      '**วิธีแก้:**',
      '1. **รอ 15 นาที** → ระบบปลดล็อคเอง',
      '2. **ติดต่อ Admin** → ปลดล็อคทันที',
      '',
      '**ทำไมถูกล็อค?** ป้องกันการ hack จากการเดารหัสเรื่อยๆ',
    ].join('\n'),
  },
  {
    id: 'no-account',
    icon: '👤',
    question: 'ไม่มีบัญชี / รหัสพนักงานไม่ถูก',
    answer: [
      'ถ้าเห็น **"ไม่พบรหัสพนักงานนี้ในระบบ"**:',
      '',
      '1. ตรวจรูปแบบรหัส: `EMP-XXX-01`, `HEAD-XXX`, `DRV001`',
      '2. ตรวจว่ามีตัวขีด `-` ถูกต้อง',
      '3. ตรวจตัวพิมพ์เล็ก/ใหญ่ (ระบบ auto เปลี่ยนเป็นพิมพ์ใหญ่)',
      '',
      '**ยังไม่ได้:** ติดต่อ Admin ขอสร้างบัญชีให้',
    ].join('\n'),
  },
  {
    id: 'system-down',
    icon: '⚠️',
    question: 'ระบบใช้ไม่ได้ · ขึ้น Error',
    answer: [
      'ถ้าระบบ crash หรือ error ไม่คุ้น:',
      '',
      '1. **Refresh หน้า** (F5 หรือปิด-เปิดแอป)',
      '2. **Clear cache** (ถ้าใช้ browser)',
      '3. **ตรวจอินเทอร์เน็ต**',
      '4. **เปลี่ยน browser/device** ลองดู',
      '',
      '**ถ้ายังไม่ได้:** ถ่าย screenshot error แล้วส่งให้ Developer',
    ].join('\n'),
  },
  {
    id: 'guest',
    icon: '🚪',
    question: 'ฉันเป็นผู้มาติดต่อ · ต้องทำยังไง',
    answer: [
      'ถ้าคุณมานัดหมายกับพนักงาน TBKK:',
      '',
      '1. **ไม่ต้อง login** → กดปุ่ม **"ลงทะเบียนผู้มาติดต่อ"** ข้างล่าง',
      '2. กรอกข้อมูล + รหัสอ้างอิงที่ได้จากพนักงาน',
      '3. รับ QR Code → แสดงที่ป้อม รปภ.',
      '',
      '**ไม่มีรหัสอ้างอิง?** ติดต่อพนักงานที่คุณจะพบ',
    ].join('\n'),
  },
];

export default function LoginHelp() {
  const [open, setOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState(null);

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[999] p-3 sm:p-4 rounded-full shadow-2xl bg-slate-700 hover:bg-slate-800 transition-all"
        title="ต้องการความช่วยเหลือ?"
      >
        <HelpCircle className="text-white w-6 h-6" />
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 py-3 flex items-center justify-between text-white flex-shrink-0">
              <div className="flex items-center gap-2">
                {activeFaq ? (
                  <button onClick={() => setActiveFaq(null)} className="text-white/80 hover:text-white">
                    <ArrowLeft size={18} />
                  </button>
                ) : (
                  <HelpCircle size={20} />
                )}
                <span className="font-black text-sm">
                  {activeFaq ? activeFaq.question : '💡 ต้องการความช่วยเหลือ?'}
                </span>
              </div>
              <button onClick={() => { setOpen(false); setActiveFaq(null); }} className="text-white/80 hover:text-white">
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1 p-4">
              {!activeFaq && (
                <>
                  {/* Greeting */}
                  <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border-2 border-indigo-200 rounded-2xl p-3 mb-4">
                    <p className="text-xs font-bold text-indigo-900">สวัสดีครับ 👋</p>
                    <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                      มีปัญหาอะไร? เลือกจากหัวข้อด้านล่าง
                    </p>
                  </div>

                  {/* FAQ list */}
                  <p className="text-[10px] font-black text-slate-500 uppercase mb-2 px-1">
                    🗂️ ปัญหาที่พบบ่อย
                  </p>
                  <div className="space-y-1.5 mb-4">
                    {LOGIN_FAQS.map((faq) => (
                      <button
                        key={faq.id}
                        onClick={() => setActiveFaq(faq)}
                        className="w-full text-left border border-slate-200 rounded-xl p-3 hover:border-indigo-300 hover:bg-indigo-50/40 transition flex items-center gap-3"
                      >
                        <span className="text-2xl">{faq.icon}</span>
                        <span className="text-xs font-bold text-slate-800 flex-1">{faq.question}</span>
                        <span className="text-slate-400">›</span>
                      </button>
                    ))}
                  </div>

                  {/* Contact */}
                  <div className="border-t border-slate-200 pt-4">
                    <p className="text-[10px] font-black text-slate-500 uppercase mb-2 px-1">
                      📞 ติดต่อทีมงาน
                    </p>
                    <div className="space-y-1.5">
                      <a
                        href="mailto:intern_attachai.k@tbkk.co.th"
                        className="flex items-center gap-3 border border-slate-200 rounded-xl p-3 hover:border-blue-300 hover:bg-blue-50/40 transition"
                      >
                        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <Mail size={16} className="text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] font-bold text-slate-500">Email</p>
                          <p className="text-xs font-bold text-slate-800">intern_attachai.k@tbkk.co.th</p>
                        </div>
                      </a>
                      <div className="flex items-center gap-3 border border-slate-200 rounded-xl p-3">
                        <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                          <MessageCircle size={16} className="text-emerald-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] font-bold text-slate-500">Admin</p>
                          <p className="text-xs font-bold text-slate-800">ติดต่อทีม IT / SOC</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Tip */}
                  <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                    <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-900 leading-relaxed">
                      <strong>Tip:</strong> ถ้า login สำเร็จแล้ว จะมีระบบแจ้งปัญหาเต็มรูปแบบ (chat + ticket) ให้ใช้
                    </p>
                  </div>
                </>
              )}

              {/* Answer view */}
              {activeFaq && (
                <>
                  {/* Question header */}
                  <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-xl p-3 mb-3">
                    <div className="flex items-start gap-2">
                      <span className="text-2xl">{activeFaq.icon}</span>
                      <div>
                        <p className="text-sm font-black text-indigo-900 leading-snug">{activeFaq.question}</p>
                      </div>
                    </div>
                  </div>

                  {/* Answer */}
                  <div className="bg-white border border-slate-200 rounded-xl p-3 mb-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Lightbulb size={14} className="text-emerald-600" />
                      <p className="text-[10px] font-black text-emerald-700 uppercase">คำตอบ</p>
                    </div>
                    <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {formatAnswer(activeFaq.answer)}
                    </div>
                  </div>

                  {/* แจ้งปัญหา actions */}
                  <div className="bg-gradient-to-br from-red-50 to-orange-50 border-2 border-red-200 rounded-xl p-3 mb-3">
                    <p className="text-xs font-black text-red-900 mb-2 flex items-center gap-1.5">
                      <AlertCircle size={14} /> ยังแก้ไม่ได้? แจ้งทีมงานเลย
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={`mailto:intern_attachai.k@tbkk.co.th?subject=${encodeURIComponent('[SOC] ' + activeFaq.question)}&body=${encodeURIComponent(`ผมมีปัญหาเรื่อง: ${activeFaq.question}\n\nรายละเอียด:\n(กรุณาเล่าปัญหาของคุณ)\n\nรหัสพนักงาน:\nเบอร์ติดต่อ:\n\n-- ส่งจากหน้า Login TBK SOC`)}`}
                        className="flex flex-col items-center justify-center gap-1 p-3 bg-white border-2 border-red-300 rounded-lg hover:bg-red-50 transition active:scale-95"
                      >
                        <Mail size={18} className="text-red-600" />
                        <span className="text-[11px] font-black text-red-700">ส่ง Email</span>
                        <span className="text-[9px] text-red-500">intern_attachai.k@tbkk.co.th</span>
                      </a>
                      <button
                        onClick={() => {
                          const text = `[SOC] ${activeFaq.question}\nผมมีปัญหา กรุณาช่วยด้วยครับ`;
                          navigator.clipboard?.writeText(`Email: intern_attachai.k@tbkk.co.th\n\n${text}`).catch(() => {});
                          alert('คัดลอกข้อความแล้ว\nวางใน LINE / Teams / อื่นๆ ส่งให้ Admin');
                        }}
                        className="flex flex-col items-center justify-center gap-1 p-3 bg-white border-2 border-red-300 rounded-lg hover:bg-red-50 transition active:scale-95"
                      >
                        <MessageCircle size={18} className="text-emerald-600" />
                        <span className="text-[11px] font-black text-red-700">คัดลอกส่ง LINE</span>
                        <span className="text-[9px] text-red-500">paste ใน LINE</span>
                      </button>
                    </div>
                    <p className="text-[10px] text-red-700 mt-2 text-center">
                      💡 Email แนบข้อความพร้อมแล้ว กด "ส่ง Email" เลย
                    </p>
                  </div>

                  {/* Back button */}
                  <button
                    onClick={() => setActiveFaq(null)}
                    className="w-full py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition border border-slate-200"
                  >
                    ← กลับไปเลือกหัวข้อ
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function formatAnswer(text) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
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
