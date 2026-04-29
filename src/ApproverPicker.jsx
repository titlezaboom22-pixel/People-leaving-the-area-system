import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, firebaseReady, appId } from './firebase';
import { normalizeDepartment, VEHICLE_MIN_APPROVAL_LEVEL, VEHICLE_MAX_APPROVAL_LEVEL, APPROVAL_LEVEL_LABELS } from './constants';

/**
 * Modal ให้ผู้ส่งฟอร์มเลือกหัวหน้าผู้อนุมัติ + เห็นสถานะอยู่/ไม่อยู่ ก่อนส่ง
 *
 * Props:
 *   open            boolean — แสดง modal ไหม
 *   department      string  — แผนกที่จะหา HEAD (เช่น "EEE (...)")
 *   onPick(user)    function — เมื่อเลือกแล้ว: { id, displayName, email, status, awayUntil }
 *   onClose         function — ปิด modal (ยกเลิก)
 */
export default function ApproverPicker({ open, department, onPick, onClose }) {
  const [approvers, setApprovers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setErr('');
      try {
        if (!firebaseReady || !db) throw new Error('Firestore not ready');
        const target = normalizeDepartment(department);
        const snap = await getDocs(
          query(
            collection(db, 'artifacts', appId, 'public', 'data', 'users'),
            where('roleType', '==', 'HEAD'),
          ),
        );
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((u) => u.active !== false)
          .filter((u) => normalizeDepartment(u.department) === target)
          // กรองเฉพาะคนที่มี approvalLevel <= 8 (Supervisor ขึ้นไป — TBKK level inverted)
          .filter((u) => {
            const lv = Number(u.approvalLevel || 0);
            return lv >= VEHICLE_MIN_APPROVAL_LEVEL && lv <= VEHICLE_MAX_APPROVAL_LEVEL;
          });
        if (!cancelled) setApprovers(list);
      } catch (e) {
        if (!cancelled) setErr(e.message || 'โหลดรายชื่อไม่สำเร็จ');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [open, department]);

  if (!open) return null;

  const statusMeta = (u) => {
    const s = (u.status || 'available').toLowerCase();
    if (s === 'away') {
      const until = u.awayUntil ? ` ถึง ${formatThai(u.awayUntil)}` : '';
      return { dot: '🔴', label: `ไม่อยู่${until}`, color: 'text-red-600 bg-red-50 border-red-200', disabled: false };
    }
    if (s === 'busy') return { dot: '🟡', label: u.statusMessage || 'ไม่ว่าง', color: 'text-amber-700 bg-amber-50 border-amber-200', disabled: false };
    return { dot: '🟢', label: 'อยู่ประจำโต๊ะ', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', disabled: false };
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-5">
          <h3 className="text-lg font-black">เลือกหัวหน้าผู้อนุมัติ</h3>
          <p className="text-xs opacity-90 mt-1">แผนก: {department || '-'}</p>
        </div>

        <div className="p-5 max-h-96 overflow-y-auto">
          {loading && <p className="text-sm text-slate-500 text-center py-6">กำลังโหลด…</p>}
          {err && <p className="text-sm text-red-600 text-center py-6">{err}</p>}
          {!loading && !err && approvers.length === 0 && (
            <div className="text-center py-6">
              <p className="text-sm text-slate-500">ไม่พบหัวหน้าที่มีสิทธิ์อนุมัติของแผนกนี้</p>
              <p className="text-[11px] text-slate-400 mt-1">(ต้องเป็นระดับ Supervisor ขึ้นไป — level ≤ {VEHICLE_MAX_APPROVAL_LEVEL})</p>
            </div>
          )}
          <div className="space-y-2">
            {approvers.map((u) => {
              const m = statusMeta(u);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => onPick(u)}
                  className={`w-full text-left border ${m.color} rounded-2xl px-4 py-3 hover:brightness-95 transition flex items-start gap-3`}
                >
                  <span className="text-xl leading-none">{m.dot}</span>
                  <span className="flex-1 min-w-0">
                    <div className="font-black text-slate-900 truncate">{u.displayName || u.id}</div>
                    <div className="text-[11px] text-slate-600 truncate">{u.email || '— ไม่มี email —'}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] font-bold">{m.label}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-bold">
                        Lv.{u.approvalLevel || '?'} {APPROVAL_LEVEL_LABELS[u.approvalLevel] ? `· ${APPROVAL_LEVEL_LABELS[u.approvalLevel].split(' ')[0]}` : ''}
                      </span>
                    </div>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-200 transition">ยกเลิก</button>
        </div>
      </div>
    </div>
  );
}

function formatThai(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short' });
  } catch { return iso; }
}
