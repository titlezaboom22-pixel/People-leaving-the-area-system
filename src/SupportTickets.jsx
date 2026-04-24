import React, { useState, useEffect, useRef } from 'react';
import {
  collection, query, where, orderBy, onSnapshot, addDoc, doc, updateDoc,
  serverTimestamp, getDoc, setDoc,
} from 'firebase/firestore';
import { db, firebaseReady, appId } from './firebase';
import {
  MessageSquare, X, Plus, Send, Bug, Lightbulb, Sparkles, HelpCircle,
  AlertTriangle, Circle, ArrowLeft, Check, Clock, CheckCircle2, Inbox, Bot,
} from 'lucide-react';
import AdminBot from './AdminBot';

const STATUS_META = {
  pending: { label: 'รอแก้ไข', color: 'bg-amber-100 text-amber-800 border-amber-300', dot: '🟡' },
  in_progress: { label: 'กำลังทำ', color: 'bg-blue-100 text-blue-800 border-blue-300', dot: '🔵' },
  resolved: { label: 'แก้แล้ว', color: 'bg-emerald-100 text-emerald-800 border-emerald-300', dot: '✅' },
  closed: { label: 'ปิด', color: 'bg-slate-100 text-slate-600 border-slate-300', dot: '⚪' },
};

const TYPE_META = {
  bug: { label: 'Bug', icon: Bug, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
  improvement: { label: 'ปรับปรุง', icon: Lightbulb, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  feature: { label: 'Feature ใหม่', icon: Sparkles, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
  question: { label: 'สอบถาม', icon: HelpCircle, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
};

const PRIORITY_META = {
  low: { label: 'ปกติ', color: 'bg-emerald-500', text: 'text-emerald-700' },
  medium: { label: 'สำคัญ', color: 'bg-amber-500', text: 'text-amber-700' },
  high: { label: 'ด่วน', color: 'bg-red-500', text: 'text-red-700' },
};

function collRef() {
  return collection(db, 'artifacts', appId, 'public', 'data', 'support_tickets');
}
function msgCollRef(ticketId) {
  return collection(db, 'artifacts', appId, 'public', 'data', 'support_tickets', ticketId, 'messages');
}

export default function SupportTickets({ user, role }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(role === 'ADMIN' ? 'bot' : 'list'); // 'bot' | 'list' | 'new' | 'detail'
  const [tickets, setTickets] = useState([]);
  const [currentTicket, setCurrentTicket] = useState(null);
  const [scope, setScope] = useState('mine'); // 'mine' | 'all' (admin only)

  const isDeveloper = role === 'ADMIN'; // Admin ทำหน้าที่ Developer ตอบ
  const showBot = role === 'ADMIN'; // Bot เฉพาะ Admin

  const canUse = user?.staffId && ['ADMIN', 'HOST', 'EMPLOYEE', 'GA', 'SECURITY', 'DRIVER'].includes(role);

  // Load tickets
  useEffect(() => {
    if (!firebaseReady || !open || !canUse) return;
    let q;
    if (scope === 'all' && isDeveloper) {
      q = query(collRef(), orderBy('createdAt', 'desc'));
    } else {
      q = query(collRef(), where('createdBy', '==', user.staffId));
    }
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Sort by createdAt desc client-side (in case where() disabled orderBy)
      list.sort((a, b) => {
        const aT = a.createdAt?.toMillis?.() || 0;
        const bT = b.createdAt?.toMillis?.() || 0;
        return bT - aT;
      });
      setTickets(list);
    });
    return () => unsub();
  }, [open, canUse, scope, isDeveloper, user?.staffId]);

  const openTicket = (t) => { setCurrentTicket(t); setView('detail'); };
  const backToList = () => { setCurrentTicket(null); setView('list'); };

  if (!canUse) return null;

  const openCount = tickets.filter((t) => t.status === 'pending' || t.status === 'in_progress').length;

  return (
    <>
      {/* Floating Button — อยู่เหนือ RobotNotifier (bottom:24, right:24) */}
      <button
        onClick={() => setOpen(!open)}
        className={`fixed z-[998] p-3 sm:p-4 rounded-full shadow-2xl transition-all ${
          openCount > 0
            ? 'bg-indigo-600 hover:bg-indigo-700 animate-pulse'
            : 'bg-slate-700 hover:bg-slate-800'
        }`}
        style={{ bottom: 110, right: 24 }}
        title="แจ้งปัญหา / ติดต่อ Developer"
      >
        <MessageSquare className="text-white w-6 h-6" />
        {openCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-black px-2 py-0.5 rounded-full shadow-lg">
            {openCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed z-[998] w-[calc(100vw-1.5rem)] sm:w-[420px] max-h-[75vh] bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in slide-in-from-bottom"
          style={{ bottom: 180, right: 12 }}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 py-3 flex items-center justify-between text-white flex-shrink-0">
            <div className="flex items-center gap-2">
              {view === 'detail' ? (
                <button onClick={backToList} className="text-white/80 hover:text-white">
                  <ArrowLeft size={18} />
                </button>
              ) : view === 'bot' ? (
                <Bot size={18} />
              ) : (
                <MessageSquare size={18} />
              )}
              <span className="font-black text-sm">
                {view === 'bot' ? '🤖 Admin Bot' :
                 view === 'new' ? 'แจ้งปัญหาใหม่' :
                 view === 'detail' ? (currentTicket?.title || 'รายละเอียด') :
                 'แจ้งปัญหา · Developer'}
              </span>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white">
              <X size={18} />
            </button>
          </div>

          {/* Tab Bar (only for Admin with bot) */}
          {showBot && (view === 'bot' || view === 'list') && (
            <div className="flex border-b border-slate-200 flex-shrink-0">
              <button
                onClick={() => setView('bot')}
                className={`flex-1 py-2 text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  view === 'bot' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Bot size={13} /> ถามบอท
              </button>
              <button
                onClick={() => setView('list')}
                className={`flex-1 py-2 text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  view === 'list' ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <MessageSquare size={13} /> Tickets
              </button>
            </div>
          )}

          {/* Body */}
          {view === 'bot' && showBot && (
            <AdminBot onRequestDeveloper={() => setView('new')} embedded />
          )}
          {view === 'list' && (
            <TicketList
              tickets={tickets}
              isDeveloper={isDeveloper}
              scope={scope}
              setScope={setScope}
              onOpen={openTicket}
              onNew={() => setView('new')}
            />
          )}
          {view === 'new' && (
            <NewTicketForm
              user={user}
              onSuccess={(t) => { backToList(); setTimeout(() => openTicket(t), 200); }}
              onCancel={backToList}
            />
          )}
          {view === 'detail' && currentTicket && (
            <TicketDetail
              ticket={currentTicket}
              user={user}
              isDeveloper={isDeveloper}
            />
          )}
        </div>
      )}
    </>
  );
}

// ====================================================================
// List View
// ====================================================================
function TicketList({ tickets, isDeveloper, scope, setScope, onOpen, onNew }) {
  return (
    <>
      {/* Toolbar */}
      <div className="p-3 border-b border-slate-200 flex items-center gap-2 flex-shrink-0">
        {isDeveloper && (
          <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs font-bold">
            <button
              onClick={() => setScope('mine')}
              className={`px-3 py-1.5 rounded-md transition ${scope === 'mine' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
            >
              ของฉัน
            </button>
            <button
              onClick={() => setScope('all')}
              className={`px-3 py-1.5 rounded-md transition ${scope === 'all' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
            >
              ทั้งหมด
            </button>
          </div>
        )}
        <div className="flex-1" />
        <button
          onClick={onNew}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition active:scale-95"
        >
          <Plus size={14} /> แจ้งใหม่
        </button>
      </div>

      {/* List */}
      <div className="overflow-y-auto flex-1 p-3 space-y-2 min-h-[200px]">
        {tickets.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <Inbox size={36} className="mx-auto mb-2" />
            <p className="text-sm">ยังไม่มีรายการแจ้ง</p>
            <p className="text-xs mt-1">กด "แจ้งใหม่" เพื่อส่งคำถาม/ปัญหา</p>
          </div>
        ) : (
          tickets.map((t) => {
            const tm = TYPE_META[t.type] || TYPE_META.question;
            const sm = STATUS_META[t.status] || STATUS_META.pending;
            const pm = PRIORITY_META[t.priority] || PRIORITY_META.low;
            const Icon = tm.icon;
            return (
              <button
                key={t.id}
                onClick={() => onOpen(t)}
                className="w-full text-left border border-slate-200 rounded-xl p-3 hover:border-indigo-300 hover:bg-indigo-50/30 transition"
              >
                <div className="flex items-start gap-2">
                  <div className={`flex-shrink-0 w-8 h-8 rounded-lg ${tm.bg} ${tm.border} border flex items-center justify-center`}>
                    <Icon size={14} className={tm.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-sm text-slate-800 line-clamp-1">{t.title}</p>
                      <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${sm.color}`}>
                        {sm.label}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{t.description}</p>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-400">
                      <span className="font-bold">{t.createdByName || t.createdBy}</span>
                      <span>·</span>
                      <span>{formatTimeAgo(t.createdAt)}</span>
                      <span>·</span>
                      <span className={`inline-flex items-center gap-1 font-bold ${pm.text}`}>
                        <Circle size={6} fill="currentColor" /> {pm.label}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </>
  );
}

// ====================================================================
// New Ticket Form
// ====================================================================
function NewTicketForm({ user, onSuccess, onCancel }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('bug');
  const [priority, setPriority] = useState('low');
  const [page, setPage] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!title.trim()) { setErr('กรุณาใส่หัวข้อ'); return; }
    if (!description.trim()) { setErr('กรุณาใส่รายละเอียด'); return; }
    if (!firebaseReady || !db) { setErr('ระบบยังไม่พร้อม'); return; }

    setSaving(true);
    setErr('');
    try {
      const docRef = await addDoc(collRef(), {
        title: title.trim(),
        description: description.trim(),
        type,
        priority,
        page: page.trim(),
        status: 'pending',
        createdBy: user.staffId,
        createdByName: user.name || user.staffId,
        createdByRole: user.roleType || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        messageCount: 0,
      });
      // Add initial system message
      await addDoc(msgCollRef(docRef.id), {
        sender: user.staffId,
        senderName: user.name || user.staffId,
        senderRole: 'user',
        text: description.trim(),
        createdAt: serverTimestamp(),
      });
      onSuccess({ id: docRef.id, title: title.trim(), type, priority, status: 'pending', createdBy: user.staffId, createdByName: user.name || user.staffId });
    } catch (e) {
      setErr(e.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overflow-y-auto flex-1 p-4 space-y-3">
      {/* Title */}
      <div>
        <label className="block text-xs font-black text-slate-600 mb-1">หัวข้อ *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="เช่น: login ไม่ได้"
          className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-none text-sm"
          maxLength={100}
        />
      </div>

      {/* Type */}
      <div>
        <label className="block text-xs font-black text-slate-600 mb-1.5">ประเภท</label>
        <div className="grid grid-cols-2 gap-1.5">
          {Object.entries(TYPE_META).map(([key, m]) => {
            const Icon = m.icon;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setType(key)}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border-2 text-[11px] font-bold transition ${
                  type === key ? `${m.bg} ${m.border} ${m.color}` : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                <Icon size={14} /> {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Priority */}
      <div>
        <label className="block text-xs font-black text-slate-600 mb-1.5">ความสำคัญ</label>
        <div className="flex gap-1.5">
          {Object.entries(PRIORITY_META).map(([key, m]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPriority(key)}
              className={`flex-1 px-2.5 py-2 rounded-lg border-2 text-[11px] font-bold transition ${
                priority === key ? `${m.color} text-white border-transparent` : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Page */}
      <div>
        <label className="block text-xs font-black text-slate-600 mb-1">หน้าที่มีปัญหา (optional)</label>
        <input
          type="text"
          value={page}
          onChange={(e) => setPage(e.target.value)}
          placeholder="เช่น: หน้า login, ฟอร์มขอใช้รถ"
          className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-none text-sm"
          maxLength={100}
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-black text-slate-600 mb-1">รายละเอียด *</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="เล่าปัญหาที่เจอ หรือสิ่งที่อยากได้..."
          rows={5}
          className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-none text-sm resize-none"
          maxLength={2000}
        />
        <p className="text-[10px] text-slate-400 mt-0.5">{description.length}/2000</p>
      </div>

      {err && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-2 rounded-lg">{err}</div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition disabled:opacity-50"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={saving || !title.trim() || !description.trim()}
          className="flex-[2] py-2.5 rounded-xl text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Send size={14} /> {saving ? 'กำลังส่ง...' : 'ส่ง'}
        </button>
      </div>
    </div>
  );
}

// ====================================================================
// Ticket Detail (Chat thread)
// ====================================================================
function TicketDetail({ ticket, user, isDeveloper }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(ticket.status);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!firebaseReady) return;
    const q = query(msgCollRef(ticket.id), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 100);
    });
    return () => unsub();
  }, [ticket.id]);

  // Watch status changes
  useEffect(() => {
    if (!firebaseReady) return;
    const unsub = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'support_tickets', ticket.id), (snap) => {
      if (snap.exists()) setStatus(snap.data().status);
    });
    return () => unsub();
  }, [ticket.id]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await addDoc(msgCollRef(ticket.id), {
        sender: user.staffId,
        senderName: user.name || user.staffId,
        senderRole: isDeveloper ? 'developer' : 'user',
        text: text.trim(),
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'support_tickets', ticket.id), {
        updatedAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
        lastMessageBy: user.staffId,
      });
      setText('');
    } catch (err) {
      alert('ส่งไม่สำเร็จ: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  const changeStatus = async (newStatus) => {
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'support_tickets', ticket.id), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
      // Add system message
      await addDoc(msgCollRef(ticket.id), {
        sender: user.staffId,
        senderName: user.name || user.staffId,
        senderRole: 'system',
        text: `เปลี่ยนสถานะเป็น: ${STATUS_META[newStatus]?.label}`,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      alert('เปลี่ยนสถานะไม่สำเร็จ: ' + err.message);
    }
  };

  const sm = STATUS_META[status] || STATUS_META.pending;
  const tm = TYPE_META[ticket.type] || TYPE_META.question;
  const pm = PRIORITY_META[ticket.priority] || PRIORITY_META.low;
  const TypeIcon = tm.icon;

  return (
    <>
      {/* Info bar */}
      <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 flex-shrink-0">
        <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-bold ${sm.color}`}>
            {sm.label}
          </span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-bold ${tm.bg} ${tm.border} ${tm.color}`}>
            <TypeIcon size={10} /> {tm.label}
          </span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-white ${pm.color}`}>
            {pm.label}
          </span>
        </div>
        {ticket.page && <p className="text-[10px] text-slate-500 mt-1">📍 {ticket.page}</p>}
      </div>

      {/* Developer status actions */}
      {isDeveloper && status !== 'closed' && (
        <div className="px-3 py-2 border-b border-slate-200 bg-indigo-50 flex-shrink-0 flex gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold text-indigo-700 self-center mr-1">Dev:</span>
          {status === 'pending' && (
            <button onClick={() => changeStatus('in_progress')} className="text-[10px] font-bold px-2 py-1 rounded-md bg-blue-500 text-white hover:bg-blue-600">
              🔵 เริ่มทำ
            </button>
          )}
          {status !== 'resolved' && (
            <button onClick={() => changeStatus('resolved')} className="text-[10px] font-bold px-2 py-1 rounded-md bg-emerald-500 text-white hover:bg-emerald-600">
              ✅ แก้แล้ว
            </button>
          )}
          <button onClick={() => changeStatus('closed')} className="text-[10px] font-bold px-2 py-1 rounded-md bg-slate-400 text-white hover:bg-slate-500">
            ⚪ ปิด
          </button>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="overflow-y-auto flex-1 p-3 space-y-2 bg-slate-50 min-h-[200px]">
        {messages.map((m) => {
          const isMine = m.sender === user.staffId;
          const isSystem = m.senderRole === 'system';
          const isDev = m.senderRole === 'developer';
          if (isSystem) {
            return (
              <div key={m.id} className="text-center py-1">
                <span className="text-[10px] text-slate-400 italic bg-white/70 px-2 py-0.5 rounded-full border border-slate-200">
                  {m.text}
                </span>
              </div>
            );
          }
          return (
            <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                isMine
                  ? 'bg-indigo-600 text-white'
                  : isDev
                    ? 'bg-white border-2 border-indigo-200 text-slate-800'
                    : 'bg-white border border-slate-200 text-slate-800'
              }`}>
                {!isMine && (
                  <p className={`text-[10px] font-bold mb-1 ${isDev ? 'text-indigo-600' : 'text-slate-500'}`}>
                    {isDev ? '👨‍💻 ' : '👤 '}{m.senderName || m.sender}
                  </p>
                )}
                <p className="text-xs whitespace-pre-wrap leading-relaxed">{m.text}</p>
                <p className={`text-[9px] mt-1 ${isMine ? 'text-indigo-200' : 'text-slate-400'}`}>
                  {formatTimeAgo(m.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      {status !== 'closed' ? (
        <div className="p-2.5 border-t border-slate-200 flex gap-1.5 flex-shrink-0">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder="พิมพ์ข้อความ... (Enter = ส่ง, Shift+Enter = ขึ้นบรรทัด)"
            rows={1}
            className="flex-1 px-3 py-2 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none text-xs resize-none max-h-24"
          />
          <button
            onClick={send}
            disabled={sending || !text.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl px-3 transition active:scale-95"
          >
            <Send size={16} />
          </button>
        </div>
      ) : (
        <div className="p-3 border-t border-slate-200 bg-slate-50 text-center text-[11px] text-slate-500 font-bold flex-shrink-0">
          🔒 Ticket นี้ถูกปิดแล้ว
        </div>
      )}
    </>
  );
}

// ====================================================================
// Helpers
// ====================================================================
function formatTimeAgo(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'เมื่อกี้';
  if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ชม.ที่แล้ว`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} วันที่แล้ว`;
  return date.toLocaleDateString('th-TH', { day: '2-digit', month: 'short' });
}
