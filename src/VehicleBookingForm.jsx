import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Car,
  Clock,
  ChevronRight,
  Calendar,
  FileText,
  Users,
  ShieldCheck,
  ArrowLeft,
  Send,
  MapPin,
  PenTool,
  Eraser,
  Upload,
  Save,
  Check,
  X,
} from 'lucide-react';
import { collection, addDoc, onSnapshot, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db, firebaseReady, appId } from './firebase';
import { createApprovalWorkflowRequest } from './approvalNotifications';
import { wakeupEmailServer } from './notifyEmail';
import { copyHtmlAndOpenOutlook, buildApproveUrl, getHeadEmail } from './emailHelper';
import { VEHICLE_MIN_APPROVAL_LEVEL, VEHICLE_MAX_APPROVAL_LEVEL } from './constants';
import { getUserById } from './authService';
import { printVehicleBooking } from './printDocument';
import ApproverPicker from './ApproverPicker';

// --- Signature Pad (compact) ---
const SignaturePad = ({ canvasId, onSave, savedImage, width = 320, height = 80 }) => {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const onSaveRef = useRef(onSave);
  const lastSavedRef = useRef(null); // track self-saved dataURL (ป้องกัน clear ตัวเอง)
  useEffect(() => { onSaveRef.current = onSave; });

  // Setup event listeners ONCE — ไม่ rerun ตอน parent render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      const x = (e.type.includes('touch') ? e.touches[0].clientX : e.clientX) - r.left;
      const y = (e.type.includes('touch') ? e.touches[0].clientY : e.clientY) - r.top;
      return { x: x * (canvas.width / r.width), y: y * (canvas.height / r.height) };
    };
    const start = (e) => { drawingRef.current = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    const move = (e) => { if (!drawingRef.current) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
    const end = () => {
      if (drawingRef.current) {
        drawingRef.current = false;
        const url = canvas.toDataURL('image/png');
        lastSavedRef.current = url;
        onSaveRef.current?.(url);
      }
    };
    const ts = (e) => { start(e); e.preventDefault(); };
    const tm = (e) => { move(e); e.preventDefault(); };
    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', end);
    canvas.addEventListener('mouseout', end);
    canvas.addEventListener('touchstart', ts, { passive: false });
    canvas.addEventListener('touchmove', tm, { passive: false });
    canvas.addEventListener('touchend', end);
    return () => {
      canvas.removeEventListener('mousedown', start);
      canvas.removeEventListener('mousemove', move);
      canvas.removeEventListener('mouseup', end);
      canvas.removeEventListener('mouseout', end);
      canvas.removeEventListener('touchstart', ts);
      canvas.removeEventListener('touchmove', tm);
      canvas.removeEventListener('touchend', end);
    };
  }, []);

  // Sync canvas กับ savedImage — skip ถ้าเป็น value ที่เราเพิ่ง save เอง
  useEffect(() => {
    if (savedImage === lastSavedRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (savedImage) {
      const img = new Image();
      img.onload = () => {
        const r = Math.min(canvas.width / img.width, canvas.height / img.height);
        ctx.drawImage(img, (canvas.width - img.width * r) / 2, (canvas.height - img.height * r) / 2, img.width * r, img.height * r);
      };
      img.src = savedImage;
    }
  }, [savedImage]);

  const clear = () => {
    const c = canvasRef.current;
    if (c) { c.getContext('2d').clearRect(0, 0, c.width, c.height); lastSavedRef.current = null; onSave(null); }
  };
  const upload = (e) => { const f = e.target.files[0]; if (f) { const r = new FileReader(); r.onload = (ev) => { lastSavedRef.current = null; onSave(ev.target.result); }; r.readAsDataURL(f); } };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1"><PenTool className="w-3 h-3" /> ลายเซ็น / Signature</span>
        <div className="flex gap-1">
          <label className="cursor-pointer text-[10px] border border-indigo-200 px-2 py-0.5 rounded-md bg-white hover:bg-indigo-50 text-indigo-600 font-bold flex items-center gap-1">
            <Upload className="w-3 h-3" /> ไฟล์ / File
            <input type="file" className="hidden" onChange={upload} accept="image/*" />
          </label>
          <button type="button" onClick={clear} className="text-[10px] border border-red-200 px-2 py-0.5 rounded-md bg-white hover:bg-red-50 text-red-500 font-bold flex items-center gap-1">
            <Eraser className="w-3 h-3" /> ล้าง / Clear
          </button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        id={canvasId}
        className="w-full bg-white border-2 border-dashed border-slate-300 rounded-xl cursor-crosshair touch-none"
        width={width}
        height={height}
      />
    </div>
  );
};

// --- Signature Manager: SignaturePad + saved signatures picker + save button ---
const SignatureManager = ({ sigData, onChange }) => {
  const [savedSigs, setSavedSigs] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newName, setNewName] = useState('');
  const [justSaved, setJustSaved] = useState(false);

  // Load saved signatures from localStorage
  useEffect(() => {
    try {
      const list = JSON.parse(localStorage.getItem('saved_signatures') || '[]');
      if (Array.isArray(list)) setSavedSigs(list);
    } catch {}
  }, []);

  const refreshSaved = () => {
    try {
      const list = JSON.parse(localStorage.getItem('saved_signatures') || '[]');
      if (Array.isArray(list)) setSavedSigs(list);
    } catch {}
  };

  const saveSignature = () => {
    if (!sigData) {
      alert('กรุณาวาดลายเซ็นก่อนบันทึก');
      return;
    }
    const name = newName.trim() || `ลายเซ็น ${savedSigs.length + 1}`;
    const newSig = {
      name,
      dataUrl: sigData,
      date: new Date().toLocaleDateString('th-TH'),
    };
    const existing = savedSigs.filter((s) => s.dataUrl !== sigData);
    const newList = [...existing, newSig].slice(-10); // เก็บไม่เกิน 10 อัน
    try {
      localStorage.setItem('saved_signatures', JSON.stringify(newList));
      setSavedSigs(newList);
      setShowSaveDialog(false);
      setNewName('');
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } catch (e) {
      alert('บันทึกไม่สำเร็จ: ' + e.message);
    }
  };

  const selectSignature = (sig) => {
    onChange(sig.dataUrl);
    setShowPicker(false);
  };

  const deleteSignature = (idx) => {
    if (!confirm('ลบลายเซ็นนี้?')) return;
    const newList = savedSigs.filter((_, i) => i !== idx);
    try {
      localStorage.setItem('saved_signatures', JSON.stringify(newList));
      setSavedSigs(newList);
    } catch {}
  };

  return (
    <div className="bg-slate-50 rounded-2xl p-4 max-w-md mx-auto">
      <SignaturePad
        canvasId="sig-user"
        savedImage={sigData}
        onSave={(img) => {
          onChange(img);
          // Auto-save ตัวล่าสุดลง localStorage
          if (img) {
            try {
              const list = JSON.parse(localStorage.getItem('saved_signatures') || '[]');
              const arr = Array.isArray(list) ? list : [];
              const filtered = arr.filter((s) => s.name !== 'ลายเซ็นล่าสุด' || s.dataUrl === img);
              const existing = filtered.find((s) => s.dataUrl === img);
              const newList = existing
                ? filtered
                : [...filtered, { name: 'ลายเซ็นล่าสุด', dataUrl: img, date: new Date().toLocaleDateString('th-TH') }].slice(-10);
              localStorage.setItem('saved_signatures', JSON.stringify(newList));
              setSavedSigs(newList);
            } catch {}
          }
        }}
        width={320}
        height={80}
      />

      {/* Action buttons */}
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => setShowSaveDialog(true)}
          disabled={!sigData}
          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg text-xs font-bold transition active:scale-95"
        >
          <Save className="w-3.5 h-3.5" />
          บันทึกลายเซ็น
        </button>
        <button
          type="button"
          onClick={() => { refreshSaved(); setShowPicker(!showPicker); }}
          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-xs font-bold transition active:scale-95"
        >
          <FileText className="w-3.5 h-3.5" />
          เลือกจากที่บันทึก ({savedSigs.length})
        </button>
      </div>

      {/* Status indicator */}
      {justSaved && (
        <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg py-1.5 font-bold">
          <Check className="w-3.5 h-3.5" /> บันทึกลายเซ็นเรียบร้อย!
        </div>
      )}
      {!justSaved && (
        sigData ? (
          <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg py-1.5">
            ✓ ลายเซ็นพร้อมใช้ · ครั้งหน้าจะขึ้นเองอัตโนมัติ
          </div>
        ) : (
          <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-slate-500 bg-slate-100 border border-slate-200 rounded-lg py-1.5">
            💡 วาดลายเซ็นในกรอบด้านบน หรือเลือกจากที่บันทึกไว้
          </div>
        )
      )}

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowSaveDialog(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-black text-slate-800 flex items-center gap-2">
                <Save className="w-5 h-5 text-emerald-600" /> บันทึกลายเซ็น
              </h3>
              <button onClick={() => setShowSaveDialog(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            {sigData && (
              <div className="mb-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <img src={sigData} alt="preview" className="w-full max-h-24 object-contain" />
              </div>
            )}
            <label className="block text-xs font-bold text-slate-600 mb-1.5">ตั้งชื่อลายเซ็น</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="เช่น ลายเซ็นหลัก / ลายเซ็นบริษัท"
              className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:outline-none text-sm"
              maxLength={50}
              autoFocus
            />
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowSaveDialog(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={saveSignature}
                className="flex-[2] py-2.5 rounded-xl text-sm font-black text-white bg-emerald-500 hover:bg-emerald-600 transition flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" /> บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Saved signatures picker */}
      {showPicker && (
        <div className="mt-3 bg-white border-2 border-indigo-200 rounded-2xl p-3 max-h-72 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-black text-indigo-700">ลายเซ็นที่บันทึกไว้</p>
            <button onClick={() => setShowPicker(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {savedSigs.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4 italic">ยังไม่มีลายเซ็นบันทึกไว้</p>
          ) : (
            <div className="space-y-1.5">
              {savedSigs.map((s, i) => (
                <div key={i} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2 hover:border-indigo-300 transition">
                  <button
                    type="button"
                    onClick={() => selectSignature(s)}
                    className="flex-1 flex items-center gap-2 text-left"
                  >
                    <img src={s.dataUrl} alt={s.name} className="w-16 h-10 bg-white border border-slate-200 rounded object-contain flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 truncate">{s.name}</p>
                      <p className="text-[10px] text-slate-400">{s.date}</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSignature(i)}
                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    title="ลบ"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// --- Main App ---
const VehicleBookingFormApp = () => {
  const [formData, setFormData] = useState({
    // 1. ผู้ขอ
    requesterName: '',
    employeeId: '',
    department: '',
    email: '',
    // 2. ผู้ติดตาม
    passengers: [],
    // 3. วันเวลา
    date: '',
    departureTime: '',
    returnTime: '',
    // 4. เส้นทาง
    routes: [{ origin: '', destination: '' }],
    // 5. วัตถุประสงค์
    purpose: '',
    otherPurposeText: '',
    // 6. การขับรถ
    drivingOption: '6.1',
    easyPass: '',  // '6.1.1' = ต้องการ Easy Pass, '6.1.2' = ไม่ต้องการ
    // ลายเซ็นผู้ขอ
    sigUser: null,
    // ข้อมูลรถ (จาก URL params — optional)
    approvedCarNo: '',
    approvedCarBrand: '',
  });

  const [availableVehicles, setAvailableVehicles] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [sending, setSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [sentToList, setSentToList] = useState([]);  // รายชื่อหัวหน้าที่ระบบส่งให้
  const [previewApprovers, setPreviewApprovers] = useState([]);  // preview ก่อนส่ง
  const [sentInfo, setSentInfo] = useState(null);  // { refId, sentAt, emailStatus }
  const [approveLinkModal, setApproveLinkModal] = useState(null); // { url, headEmail, requesterName }
  const [copiedLink, setCopiedLink] = useState(false);
  const [showApproverPicker, setShowApproverPicker] = useState(false);
  const [lookupStatus, setLookupStatus] = useState('idle'); // 'idle'|'loading'|'found'|'notfound'
  const [passengerLookups, setPassengerLookups] = useState({}); // { idx: 'idle'|'loading'|'found'|'notfound' }
  const passengerTimers = useRef({});

  const lookupPassengerById = async (idx, empId) => {
    const id = (empId || '').trim().toUpperCase();
    if (!id || id.length < 3) {
      setPassengerLookups((p) => ({ ...p, [idx]: 'idle' }));
      return;
    }
    setPassengerLookups((p) => ({ ...p, [idx]: 'loading' }));
    try {
      const user = await getUserById(id);
      if (user) {
        setFormData((p) => {
          const arr = [...p.passengers];
          if (arr[idx]) {
            arr[idx] = {
              ...arr[idx],
              name: user.displayName || arr[idx].name,
              dept: user.department || arr[idx].dept,
              email: user.email || arr[idx].email,
            };
          }
          return { ...p, passengers: arr };
        });
        setPassengerLookups((p) => ({ ...p, [idx]: 'found' }));
      } else {
        setPassengerLookups((p) => ({ ...p, [idx]: 'notfound' }));
      }
    } catch {
      setPassengerLookups((p) => ({ ...p, [idx]: 'notfound' }));
    }
  };

  const handlePassengerEmpIdChange = (idx, value) => {
    // อัปเดตค่าใน input ทันที + debounce lookup 350ms
    setFormData((p) => {
      const arr = [...p.passengers];
      if (arr[idx]) arr[idx] = { ...arr[idx], empId: value };
      return { ...p, passengers: arr };
    });
    if (passengerTimers.current[idx]) clearTimeout(passengerTimers.current[idx]);
    passengerTimers.current[idx] = setTimeout(() => {
      lookupPassengerById(idx, value);
    }, 350);
  };

  // Auto-lookup พนักงานเมื่อพิมพ์รหัส (debounce 350ms)
  useEffect(() => {
    const id = (formData.employeeId || '').trim().toUpperCase();
    if (!id || id.length < 3) {
      setLookupStatus('idle');
      return;
    }
    setLookupStatus('loading');
    const t = setTimeout(async () => {
      try {
        const user = await getUserById(id);
        if (user) {
          setFormData((p) => ({
            ...p,
            requesterName: user.displayName || p.requesterName,
            department: user.department || p.department,
            email: user.email || p.email,
          }));
          setLookupStatus('found');
        } else {
          setLookupStatus('notfound');
        }
      } catch {
        setLookupStatus('notfound');
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.employeeId]);

  // Auto-fetch หัวหน้า Lv.4-5 ของแผนก เพื่อ preview ก่อนส่ง
  useEffect(() => {
    const dept = (formData.department || '').trim();
    if (!dept || !firebaseReady) {
      setPreviewApprovers([]);
      return;
    }
    let cancelled = false;
    // Normalize dept สำหรับเทียบ: EEE / EMPLOYEE EXPERIENCE ENGAGEMENT / EEE (Employee Experience Engagement)
    const normalize = (s) => (s || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const targetNorm = normalize(dept);
    const targetShort = normalize(dept.split('(')[0].trim()); // เอาส่วนหน้า "(...)"
    (async () => {
      try {
        // Query ทุกคนที่ Lv.4 หรือ Lv.5 และ active
        const snap = await getDocs(
          query(
            collection(db, 'artifacts', appId, 'public', 'data', 'users'),
            where('roleType', '==', 'HEAD'),
          )
        );
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((u) => {
            if (u.active === false) return false;
            const lv = Number(u.approvalLevel || 0);
            return lv >= VEHICLE_MIN_APPROVAL_LEVEL && lv <= VEHICLE_MAX_APPROVAL_LEVEL;
          })
          .filter((u) => {
            const ud = normalize(u.department);
            // Match แบบใดก็ได้: ตรงกัน หรือมีคำหลักร่วมกัน
            if (ud === targetNorm) return true;
            if (ud.startsWith(targetShort) || targetNorm.startsWith(ud.split(' ')[0])) return true;
            // EEE matches EMPLOYEEEXPERIENCEENGAGEMENT
            if (targetShort === 'EEE' && ud.startsWith('EMPLOYEEEXPERIENCE')) return true;
            if (ud === 'EEE' && targetNorm.startsWith('EMPLOYEEEXPERIENCE')) return true;
            return false;
          });
        if (!cancelled) setPreviewApprovers(list);
      } catch (e) {
        if (!cancelled) setPreviewApprovers([]);
      }
    })();
    return () => { cancelled = true; };
  }, [formData.department]);

  const [resubmitInfo, setResubmitInfo] = useState(null); // { fromId, oldChainId, oldRejectReason }

  // 📧 ปลุก email server ทันทีที่หน้าโหลด — กัน Render sleep
  useEffect(() => {
    wakeupEmailServer();
  }, []);

  // Read URL params for prefill + auto-load saved signature
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const date = params.get('date');
    const vehicleId = params.get('vehicleId');
    const plate = params.get('plate');
    const brand = params.get('brand');
    const name = params.get('name');
    const staffId = params.get('staffId');
    const dept = params.get('dept');
    const resubmitFrom = params.get('resubmitFrom'); // ID ของ workflow ที่ถูก reject

    // Auto-load ลายเซ็นที่บันทึกไว้ล่าสุดจาก localStorage
    let savedSig = null;
    try {
      const list = JSON.parse(localStorage.getItem('saved_signatures') || '[]');
      if (Array.isArray(list) && list.length > 0) {
        savedSig = list[list.length - 1]?.dataUrl || null;
      }
    } catch {}

    setFormData((prev) => ({
      ...prev,
      ...(name && { requesterName: name }),
      ...(staffId && { employeeId: staffId }),
      ...(dept && { department: dept }),
      ...(date && { date }),
      ...(plate && { approvedCarNo: decodeURIComponent(plate) }),
      ...(brand && { approvedCarBrand: decodeURIComponent(brand) }),
      ...(savedSig && !prev.sigUser && { sigUser: savedSig }),
    }));
    if (vehicleId) setSelectedVehicleId(vehicleId);

    // ถ้ามี resubmitFrom → โหลดข้อมูลจาก workflow เดิมที่ถูก reject แล้ว prefill
    if (resubmitFrom && firebaseReady) {
      (async () => {
        try {
          const collRef = collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows');
          const q = query(collRef, where('id', '==', resubmitFrom));
          const snap = await getDocs(q);
          if (snap.empty) return;
          const old = snap.docs[0].data();
          const p = old.requestPayload || {};
          setResubmitInfo({
            fromId: resubmitFrom,
            oldChainId: old.chainId || null,
            oldRejectReason: old.rejectReason || '',
            oldRejectedBy: old.rejectedBy || '',
            oldRejectedByRole: old.rejectedByRole || '',
          });
          setFormData((prev) => ({
            ...prev,
            requesterName: p.name || old.requesterName || prev.requesterName,
            employeeId: p.requesterId || old.requesterId || prev.employeeId,
            department: p.department || old.requesterDepartment || prev.department,
            date: p.date || prev.date,
            departureTime: p.timeStart || prev.departureTime,
            returnTime: p.timeEnd || prev.returnTime,
            routes: Array.isArray(p.routes) && p.routes.length > 0 ? p.routes : prev.routes,
            purpose: p.purpose && !p.purpose.startsWith('5.5') ? p.purpose : prev.purpose,
            otherPurposeText: p.purpose && p.purpose.startsWith('5.5 อื่นๆ:') ? p.purpose.replace('5.5 อื่นๆ:', '').trim() : prev.otherPurposeText,
            drivingOption: p.drivingOption || prev.drivingOption,
            passengers: Array.isArray(p.passengers) ? p.passengers : prev.passengers,
            sigUser: p.requesterSign || prev.sigUser,
          }));
        } catch (err) {
          console.warn('Load resubmit data failed:', err);
        }
      })();
    }
  }, []);

  // Load vehicles
  useEffect(() => {
    if (!firebaseReady) return;
    try {
      const ref = collection(db, 'artifacts', appId, 'public', 'data', 'vehicles');
      const unsub = onSnapshot(ref, (snap) => {
        setAvailableVehicles(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      });
      return () => unsub();
    } catch (err) {
      console.error('Vehicles load error:', err);
    }
  }, []);

  const updateField = (field, value) => setFormData((p) => ({ ...p, [field]: value }));

  // Passengers
  const addPassenger = () => {
    if (formData.passengers.length >= 10) return;
    setFormData((p) => ({ ...p, passengers: [...p.passengers, { name: '', empId: '', dept: '' }] }));
  };
  const removePassenger = (i) => setFormData((p) => ({ ...p, passengers: p.passengers.filter((_, idx) => idx !== i) }));
  const updatePassenger = (i, field, value) => {
    const u = [...formData.passengers];
    u[i] = { ...u[i], [field]: value };
    setFormData((p) => ({ ...p, passengers: u }));
  };

  // Routes
  const addRoute = () => {
    if (formData.routes.length >= 10) return;
    setFormData((p) => {
      // 🔗 Auto-chain: ต้นทางจุดใหม่ = ปลายทางจุดก่อนหน้า
      const last = p.routes[p.routes.length - 1];
      const newOrigin = last?.destination?.trim() || '';
      return { ...p, routes: [...p.routes, { origin: newOrigin, destination: '' }] };
    });
  };
  // 🏭 เพิ่มจุดสุดท้าย "กลับโรงงาน TBKK" — auto-fill destination
  const addReturnToFactory = () => {
    if (formData.routes.length >= 10) return;
    setFormData((p) => {
      const last = p.routes[p.routes.length - 1];
      const newOrigin = last?.destination?.trim() || '';
      return {
        ...p,
        routes: [...p.routes, { origin: newOrigin, destination: 'TBKK โรงงาน (กลับเข้าบริษัท)' }],
      };
    });
  };
  const removeRoute = (i) => {
    if (formData.routes.length <= 1) return;
    setFormData((p) => ({ ...p, routes: p.routes.filter((_, idx) => idx !== i) }));
  };
  const updateRoute = (i, field, value) => {
    const u = [...formData.routes];
    u[i] = { ...u[i], [field]: value };
    setFormData((p) => ({ ...p, routes: u }));
  };

  const handleBack = () => { if (window.opener) window.close(); else window.location.href = '/'; };
  const handleReset = () => { if (window.confirm('ต้องการล้างข้อมูลทั้งหมดหรือไม่?\nClear all form data?')) window.location.reload(); };

  // Save vehicle booking if vehicle was picked
  const saveVehicleBooking = async () => {
    if (!firebaseReady || !selectedVehicleId || !formData.date) return;
    const vehicle = availableVehicles.find((v) => v.id === selectedVehicleId);
    if (!vehicle) return;
    try {
      const ref = collection(db, 'artifacts', appId, 'public', 'data', 'vehicle_bookings');
      await addDoc(ref, {
        vehicleId: selectedVehicleId,
        plate: vehicle.plate,
        brand: vehicle.brand,
        date: formData.date,
        timeStart: formData.departureTime || '',
        timeEnd: formData.returnTime || '',
        bookedBy: formData.employeeId || '-',
        bookedByName: formData.requesterName || '-',
        department: formData.department || '',
        destination: (formData.routes.find((r) => r.destination) || {}).destination || '',
        status: 'booked',
        createdAt: Timestamp.now(),
      });
    } catch (err) { console.error('Booking save error:', err); }
  };

  const handleSend = (e) => {
    e?.preventDefault();
    if (sending) return;

    // Validation
    if (!formData.requesterName.trim() || !formData.employeeId.trim() || !formData.department.trim()) {
      alert('กรุณากรอกข้อมูลผู้ขอใช้รถให้ครบ\nPlease fill in all requester information');
      return;
    }
    if (!formData.date || !formData.departureTime || !formData.returnTime) {
      alert('กรุณาระบุวันและเวลา\nPlease specify date and time');
      return;
    }
    const validRoutes = formData.routes.filter((r) => (r.origin || '').trim() && (r.destination || '').trim());
    if (validRoutes.length === 0) {
      alert('กรุณาระบุเส้นทางอย่างน้อย 1 รายการ\nPlease specify at least 1 route');
      return;
    }
    if (!formData.purpose) {
      alert('กรุณาเลือกวัตถุประสงค์\nPlease select a purpose');
      return;
    }
    // ตรวจ Easy Pass ถ้าเลือก 6.1 ขับเอง
    if (formData.drivingOption === '6.1' && !formData.easyPass) {
      alert('กรุณาเลือกว่าต้องการ Easy Pass หรือไม่\nPlease select Easy Pass option');
      return;
    }
    // Auto-send ไปทุก Lv.4 + Lv.5 ในแผนกเดียวกัน (ใครเห็นก่อนกดอนุมัติได้)
    // ไม่เปิด ApproverPicker แล้ว
    performSend(null);
  };

  const performSend = async (picked) => {
    setShowApproverPicker(false);
    if (sending) return;
    const validRoutes = formData.routes.filter((r) => (r.origin || '').trim() && (r.destination || '').trim());

    setSending(true);
    try {
      const purposeLabel = formData.purpose === '5.5 อื่นๆ' && formData.otherPurposeText.trim()
        ? `5.5 อื่นๆ: ${formData.otherPurposeText.trim()}`
        : formData.purpose;

      const destinationText = validRoutes.map((r) => `${r.origin} → ${r.destination}`).join(' | ');

      const payload = {
        form: 'VEHICLE_BOOKING',
        name: formData.requesterName,
        requesterId: formData.employeeId,
        department: formData.department,
        email: formData.email || '',
        date: formData.date,
        timeStart: formData.departureTime,
        timeEnd: formData.returnTime,
        destination: destinationText,
        routes: validRoutes,
        purpose: purposeLabel,
        drivingOption: formData.drivingOption,
        passengers: formData.passengers.filter((p) => p.name.trim()).map((p) => ({
          name: p.name.trim(),
          empId: (p.empId || '').trim(),
          dept: (p.dept || '').trim(),
          email: (p.email || '').trim(),
        })),
        approvedCarNo: formData.approvedCarNo || '',
        driver: '',
        sigUser: formData.sigUser || '',
        sentAt: new Date().toISOString(),
      };

      const workflowItemId = await createApprovalWorkflowRequest({
        topic: resubmitInfo ? 'เอกสารขอใช้รถ (ส่งใหม่หลังถูกปฏิเสธ)' : 'เอกสารขอใช้รถ รอเซ็นอนุมัติ',
        requesterId: formData.employeeId || '-',
        requesterName: formData.requesterName || '-',
        requesterDepartment: formData.department || '',
        sourceForm: 'VEHICLE_BOOKING',
        targetUserId: picked?.id || null,
        targetUserEmail: picked?.email || null,
        targetUserName: picked?.displayName || null,
        requestPayload: {
          ...(resubmitInfo ? {
            resubmittedFrom: resubmitInfo.fromId,
            previousChainId: resubmitInfo.oldChainId,
            previousRejectReason: resubmitInfo.oldRejectReason,
          } : {}),
          name: formData.requesterName,
          requesterId: formData.employeeId,
          department: formData.department,
          email: formData.email || '',
          date: formData.date,
          timeStart: formData.departureTime,
          timeEnd: formData.returnTime,
          destination: destinationText,
          routes: validRoutes,
          purpose: purposeLabel,
          drivingOption: formData.drivingOption,
          driveSelf: formData.drivingOption === '6.1',
          needDriver: formData.drivingOption === '6.2',
          easyPass: formData.drivingOption === '6.1' ? formData.easyPass : '',
          needEasyPass: formData.drivingOption === '6.1' && formData.easyPass === '6.1.1',
          passengers: formData.passengers.filter((p) => p.name.trim()).map((p) => ({
            name: p.name.trim(),
            empId: (p.empId || '').trim(),
            dept: (p.dept || '').trim(),
          })),
          approvedCarNo: formData.approvedCarNo || '',
          requesterSign: formData.sigUser || '',
        },
      });

      await saveVehicleBooking();
      printVehicleBooking(payload);

      const approveUrl = workflowItemId ? buildApproveUrl(workflowItemId) : '';

      // ใช้ previewApprovers ที่โหลดไว้แล้ว (Lv.4-5 ในแผนก)
      const approvers = previewApprovers;
      setSentToList(approvers);

      // รวมอีเมลทุกคนเป็น comma-separated string
      const allEmails = approvers
        .map((u) => u.email)
        .filter((e) => e && e.includes('@'))
        .join(', ');
      const approverNames = approvers
        .map((u) => (u.name || u.displayName || '').split(' ')[0])
        .filter(Boolean)
        .join(', ');

      const headEmail = allEmails || picked?.email || await getHeadEmail(formData.department);
      // Subject ที่ชัดเจน — มี emoji รถ + ระบุประเภทเอกสาร + ชื่อผู้ขอ
      const dateStr = formData.date ? new Date(formData.date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' }) : '';
      const subject = approverNames
        ? `🚗 [TBKK ขอใช้รถ] รอท่าน ${approverNames} อนุมัติ — ${formData.requesterName} (${dateStr})`
        : `🚗 [TBKK ขอใช้รถ] ${formData.requesterName} รอเซ็นอนุมัติ ${dateStr ? `— วันที่ ${dateStr}` : ''}`;

      // 1) ส่ง email อัตโนมัติ (backend SMTP → EmailJS → mailto fallback)
      let emailResult = null;
      if (headEmail) {
        try {
          emailResult = await copyHtmlAndOpenOutlook({
            to: headEmail,
            subject,
            formType: 'VEHICLE_BOOKING',
            data: payload,
            approveUrl,
            requesterSign: formData.sigUser,
          });
        } catch (err) {
          console.warn('Send email failed:', err);
        }
      }

      // 2) แสดง modal แชร์ลิงก์ เฉพาะกรณี SMTP อัตโนมัติล้มเหลว
      //    (ถ้า backend-smtp สำเร็จ → หัวหน้าได้เมล HTML พร้อมปุ่มกดแล้ว ไม่ต้องแชร์ซ้ำ)
      const autoSent = emailResult?.method === 'backend-smtp' || emailResult?.method === 'emailjs';
      if (approveUrl && !autoSent) {
        setApproveLinkModal({
          url: approveUrl,
          headEmail: headEmail || '',
          requesterName: formData.requesterName,
          subject,
          payload,
        });
      }

      // เก็บข้อมูลการส่ง — แสดงใน modal popup เด่นๆ
      setSentInfo({
        refId: workflowItemId || `WF-${Date.now()}`,
        sentAt: new Date(),
        emailStatus: emailResult?.method || 'demo',
        approverCount: approvers.length,
        approverNames: approvers.map(u => u.name || u.displayName || u.id),
        emails: approvers.map(u => u.email).filter(Boolean),
        approveUrl,
      });
      setSentSuccess(true);
      // เลื่อนหน้าขึ้นบนสุดเพื่อให้เห็น banner/modal
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
    } catch (err) {
      console.error('Send error:', err);
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  const copyApproveLink = async () => {
    if (!approveLinkModal?.url) return;
    try {
      await navigator.clipboard.writeText(approveLinkModal.url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = approveLinkModal.url;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); } catch {}
      document.body.removeChild(ta);
    }
  };

  const shareViaLine = () => {
    if (!approveLinkModal?.url) return;
    const text = `📋 ใบขออนุญาตใช้รถ รอเซ็นอนุมัติ\nผู้ขอ: ${approveLinkModal.requesterName}\n${approveLinkModal.url}`;
    const lineUrl = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(approveLinkModal.url)}&text=${encodeURIComponent(text)}`;
    window.open(lineUrl, '_blank', 'width=600,height=600');
  };

  const openEmailClient = async () => {
    if (!approveLinkModal) return;
    try {
      await copyHtmlAndOpenOutlook({
        to: approveLinkModal.headEmail || '',
        subject: approveLinkModal.subject,
        formType: 'VEHICLE_BOOKING',
        data: approveLinkModal.payload,
        approveUrl: approveLinkModal.url,
        requesterSign: formData.sigUser,
      });
    } catch (err) {
      console.error('Open email error:', err);
    }
  };

  // เปิด Outlook Web (outlook.office.com) — ไม่ต้องมีโปรแกรม Outlook ติดเครื่อง
  const openOutlookWeb = () => {
    if (!approveLinkModal) return;
    const { url, headEmail, subject, requesterName } = approveLinkModal;
    const body =
      `🔔 มีเอกสารใหม่รอเซ็นอนุมัติ\n\n` +
      `📋 ใบขอใช้รถ\n` +
      `👤 ผู้ขอ: ${requesterName}\n\n` +
      `👉 กดลิงก์เพื่อเซ็นอนุมัติ (ไม่ต้อง Login):\n\n` +
      `${url}\n\n` +
      `— SOC Systems • TBKK Group —`;
    const webUrl = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(headEmail || '')}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(webUrl, '_blank');
  };

  // เปิด Gmail Web compose
  const openGmailWeb = () => {
    if (!approveLinkModal) return;
    const { url, headEmail, subject, requesterName } = approveLinkModal;
    const body =
      `🔔 มีเอกสารใหม่รอเซ็นอนุมัติ\n\n` +
      `📋 ใบขอใช้รถ\n` +
      `👤 ผู้ขอ: ${requesterName}\n\n` +
      `👉 กดลิงก์เพื่อเซ็นอนุมัติ (ไม่ต้อง Login):\n\n` +
      `${url}\n\n` +
      `— SOC Systems • TBKK Group —`;
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(headEmail || '')}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(gmailUrl, '_blank');
  };

  // ส่งทาง Microsoft Teams chat
  const shareViaTeams = () => {
    if (!approveLinkModal) return;
    const { url, headEmail, requesterName } = approveLinkModal;
    const message = `📋 ใบขออนุญาตใช้รถ รอเซ็นอนุมัติ\nผู้ขอ: ${requesterName}\nลิงก์: ${url}`;
    const teamsUrl = headEmail
      ? `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(headEmail)}&message=${encodeURIComponent(message)}`
      : `https://teams.microsoft.com/l/chat/0/0?message=${encodeURIComponent(message)}`;
    window.open(teamsUrl, '_blank');
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 p-4 md:p-8">
      <ApproverPicker
        open={showApproverPicker}
        department={formData.department}
        onPick={performSend}
        onClose={() => setShowApproverPicker(false)}
      />
      <div className="max-w-4xl mx-auto">
        {/* Resubmit Banner — แสดงเมื่อมาจาก ?resubmitFrom= */}
        {resubmitInfo && (
          <div className="mb-4 bg-blue-50 border-2 border-blue-300 rounded-2xl p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg flex-shrink-0">✏️</div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-blue-900 text-sm">กำลังแก้ไขเอกสารที่ถูกปฏิเสธ</p>
                <p className="text-xs text-blue-700 mt-0.5">ข้อมูลทั้งหมดถูก prefill จากใบเดิม — แก้ไขส่วนที่ต้องการแล้วกดส่งได้เลย</p>
                {resubmitInfo.oldRejectReason && (
                  <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <p className="text-[11px] font-black text-red-700">
                      ❌ เหตุผลที่ถูกปฏิเสธ {resubmitInfo.oldRejectedByRole ? `(${resubmitInfo.oldRejectedByRole})` : ''}:
                    </p>
                    <p className="text-[12px] text-red-700 mt-0.5 whitespace-pre-wrap break-words">
                      {resubmitInfo.oldRejectReason}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Success Modal — popup ใหญ่กลางจอเด่นๆ */}
        {sentSuccess && sentInfo && (
          <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl shadow-emerald-300/40 max-w-lg w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-300">
              {/* Header สีเขียวเด่น */}
              <div className="relative bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500 text-white px-6 py-8 rounded-t-3xl text-center overflow-hidden">
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/20 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-emerald-300/30 rounded-full blur-3xl pointer-events-none" />
                <div className="relative">
                  <div className="w-20 h-20 mx-auto rounded-full bg-white text-emerald-600 flex items-center justify-center mb-3 shadow-xl animate-in zoom-in duration-500">
                    <Check className="w-12 h-12" strokeWidth={3} />
                  </div>
                  <h3 className="text-2xl font-black drop-shadow">✓ ส่งสำเร็จแล้ว!</h3>
                  <p className="text-emerald-50 text-sm mt-1">Request Submitted Successfully</p>
                  <div className="inline-block mt-3 px-3 py-1 bg-white/20 backdrop-blur border border-white/30 rounded-full text-[10px] font-mono font-bold tracking-wider">
                    REF: {(sentInfo.refId || '').slice(-12).toUpperCase()}
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                {/* Sent timestamp */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-semibold uppercase tracking-wider">📅 ส่งเมื่อ</span>
                  <span className="text-slate-900 font-bold">
                    {sentInfo.sentAt.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>

                {/* Approvers list */}
                <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-200">
                  <p className="text-xs font-black text-emerald-800 uppercase tracking-widest mb-3 flex items-center gap-2">
                    📨 ส่งให้ {sentInfo.approverCount} คน — ใครเห็นก่อนกดอนุมัติได้
                  </p>
                  <ul className="space-y-2">
                    {sentToList.map((u) => (
                      <li key={u.id} className="flex items-center gap-3 p-2 bg-white rounded-xl border border-emerald-100">
                        <span className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-black ${
                          u.approvalLevel === 4 ? 'bg-purple-100 text-purple-700' :
                          u.approvalLevel === 5 ? 'bg-blue-100 text-blue-700' :
                          u.approvalLevel === 6 ? 'bg-cyan-100 text-cyan-700' :
                          u.approvalLevel === 7 ? 'bg-teal-100 text-teal-700' :
                          u.approvalLevel === 8 ? 'bg-emerald-100 text-emerald-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          Lv.{u.approvalLevel}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900 leading-tight">
                            {u.name || u.displayName || u.id}
                          </p>
                          <p className="text-[10px] text-slate-500 leading-tight truncate">
                            {u.email || '— ไม่มี email —'}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Email status */}
                <div className={`p-3 rounded-xl border ${
                  sentInfo.emailStatus === 'backend-smtp'
                    ? 'bg-blue-50 border-blue-200 text-blue-800'
                    : sentInfo.emailStatus === 'emailjs'
                      ? 'bg-cyan-50 border-cyan-200 text-cyan-800'
                      : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}>
                  <p className="text-xs font-bold flex items-center gap-2">
                    {sentInfo.emailStatus === 'backend-smtp' ? '✉️ Email ส่งสำเร็จแล้ว (SMTP)'
                      : sentInfo.emailStatus === 'emailjs' ? '✉️ Email ส่งสำเร็จแล้ว (EmailJS)'
                      : '📋 ในระบบเรียบร้อย — Email demo mode (ตั้ง SMTP เพิ่มจะส่งจริง)'}
                  </p>
                  <p className="text-[10px] mt-1 opacity-75">
                    หัวหน้าจะได้รับ notification ใน Bell icon ทันที
                    {sentInfo.emails.length > 0 && ` · email: ${sentInfo.emails.length} ที่อยู่`}
                  </p>
                </div>

                {/* Action buttons */}
                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => { setSentSuccess(false); setSentInfo(null); }}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition active:scale-95"
                  >
                    ปิด / Close
                  </button>
                  <button
                    type="button"
                    onClick={() => { window.location.href = '/'; }}
                    className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white rounded-xl font-bold text-sm shadow-md shadow-emerald-200 transition active:scale-95"
                  >
                    🏠 กลับหน้าหลัก
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4 bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-600 rounded-2xl shadow-xl shadow-indigo-100">
              <Car className="text-white w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-slate-800 leading-tight">ระบบขอใช้รถบริษัท</h1>
              <p className="text-slate-500 text-[10px] md:text-xs font-bold uppercase tracking-widest">Vehicle Request Platform</p>
            </div>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button onClick={handleBack} className="flex-1 md:flex-none flex items-center justify-center gap-1.5 bg-slate-100 text-slate-600 px-4 py-2.5 rounded-xl hover:bg-slate-200 transition font-bold text-sm">
              <ArrowLeft className="w-4 h-4" /> กลับ / Back
            </button>
            <button onClick={handleReset} className="flex-1 md:flex-none bg-white border border-slate-200 text-slate-500 px-4 py-2.5 rounded-xl hover:bg-slate-50 transition font-bold text-sm">
              ล้าง / Clear
            </button>
          </div>
        </header>

        {/* Success banner */}
        {sentSuccess && (
          <div className="mb-6 bg-emerald-50 border-2 border-emerald-200 text-emerald-800 px-5 py-4 rounded-2xl animate-in fade-in slide-in-from-top-2">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center font-black flex-shrink-0">✓</div>
              <div className="flex-1">
                <p className="font-black">ส่งเรียบร้อย! / Submitted!</p>
                <p className="text-xs mt-1">
                  ระบบส่งคำขอไปให้หัวหน้าแผนก <strong>{formData.department}</strong> เรียบร้อย —
                  ใครเห็นก่อนกดอนุมัติได้
                </p>

                {sentToList.length > 0 ? (
                  <div className="mt-3 p-3 bg-white border border-emerald-200 rounded-xl">
                    <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-2">
                      📨 ส่งให้ — {sentToList.length} คน (Lv.{VEHICLE_MIN_APPROVAL_LEVEL}-{VEHICLE_MAX_APPROVAL_LEVEL} ของแผนก {formData.department})
                    </p>
                    <ul className="space-y-1.5">
                      {sentToList.map((u) => (
                        <li key={u.id} className="flex items-center gap-2 text-xs">
                          <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-black">
                            {u.approvalLevel || '?'}
                          </span>
                          <div className="flex-1">
                            <p className="font-bold text-slate-900 leading-tight">{u.name || u.displayName || u.id}</p>
                            <p className="text-[10px] text-slate-500">
                              {u.position || (
                                u.approvalLevel === 4 ? 'Asst.GM' :
                                u.approvalLevel === 5 ? 'ผู้จัดการฝ่าย' :
                                u.approvalLevel === 6 ? 'ผู้ช่วยผู้จัดการฝ่าย' :
                                u.approvalLevel === 7 ? 'หัวหน้าแผนก' :
                                u.approvalLevel === 8 ? 'Supervisor' : 'หัวหน้า'
                              )}
                              {u.email && ` · ${u.email}`}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-[11px] text-amber-700 mt-2 italic">⚠ ไม่พบหัวหน้า Lv.{VEHICLE_MIN_APPROVAL_LEVEL}-{VEHICLE_MAX_APPROVAL_LEVEL} ในแผนก {formData.department} (ระบบจะส่งให้ admin จัดการ)</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Form Card */}
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 p-6 md:p-8 text-white">
            <h2 className="text-lg md:text-2xl font-bold flex items-center gap-3">
              <FileText className="w-6 h-6 md:w-7 md:h-7" /> ใบขออนุญาตใช้รถบริษัท / Company Vehicle Request
            </h2>
            <p className="text-indigo-100 mt-1 uppercase text-[10px] md:text-xs tracking-widest font-bold">ส่วนที่ 1-6 — ผู้ขอใช้รถกรอก / Sections 1-6 — To be filled by requester</p>
          </div>

          <form onSubmit={handleSend} className="p-5 md:p-8 space-y-8">
            {/* 1. Requester */}
            <section className="space-y-4">
              <h3 className="text-base md:text-lg font-black text-indigo-600 flex items-center gap-3 border-b-2 border-indigo-50 pb-2">
                <span className="flex items-center justify-center w-7 h-7 bg-indigo-600 text-white rounded-lg text-sm">1</span>
                ผู้ขอใช้รถ (Requester)
              </h3>
              {/* 4 columns: ID / Name / Department / Email — bilingual */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">รหัสพนักงาน / ID *</label>
                  <div className="relative">
                    <input
                      required
                      type="text"
                      value={formData.employeeId}
                      onChange={(e) => updateField('employeeId', e.target.value)}
                      className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none uppercase font-mono text-sm"
                      placeholder="SD553"
                    />
                    {lookupStatus === 'loading' && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                    )}
                    {lookupStatus === 'found' && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-emerald-600 text-sm">✓</span>
                    )}
                    {lookupStatus === 'notfound' && formData.employeeId.trim().length >= 3 && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-600 text-xs">⚠</span>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">ชื่อ-นามสกุล / Name *</label>
                  <input
                    required
                    type="text"
                    value={formData.requesterName}
                    onChange={(e) => updateField('requesterName', e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                    placeholder="—"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">แผนก / Department *</label>
                  <input
                    required
                    type="text"
                    value={formData.department}
                    onChange={(e) => updateField('department', e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                    placeholder="—"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">อีเมล / Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm font-mono"
                    placeholder="name@tbkk.co.th"
                  />
                </div>
              </div>
            </section>

            {/* 2. Passengers */}
            <section className="space-y-4">
              <div className="flex flex-wrap justify-between items-center border-b-2 border-indigo-50 pb-2 gap-2">
                <h3 className="text-base md:text-lg font-black text-indigo-600 flex items-center gap-3">
                  <span className="flex items-center justify-center w-7 h-7 bg-indigo-600 text-white rounded-lg text-sm">2</span>
                  ผู้ติดตาม (Passengers)
                </h3>
                {formData.passengers.length < 10 && (
                  <button type="button" onClick={addPassenger} className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 hover:bg-indigo-100 transition">
                    <Plus className="w-4 h-4" /> เพิ่มผู้ติดตาม / Add Passenger
                  </button>
                )}
              </div>
              {formData.passengers.length === 0 ? (
                <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center">
                  <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">ยังไม่มีผู้ติดตาม — กด "เพิ่มผู้ติดตาม" เพื่อเพิ่มรายการ<br/>No passengers — click "Add Passenger" to add</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {formData.passengers.map((p, i) => {
                    const status = passengerLookups[i] || 'idle';
                    return (
                      <div key={i} className="grid grid-cols-12 gap-2 md:gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                        {/* Index badge */}
                        <div className="col-span-12 md:col-span-1 flex md:flex-col items-center md:items-start gap-2">
                          <span className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-black">{i + 1}</span>
                          <span className="text-[10px] text-slate-400 md:hidden">ผู้ติดตามคนที่ {i + 1}</span>
                        </div>
                        {/* รหัสพนักงาน */}
                        <div className="col-span-12 md:col-span-2">
                          <label className="block text-[10px] font-semibold text-slate-500 mb-0.5 md:hidden">รหัสพนักงาน / ID</label>
                          <div className="relative">
                            <input
                              value={p.empId}
                              onChange={(e) => handlePassengerEmpIdChange(i, e.target.value)}
                              type="text"
                              placeholder="รหัสพนักงาน / ID"
                              className="w-full px-3 py-2 pr-7 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400 uppercase font-mono"
                            />
                            {status === 'loading' && (
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                            )}
                            {status === 'found' && (
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-emerald-600 text-sm">✓</span>
                            )}
                            {status === 'notfound' && (p.empId || '').trim().length >= 3 && (
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-600 text-xs">⚠</span>
                            )}
                          </div>
                        </div>
                        {/* ชื่อ-นามสกุล */}
                        <div className="col-span-12 md:col-span-3">
                          <input
                            value={p.name}
                            onChange={(e) => updatePassenger(i, 'name', e.target.value)}
                            type="text"
                            placeholder="ชื่อ-นามสกุล / Name"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                          />
                        </div>
                        {/* แผนก */}
                        <div className="col-span-12 md:col-span-3">
                          <input
                            value={p.dept}
                            onChange={(e) => updatePassenger(i, 'dept', e.target.value)}
                            type="text"
                            placeholder="แผนก / Dept"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                          />
                        </div>
                        {/* อีเมล */}
                        <div className="col-span-10 md:col-span-2">
                          <input
                            value={p.email || ''}
                            onChange={(e) => updatePassenger(i, 'email', e.target.value)}
                            type="email"
                            placeholder="อีเมล / Email"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400 font-mono"
                          />
                        </div>
                        {/* ปุ่มลบ */}
                        <div className="col-span-2 md:col-span-1 flex justify-center items-center">
                          <button
                            type="button"
                            onClick={() => {
                              removePassenger(i);
                              setPassengerLookups((p) => {
                                const np = { ...p };
                                delete np[i];
                                return np;
                              });
                            }}
                            className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* 3. Date & Time */}
            <section className="space-y-4">
              <h3 className="text-base md:text-lg font-black text-indigo-600 flex items-center gap-3 border-b-2 border-indigo-50 pb-2">
                <span className="flex items-center justify-center w-7 h-7 bg-indigo-600 text-white rounded-lg text-sm">3</span>
                วันและเวลา (Date & Time)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 flex items-center gap-1"><Calendar className="w-3 h-3" /> วันที่ (Date)</label>
                  <input required type="date" value={formData.date} onChange={(e) => updateField('date', e.target.value)} className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:bg-white text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 flex items-center gap-1"><Clock className="w-3 h-3" /> เวลาออก (Departure)</label>
                  <input required type="time" value={formData.departureTime} onChange={(e) => updateField('departureTime', e.target.value)} className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:bg-white text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 flex items-center gap-1"><Clock className="w-3 h-3" /> เวลากลับ (Return)</label>
                  <input required type="time" value={formData.returnTime} onChange={(e) => updateField('returnTime', e.target.value)} className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:bg-white text-sm" />
                </div>
              </div>
            </section>

            {/* 4. Route */}
            <section className="space-y-4">
              <div className="flex flex-wrap justify-between items-center border-b-2 border-indigo-50 pb-2 gap-2">
                <h3 className="text-base md:text-lg font-black text-indigo-600 flex items-center gap-3">
                  <span className="flex items-center justify-center w-7 h-7 bg-indigo-600 text-white rounded-lg text-sm">4</span>
                  สถานที่ (Route)
                </h3>
                {formData.routes.length < 10 && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={addRoute}
                      className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 hover:bg-indigo-100 transition border border-indigo-200"
                      title="เพิ่มจุดแวะ — ต้นทางจะกรอกอัตโนมัติจากปลายทางจุดก่อนหน้า"
                    >
                      <Plus className="w-4 h-4" /> เพิ่มจุดแวะ / Add Stop
                    </button>
                    <button
                      type="button"
                      onClick={addReturnToFactory}
                      className="text-xs bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 hover:bg-emerald-100 transition border border-emerald-200"
                      title="เพิ่มจุดสุดท้าย — กลับเข้าโรงงาน TBKK"
                    >
                      🏭 กลับโรงงาน / Return
                    </button>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                {formData.routes.map((r, i) => (
                  <div key={i} className="flex flex-col md:flex-row gap-3 items-stretch md:items-center bg-indigo-50/40 p-3 md:p-4 rounded-2xl border border-indigo-100">
                    <span className="hidden md:flex flex-shrink-0 w-8 h-8 rounded-full bg-indigo-600 text-white items-center justify-center font-black text-sm">{i + 1}</span>
                    <span className="md:hidden text-xs font-black text-indigo-600">จุดที่ {i + 1}</span>
                    <div className="flex-1 flex items-center gap-2 md:gap-3">
                      <MapPin className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <input required value={r.origin} onChange={(e) => updateRoute(i, 'origin', e.target.value)} type="text" placeholder="ต้นทาง (Origin)" className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400 min-w-0" />
                    </div>
                    <ChevronRight className="hidden md:block text-indigo-300 flex-shrink-0" />
                    <div className="flex-1 flex items-center gap-2 md:gap-3">
                      <MapPin className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <input required value={r.destination} onChange={(e) => updateRoute(i, 'destination', e.target.value)} type="text" placeholder="ปลายทาง (Destination)" className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400 min-w-0" />
                    </div>
                    {/* 🗺️ ดูบน Google Maps */}
                    {(r.origin?.trim() && r.destination?.trim()) && (
                      <button
                        type="button"
                        onClick={() => {
                          const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(r.origin)}&destination=${encodeURIComponent(r.destination)}&travelmode=driving`;
                          window.open(url, '_blank', 'noopener');
                        }}
                        className="text-blue-600 hover:text-white hover:bg-blue-600 bg-blue-50 border border-blue-200 hover:border-blue-600 px-2.5 py-2 rounded-lg self-center transition flex items-center gap-1 text-xs font-bold whitespace-nowrap"
                        title="ดูเส้นทางและระยะทางบน Google Maps"
                      >
                        🗺️ <span className="hidden md:inline">Maps</span>
                      </button>
                    )}
                    {formData.routes.length > 1 && (
                      <button type="button" onClick={() => removeRoute(i)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg self-center transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* 🗺️ ดูเส้นทางทั้งหมดบน Google Maps */}
              {(() => {
                const validStops = formData.routes.filter(r => r.origin?.trim() && r.destination?.trim());
                if (validStops.length === 0) return null;
                const buildFullRouteUrl = () => {
                  // Combine all stops: origin → waypoints → final destination
                  const allPoints = [];
                  validStops.forEach((r, i) => {
                    if (i === 0) allPoints.push(r.origin);
                    allPoints.push(r.destination);
                  });
                  if (allPoints.length < 2) return '';
                  const origin = encodeURIComponent(allPoints[0]);
                  const destination = encodeURIComponent(allPoints[allPoints.length - 1]);
                  const waypoints = allPoints.slice(1, -1).map(p => encodeURIComponent(p)).join('|');
                  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
                  if (waypoints) url += `&waypoints=${waypoints}`;
                  return url;
                };
                const url = buildFullRouteUrl();
                if (!url) return null;
                return (
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-3 md:p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="text-2xl flex-shrink-0">🗺️</span>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-blue-900">ดูระยะทาง / เส้นทางบน Google Maps</p>
                        <p className="text-xs text-blue-700/80 mt-0.5">รวม {validStops.length} จุด — เห็นกิโลเมตร, เวลาเดินทาง, แผนที่จริง</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => window.open(url, '_blank', 'noopener')}
                      className="flex-shrink-0 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-bold text-sm flex items-center gap-2 transition shadow-sm whitespace-nowrap"
                    >
                      🗺️ เปิด Google Maps
                    </button>
                  </div>
                );
              })()}
            </section>

            {/* 5. Purpose + 6. Driving */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <section className="space-y-3">
                <h3 className="text-base md:text-lg font-black text-indigo-600 flex items-center gap-3 border-b-2 border-indigo-50 pb-2">
                  <span className="flex items-center justify-center w-7 h-7 bg-indigo-600 text-white rounded-lg text-sm">5</span>
                  วัตถุประสงค์ / Purpose
                </h3>
                <div className="space-y-2">
                  {[
                    { value: '5.1 อบรม', label: '5.1 อบรม / Training' },
                    { value: '5.2 ติดต่อลูกค้า', label: '5.2 ติดต่อลูกค้า / Visit Customer' },
                    { value: '5.3 ติดต่อซัพพลายเออร์', label: '5.3 ติดต่อซัพพลายเออร์ / Visit Supplier' },
                    { value: '5.4 หน่วยงานราชการ', label: '5.4 หน่วยงานราชการ / Government Agency' },
                    { value: '5.5 อื่นๆ', label: '5.5 อื่นๆ / Other' },
                  ].map((opt) => (
                    <label key={opt.value} className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition ${formData.purpose === opt.value ? 'bg-indigo-50 border-2 border-indigo-300' : 'bg-slate-50 border-2 border-slate-100 hover:border-indigo-200'}`}>
                      <input
                        type="radio"
                        name="purpose"
                        value={opt.value}
                        checked={formData.purpose === opt.value}
                        onChange={(e) => updateField('purpose', e.target.value)}
                        className="accent-indigo-600"
                      />
                      <span className="text-sm font-bold text-slate-700">{opt.label}</span>
                    </label>
                  ))}
                  {formData.purpose === '5.5 อื่นๆ' && (
                    <input
                      type="text"
                      value={formData.otherPurposeText}
                      onChange={(e) => updateField('otherPurposeText', e.target.value)}
                      placeholder="ระบุวัตถุประสงค์อื่นๆ... / Specify other purpose..."
                      className="w-full px-4 py-2.5 bg-white border-2 border-indigo-200 rounded-xl outline-none focus:border-indigo-500 text-sm mt-2"
                    />
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-base md:text-lg font-black text-indigo-600 flex items-center gap-3 border-b-2 border-indigo-50 pb-2">
                  <span className="flex items-center justify-center w-7 h-7 bg-indigo-600 text-white rounded-lg text-sm">6</span>
                  การขับรถ / Driving Option
                </h3>
                <div className="space-y-2">
                  {[
                    { value: '6.1', label: '6.1 ขับเอง (Self-driving)', icon: '🚗' },
                    { value: '6.2', label: '6.2 ต้องการคนขับรถ (Driver required)', icon: '👤' },
                  ].map((opt) => (
                    <div key={opt.value}>
                      <label className={`flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer transition ${formData.drivingOption === opt.value ? 'bg-indigo-50 border-2 border-indigo-300' : 'bg-slate-50 border-2 border-slate-100 hover:border-indigo-200'}`}>
                        <input
                          type="radio"
                          name="drivingOption"
                          value={opt.value}
                          checked={formData.drivingOption === opt.value}
                          onChange={(e) => updateField('drivingOption', e.target.value)}
                          className="accent-indigo-600"
                        />
                        <span className="text-lg">{opt.icon}</span>
                        <span className="text-sm font-bold text-slate-700">{opt.label}</span>
                      </label>

                      {/* Sub-options ของ 6.1 — Easy Pass */}
                      {opt.value === '6.1' && formData.drivingOption === '6.1' && (
                        <div className="mt-2 ml-6 pl-4 border-l-2 border-indigo-200 space-y-2">
                          <p className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">
                            Easy Pass <span className="text-red-500">*</span>
                          </p>
                          {[
                            { v: '6.1.1', lbl: 'ต้องการ Easy Pass',     en: 'Need Easy Pass',    icon: '✓', tone: 'green' },
                            { v: '6.1.2', lbl: 'ไม่ต้องการ Easy Pass', en: 'No Easy Pass needed', icon: '✕', tone: 'red'   },
                          ].map((sub) => {
                            const checked = formData.easyPass === sub.v;
                            const isGreen = sub.tone === 'green';
                            return (
                              <label
                                key={sub.v}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition ${
                                  checked
                                    ? isGreen
                                      ? 'bg-emerald-50 border border-emerald-300 shadow-sm shadow-emerald-100'
                                      : 'bg-red-50 border border-red-300 shadow-sm shadow-red-100'
                                    : 'bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="easyPass"
                                  value={sub.v}
                                  checked={checked}
                                  onChange={(e) => updateField('easyPass', e.target.value)}
                                  className={isGreen ? 'accent-emerald-600' : 'accent-red-600'}
                                />
                                <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${
                                  checked
                                    ? isGreen
                                      ? 'bg-emerald-500 text-white'
                                      : 'bg-red-500 text-white'
                                    : 'bg-slate-100 text-slate-400'
                                }`}>{sub.icon}</span>
                                <div className="flex-1">
                                  <p className={`text-sm font-semibold ${
                                    checked ? (isGreen ? 'text-emerald-900' : 'text-red-900') : 'text-slate-700'
                                  }`}>
                                    <span className="text-slate-400 mr-1">{sub.v}</span>
                                    {sub.lbl}
                                  </p>
                                  <p className={`text-[10px] ${
                                    checked ? (isGreen ? 'text-emerald-700' : 'text-red-700') : 'text-slate-500'
                                  }`}>{sub.en}</p>
                                </div>
                              </label>
                            );
                          })}
                          {!formData.easyPass && (
                            <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded">
                              ⚠ กรุณาเลือกว่าต้องการ Easy Pass หรือไม่
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Confirmation & Submit — ใช้ login เป็นการยืนยัน ไม่ต้องเซ็น */}
            <section className="space-y-3">
              <h3 className="text-base md:text-lg font-black text-emerald-600 flex items-center gap-3 border-b-2 border-emerald-50 pb-2">
                <Send className="w-5 h-5" />
                ยืนยันและส่ง / Confirm &amp; Submit
              </h3>

              <div className="p-4 md:p-5 border border-emerald-200 rounded-2xl bg-gradient-to-br from-emerald-50/50 via-white to-green-50/30 shadow-sm space-y-3">
                {/* ข้อมูลผู้ขอ */}
                <div className="bg-white rounded-xl border border-emerald-100 overflow-hidden">
                  <div className="bg-gradient-to-r from-emerald-50 to-green-50 px-4 py-2 border-b border-emerald-100">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-emerald-700 font-bold">ข้อมูลผู้ขอ / Requester Information</p>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-slate-100">
                    <div className="px-3 py-2.5 col-span-2 md:col-span-1">
                      <p className="text-[10px] text-emerald-600 uppercase tracking-wider font-bold">ID</p>
                      <p className="text-sm font-mono font-bold text-slate-900 truncate">{formData.employeeId || <span className="text-slate-400 italic font-sans font-normal">— ยังไม่กรอก —</span>}</p>
                    </div>
                    <div className="px-3 py-2.5">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Name</p>
                      <p className="text-sm font-semibold text-slate-900 truncate">{formData.requesterName || <span className="text-slate-400 italic">—</span>}</p>
                    </div>
                    <div className="px-3 py-2.5">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Dept</p>
                      <p className="text-sm font-semibold text-slate-900 truncate">{formData.department || <span className="text-slate-400 italic">—</span>}</p>
                    </div>
                    <div className="px-3 py-2.5">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Email</p>
                      <p className="text-xs font-mono font-medium text-slate-900 truncate">{formData.email || <span className="text-slate-400 italic font-sans font-normal">— ไม่มี —</span>}</p>
                    </div>
                  </div>
                </div>

                {/* ข้อความยืนยัน */}
                <div className="flex items-start gap-2 px-1">
                  <span className="text-emerald-600 mt-0.5">✓</span>
                  <p className="text-[11px] text-slate-600 leading-snug">
                    ระบบจะใช้ข้อมูล Login ของท่านเป็นการยืนยันคำขอโดยอัตโนมัติ ไม่จำเป็นต้องเซ็นชื่อ
                    <br />
                    <span className="text-slate-500 italic">Your login credentials will be automatically used to verify this request — no signature required.</span>
                  </p>
                </div>


                {/* ปุ่มส่ง */}
                <button
                  type="submit"
                  disabled={sending}
                  className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-gradient-to-r from-emerald-600 via-green-600 to-emerald-600 hover:from-emerald-700 hover:via-green-700 hover:to-emerald-700 text-white rounded-xl font-bold text-base shadow-lg shadow-emerald-200 disabled:opacity-60 disabled:cursor-not-allowed transition active:scale-[0.99]"
                >
                  {sending ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      กำลังส่ง... / Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      ยืนยันและส่งใบขอใช้รถ / Confirm &amp; Submit Request
                    </>
                  )}
                </button>
                <p className="text-[10px] text-center text-slate-400">
                  เมื่อกดส่ง คำขอจะถูกบันทึกและส่งให้หัวหน้าอนุมัติทันที / Once submitted, the request will be sent to the head for approval immediately.
                </p>
              </div>
            </section>
          </form>
        </div>
      </div>

      {/* Approve Link Modal — แสดงหลังส่งฟอร์ม (compact, mobile-friendly) */}
      {approveLinkModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden max-h-[95vh] flex flex-col">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 p-3 sm:p-5 text-white flex-shrink-0">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/20 flex items-center justify-center text-lg sm:text-2xl">✓</div>
                <div className="min-w-0">
                  <h3 className="font-black text-base sm:text-lg leading-tight">ส่งเรียบร้อย!</h3>
                  <p className="text-emerald-50 text-[10px] sm:text-xs leading-tight">ส่งลิงก์นี้ให้หัวหน้าเซ็นอนุมัติ</p>
                </div>
              </div>
            </div>

            <div className="p-3 sm:p-5 space-y-3 overflow-y-auto">
              {/* QR Code */}
              <div className="flex flex-col items-center gap-1 py-2 border border-dashed border-slate-200 rounded-xl bg-slate-50">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(approveLinkModal.url)}`}
                  alt="QR Code"
                  className="w-28 h-28 sm:w-36 sm:h-36"
                />
                <p className="text-[10px] text-slate-500">📱 สแกนเพื่อเปิดหน้าอนุมัติ</p>
              </div>

              {/* URL */}
              <div className="flex gap-1.5">
                <input
                  type="text"
                  readOnly
                  value={approveLinkModal.url}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-mono outline-none focus:border-indigo-500 min-w-0"
                />
                <button
                  type="button"
                  onClick={copyApproveLink}
                  className={`px-3 py-1.5 rounded-lg font-bold text-[10px] whitespace-nowrap transition ${copiedLink ? 'bg-emerald-500 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                >
                  {copiedLink ? '✓' : '📋 คัดลอก'}
                </button>
              </div>

              {/* ช่องทางแชร์ทั้งหมด — รวมใน grid เดียว 4 คอลัมน์ */}
              <div>
                <p className="text-[10px] font-black text-slate-600 mb-1.5">⭐ เลือกวิธีส่งให้หัวหน้า</p>
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={shareViaLine}
                    className="flex flex-col items-center gap-0.5 p-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition shadow-sm active:scale-95"
                  >
                    <span className="text-lg">💬</span>
                    <span className="text-[9px] font-black">LINE</span>
                  </button>
                  <button
                    type="button"
                    onClick={openOutlookWeb}
                    className="flex flex-col items-center gap-0.5 p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition shadow-sm active:scale-95"
                  >
                    <span className="text-lg">🌐</span>
                    <span className="text-[9px] font-black">Outlook</span>
                  </button>
                  <button
                    type="button"
                    onClick={openGmailWeb}
                    className="flex flex-col items-center gap-0.5 p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition shadow-sm active:scale-95"
                  >
                    <span className="text-lg">✉️</span>
                    <span className="text-[9px] font-black">Gmail</span>
                  </button>
                  <button
                    type="button"
                    onClick={shareViaTeams}
                    className="flex flex-col items-center gap-0.5 p-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition shadow-sm active:scale-95"
                  >
                    <span className="text-lg">👥</span>
                    <span className="text-[9px] font-black">Teams</span>
                  </button>
                </div>
              </div>

              {approveLinkModal.headEmail && (
                <div className="bg-amber-50 border-l-4 border-amber-400 p-2 rounded-r-lg text-[10px] text-amber-900">
                  📧 Email หัวหน้า: <span className="font-mono font-bold">{approveLinkModal.headEmail}</span>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-slate-200 flex-shrink-0 bg-white">
              <button
                type="button"
                onClick={() => { setApproveLinkModal(null); setSentSuccess(false); }}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-xl font-bold text-sm transition"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VehicleBookingFormApp;
