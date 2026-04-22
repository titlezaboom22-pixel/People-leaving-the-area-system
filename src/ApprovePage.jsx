import React, { useState, useRef, useEffect } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, addDoc, Timestamp, onSnapshot } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { db, auth, firebaseReady, appId } from './firebase';
import { HR_DEPARTMENT, SHOP_DEPARTMENT, SECURITY_DEPARTMENT, STEP_LABEL, WORKFLOW_ROUTES, SPECIAL_EMAILS } from './constants';
import { getHeadEmail, copyHtmlAndOpenOutlook, buildApproveUrl } from './emailHelper';

/**
 * หน้าอนุมัติเอกสาร — เปิดจากลิงก์ใน Outlook โดยไม่ต้อง login
 * URL: /index.html?approve=WORKFLOW_ID
 */
export default function ApprovePage({ workflowId }) {
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signDataUrl, setSignDataUrl] = useState('');
  const [approverName, setApproverName] = useState('');
  const [done, setDone] = useState(false);
  const [savedSignatures, setSavedSignatures] = useState([]);
  const [showSavedPicker, setShowSavedPicker] = useState(false);
  // GA vehicle assignment state
  const [gaVehicles, setGaVehicles] = useState([]);
  const [gaDrivers, setGaDrivers] = useState([]);
  const [gaDateBookings, setGaDateBookings] = useState([]);
  const [gaDriverBookings, setGaDriverBookings] = useState([]);
  const [gaSelectedVehicle, setGaSelectedVehicle] = useState(null);
  const [gaSelectedDriver, setGaSelectedDriver] = useState(null);
  const [gaNoVehicle, setGaNoVehicle] = useState(false);

  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const isDrawingRef = useRef(false);

  // โหลดลายเซ็นที่บันทึกไว้จาก localStorage
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('saved_signatures') || '[]');
      setSavedSignatures(saved);
    } catch {}
  }, []);

  // รอ Firebase Auth พร้อมก่อนโหลดเอกสาร — สำคัญมาก!
  // เพราะ firestore.rules บังคับว่าต้อง auth ก่อนจึงอ่านได้
  useEffect(() => {
    if (!firebaseReady || !auth) {
      setError('ระบบยังไม่พร้อม');
      setLoading(false);
      return;
    }

    let cancelled = false;

    const ensureAuthAndLoad = async () => {
      try {
        // ถ้ายังไม่ได้ sign-in → sign-in anonymous ก่อน
        if (!auth.currentUser) {
          await signInAnonymously(auth);
        }
      } catch (err) {
        if (!cancelled) {
          setError('เชื่อมต่อระบบไม่ได้: ' + err.message);
          setLoading(false);
        }
        return;
      }
      if (!cancelled) loadWorkflow();
    };

    // listen auth state + attempt sign-in
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u && !cancelled) {
        loadWorkflow();
      }
    });
    ensureAuthAndLoad();

    return () => { cancelled = true; unsub(); };
  }, [workflowId]);

  const loadWorkflow = async () => {
    if (!firebaseReady || !db) {
      setError('ระบบยังไม่พร้อม');
      setLoading(false);
      return;
    }
    // กันไม่ให้โหลดซ้ำถ้าโหลดเสร็จแล้ว
    if (item) return;
    try {
      const collRef = collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows');
      const q = query(collRef, where('id', '==', workflowId));
      const snap = await getDocs(q);
      if (snap.empty) {
        setError('ไม่พบเอกสารนี้ในระบบ หรืออนุมัติไปแล้ว');
      } else {
        const data = snap.docs[0].data();
        if (data.status !== 'pending') {
          setError('เอกสารนี้ได้รับการอนุมัติแล้ว');
        } else {
          setItem({ ...data, _docId: snap.docs[0].id });
          setError(''); // clear any previous error
        }
      }
    } catch (err) {
      setError('เกิดข้อผิดพลาด: ' + err.message);
    }
    setLoading(false);
  };

  // Load vehicles + drivers for GA approval of VEHICLE_BOOKING
  useEffect(() => {
    if (!item || item.sourceForm !== 'VEHICLE_BOOKING' || item.targetType !== 'GA') return;
    const unsubs = [];
    try {
      // Load vehicles
      const vRef = collection(db, 'artifacts', appId, 'public', 'data', 'vehicles');
      unsubs.push(onSnapshot(vRef, (snap) => {
        setGaVehicles(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.id.localeCompare(b.id)));
      }));
      // Load drivers
      const dRef = collection(db, 'artifacts', appId, 'public', 'data', 'drivers');
      unsubs.push(onSnapshot(dRef, (snap) => {
        setGaDrivers(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.id.localeCompare(b.id)));
      }));
      // Load vehicle bookings for requested date
      const bRef = collection(db, 'artifacts', appId, 'public', 'data', 'vehicle_bookings');
      unsubs.push(onSnapshot(bRef, (snap) => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const requestDate = item.requestPayload?.date;
        setGaDateBookings(requestDate ? all.filter(b => b.date === requestDate) : []);
        setGaDriverBookings(requestDate ? all.filter(b => b.date === requestDate && b.driverId) : []);
      }));
    } catch (err) { console.error('GA load error:', err); }
    return () => unsubs.forEach(u => u());
  }, [item]);

  const isVehicleBookedGA = (vehicleId) => gaDateBookings.some(b => b.vehicleId === vehicleId);
  const isDriverBookedGA = (driverId) => gaDriverBookings.some(b => b.driverId === driverId);

  // Canvas signature
  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
  };

  useEffect(() => { initCanvas(); }, [item]);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  };

  const startDraw = (e) => {
    e.preventDefault();
    isDrawingRef.current = true;
    const ctx = canvasRef.current.getContext('2d');
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const endDraw = () => {
    isDrawingRef.current = false;
    if (canvasRef.current) {
      setSignDataUrl(canvasRef.current.toDataURL());
    }
  };

  const clearSign = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignDataUrl('');
  };

  // อัปโหลดรูปลายเซ็นจากไฟล์
  const handleUploadSign = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setSignDataUrl(ev.target.result);
      // วาดรูปลงบน canvas ด้วย
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const scale = Math.min(canvas.width / img.width, canvas.height / img.height) * 0.9;
        const x = (canvas.width - img.width * scale) / 2;
        const y = (canvas.height - img.height * scale) / 2;
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  // บันทึกลายเซ็นปัจจุบันไว้ใช้ซ้ำ
  const saveCurrentSignature = () => {
    if (!signDataUrl) { alert('กรุณาวาดหรืออัปโหลดลายเซ็นก่อน'); return; }
    const name = approverName.trim() || `ลายเซ็น ${savedSignatures.length + 1}`;
    const newList = [...savedSignatures, { name, dataUrl: signDataUrl, date: new Date().toLocaleDateString('th-TH') }];
    setSavedSignatures(newList);
    try { localStorage.setItem('saved_signatures', JSON.stringify(newList)); } catch {}
    alert(`บันทึกลายเซ็น "${name}" แล้ว ครั้งหน้ากดเลือกได้เลย`);
  };

  // เลือกลายเซ็นที่บันทึกไว้
  const selectSavedSignature = (sig) => {
    setSignDataUrl(sig.dataUrl);
    if (sig.name && !approverName) setApproverName(sig.name);
    setShowSavedPicker(false);
    // วาดลง canvas
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min(canvas.width / img.width, canvas.height / img.height) * 0.9;
      const x = (canvas.width - img.width * scale) / 2;
      const y = (canvas.height - img.height * scale) / 2;
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
    };
    img.src = sig.dataUrl;
  };

  // ลบลายเซ็นที่บันทึกไว้
  const deleteSavedSignature = (idx) => {
    const newList = savedSignatures.filter((_, i) => i !== idx);
    setSavedSignatures(newList);
    try { localStorage.setItem('saved_signatures', JSON.stringify(newList)); } catch {}
  };

  // Quick Approve — ใช้ลายเซ็นที่บันทึกไว้ กดปุ่มเดียวจบ
  const handleQuickApprove = async (sig) => {
    if (!item) return;
    setSignDataUrl(sig.dataUrl);
    setApproverName(sig.name);
    // รอ state อัปเดต แล้วค่อย approve
    setTimeout(() => {
      handleApproveWithData(sig.dataUrl, sig.name);
    }, 100);
  };

  const handleApprove = async () => {
    if (!signDataUrl) { alert('กรุณาลงลายเซ็นก่อนอนุมัติ'); return; }
    if (!item) return;

    // GA vehicle assignment validation
    const isGAVehicleStep = item.sourceForm === 'VEHICLE_BOOKING' && item.targetType === 'GA';
    if (isGAVehicleStep && !gaNoVehicle && !gaSelectedVehicle) {
      alert('กรุณาเลือกรถที่จะจัดให้ หรือกด "ไม่มีรถให้ใช้งาน"');
      return;
    }
    if (isGAVehicleStep && !gaNoVehicle && item.requestPayload?.needDriver && !gaSelectedDriver) {
      alert('พนักงานต้องการคนขับ กรุณาเลือกคนขับ');
      return;
    }

    await handleApproveWithData(signDataUrl, approverName.trim());
  };

  const handleApproveWithData = async (signData, approver) => {
    if (!signData) { alert('กรุณาลงลายเซ็นก่อนอนุมัติ'); return; }
    if (!item) return;

    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'approval_workflows', item._docId);
      const now = new Date().toISOString();

      const approveDate = new Date().toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const approveTime = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

      // GA Vehicle assignment — save extra data
      const isGAVehicleStep = item.sourceForm === 'VEHICLE_BOOKING' && item.targetType === 'GA';
      const vehicleAssignment = {};
      if (isGAVehicleStep) {
        if (gaNoVehicle) {
          vehicleAssignment.vehicleResult = 'no_vehicle';
          vehicleAssignment.vehicleMessage = 'ไม่มีรถให้ใช้งาน ท่านสามารถเอารถของคุณไปใช้';
        } else {
          vehicleAssignment.vehicleResult = 'assigned';
          vehicleAssignment.assignedVehicle = gaSelectedVehicle;
          if (gaSelectedDriver) {
            vehicleAssignment.assignedDriver = gaSelectedDriver;
          }
        }
      }

      await updateDoc(docRef, {
        status: 'approved',
        acknowledgedAt: now,
        approvedBy: approver || '-',
        approvedSign: signData,
        approvedDate: approveDate,
        approvedTime: approveTime,
        ...vehicleAssignment,
      });

      // ถ้า GA จัดรถสำเร็จ → บันทึกการจองรถลง vehicle_bookings
      if (isGAVehicleStep && !gaNoVehicle && gaSelectedVehicle) {
        try {
          const bookingRef = collection(db, 'artifacts', appId, 'public', 'data', 'vehicle_bookings');
          const rp = item.requestPayload || {};
          await addDoc(bookingRef, {
            vehicleId: gaSelectedVehicle.id,
            plate: gaSelectedVehicle.plate,
            brand: gaSelectedVehicle.brand,
            driverId: gaSelectedDriver?.id || null,
            driverName: gaSelectedDriver?.name || null,
            driverPhone: gaSelectedDriver?.phone || null,
            driverPhoneBackup: gaSelectedDriver?.phoneBackup || null,
            driverLicenseType: gaSelectedDriver?.licenseType || null,
            date: rp.date || '',
            timeStart: rp.timeStart || '',
            timeEnd: rp.timeEnd || '',
            // เก็บทั้ง requester* และ bookedBy* เพื่อให้ระบบอื่นอ่านได้
            requesterId: item.requesterId,
            requesterName: item.requesterName,
            bookedBy: item.requesterId || rp.requesterId || '-',
            bookedByName: item.requesterName || rp.name || '-',
            department: item.requesterDepartment || rp.department || '',
            destination: rp.destination || '',
            purpose: Array.isArray(rp.purpose) ? rp.purpose.filter(p => p).join(', ') : (rp.purpose || ''),
            passengers: rp.passengers || [],
            companions: rp.companions || [],
            note: rp.note || '',
            status: 'booked',
            vehicleStatus: 'pending',
            chainId: item.chainId,
            createdAt: Timestamp.now(),
          });
        } catch (err) { console.error('Save vehicle booking error:', err); }
      }

      // สร้าง step ถัดไป + ส่ง email
      const step = item.step || 1;
      const route = WORKFLOW_ROUTES[item.sourceForm];
      const maxSteps = route ? route.steps : 3;

      if (step < maxSteps) {
        const nextStep = step + 1;

        // หา department + label ตาม route
        let nextDept, nextStepLabel, nextTargetType;
        if (route) {
          if (nextStep === 2) {
            nextDept = route.step2 === 'HR' ? HR_DEPARTMENT : route.step2;
            nextStepLabel = route.step2Label;
            nextTargetType = route.step2;
          } else if (nextStep === 3) {
            nextDept = route.step3 === 'SECURITY' ? SECURITY_DEPARTMENT : route.step3;
            nextStepLabel = route.step3Label;
            nextTargetType = route.step3;
          }
        } else {
          nextDept = nextStep === 2 ? HR_DEPARTMENT : SHOP_DEPARTMENT;
          nextStepLabel = STEP_LABEL[nextStep];
        }

        const nextItem = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          chainId: item.chainId,
          step: nextStep,
          totalSteps: maxSteps,
          stepLabel: nextStepLabel || STEP_LABEL[nextStep],
          topic: item.topic,
          sourceForm: item.sourceForm,
          requesterId: item.requesterId,
          requesterName: item.requesterName,
          requesterDepartment: item.requesterDepartment,
          department: nextDept,
          targetType: nextTargetType || null,
          requestPayload: item.requestPayload,
          status: 'pending',
          createdAt: item.createdAt,
          forwardedAt: now,
          acknowledgedAt: null,
          approvedBy: null,
          approvedSign: null,
          firestoreCreatedAt: Timestamp.now(),
        };

        const collRef = collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows');
        await addDoc(collRef, nextItem);

        // หา email ผู้อนุมัติคนถัดไป — รองรับ "ส่งหลายคน"
        let nextEmails = [];
        if (nextTargetType === 'GA' || nextDept === 'GA') {
          // GA: ส่งให้ทุกคนในทีม GA
          try {
            const gaSnap = await getDocs(
              query(collection(db, 'artifacts', appId, 'public', 'data', 'users'),
                where('role', '==', 'GA')),
            );
            nextEmails = gaSnap.docs
              .map(d => d.data())
              .filter(u => u.active !== false)
              .map(u => u.email)
              .filter(Boolean);
          } catch (e) { console.warn('Load GA team failed:', e); }
          if (nextEmails.length === 0 && SPECIAL_EMAILS.GA) nextEmails.push(SPECIAL_EMAILS.GA);
        } else if (nextTargetType && SPECIAL_EMAILS[nextTargetType]) {
          // ปลายทางพิเศษ: รปภ., ร้านกาแฟ, ร้านข้าว OT
          nextEmails = [SPECIAL_EMAILS[nextTargetType]];
        } else {
          // หัวหน้าแผนก (HR หรืออื่นๆ)
          const email = await getHeadEmail(nextDept);
          if (email) nextEmails = [email];
        }

        if (nextEmails.length > 0) {
          const approveUrl = buildApproveUrl(nextItem.id);
          const subject = `[SOC] ${item.topic} - รอ${nextStepLabel}เซ็นอนุมัติ`;
          await Promise.all(nextEmails.map(to => copyHtmlAndOpenOutlook({
            to,
            subject,
            formType: item.sourceForm || 'DEFAULT',
            data: item.requestPayload || {},
            approveUrl,
          }).catch(err => console.warn('send fail', to, err))));
        }
      }

      setDone(true);
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: 'sans-serif' }}>
        <p>กำลังโหลดเอกสาร...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center', padding: 40, background: '#fff', borderRadius: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.1)', maxWidth: 400 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <p style={{ fontSize: 16, color: '#666' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: 'sans-serif', background: '#f0fdf4' }}>
        <div style={{ textAlign: 'center', padding: 40, background: '#fff', borderRadius: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.1)', maxWidth: 400 }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontSize: 24, fontWeight: 900, color: '#166534' }}>อนุมัติสำเร็จ!</h2>
          <p style={{ color: '#666', fontSize: 14, marginTop: 8 }}>
            {(() => {
              const route = WORKFLOW_ROUTES[item.sourceForm];
              const maxSteps = route ? route.steps : 3;
              return item.step < maxSteps ? 'ระบบส่งเอกสารให้ผู้อนุมัติคนถัดไปแล้ว' : 'เอกสารผ่านการอนุมัติครบทุกขั้นตอน';
            })()}
          </p>
          <p style={{ color: '#999', fontSize: 12, marginTop: 16 }}>สามารถปิดหน้านี้ได้เลย</p>
        </div>
      </div>
    );
  }

  const payload = item.requestPayload || {};

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'sans-serif', padding: '12px', boxSizing: 'border-box', overflowX: 'hidden' }}>
      <div style={{ maxWidth: 600, margin: '0 auto', width: '100%' }}>
        {/* Header */}
        <div style={{ background: '#fff', borderRadius: 24, padding: 32, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', marginBottom: 20 }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ background: '#2563eb', color: '#fff', display: 'inline-block', padding: '8px 20px', borderRadius: 12, fontSize: 12, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase' }}>
              SOC Systems — ขั้นตอนที่ {item.step}/3
            </div>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 900, textAlign: 'center', margin: '0 0 4px' }}>{item.topic}</h1>
          <p style={{ textAlign: 'center', color: '#999', fontSize: 13 }}>{item.stepLabel}</p>
        </div>

        {/* Document - แสดงเอกสารเต็มรูปแบบ */}
        <div style={{ background: '#fff', borderRadius: 0, border: '2px solid #333', marginBottom: 20, overflow: 'hidden', maxWidth: '100%' }}>
          <div style={{ textAlign: 'center', padding: 18, borderBottom: '2px solid #333' }}>
            <h2 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 2px' }}>{
              item.sourceForm === 'VEHICLE_BOOKING' ? 'ใบขออนุญาตใช้รถ/จองรถ เพื่อปฏิบัติงาน' :
              item.sourceForm === 'DRINK_ORDER' ? 'แบบการสั่งเครื่องดื่มเพื่อลูกค้า' :
              item.sourceForm === 'FOOD_ORDER' ? 'แบบการสั่งอาหารเพื่อรับรองลูกค้า' :
              item.sourceForm === 'DRINK_FOOD_ORDER' ? 'แบบการสั่งเครื่องดื่มและอาหารเพื่อรับรองลูกค้า' :
              item.sourceForm === 'OUTING_REQUEST' ? 'ใบขออนุญาตออกนอกสถานที่' :
              item.sourceForm === 'GOODS_IN_OUT' ? 'ใบนำของเข้า-ออกบริษัท' :
              item.topic
            }</h2>
          </div>
          <div style={{ padding: '18px 22px', fontSize: 14 }}>
            {item.sourceForm === 'VEHICLE_BOOKING' ? (<>
              {/* 1. ผู้ขอใช้รถ */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#4f46e5', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 12 }}>1</span>
                <span style={{ fontWeight: 900, color: '#1e293b', fontSize: 14 }}>ผู้ขอใช้รถ</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
                <VCell label="ชื่อ-นามสกุล" value={payload.name} />
                <VCell label="รหัสพนักงาน" value={payload.requesterId || item.requesterId} />
                <VCell label="แผนก" value={payload.department || item.requesterDepartment} />
              </div>

              {/* 2. ผู้ร่วมเดินทาง */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 10, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#4f46e5', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 12 }}>2</span>
                <span style={{ fontWeight: 900, color: '#1e293b', fontSize: 14 }}>ผู้ร่วมเดินทาง ({(payload.passengers || []).length} คน)</span>
              </div>
              {(payload.passengers || []).length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: 8 }}>— ไม่มีผู้ร่วมเดินทาง —</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 14 }}>
                  <thead>
                    <tr style={{ background: '#eef2ff' }}>
                      <th style={{ border: '1px solid #e2e8f0', padding: '6px', width: 30, color: '#3730a3' }}>#</th>
                      <th style={{ border: '1px solid #e2e8f0', padding: '6px', color: '#3730a3' }}>ชื่อ-นามสกุล</th>
                      <th style={{ border: '1px solid #e2e8f0', padding: '6px', width: 120, color: '#3730a3' }}>รหัส</th>
                      <th style={{ border: '1px solid #e2e8f0', padding: '6px', width: 120, color: '#3730a3' }}>แผนก</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(payload.passengers || []).map((p, i) => (
                      <tr key={i}>
                        <td style={{ border: '1px solid #e2e8f0', padding: '5px', textAlign: 'center' }}>{i + 1}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: '5px' }}>{p.name || '-'}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: '5px', textAlign: 'center', fontFamily: 'monospace' }}>{p.empId || '-'}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: '5px' }}>{p.dept || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* 3. วัน-เวลา */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 10, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#4f46e5', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 12 }}>3</span>
                <span style={{ fontWeight: 900, color: '#1e293b', fontSize: 14 }}>วันและเวลา</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
                <VCell label="วันที่ขอใช้รถ" value={payload.date} />
                <VCell label="เวลาออก" value={payload.timeStart ? `${payload.timeStart} น.` : ''} />
                <VCell label="เวลากลับ" value={payload.timeEnd ? `${payload.timeEnd} น.` : ''} />
              </div>

              {/* 4. เส้นทาง */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 10, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#4f46e5', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 12 }}>4</span>
                <span style={{ fontWeight: 900, color: '#1e293b', fontSize: 14 }}>เส้นทาง</span>
              </div>
              {(() => {
                const routes = Array.isArray(payload.routes) && payload.routes.length > 0
                  ? payload.routes
                  : (payload.destination ? [{ origin: '-', destination: payload.destination }] : []);
                return routes.length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: 8 }}>— ไม่ระบุ —</div>
                ) : routes.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
                    <span style={{ color: '#16a34a' }}>🟢 {r.origin || '-'}</span>
                    <span style={{ color: '#6366f1', fontWeight: 900 }}>→</span>
                    <span style={{ color: '#dc2626' }}>🔴 {r.destination || '-'}</span>
                  </div>
                ));
              })()}

              {/* 5. วัตถุประสงค์ */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 10, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#4f46e5', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 12 }}>5</span>
                <span style={{ fontWeight: 900, color: '#1e293b', fontSize: 14 }}>วัตถุประสงค์การใช้รถ</span>
              </div>
              {(() => {
                const opts = [
                  { code: '5.1', label: 'ติดต่องานบริษัท' },
                  { code: '5.2', label: 'ไปต่างจังหวัด' },
                  { code: '5.3', label: 'รับ-ส่งลูกค้า' },
                  { code: '5.4', label: 'บริเวณในโรงงาน' },
                  { code: '5.5', label: 'อื่นๆ' },
                ];
                const selectedCode = (payload.purpose || '').toString().trim().slice(0, 3);
                const detail = (payload.purpose || '').toString().includes(':')
                  ? (payload.purpose || '').split(':').slice(1).join(':').trim()
                  : '';
                return (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                      {opts.map((o) => {
                        const on = selectedCode === o.code;
                        return (
                          <div key={o.code} style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, background: on ? '#4f46e5' : '#fff', color: on ? '#fff' : '#1e293b', fontWeight: on ? 700 : 400 }}>
                            <b>{o.code}</b> {o.label}
                          </div>
                        );
                      })}
                    </div>
                    {detail && (
                      <div style={{ marginTop: 8, padding: 10, background: '#eef2ff', borderLeft: '3px solid #6366f1', borderRadius: 6, fontSize: 13 }}>
                        <b>รายละเอียด:</b> {detail}
                      </div>
                    )}
                  </>
                );
              })()}

              {/* 6. การขับรถ */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 10, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#4f46e5', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 12 }}>6</span>
                <span style={{ fontWeight: 900, color: '#1e293b', fontSize: 14 }}>การขับรถ</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {(() => {
                  const opt = payload.drivingOption || (payload.driveSelf ? '6.1' : payload.needDriver ? '6.2' : '');
                  return (
                    <>
                      <div style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, background: opt === '6.1' ? '#4f46e5' : '#fff', color: opt === '6.1' ? '#fff' : '#1e293b', fontWeight: opt === '6.1' ? 700 : 400 }}>🚗 <b>6.1</b> ต้องการขับเอง</div>
                      <div style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, background: opt === '6.2' ? '#4f46e5' : '#fff', color: opt === '6.2' ? '#fff' : '#1e293b', fontWeight: opt === '6.2' ? 700 : 400 }}>👤 <b>6.2</b> ต้องการใช้พนักงานขับรถให้</div>
                    </>
                  );
                })()}
              </div>

              {payload.approvedCarNo && (
                <div style={{ marginTop: 14, padding: 12, background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 8 }}>
                  <p style={{ margin: 0, color: '#065f46', fontWeight: 900, fontSize: 13 }}>✓ รถที่อนุมัติแล้ว</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginTop: 6 }}>
                    <VCell label="ทะเบียนรถ" value={payload.approvedCarNo} />
                    {payload.driver && <VCell label="พนักงานขับรถ" value={payload.driver} />}
                  </div>
                </div>
              )}
            </>) : item.sourceForm === 'DRINK_ORDER' || item.sourceForm === 'FOOD_ORDER' ? (<>
              <DocField label="ผู้รับผิดชอบ" value={payload.responsiblePerson} />
              <div style={{ display: 'flex', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, minWidth: 120, flexShrink: 0 }}>รหัสพนักงาน:</span><span>{payload.employeeId || '-'}</span>
                <span style={{ fontWeight: 700 }}>แผนก:</span><span>{payload.department || '-'}</span>
              </div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, minWidth: 120, flexShrink: 0 }}>วันที่สั่ง:</span><span>{payload.orderDate || '-'}</span>
                <span style={{ fontWeight: 700 }}>เวลา:</span><span>{payload.orderTime || '-'}</span>
              </div>
              {(() => {
                const rows = (payload.rows || []).filter(r => r.details);
                if (rows.length === 0) return null;
                const hasPrice = rows.some(r => r.unitPrice != null || r.lineTotal != null);
                const grand = typeof payload.totalAmount === 'number' ? payload.totalAmount : rows.reduce((s, r) => s + (Number(r.lineTotal) || 0), 0);
                const cellCenter = { border: '1px solid #999', padding: '5px 8px', textAlign: 'center' };
                const cell = { border: '1px solid #999', padding: '5px 8px' };
                const cellRight = { border: '1px solid #999', padding: '5px 8px', textAlign: 'right' };
                const thStyle = { border: '1px solid #999', padding: '5px 8px', background: '#f5f5f5', fontWeight: 700 };
                const fmtPrice = (v) => v == null ? '-' : `฿${Number(v).toLocaleString()}`;
                return (
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10, fontSize: 13 }}>
                    <thead>
                      <tr>
                        {(hasPrice
                          ? ['ลำดับ', 'รายการ', 'เงื่อนไข', 'จำนวน', 'ราคา/หน่วย', 'รวม']
                          : ['ลำดับ', 'รายการ', 'จำนวน', 'เงื่อนไข']
                        ).map(h => <th key={h} style={thStyle}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => hasPrice ? (
                        <tr key={i}>
                          <td style={cellCenter}>{i + 1}</td>
                          <td style={cell}>{r.details}</td>
                          <td style={cell}>{r.condition || '-'}</td>
                          <td style={cellCenter}>{r.count || '-'}</td>
                          <td style={cellRight}>{fmtPrice(r.unitPrice)}</td>
                          <td style={{ ...cellRight, fontWeight: 700 }}>{fmtPrice(r.lineTotal)}</td>
                        </tr>
                      ) : (
                        <tr key={i}>
                          <td style={cellCenter}>{i + 1}</td>
                          <td style={cell}>{r.details}</td>
                          <td style={cellCenter}>{r.count || '-'}</td>
                          <td style={cell}>{r.condition || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                    {hasPrice && (
                      <tfoot>
                        <tr style={{ background: '#fef3c7' }}>
                          <td colSpan={5} style={{ ...cellRight, fontWeight: 700, fontSize: 14 }}>💰 รวมทั้งหมด</td>
                          <td style={{ ...cellRight, fontWeight: 900, fontSize: 14, color: '#b45309' }}>฿{grand.toLocaleString()}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                );
              })()}
              {payload.note && <DocField label="หมายเหตุ" value={payload.note} />}
              {payload.ordererSign && (
                <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid #ccc' }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>ลายเซ็นผู้สั่ง:</span>
                  <div><img src={payload.ordererSign} alt="signature" style={{ height: 48, objectFit: 'contain', marginTop: 4 }} /></div>
                </div>
              )}
            </>) : item.sourceForm === 'DRINK_FOOD_ORDER' ? (<>
              <DocField label="ผู้รับผิดชอบ" value={payload.responsiblePerson} />
              <div style={{ display: 'flex', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, minWidth: 120, flexShrink: 0 }}>รหัสพนักงาน:</span><span>{payload.employeeId || '-'}</span>
                <span style={{ fontWeight: 700 }}>แผนก:</span><span>{payload.department || '-'}</span>
              </div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, minWidth: 120, flexShrink: 0 }}>วันที่สั่ง:</span><span>{payload.orderDate || '-'}</span>
                <span style={{ fontWeight: 700 }}>เวลา:</span><span>{payload.orderTime || '-'}</span>
              </div>
              {(() => {
                const drinkRows = payload.drinkRows || [];
                const foodRows = payload.foodRows || [];
                const hasAny = drinkRows.length > 0 || foodRows.length > 0;
                if (!hasAny) return null;
                const dTotal = typeof payload.drinkTotalAmount === 'number' ? payload.drinkTotalAmount : 0;
                const fTotal = typeof payload.foodTotalAmount === 'number' ? payload.foodTotalAmount : 0;
                const grand = dTotal + fTotal;
                const fmtPrice = (v) => v == null ? '-' : `฿${Number(v).toLocaleString()}`;
                const cellCenter = { border: '1px solid #999', padding: '5px 8px', textAlign: 'center' };
                const cell = { border: '1px solid #999', padding: '5px 8px' };
                const cellRight = { border: '1px solid #999', padding: '5px 8px', textAlign: 'right' };
                const thStyle = { border: '1px solid #999', padding: '5px 8px', background: '#f5f5f5', fontWeight: 700, fontSize: 13 };
                return (
                  <div style={{ marginTop: 12 }}>
                    <p style={{ fontWeight: 700, margin: '0 0 4px', color: '#1f2937' }}>📦 รายการที่สั่ง</p>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr>
                          {['ลำดับ', 'ประเภท', 'รายการ', 'เงื่อนไข', 'จำนวน', 'ราคา/หน่วย', 'รวม'].map(h => (
                            <th key={h} style={thStyle}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {drinkRows.map((r, i) => (
                          <tr key={`d-${i}`}>
                            <td style={cellCenter}>{i + 1}</td>
                            <td style={cellCenter}>☕ น้ำ</td>
                            <td style={cell}>{r.details}</td>
                            <td style={cell}>{r.condition || '-'}</td>
                            <td style={cellCenter}>{r.count || '-'}</td>
                            <td style={cellRight}>{fmtPrice(r.unitPrice)}</td>
                            <td style={{ ...cellRight, fontWeight: 700 }}>{fmtPrice(r.lineTotal)}</td>
                          </tr>
                        ))}
                        {foodRows.map((r, i) => (
                          <tr key={`f-${i}`}>
                            <td style={cellCenter}>{drinkRows.length + i + 1}</td>
                            <td style={cellCenter}>🍛 ข้าว</td>
                            <td style={cell}>{r.details}</td>
                            <td style={cell}>{r.condition || '-'}</td>
                            <td style={cellCenter}>{r.count || '-'}</td>
                            <td style={cellRight}>{fmtPrice(r.unitPrice)}</td>
                            <td style={{ ...cellRight, fontWeight: 700 }}>{fmtPrice(r.lineTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: '#fef3c7' }}>
                          <td colSpan={6} style={{ ...cellRight, fontWeight: 700, fontSize: 14 }}>💰 รวมทั้งหมด</td>
                          <td style={{ ...cellRight, fontWeight: 900, fontSize: 14, color: '#b45309' }}>฿{grand.toLocaleString()}</td>
                        </tr>
                      </tfoot>
                    </table>
                    {(payload.drinkNote || payload.foodNote) && (
                      <div style={{ fontSize: 12, marginTop: 6, color: '#555' }}>
                        {payload.drinkNote && <div><b>หมายเหตุเครื่องดื่ม:</b> {payload.drinkNote}</div>}
                        {payload.foodNote && <div><b>หมายเหตุอาหาร:</b> {payload.foodNote}</div>}
                      </div>
                    )}
                  </div>
                );
              })()}
              {payload.ordererSign && (
                <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid #ccc' }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>ลายเซ็นผู้สั่ง:</span>
                  <div><img src={payload.ordererSign} alt="signature" style={{ height: 48, objectFit: 'contain', marginTop: 4 }} /></div>
                </div>
              )}
            </>) : item.sourceForm === 'OUTING_REQUEST' ? (<>
              <DocField label="ผู้อนุมัติ" value={payload.managerName} />
              <DocField label="ประเภท" value={payload.type} />
              <div style={{ display: 'flex', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, minWidth: 120, flexShrink: 0 }}>วันที่:</span><span>{payload.date || '-'}</span>
                <span style={{ fontWeight: 700 }}>จำนวนคน:</span><span>{payload.totalCount || '-'} คน</span>
              </div>
              {(payload.rows || []).filter(r => r.name).length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10, fontSize: 13 }}>
                  <thead><tr>{['ลำดับ','ชื่อ','ปลายทาง','เวลาออก','เวลากลับ'].map(h => <th key={h} style={{ border: '1px solid #999', padding: '5px 8px', background: '#f5f5f5', fontWeight: 700 }}>{h}</th>)}</tr></thead>
                  <tbody>{(payload.rows || []).filter(r => r.name).map((r, i) => <tr key={i}><td style={{ border: '1px solid #999', padding: '5px 8px', textAlign: 'center' }}>{i+1}</td><td style={{ border: '1px solid #999', padding: '5px 8px' }}>{r.name}</td><td style={{ border: '1px solid #999', padding: '5px 8px' }}>{r.destination || '-'}</td><td style={{ border: '1px solid #999', padding: '5px 8px' }}>{r.timeOut || '-'}</td><td style={{ border: '1px solid #999', padding: '5px 8px' }}>{r.timeIn || '-'}</td></tr>)}</tbody>
                </table>
              )}
            </>) : item.sourceForm === 'GOODS_IN_OUT' ? (<>
              <DocField label="ประเภท" value={payload.direction === 'IN' ? 'นำของเข้า' : 'นำของออก'} />
              <DocField label="จุดประตู" value={payload.gate} />
              {payload.docNo && <DocField label="เลขที่เอกสาร/ใบนำของ" value={payload.docNo} />}
              <DocField label="ผู้นำของ / ผู้รับผิดชอบ" value={payload.carrierName} />
              <div style={{ display: 'flex', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, minWidth: 120, flexShrink: 0 }}>รหัสพนักงาน:</span><span>{payload.staffId || '-'}</span>
                <span style={{ fontWeight: 700 }}>แผนก:</span><span>{payload.dept || '-'}</span>
              </div>
              {payload.vehiclePlate && <DocField label="ทะเบียนรถ" value={payload.vehiclePlate} />}
              {payload.sealNo && <DocField label="เลข Seal" value={payload.sealNo} />}
              {payload.deliveryDate && <DocField label="วันที่รับ/ส่งสินค้า" value={payload.deliveryDate} />}
              {payload.deliveryTime && <DocField label="เวลารับ/ส่ง" value={payload.deliveryTime} />}
              {(payload.lines || []).filter(l => l.description).length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10, fontSize: 13 }}>
                  <thead><tr>{['ลำดับ','รายการ','จำนวน','หน่วย'].map(h => <th key={h} style={{ border: '1px solid #999', padding: '5px 8px', background: '#f5f5f5', fontWeight: 700 }}>{h}</th>)}</tr></thead>
                  <tbody>{(payload.lines || []).filter(l => l.description).map((l, i) => <tr key={i}><td style={{ border: '1px solid #999', padding: '5px 8px', textAlign: 'center' }}>{i+1}</td><td style={{ border: '1px solid #999', padding: '5px 8px' }}>{l.description}</td><td style={{ border: '1px solid #999', padding: '5px 8px', textAlign: 'center' }}>{l.qty || '-'}</td><td style={{ border: '1px solid #999', padding: '5px 8px' }}>{l.unit || '-'}</td></tr>)}</tbody>
                </table>
              )}
              {/* แสดงรูปชิ้นงาน */}
              {(payload.lines || []).some(l => (l.photos || []).length > 0) && (
                <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid #ccc' }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>รูปชิ้นงาน:</span>
                  {(payload.lines || []).map((l, li) => (l.photos || []).length > 0 ? (
                    <div key={li} style={{ marginTop: 8 }}>
                      <span style={{ fontSize: 12, color: '#666' }}>รายการ {li+1}: {l.description || '-'}</span>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                        {(l.photos || []).map((src, pi) => (
                          <img key={pi} src={src} alt={`รูปชิ้นงาน ${li+1}-${pi+1}`} style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid #ddd', cursor: 'pointer' }} onClick={() => window.open(src, '_blank')} />
                        ))}
                      </div>
                    </div>
                  ) : null)}
                </div>
              )}
              {/* ลายเซ็นผู้นำของ */}
              {payload.carrierSign && (
                <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid #ccc' }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>ลายเซ็นผู้นำของ:</span>
                  <div style={{ marginTop: 6 }}>
                    <img src={payload.carrierSign} alt="ลายเซ็นผู้นำของ" style={{ maxWidth: 200, maxHeight: 100, border: '1px solid #ddd', borderRadius: 8 }} />
                  </div>
                </div>
              )}
              {payload.note && <DocField label="หมายเหตุ" value={payload.note} />}
            </>) : (<>
              <DocField label="ผู้ขอ" value={item.requesterName} />
              <DocField label="รหัสพนักงาน" value={item.requesterId} />
              <DocField label="แผนก" value={item.requesterDepartment} />
              {payload.destination && <DocField label="ปลายทาง" value={payload.destination} />}
              {payload.note && <DocField label="หมายเหตุ" value={payload.note} />}
            </>)}
          </div>
        </div>

        {/* GA Vehicle Assignment — เฉพาะ VEHICLE_BOOKING step GA */}
        {item.sourceForm === 'VEHICLE_BOOKING' && item.targetType === 'GA' && (
          <div style={{ background: '#fff', borderRadius: 24, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', marginBottom: 20, maxWidth: '100%', boxSizing: 'border-box' }}>
            <h3 style={{ fontSize: 16, fontWeight: 900, color: '#b45309', marginBottom: 4 }}>🚗 จัดรถให้พนักงาน</h3>
            <p style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>
              พนักงานต้องการ: <strong style={{ color: payload.needDriver ? '#dc2626' : '#16a34a' }}>{payload.needDriver ? '🧑‍✈️ ต้องการคนขับ' : '🚘 ขับเอง'}</strong>
              {' | '} วันที่: <strong>{payload.date || '-'}</strong>
              {' | '} เวลา: <strong>{payload.timeStart || '-'} - {payload.timeEnd || '-'}</strong>
            </p>

            {/* Toggle: ไม่มีรถ */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '10px 14px', borderRadius: 12, border: gaNoVehicle ? '2px solid #dc2626' : '2px solid #e5e7eb', background: gaNoVehicle ? '#fef2f2' : '#fff' }}>
                <input type="checkbox" checked={gaNoVehicle} onChange={e => { setGaNoVehicle(e.target.checked); if (e.target.checked) { setGaSelectedVehicle(null); setGaSelectedDriver(null); } }} />
                <span style={{ fontWeight: 700, color: gaNoVehicle ? '#dc2626' : '#374151' }}>❌ ไม่มีรถให้ใช้งาน (แจ้งพนักงานใช้รถส่วนตัว)</span>
              </label>
            </div>

            {!gaNoVehicle && (
              <>
                {/* เลือกรถ */}
                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 800, color: '#374151', marginBottom: 8 }}>เลือกรถ *</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
                    {gaVehicles.map(v => {
                      const booked = isVehicleBookedGA(v.id);
                      const isMaint = v.status === 'maintenance' || v.status === 'unavailable';
                      const selected = gaSelectedVehicle?.id === v.id;
                      const clickable = !booked && !isMaint;
                      return (
                        <div key={v.id}
                          onClick={() => clickable && setGaSelectedVehicle(v)}
                          style={{
                            border: selected ? '2px solid #2563eb' : booked ? '2px solid #fca5a5' : isMaint ? '2px solid #fbbf24' : '2px solid #86efac',
                            borderRadius: 12, padding: 10, cursor: clickable ? 'pointer' : 'not-allowed',
                            background: selected ? '#eff6ff' : booked ? '#fef2f2' : isMaint ? '#fefce8' : '#f0fdf4',
                            opacity: clickable ? 1 : 0.5, transition: 'all 0.15s',
                          }}
                        >
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{v.brand}</div>
                          <div style={{ fontSize: 12, color: '#6b7280', fontFamily: 'monospace' }}>{v.plate}</div>
                          <div style={{ fontSize: 10, color: '#9ca3af' }}>{v.type} | {v.seats} ที่นั่ง</div>
                          <div style={{ fontSize: 10, fontWeight: 700, marginTop: 4, color: booked ? '#dc2626' : isMaint ? '#d97706' : selected ? '#2563eb' : '#16a34a' }}>
                            {booked ? 'จองแล้ว' : isMaint ? 'ซ่อมบำรุง' : selected ? '✓ เลือกแล้ว' : 'ว่าง'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {gaSelectedVehicle && (
                    <div style={{ marginTop: 8, padding: '8px 12px', background: '#eff6ff', borderRadius: 8, fontSize: 13 }}>
                      ✅ เลือก: <strong>{gaSelectedVehicle.brand} {gaSelectedVehicle.plate}</strong>
                    </div>
                  )}
                </div>

                {/* เลือกคนขับ — แสดงเฉพาะเมื่อพนักงานต้องการคนขับ */}
                {(payload.needDriver || payload.drivingOption === '6.2') && (
                  <div>
                    <h4 style={{ fontSize: 13, fontWeight: 800, color: '#374151', marginBottom: 8 }}>เลือกคนขับ *</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                      {gaDrivers.map(d => {
                        const booked = isDriverBookedGA(d.id);
                        const selected = gaSelectedDriver?.id === d.id;
                        const clickable = !booked && d.status === 'available';
                        return (
                          <div key={d.id}
                            onClick={() => clickable && setGaSelectedDriver(d)}
                            style={{
                              border: selected ? '2px solid #2563eb' : booked ? '2px solid #fca5a5' : '2px solid #86efac',
                              borderRadius: 12, padding: 10, cursor: clickable ? 'pointer' : 'not-allowed',
                              background: selected ? '#eff6ff' : booked ? '#fef2f2' : '#f0fdf4',
                              opacity: clickable ? 1 : 0.5, transition: 'all 0.15s',
                            }}
                          >
                            <div style={{ fontWeight: 700, fontSize: 13 }}>🧑‍✈️ {d.name} {d.licenseType && <span style={{ fontSize: 10, padding: '1px 6px', background: '#e0e7ff', color: '#4338ca', borderRadius: 4, marginLeft: 4 }}>{d.licenseType}</span>}</div>
                            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>📞 <b>{d.phone || '-'}</b></div>
                            {d.phoneBackup && (
                              <div style={{ fontSize: 11, color: '#94a3b8' }}>📱 สำรอง: {d.phoneBackup}</div>
                            )}
                            <div style={{ fontSize: 10, fontWeight: 700, marginTop: 4, color: booked ? '#dc2626' : selected ? '#2563eb' : '#16a34a' }}>
                              {booked ? 'ไม่ว่าง' : selected ? '✓ เลือกแล้ว' : 'ว่าง'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {gaSelectedDriver && (
                      <div style={{ marginTop: 8, padding: '10px 12px', background: '#eff6ff', borderRadius: 8, fontSize: 13, lineHeight: 1.6 }}>
                        ✅ คนขับ: <strong>{gaSelectedDriver.name}</strong>
                        <br />📞 หลัก: <b>{gaSelectedDriver.phone || '-'}</b>
                        {gaSelectedDriver.phoneBackup && <> &nbsp;|&nbsp; 📱 สำรอง: <b>{gaSelectedDriver.phoneBackup}</b></>}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Signature Area - แค่เซ็นแล้วกดอนุมัติ */}
        <div style={{ background: '#fff', borderRadius: 24, padding: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', maxWidth: '100%', boxSizing: 'border-box' }}>
          <h3 style={{ fontSize: 15, fontWeight: 900, color: '#1e40af', marginBottom: 16, textAlign: 'center' }}>ลงลายเซ็นอนุมัติ</h3>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#666', display: 'block', marginBottom: 6 }}>ลายเซ็น *</label>

            {/* ปุ่มเลือกลายเซ็น */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              {savedSignatures.length > 0 && (
                <button
                  onClick={() => setShowSavedPicker(!showSavedPicker)}
                  style={{ padding: '10px 18px', fontSize: 14, fontWeight: 700, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  ✍️ เลือกลายเซ็นที่บันทึกไว้ ({savedSignatures.length})
                </button>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{ padding: '10px 18px', fontSize: 14, fontWeight: 700, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                📁 อัปโหลดรูปลายเซ็น
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUploadSign} />
            </div>

            {/* แสดงลายเซ็นที่บันทึกไว้ */}
            {showSavedPicker && savedSignatures.length > 0 && (
              <div style={{ background: '#f8fafc', border: '2px solid #e2e8f0', borderRadius: 12, padding: 12, marginBottom: 10 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#999', marginBottom: 8 }}>กดเลือกลายเซ็น:</p>
                <div style={{ display: 'grid', gap: 8 }}>
                  {savedSignatures.map((sig, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', padding: 10, borderRadius: 10, border: '1px solid #e2e8f0', cursor: 'pointer' }} onClick={() => selectSavedSignature(sig)}>
                      <img src={sig.dataUrl} alt="sig" style={{ width: 120, height: 50, objectFit: 'contain', background: '#fafafa', borderRadius: 6, border: '1px solid #eee' }} />
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{sig.name}</p>
                        <p style={{ fontSize: 11, color: '#999', margin: 0 }}>{sig.date}</p>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); deleteSavedSignature(idx); }} style={{ padding: '4px 10px', fontSize: 11, background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, cursor: 'pointer' }}>ลบ</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Canvas วาดลายเซ็น */}
            <p style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>หรือวาดด้วยนิ้ว/เมาส์:</p>
            <canvas
              ref={canvasRef}
              width={500}
              height={150}
              style={{ border: '2px solid #e2e8f0', borderRadius: 12, width: '100%', maxWidth: '100%', height: 'auto', minHeight: 120, touchAction: 'none', background: '#fafafa', cursor: 'crosshair' }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={clearSign} style={{ padding: '6px 16px', fontSize: 12, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer' }}>
                ล้างลายเซ็น
              </button>
              {signDataUrl && (
                <button onClick={saveCurrentSignature} style={{ padding: '6px 16px', fontSize: 12, background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
                  💾 บันทึกลายเซ็นนี้ไว้ใช้ครั้งหน้า
                </button>
              )}
            </div>
          </div>

          {/* Quick Approve — ลายเซ็นเด้ง กดปุ่มเดียวจบ */}
          {savedSignatures.length > 0 && !signDataUrl && (
            <div style={{ background: '#ecfdf5', border: '2px solid #a7f3d0', borderRadius: 16, padding: 16, marginTop: 12, marginBottom: 12 }}>
              <p style={{ fontSize: 13, fontWeight: 900, color: '#059669', marginBottom: 10, textAlign: 'center' }}>⚡ อนุมัติด่วน — กดปุ่มเดียวจบ</p>
              <div style={{ display: 'grid', gap: 8 }}>
                {savedSignatures.map((sig, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleQuickApprove(sig)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', padding: '12px 16px', borderRadius: 12, border: '2px solid #d1fae5', cursor: 'pointer', width: '100%', textAlign: 'left', transition: 'all 0.2s' }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = '#16a34a'; e.currentTarget.style.background = '#f0fdf4'; }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = '#d1fae5'; e.currentTarget.style.background = '#fff'; }}
                  >
                    <img src={sig.dataUrl} alt="sig" style={{ width: 80, height: 35, objectFit: 'contain', background: '#fafafa', borderRadius: 6, border: '1px solid #eee' }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 14, fontWeight: 900, margin: 0, color: '#166534' }}>{sig.name}</p>
                      <p style={{ fontSize: 10, color: '#999', margin: 0 }}>{new Date().toLocaleDateString('th-TH')} — กด Approve ทันที</p>
                    </div>
                    <span style={{ fontSize: 24 }}>✅</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleApprove}
            style={{ width: '100%', padding: 16, fontSize: 18, fontWeight: 900, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 16, cursor: 'pointer', marginTop: 12, minHeight: 48 }}
          >
            ✓ อนุมัติเอกสาร
          </button>

          <p style={{ textAlign: 'center', fontSize: 11, color: '#999', marginTop: 12 }}>
            หลังอนุมัติ ระบบจะส่งเอกสารให้ผู้อนุมัติคนถัดไปอัตโนมัติ
          </p>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 14 }}>
      <span style={{ color: '#999', minWidth: 130 }}>{label}</span>
      <span style={{ fontWeight: 700, color: '#1a1a1a' }}>{value || '-'}</span>
    </div>
  );
}

function CheckItem({ checked, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
      <span style={{ width: 16, height: 16, border: '2px solid #333', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, background: checked ? '#2563eb' : '#fff', color: checked ? '#fff' : 'transparent', borderColor: checked ? '#2563eb' : '#333' }}>
        {checked ? '✓' : ''}
      </span>
      <span>{label}</span>
    </div>
  );
}

function DocField({ label, value }) {
  return (
    <div style={{ marginBottom: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      <span style={{ fontWeight: 700, minWidth: 120, flexShrink: 0 }}>{label}:</span>
      <span style={{ borderBottom: '1px dotted #999', flex: 1, minWidth: 0, paddingBottom: 1, wordBreak: 'break-word' }}>{value || '-'}</span>
    </div>
  );
}

// Vehicle new-design cell (indigo theme)
function VCell({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 3, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ padding: '8px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, minHeight: 18 }}>{value || '-'}</div>
    </div>
  );
}
