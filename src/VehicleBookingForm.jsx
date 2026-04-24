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
import { collection, addDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { db, firebaseReady, appId } from './firebase';
import { createApprovalWorkflowRequest } from './approvalNotifications';
import { copyHtmlAndOpenOutlook, buildApproveUrl, getHeadEmail } from './emailHelper';
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
  const [approveLinkModal, setApproveLinkModal] = useState(null); // { url, headEmail, requesterName }
  const [copiedLink, setCopiedLink] = useState(false);
  const [showApproverPicker, setShowApproverPicker] = useState(false);

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
    setFormData((p) => ({ ...p, routes: [...p.routes, { origin: '', destination: '' }] }));
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
    // Validation ผ่าน → เปิด modal ให้เลือกหัวหน้าผู้อนุมัติ
    setShowApproverPicker(true);
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
        })),
        approvedCarNo: formData.approvedCarNo || '',
        driver: '',
        sigUser: formData.sigUser || '',
        sentAt: new Date().toISOString(),
      };

      const workflowItemId = await createApprovalWorkflowRequest({
        topic: 'เอกสารขอใช้รถ รอเซ็นอนุมัติ',
        requesterId: formData.employeeId || '-',
        requesterName: formData.requesterName || '-',
        requesterDepartment: formData.department || '',
        sourceForm: 'VEHICLE_BOOKING',
        targetUserId: picked?.id || null,
        targetUserEmail: picked?.email || null,
        targetUserName: picked?.displayName || null,
        requestPayload: {
          name: formData.requesterName,
          requesterId: formData.employeeId,
          department: formData.department,
          date: formData.date,
          timeStart: formData.departureTime,
          timeEnd: formData.returnTime,
          destination: destinationText,
          routes: validRoutes,
          purpose: purposeLabel,
          drivingOption: formData.drivingOption,
          driveSelf: formData.drivingOption === '6.1',
          needDriver: formData.drivingOption === '6.2',
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
      const headEmail = picked?.email || await getHeadEmail(formData.department);
      const subject = `[SOC] ใบขออนุญาตใช้รถ รอเซ็นอนุมัติ - ${formData.requesterName}`;

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

      setSentSuccess(true);
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
          <div className="mb-6 bg-emerald-50 border-2 border-emerald-200 text-emerald-800 px-5 py-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
            <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center font-black">✓</div>
            <div>
              <p className="font-black">ส่งเรียบร้อย! / Submitted!</p>
              <p className="text-xs">ระบบได้ส่งลิงก์เซ็นอนุมัติให้หัวหน้าแผนกทางอีเมลแล้ว / Approval link sent to head of department via email</p>
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">ชื่อ-นามสกุล (Full Name)</label>
                  <input
                    required
                    type="text"
                    value={formData.requesterName}
                    onChange={(e) => updateField('requesterName', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:bg-white transition text-sm"
                    placeholder="กรอกชื่อ-นามสกุล / Enter full name"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">รหัสพนักงาน (Employee ID)</label>
                  <input
                    required
                    type="text"
                    value={formData.employeeId}
                    onChange={(e) => updateField('employeeId', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:bg-white transition text-sm uppercase"
                    placeholder="เช่น / e.g. EMP-EEE-01"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">แผนก (Department)</label>
                  <input
                    required
                    type="text"
                    value={formData.department}
                    onChange={(e) => updateField('department', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:bg-white transition text-sm"
                    placeholder="เช่น / e.g. EEE"
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
                  {formData.passengers.map((p, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 md:gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                      <div className="col-span-12 md:col-span-5">
                        <input value={p.name} onChange={(e) => updatePassenger(i, 'name', e.target.value)} type="text" placeholder="ชื่อ-นามสกุล / Full name" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400" />
                      </div>
                      <div className="col-span-5 md:col-span-3">
                        <input value={p.empId} onChange={(e) => updatePassenger(i, 'empId', e.target.value)} type="text" placeholder="รหัสพนักงาน / Employee ID" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400 uppercase" />
                      </div>
                      <div className="col-span-5 md:col-span-3">
                        <input value={p.dept} onChange={(e) => updatePassenger(i, 'dept', e.target.value)} type="text" placeholder="แผนก / Department" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400" />
                      </div>
                      <div className="col-span-2 md:col-span-1 flex justify-center items-center">
                        <button type="button" onClick={() => removePassenger(i)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
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
                  <button type="button" onClick={addRoute} className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 hover:bg-indigo-100 transition">
                    <Plus className="w-4 h-4" /> เพิ่มจุดแวะ / Add Stop
                  </button>
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
                    {formData.routes.length > 1 && (
                      <button type="button" onClick={() => removeRoute(i)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg self-center transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
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
                    <label key={opt.value} className={`flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer transition ${formData.drivingOption === opt.value ? 'bg-indigo-50 border-2 border-indigo-300' : 'bg-slate-50 border-2 border-slate-100 hover:border-indigo-200'}`}>
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
                  ))}
                </div>
              </section>
            </div>

            {/* Signature */}
            <section className="space-y-3">
              <h3 className="text-base md:text-lg font-black text-indigo-600 flex items-center gap-3 border-b-2 border-indigo-50 pb-2">
                <PenTool className="w-5 h-5" />
                ลายเซ็นผู้ขอ (Requester Signature)
              </h3>
              <SignatureManager
                sigData={formData.sigUser}
                onChange={(img) => updateField('sigUser', img)}
              />
            </section>

            {/* Submit */}
            <button
              type="submit"
              disabled={sending}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white py-4 md:py-5 rounded-3xl font-black text-base md:text-lg shadow-xl shadow-indigo-200 transition-all flex items-center justify-center gap-3"
            >
              {sending ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  กำลังส่ง...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  ส่งใบขอใช้รถ / Submit Request
                </>
              )}
            </button>
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
