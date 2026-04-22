import React, { useRef, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, firebaseReady, appId } from './firebase';
import { Camera, X, Check, Upload } from 'lucide-react';

/**
 * Modal: บันทึกรถกลับ + ถ่ายรูปเลขไมล์
 *
 * Props:
 *   open            boolean
 *   booking         { id, plate, brand, timeEnd, requesterName, ... }
 *   currentUserId   staffId ของคนกดบันทึก (เก็บใน returnedBy)
 *   onClose         function
 *   onSaved(booking) function — เรียกหลังบันทึกสำเร็จ
 */
export default function ReturnVehicleModal({ open, booking, currentUserId, onClose, onSaved }) {
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [mileage, setMileage] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const fileInputRef = useRef(null);

  if (!open || !booking) return null;

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1200;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        setPhotoDataUrl(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!photoDataUrl) { setErr('กรุณาถ่ายรูปเลขไมล์'); return; }
    if (!mileage.trim() || isNaN(Number(mileage))) { setErr('กรุณากรอกเลขไมล์เป็นตัวเลข'); return; }
    if (!firebaseReady || !db) { setErr('Firebase ไม่พร้อม'); return; }

    setSaving(true);
    setErr('');
    try {
      const ref = doc(db, 'artifacts', appId, 'public', 'data', 'vehicle_bookings', booking.id);
      const returnedAt = new Date().toISOString();
      await updateDoc(ref, {
        returned: true,
        returnedAt,
        returnedBy: currentUserId || '-',
        returnMileage: Number(mileage),
        returnMileagePhoto: photoDataUrl,
      });
      onSaved?.({ ...booking, returned: true, returnedAt, returnMileage: Number(mileage) });
      onClose();
    } catch (e) {
      console.error('save return failed:', e);
      setErr(e.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-emerald-600 to-green-600 text-white p-5 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black">บันทึกรถกลับ</h3>
            <p className="text-xs opacity-90 mt-0.5">{booking.brand || ''} {booking.plate || ''}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1">
            <div>👤 ผู้ขอ: <b>{booking.requesterName || '-'}</b></div>
            <div>⏰ เวลาคืนเดิม: <b>{booking.timeEnd || '-'}</b></div>
            <div>✅ เวลาที่คืนจริง: <b>{new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</b></div>
          </div>

          {/* Photo */}
          <div>
            <label className="block text-xs font-black text-slate-700 mb-2">📷 รูปเลขไมล์ *</label>
            {photoDataUrl ? (
              <div className="relative">
                <img src={photoDataUrl} alt="เลขไมล์" className="w-full rounded-xl border-2 border-emerald-300" />
                <button
                  onClick={() => { setPhotoDataUrl(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 shadow-lg"
                ><X size={14} /></button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl p-6 cursor-pointer hover:bg-slate-50 hover:border-emerald-400 transition">
                <Camera className="text-slate-400" size={28} />
                <span className="text-xs font-bold text-slate-500">กดเพื่อเปิดกล้อง / เลือกไฟล์</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFile}
                />
              </label>
            )}
          </div>

          {/* Mileage number */}
          <div>
            <label className="block text-xs font-black text-slate-700 mb-2">🔢 เลขไมล์ (กม.) *</label>
            <input
              type="number"
              value={mileage}
              onChange={(e) => setMileage(e.target.value)}
              placeholder="เช่น 45230"
              className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:outline-none text-lg font-bold"
            />
            <p className="text-[10px] text-slate-400 mt-1">อ่านเลขจากรูปที่ถ่ายแล้วกรอก</p>
          </div>

          {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{err}</p>}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 px-4 py-3 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-200 transition disabled:opacity-50"
          >ยกเลิก</button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !photoDataUrl || !mileage}
            className="flex-[2] px-4 py-3 rounded-xl text-sm font-black text-white bg-gradient-to-r from-emerald-600 to-green-600 hover:brightness-110 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Check size={18} /> {saving ? 'กำลังบันทึก…' : 'ยืนยันรถกลับ'}
          </button>
        </div>
      </div>
    </div>
  );
}
