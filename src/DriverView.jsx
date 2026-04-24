import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, updateDoc, collection, query, where, onSnapshot as onSnap } from 'firebase/firestore';
import { db, firebaseReady, appId } from './firebase';
import { LogOut, CheckCircle2, Clock, Calendar, Car, User, MapPin, X } from 'lucide-react';

const STATUS_CONFIG = {
  available: { label: 'ว่าง', emoji: '🟢', bg: 'bg-emerald-500', text: 'text-emerald-700', border: 'border-emerald-300', light: 'bg-emerald-50' },
  busy: { label: 'ไม่ว่าง', emoji: '🟡', bg: 'bg-amber-500', text: 'text-amber-700', border: 'border-amber-300', light: 'bg-amber-50' },
  on_leave: { label: 'ลา', emoji: '🔴', bg: 'bg-red-500', text: 'text-red-700', border: 'border-red-300', light: 'bg-red-50' },
};

export default function DriverView({ user, onLogout }) {
  const [driver, setDriver] = useState(null);
  const [modal, setModal] = useState(null); // 'busy' | 'on_leave' | null
  const [noteInput, setNoteInput] = useState('');
  const [untilInput, setUntilInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [todayBookings, setTodayBookings] = useState([]);

  const driverId = user?.driverId || user?.staffId;

  // Subscribe driver doc
  useEffect(() => {
    if (!firebaseReady || !driverId) return;
    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'drivers', driverId);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) setDriver({ id: snap.id, ...snap.data() });
    });
    return () => unsub();
  }, [driverId]);

  // Subscribe today's bookings for this driver
  useEffect(() => {
    if (!firebaseReady || !driverId) return;
    const today = new Date().toISOString().split('T')[0];
    const q = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'vehicle_bookings'),
      where('driverId', '==', driverId),
    );
    const unsub = onSnap(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTodayBookings(all.filter((b) => b.date === today && !b.returned));
    });
    return () => unsub();
  }, [driverId]);

  const currentStatus = driver?.status || 'available';
  const cfg = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.available;

  const openModal = (target) => {
    setNoteInput(driver?.statusNote || '');
    setUntilInput(driver?.statusUntil || '');
    setModal(target);
  };

  const saveStatus = async (newStatus, note = '', until = null) => {
    if (!driverId || !firebaseReady) return;
    setSaving(true);
    try {
      const ref = doc(db, 'artifacts', appId, 'public', 'data', 'drivers', driverId);
      await updateDoc(ref, {
        status: newStatus,
        statusNote: note || '',
        statusUntil: until || null,
        statusUpdatedAt: new Date().toISOString(),
        statusUpdatedBy: driverId,
      });
      setModal(null);
    } catch (err) {
      alert('บันทึกไม่สำเร็จ: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSetAvailable = () => saveStatus('available');

  const handleConfirmModal = () => {
    if (!noteInput.trim()) {
      alert(modal === 'busy' ? 'กรุณากรอกว่าไปไหน/ทำอะไร' : 'กรุณากรอกเหตุผลที่ลา');
      return;
    }
    saveStatus(modal, noteInput.trim(), untilInput || null);
  };

  if (!driver) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <p className="text-slate-500">กำลังโหลด...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-8">
      {/* Header */}
      <header className="bg-gradient-to-r from-indigo-600 to-indigo-500 text-white px-5 py-4 flex items-center justify-between shadow-lg">
        <div>
          <p className="text-xs opacity-80">TBK SOC • คนขับ</p>
          <h1 className="text-lg font-black">{driver.nickname || driver.name}</h1>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-2 rounded-xl text-xs font-bold transition"
        >
          <LogOut size={14} /> ออก
        </button>
      </header>

      <div className="max-w-md mx-auto px-4 pt-5 space-y-5">
        {/* Current Status Card */}
        <div className={`${cfg.light} border-2 ${cfg.border} rounded-3xl p-6 shadow-sm`}>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">สถานะตอนนี้</p>
          <div className="flex items-center gap-3">
            <span className="text-4xl">{cfg.emoji}</span>
            <div>
              <p className={`text-2xl font-black ${cfg.text}`}>{cfg.label}</p>
              {driver.statusNote && (
                <p className="text-sm text-slate-600 mt-1 flex items-start gap-1">
                  <MapPin size={14} className="mt-0.5 flex-shrink-0" />
                  <span>{driver.statusNote}</span>
                </p>
              )}
              {driver.statusUntil && (
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                  <Clock size={12} /> ถึง {driver.statusUntil}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">เปลี่ยนสถานะ</p>

          <button
            onClick={handleSetAvailable}
            disabled={saving || currentStatus === 'available'}
            className={`w-full py-4 rounded-2xl text-white font-black text-lg shadow-md transition active:scale-95 flex items-center justify-center gap-2 ${
              currentStatus === 'available'
                ? 'bg-slate-300 cursor-not-allowed'
                : 'bg-emerald-500 hover:bg-emerald-600'
            }`}
          >
            🟢 ว่าง
            {currentStatus === 'available' && <span className="text-xs">(ปัจจุบัน)</span>}
          </button>

          <button
            onClick={() => openModal('busy')}
            disabled={saving}
            className="w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black text-lg shadow-md transition active:scale-95"
          >
            🟡 ไม่ว่าง
          </button>

          <button
            onClick={() => openModal('on_leave')}
            disabled={saving}
            className="w-full py-4 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-black text-lg shadow-md transition active:scale-95"
          >
            🔴 ลา
          </button>
        </div>

        {/* Today's Assigned Jobs */}
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1">
            <Calendar size={12} /> งานวันนี้
          </p>
          {todayBookings.length === 0 ? (
            <p className="text-sm text-slate-400 italic text-center py-4">ยังไม่มีงาน</p>
          ) : (
            <div className="space-y-2">
              {todayBookings.map((b) => (
                <div key={b.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <Car size={14} className="text-indigo-500" />
                    {b.brand} {b.plate}
                  </div>
                  <div className="text-xs text-slate-600 mt-1 space-y-0.5">
                    <p className="flex items-center gap-1"><User size={11} /> {b.requesterName || b.bookedByName || '-'}</p>
                    <p className="flex items-center gap-1"><Clock size={11} /> {b.timeStart} - {b.timeEnd}</p>
                    {b.destination && (
                      <p className="flex items-start gap-1"><MapPin size={11} className="mt-0.5" /> {b.destination}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Driver Info */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 text-xs text-slate-600 space-y-1">
          <p>📞 {driver.phone}</p>
          <p>🆔 {driver.id}</p>
        </div>
      </div>

      {/* Status Modal */}
      {modal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => !saving && setModal(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`${modal === 'busy' ? 'bg-amber-500' : 'bg-red-500'} text-white p-5 flex items-center justify-between`}>
              <div>
                <p className="text-xs opacity-80">เปลี่ยนสถานะเป็น</p>
                <h3 className="text-xl font-black">
                  {modal === 'busy' ? '🟡 ไม่ว่าง' : '🔴 ลา'}
                </h3>
              </div>
              <button onClick={() => setModal(null)} disabled={saving} className="text-white/80 hover:text-white">
                <X size={22} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-700 mb-2">
                  {modal === 'busy' ? 'ไปไหน / ทำอะไร? *' : 'เหตุผล *'}
                </label>
                <input
                  type="text"
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder={modal === 'busy' ? 'เช่น ส่ง Mr.Osawa BKK' : 'เช่น ลาป่วย'}
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none text-base"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-2">
                  {modal === 'busy' ? 'คาดว่าจะกลับ (optional)' : 'กลับมาวันที่ (optional)'}
                </label>
                <input
                  type={modal === 'busy' ? 'time' : 'date'}
                  value={untilInput}
                  onChange={(e) => setUntilInput(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none text-base"
                />
              </div>

              {modal === 'on_leave' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                  💡 คำแนะนำ: ใส่ประเภท เช่น "ลาป่วย" / "ลากิจ" / "ลาพักร้อน"
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-2">
              <button
                onClick={() => setModal(null)}
                disabled={saving}
                className="flex-1 py-3 rounded-xl text-slate-600 font-bold hover:bg-slate-200 transition disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleConfirmModal}
                disabled={saving || !noteInput.trim()}
                className={`flex-[2] py-3 rounded-xl text-white font-black transition disabled:opacity-50 flex items-center justify-center gap-2 ${
                  modal === 'busy' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                <CheckCircle2 size={18} /> {saving ? 'กำลังบันทึก...' : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
