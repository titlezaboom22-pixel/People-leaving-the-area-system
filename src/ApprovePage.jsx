import React, { useState, useRef, useEffect } from 'react';
import { collection, query, where, getDocs, getDoc, doc, updateDoc, addDoc, Timestamp, onSnapshot } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { db, auth, firebaseReady, appId } from './firebase';
import { HR_DEPARTMENT, SHOP_DEPARTMENT, SECURITY_DEPARTMENT, STEP_LABEL, WORKFLOW_ROUTES, SPECIAL_EMAILS } from './constants';
import { getHeadEmail, copyHtmlAndOpenOutlook, buildApproveUrl, sendPushToUser } from './emailHelper';
import { rejectNotification } from './approvalNotifications';
import { notifyGAVehicleRequest } from './notifyEmail';
import { authenticateUser } from './authService';

/**
 * หน้าอนุมัติเอกสาร — เปิดจากลิงก์ใน Outlook โดยไม่ต้อง login
 * URL: /index.html?approve=WORKFLOW_ID
 */
// 🔐 Session helper — load login session
function loadApproveSession() {
  try {
    const raw = sessionStorage.getItem('soc_login');
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (Date.now() - s.ts > 30 * 60 * 1000) { sessionStorage.removeItem('soc_login'); return null; }
    return s;
  } catch { return null; }
}
function saveApproveSession(identity, role) {
  try { sessionStorage.setItem('soc_login', JSON.stringify({ identity, role, ts: Date.now() })); } catch {}
}

export default function ApprovePage({ workflowId }) {
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signDataUrl, setSignDataUrl] = useState('');
  const [approverName, setApproverName] = useState('');
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savedSignatures, setSavedSignatures] = useState([]);
  const [showSavedPicker, setShowSavedPicker] = useState(false);
  const [chainSteps, setChainSteps] = useState([]);  // ทุก step ของ chain เดียวกัน — ใช้แสดงลายเซ็น
  const [approverCandidates, setApproverCandidates] = useState([]); // รายชื่อผู้อนุมัติที่ระบบส่งให้ — เลือกตัวเอง
  const [selectedCandidateId, setSelectedCandidateId] = useState(''); // ID ของคนที่กำลังอนุมัติ
  // 🔐 Login session
  const [loginSession, setLoginSession] = useState(() => loadApproveSession());
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  // GA vehicle assignment state
  const [gaVehicles, setGaVehicles] = useState([]);
  const [gaDrivers, setGaDrivers] = useState([]);
  const [gaDateBookings, setGaDateBookings] = useState([]);
  const [gaDriverBookings, setGaDriverBookings] = useState([]);
  const [gaSelectedVehicle, setGaSelectedVehicle] = useState(null);
  const [gaSelectedDriver, setGaSelectedDriver] = useState(null);
  const [gaNoVehicle, setGaNoVehicle] = useState(false);
  // Reject state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejected, setRejected] = useState(false);

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
        setError('ไม่พบเอกสารนี้ในระบบ');
      } else {
        const data = snap.docs[0].data();
        if (data.status === 'approved') {
          // เก็บข้อมูลของผู้ที่อนุมัติแล้ว เพื่อแสดงใน error page
          setItem({ ...data, _docId: snap.docs[0].id, _alreadyApproved: true });
          setError('ALREADY_APPROVED');
        } else if (data.status === 'rejected') {
          setItem({ ...data, _docId: snap.docs[0].id, _alreadyRejected: true });
          setError('ALREADY_REJECTED');
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

  // โหลดรายชื่อผู้อนุมัติที่อาจเป็นเจ้าของลิงก์นี้ — เพื่อให้เลือก "ฉันคือใคร?"
  useEffect(() => {
    if (!item) { setApproverCandidates([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const isGAStep = item.targetType === 'GA';
        const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
        let snap;
        if (isGAStep) {
          // 🔧 FIX: GA team อาจอยู่แผนกอื่นแต่ดูแล GA (headOfAlsoDepartments มี 'GA')
          // → โหลดทั้งหมดมาแล้ว filter ฝั่ง client เพื่อรองรับ multi-dept heads
          snap = await getDocs(usersRef);
        } else {
          // Head — query HEAD ใน department เดียวกับผู้ขอ + Lv.2-8
          snap = await getDocs(query(usersRef, where('roleType', '==', 'HEAD')));
        }
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        let candidates = [];
        if (isGAStep) {
          // กรอง: role=GA + (department=GA หรือ headOfAlsoDepartments มี GA)
          const norm = (s) => (s || '').toString().toUpperCase().replace(/[^A-Z0-9ก-๙]/g, '');
          const targetGA = norm('GA');
          candidates = all.filter(u => {
            if (u.active === false) return false;
            if ((u.role || '').toUpperCase() !== 'GA') return false;
            const primary = norm(u.department) === targetGA;
            const additional = Array.isArray(u.headOfAlsoDepartments) ? u.headOfAlsoDepartments : [];
            const additionalMatch = additional.some(d => norm(d) === targetGA);
            return primary || additionalMatch;
          });
        } else {
          // Filter Lv.2-8 + same department as requester (with normalization)
          const normalize = (s) => (s || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
          const reqDeptN = normalize(item.requesterDepartment || item.dept || '');
          const reqShort = reqDeptN.split(' ')[0];
          candidates = all.filter(u => {
            if (u.active === false) return false;
            const lv = Number(u.approvalLevel || 0);
            if (lv < 3 || lv > 8) return false;  // Lv.3-8 (GM ถึง Supervisor)
            const ud = normalize(u.department);
            if (ud === reqDeptN) return true;
            if (reqShort && (ud.startsWith(reqShort) || reqDeptN.startsWith(ud.split(' ')[0]))) return true;
            // EEE alias ↔ EMPLOYEEEXPERIENCE...
            if ((reqShort === 'EEE' && ud.startsWith('EMPLOYEEEXPERIENCE')) ||
                (ud === 'EEE' && reqDeptN.startsWith('EMPLOYEEEXPERIENCE'))) return true;
            return false;
          });
        }
        candidates.sort((a, b) => (Number(a.approvalLevel) || 99) - (Number(b.approvalLevel) || 99));
        if (!cancelled) {
          setApproverCandidates(candidates);

          // 🔐 PRIORITY 1: ถ้า login อยู่ → ใช้ identity จาก session (ปลอดภัยที่สุด)
          if (loginSession?.identity?.staffId) {
            const sessionUser = candidates.find(u => (u.id || '').toUpperCase() === loginSession.identity.staffId.toUpperCase());
            if (sessionUser) {
              setSelectedCandidateId(sessionUser.id);
              setApproverName(sessionUser.name || sessionUser.displayName || loginSession.identity.displayName || '');
              console.log(`[ApprovePage] Identified via Login session: ${sessionUser.name}`);
              return;
            }
          }

          // PRIORITY 2: Auto-detect จาก ?as=email (ถ้าไม่ได้ login)
          const urlParams = new URLSearchParams(window.location.search);
          const asEmail = urlParams.get('as');
          if (asEmail) {
            const matched = candidates.find(u => u.email?.toLowerCase() === asEmail.toLowerCase());
            if (matched) {
              setSelectedCandidateId(matched.id);
              setApproverName(matched.name || matched.displayName || '');
              console.log(`[ApprovePage] Auto-detected user (URL): ${matched.name} (${matched.email})`);
              return;
            }
          }

          // Fallback: ถ้ามีคนเดียว → auto-select เลย
          if (candidates.length === 1) {
            setSelectedCandidateId(candidates[0].id);
            if (!approverName) setApproverName(candidates[0].name || candidates[0].displayName || '');
          }
        }
      } catch (e) {
        console.warn('Load approver candidates error:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [item]);

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

  // Auto-fill ลายเซ็นที่บันทึกไว้ล่าสุด เมื่อเปิดหน้า (ถ้ามี และยังไม่มีลายเซ็น)
  useEffect(() => {
    if (!item || signDataUrl || savedSignatures.length === 0) return;
    const latest = savedSignatures[savedSignatures.length - 1];
    if (!latest?.dataUrl) return;
    setSignDataUrl(latest.dataUrl);
    if (latest.name && !approverName) setApproverName(latest.name);
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
    img.src = latest.dataUrl;
  }, [item, savedSignatures]);

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

  // ปฏิเสธเอกสาร — ระบุเหตุผล + จบ workflow
  const handleReject = async () => {
    if (submitting) return;
    if (!item) return;
    // 🔐 บังคับ Login ก่อนปฏิเสธ — เก็บ audit ว่าใครปฏิเสธ
    if (!loginSession?.identity?.staffId) {
      setShowRejectModal(false);
      setShowLoginPrompt(true);
      return;
    }
    const reason = rejectReason.trim();
    if (!reason) {
      alert('กรุณาระบุเหตุผลในการปฏิเสธ');
      return;
    }
    setSubmitting(true);
    try {
      // ใช้ approverName ถ้ามี ไม่งั้นใช้ stepLabel
      const rejectedBy = approverName.trim() || item.stepLabel || 'ผู้อนุมัติ';
      const rejectedByRole = item.targetType === 'GA' ? 'GA' : (item.stepLabel || '');
      await rejectNotification(item.id, {
        rejectedBy,
        rejectedByRole,
        rejectReason: reason,
      });
      // แจ้งผู้ขอผ่าน FCM push (เผื่อไม่ได้ดูอีเมล)
      try {
        if (item.requesterId) {
          sendPushToUser(item.requesterId, {
            title: '❌ เอกสารถูกปฏิเสธ',
            body: `${item.topic || 'เอกสาร'} — ${reason.slice(0, 80)}`,
            clickUrl: '/',
          }).catch(() => {});
        }
      } catch {}
      setShowRejectModal(false);
      setRejected(true);
    } catch (err) {
      alert('ไม่สามารถปฏิเสธเอกสารได้: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Quick Approve — ใช้ลายเซ็นที่บันทึกไว้ กดปุ่มเดียวจบ
  const handleQuickApprove = async (sig) => {
    if (!item || submitting) return;
    // ✅ ต้องมีการเลือก "ฉันคือใคร?" ก่อน
    const finalName = approverName.trim() || sig.name?.trim() || '';
    if (!finalName) {
      alert('⚠️ กรุณาเลือก "ท่านคือใคร?" ก่อนอนุมัติด่วน');
      return;
    }
    setSignDataUrl(sig.dataUrl);
    setApproverName(finalName);
    setTimeout(() => {
      handleApproveWithData(sig.dataUrl, finalName);
    }, 100);
  };

  const handleApprove = async () => {
    if (submitting) return;
    if (!item) return;

    // 🔐 บังคับ Login ก่อนอนุมัติ — ปลอดภัยกว่า
    if (!loginSession?.identity?.staffId) {
      setShowLoginPrompt(true);
      return;
    }

    // ✅ ตรวจสอบว่าระบุชื่อผู้อนุมัติแล้วหรือยัง
    if (!approverName.trim()) {
      alert('⚠️ กรุณาเลือก/ใส่ชื่อผู้อนุมัติก่อน');
      return;
    }

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

    // ✨ ไม่ต้องใช้ลายเซ็น — ส่ง approverName + วันที่อนุมัติเป็น "ลายเซ็น"
    await handleApproveWithData(signDataUrl || '', approverName.trim());
  };

  const handleApproveWithData = async (signData, approver) => {
    // signData ว่างก็ได้ — ใช้ชื่อผู้อนุมัติเป็นการยืนยัน
    if (!item) return;
    if (submitting) return;

    setSubmitting(true);
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'approval_workflows', item._docId);
      // Idempotency: อ่าน status ล่าสุดจาก Firestore ก่อน — กันสร้าง next step ซ้ำ
      const freshSnap = await getDoc(docRef);
      if (!freshSnap.exists() || freshSnap.data().status !== 'pending') {
        alert('เอกสารนี้ได้รับการอนุมัติไปแล้ว');
        setSubmitting(false);
        setDone(true);
        return;
      }
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

      // 🛡 Audit log — เก็บข้อมูลคนกดอนุมัติเพื่อตรวจสอบย้อนหลัง
      const urlAsEmail = (() => { try { return new URLSearchParams(window.location.search).get('as') || ''; } catch { return ''; } })();
      const auditFields = {
        approverEmail: urlAsEmail || null,
        approvedFromIP: null,  // จะ fetch จาก client เพิ่ม
        approvedUserAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null,
        approvedDeviceLang: typeof navigator !== 'undefined' ? navigator.language : null,
        approvedScreenSize: typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : null,
        approvedTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      // Fetch IP ในเบื้องหลัง (ไม่ block)
      try {
        const ipRes = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(2000) });
        const ipJson = await ipRes.json();
        auditFields.approvedFromIP = ipJson.ip || null;
      } catch {}

      await updateDoc(docRef, {
        status: 'approved',
        acknowledgedAt: now,
        approvedBy: approver || '-',
        approvedSign: signData,
        approvedDate: approveDate,
        approvedTime: approveTime,
        ...auditFields,
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

        // ถ้า next step คือ GA และเป็นใบขอใช้รถ → ส่งเมล "ใบขอใช้รถใหม่ รอจัดรถ" ให้ GA โดยเฉพาะ
        if (item.sourceForm === 'VEHICLE_BOOKING' && (nextTargetType === 'GA' || nextDept === 'GA')) {
          try {
            notifyGAVehicleRequest(nextItem);
          } catch (err) { console.warn('notifyGAVehicleRequest failed:', err); }
        }

        // ส่ง FCM push ไปผู้อนุมัติคนถัดไป (ไม่ block — ยิงใน background)
        try {
          const approveUrl = buildApproveUrl(nextItem.id);
          const pushTitle = `🔔 TBK SOC — รอเซ็นอนุมัติ`;
          const pushBody = `${item.topic}\nผู้ขอ: ${item.requesterName || '-'}`;
          // หา staffIds ของผู้รับ push ตาม step type
          let recipientIds = [];
          if (nextTargetType === 'GA' || nextDept === 'GA') {
            const gaSnap = await getDocs(
              query(collection(db, 'artifacts', appId, 'public', 'data', 'users'),
                where('role', '==', 'GA')),
            );
            recipientIds = gaSnap.docs.filter((d) => d.data().active !== false).map((d) => d.id);
          } else if (nextTargetType === 'SECURITY') {
            const secSnap = await getDocs(
              query(collection(db, 'artifacts', appId, 'public', 'data', 'users'),
                where('role', '==', 'SECURITY')),
            );
            recipientIds = secSnap.docs.filter((d) => d.data().active !== false).map((d) => d.id);
          } else if (nextDept) {
            // หัวหน้าแผนก (HR หรืออื่น)
            const headSnap = await getDocs(
              query(collection(db, 'artifacts', appId, 'public', 'data', 'users'),
                where('roleType', '==', 'HEAD')),
            );
            const target = (nextDept || '').toString();
            recipientIds = headSnap.docs
              .filter((d) => d.data().active !== false && (d.data().department || '').includes(target.split(' ')[0]))
              .map((d) => d.id);
          }
          recipientIds.forEach((id) => {
            sendPushToUser(id, { title: pushTitle, body: pushBody, clickUrl: approveUrl }).catch(() => {});
          });
        } catch (err) {
          console.warn('FCM push failed:', err?.message);
        }
      }

      // 🔔 แจ้งพนักงาน (เจ้าของเอกสาร) ว่า step นี้ถูกอนุมัติแล้ว
      try {
        if (item.requesterId) {
          const isFinalStep = step >= maxSteps;
          const approverLabel = item.stepLabel || `ขั้นที่ ${step}`;
          let reqTitle, reqBody;
          if (isFinalStep) {
            if (isGAVehicleStep && vehicleAssignment.vehicleResult === 'no_vehicle') {
              reqTitle = '⚠️ GA แจ้ง: ไม่มีรถให้ใช้งาน';
              reqBody = `เอกสารขอใช้รถของคุณ — GA แจ้งว่าไม่มีรถว่าง กรุณาใช้รถส่วนตัว`;
            } else if (isGAVehicleStep && gaSelectedVehicle) {
              const drv = gaSelectedDriver ? ` / คนขับ: ${gaSelectedDriver.nickname || gaSelectedDriver.name}` : '';
              reqTitle = '✅ GA จัดรถให้แล้ว';
              reqBody = `${gaSelectedVehicle.brand} ${gaSelectedVehicle.plate}${drv}`;
            } else {
              reqTitle = '✅ เอกสารของคุณอนุมัติครบแล้ว';
              reqBody = `${item.topic || 'เอกสาร'} — ผ่าน ${approverLabel} เรียบร้อย`;
            }
          } else {
            reqTitle = '✅ อนุมัติแล้ว — เดินหน้าต่อ';
            reqBody = `${item.topic || 'เอกสาร'} — ${approverLabel} เซ็นแล้ว รอขั้นถัดไป`;
          }
          sendPushToUser(item.requesterId, {
            title: reqTitle,
            body: reqBody,
            clickUrl: '/',
          }).catch(() => {});

          // 📧 ส่ง EMAIL กลับให้พนักงาน — เฉพาะตอน GA จบงาน (final step)
          if (isFinalStep && isGAVehicleStep) {
            try {
              const requesterDoc = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', item.requesterId));
              const requester = requesterDoc.data();
              const requesterEmail = requester?.email;
              if (requesterEmail) {
                const isAssigned = vehicleAssignment.vehicleResult === 'assigned' && gaSelectedVehicle;
                const isNoVehicle = vehicleAssignment.vehicleResult === 'no_vehicle';
                const refId = (item.id || '').slice(-12).toUpperCase();
                const subject = isAssigned
                  ? `🚗 [TBKK] GA จัดรถให้แล้ว — ${gaSelectedVehicle.plate}`
                  : `⚠️ [TBKK] GA แจ้ง: ไม่มีรถให้ใช้งาน`;
                const bodyHtml = isAssigned ? `
                  <div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:20px">
                    <div style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;padding:24px;text-align:center;border-radius:16px 16px 0 0">
                      <h2 style="margin:0;font-size:22px">✅ GA จัดรถให้แล้ว</h2>
                      <p style="margin:6px 0 0;font-size:13px;opacity:0.9">REF: ${refId}</p>
                    </div>
                    <div style="background:#fff;padding:24px;border-radius:0 0 16px 16px">
                      <p style="font-size:14px;color:#334155">เรียน คุณ ${requester.displayName || requester.name || item.requesterName}</p>
                      <p style="font-size:14px;color:#334155;margin-bottom:16px">เอกสาร <strong>ขอใช้รถ</strong> ของคุณได้รับการอนุมัติครบแล้ว และ GA จัดรถให้คุณดังนี้:</p>
                      <div style="background:#f0fdf4;border:2px solid #10b981;border-radius:12px;padding:20px;margin:16px 0">
                        <table style="width:100%;font-size:14px;color:#065f46">
                          <tr><td style="padding:6px 0;font-weight:700;width:120px">🚗 รถ:</td><td style="font-weight:900;font-size:16px">${gaSelectedVehicle.brand} ${gaSelectedVehicle.plate}</td></tr>
                          ${gaSelectedDriver ? `<tr><td style="padding:6px 0;font-weight:700">👤 คนขับ:</td><td style="font-weight:900">${gaSelectedDriver.nickname || gaSelectedDriver.name}${gaSelectedDriver.phone ? ` · ${gaSelectedDriver.phone}` : ''}</td></tr>` : ''}
                          <tr><td style="padding:6px 0;font-weight:700">📅 วันที่:</td><td>${item.requestPayload?.date || '-'}</td></tr>
                          <tr><td style="padding:6px 0;font-weight:700">🕐 เวลา:</td><td>${item.requestPayload?.timeStart || '-'} - ${item.requestPayload?.timeEnd || '-'}</td></tr>
                        </table>
                      </div>
                      <div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:14px;border-radius:8px;margin:16px 0">
                        <p style="margin:0;font-size:13px;color:#1e40af;font-weight:700">📌 ใช้สำหรับยืนยันกับ รปภ.</p>
                        <p style="margin:6px 0 0;font-size:12px;color:#3b82f6">นำอีเมลฉบับนี้แสดงที่ป้อม รปภ. หรือใช้รหัสอ้างอิง <strong>${refId}</strong> เพื่อยืนยันการอนุมัติ</p>
                      </div>
                      <p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:16px">SOC Systems · TBKK Group · no-reply@tbkk.co.th</p>
                    </div>
                  </div>
                ` : `
                  <div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:20px">
                    <div style="background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;padding:24px;text-align:center;border-radius:16px 16px 0 0">
                      <h2 style="margin:0;font-size:22px">⚠️ ไม่มีรถให้ใช้งาน</h2>
                      <p style="margin:6px 0 0;font-size:13px;opacity:0.9">REF: ${refId}</p>
                    </div>
                    <div style="background:#fff;padding:24px;border-radius:0 0 16px 16px">
                      <p style="font-size:14px;color:#334155">เรียน คุณ ${requester.displayName || requester.name || item.requesterName}</p>
                      <p style="font-size:14px;color:#334155">GA แจ้งว่า <strong>ไม่มีรถบริษัทว่างในวันที่ขอ</strong> ${item.requestPayload?.date || ''}</p>
                      <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:14px;border-radius:8px;margin:16px 0">
                        <p style="margin:0;font-size:13px;color:#78350f">💡 ท่านสามารถใช้รถส่วนตัวไปก่อนได้ — เก็บใบเสร็จเพื่อเบิกค่าน้ำมัน/ทางด่วนภายหลัง</p>
                      </div>
                      <p style="font-size:11px;color:#94a3b8;text-align:center">SOC Systems · TBKK Group</p>
                    </div>
                  </div>
                `;
                const bodyText = isAssigned
                  ? `GA จัดรถให้แล้ว\nREF: ${refId}\nรถ: ${gaSelectedVehicle.brand} ${gaSelectedVehicle.plate}${gaSelectedDriver ? `\nคนขับ: ${gaSelectedDriver.name} (${gaSelectedDriver.phone || '-'})` : ''}\n\n📌 นำอีเมลนี้แสดงที่ป้อม รปภ. หรือใช้รหัส ${refId}`
                  : `ไม่มีรถให้ใช้งาน\nREF: ${refId}\nGA แจ้งว่าไม่มีรถบริษัทว่างในวันที่ขอ — ใช้รถส่วนตัวไปก่อนได้`;

                fetch('http://localhost:3001/api/send-email', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ to: requesterEmail, subject, html: bodyHtml, text: bodyText }),
                }).catch(() => {
                  // Fallback: production server might be different
                  return fetch('/api/send-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ to: requesterEmail, subject, html: bodyHtml, text: bodyText }),
                  }).catch(() => {});
                });
                console.log('[GA] ส่ง email กลับให้พนักงาน:', requesterEmail);
              }
            } catch (emailErr) {
              console.warn('Send GA result email failed:', emailErr);
            }
          }
        }
      } catch (err) {
        console.warn('Notify requester failed:', err?.message);
      }

      setDone(true);
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: 'sans-serif' }}>
        <p>กำลังโหลดเอกสาร...</p>
      </div>
    );
  }

  // ลิงก์ใช้ไม่ได้แล้ว — แสดงชื่อคนที่ดำเนินการไปแล้ว + เวลา + ลายเซ็น
  if (error === 'ALREADY_APPROVED' || error === 'ALREADY_REJECTED') {
    const isApproved = error === 'ALREADY_APPROVED';
    const approverName = item?.approvedBy || item?.rejectedBy || '-';
    const approvedSign = item?.approvedSign;
    const approvedAt = item?.acknowledgedAt
      ? new Date(item.acknowledgedAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
      : (item?.rejectedAt ? new Date(item.rejectedAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-');
    const stepLabel = item?.stepLabel || (item?.targetType === 'GA' ? 'GA จัดรถ' : 'ผู้อนุมัติ');
    const rejectReason = item?.rejectReason;
    const rp = item?.requestPayload || {};

    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: 'sans-serif', background: '#f8fafc', padding: 16 }}>
        <div style={{ padding: 28, background: '#fff', borderRadius: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', maxWidth: 460, width: '100%', border: '1px solid #e2e8f0' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>{isApproved ? '✅' : '❌'}</div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: isApproved ? '#15803d' : '#b91c1c', margin: '0 0 4px' }}>
              {isApproved ? 'เอกสารนี้ถูกอนุมัติไปแล้ว' : 'เอกสารนี้ถูกปฏิเสธไปแล้ว'}
            </h2>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
              {isApproved ? 'This document has been approved' : 'This document has been rejected'}
            </p>
          </div>

          {/* รายละเอียดผู้อนุมัติ */}
          <div style={{ background: isApproved ? '#f0fdf4' : '#fef2f2', border: `1.5px solid ${isApproved ? '#86efac' : '#fca5a5'}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
            <p style={{ fontSize: 10, fontWeight: 900, color: isApproved ? '#15803d' : '#b91c1c', textTransform: 'uppercase', letterSpacing: 1.5, margin: '0 0 10px' }}>
              {isApproved ? `✍️ ${stepLabel} — ${approverName === '-' ? 'ผู้อนุมัติ' : 'อนุมัติแล้วโดย'}` : 'ปฏิเสธโดย'}
            </p>

            {/* ลายเซ็น */}
            {approvedSign && (
              <div style={{ background: '#fff', borderRadius: 10, padding: 12, textAlign: 'center', marginBottom: 10, border: '1px solid #e2e8f0' }}>
                <img src={approvedSign} alt="ลายเซ็น" style={{ height: 60, maxWidth: '100%', objectFit: 'contain', display: 'block', margin: '0 auto' }} />
              </div>
            )}

            {/* ชื่อ + เวลา */}
            <div style={{ background: '#fff', borderRadius: 8, padding: '10px 14px', border: '1px solid #e2e8f0' }}>
              <p style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', margin: '0 0 2px' }}>👤 {approverName}</p>
              <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>📅 {approvedAt}</p>
            </div>

            {/* เหตุผลที่ปฏิเสธ */}
            {!isApproved && rejectReason && (
              <div style={{ marginTop: 10, padding: 10, background: '#fff', border: '1px solid #fecaca', borderRadius: 8 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#b91c1c', margin: '0 0 4px' }}>เหตุผลที่ปฏิเสธ:</p>
                <p style={{ fontSize: 13, color: '#7f1d1d', margin: 0, whiteSpace: 'pre-wrap' }}>{rejectReason}</p>
              </div>
            )}
          </div>

          {/* ข้อมูลเอกสาร */}
          <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#475569', marginBottom: 14, border: '1px solid #e2e8f0' }}>
            <p style={{ margin: '0 0 4px' }}><strong>เอกสาร:</strong> {item?.topic || '-'}</p>
            <p style={{ margin: 0 }}>
              <strong>ผู้ขอ:</strong> {item?.requesterName || '-'}
              {item?.requesterId ? ` (${item.requesterId})` : ''}
              {rp?.date ? ` · วันที่ใช้ ${rp.date}` : ''}
              {rp?.orderDate ? ` · ${rp.orderDate} ${rp.orderTime || ''}` : ''}
              {rp?.location ? ` · 📍 ${rp.location}` : ''}
            </p>
          </div>

          {/* 📋 รายการที่สั่ง — เฉพาะ FOOD/DRINK orders */}
          {(['FOOD_ORDER', 'DRINK_ORDER', 'DRINK_FOOD_ORDER'].includes(item?.sourceForm)) && (() => {
            const drinkRows = rp.drinkRows || (item?.sourceForm === 'DRINK_ORDER' ? rp.rows : []) || [];
            const foodRows = rp.foodRows || (item?.sourceForm === 'FOOD_ORDER' ? rp.rows : []) || [];
            if (drinkRows.length === 0 && foodRows.length === 0) return null;
            const dTotal = rp.drinkTotalAmount ?? drinkRows.reduce((s, r) => s + (Number(r.lineTotal) || 0), 0);
            const fTotal = rp.foodTotalAmount ?? foodRows.reduce((s, r) => s + (Number(r.lineTotal) || 0), 0);
            const grand = rp.totalAmount ?? (dTotal + fTotal);
            const fmt = (v) => v == null ? '0' : Number(v).toLocaleString();
            return (
              <div style={{ background: 'linear-gradient(135deg, #fefce8, #fef9c3)', border: '1.5px solid #fde047', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                <p style={{ fontSize: 11, fontWeight: 900, color: '#713f12', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 10px' }}>📋 รายการที่สั่ง</p>

                {/* เครื่องดื่ม */}
                {drinkRows.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#0f766e', margin: '0 0 6px' }}>☕ เครื่องดื่ม ({drinkRows.length})</p>
                    {drinkRows.map((r, i) => (
                      <div key={`d-${i}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: i < drinkRows.length - 1 ? '1px dashed #fde68a' : 'none', fontSize: 12 }}>
                        <span style={{ color: '#0f172a' }}>
                          {r.menu || r.details || r.name || '-'} {r.temp && `(${r.temp})`} <span style={{ color: '#64748b' }}>×{r.qty || r.count || 1}</span>
                        </span>
                        <span style={{ fontWeight: 900, color: '#0f766e', fontFamily: 'monospace' }}>฿{fmt(r.lineTotal)}</span>
                      </div>
                    ))}
                    {/* 💧 รวมค่าน้ำ */}
                    <div style={{ marginTop: 6, padding: '6px 10px', background: '#ccfbf1', border: '1px solid #5eead4', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 900, color: '#0f766e' }}>💧 รวมค่าน้ำ</span>
                      <span style={{ fontSize: 14, fontWeight: 900, color: '#0f766e', fontFamily: 'monospace' }}>฿{fmt(dTotal)}</span>
                    </div>
                  </div>
                )}

                {/* อาหาร */}
                {foodRows.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#9a3412', margin: '0 0 6px' }}>🍱 อาหาร ({foodRows.length})</p>
                    {foodRows.map((r, i) => {
                      const tags = [...(r.proteins || []), ...(r.spicy || []), ...(r.egg || [])].filter(Boolean);
                      return (
                        <div key={`f-${i}`} style={{ padding: '4px 0', borderBottom: i < foodRows.length - 1 ? '1px dashed #fde68a' : 'none', fontSize: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#0f172a', flex: 1 }}>
                              {r.menu || r.details || r.name || '-'} <span style={{ color: '#64748b' }}>×{r.qty || r.count || 1}</span>
                              {tags.length > 0 && <span style={{ fontSize: 10, color: '#9a3412', marginLeft: 4 }}>· {tags.join(', ')}</span>}
                            </span>
                            <span style={{ fontWeight: 900, color: '#9a3412', fontFamily: 'monospace' }}>฿{fmt(r.lineTotal)}</span>
                          </div>
                          {r.hasAllergy && (r.allergies?.length > 0 || r.allergyNames?.length > 0) && (
                            <div style={{ marginTop: 3, padding: '4px 8px', background: '#fef2f2', border: '1px dashed #fca5a5', borderRadius: 6 }}>
                              <p style={{ fontSize: 10, fontWeight: 700, color: '#991b1b', margin: 0 }}>
                                ⚠️ แพ้: {(r.allergies || []).join(', ') || '-'}
                                {r.allergyNames?.length > 0 && <span> · 👤 {r.allergyNames.join(', ')}</span>}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* 🍚 รวมค่าข้าว */}
                    <div style={{ marginTop: 6, padding: '6px 10px', background: '#fed7aa', border: '1px solid #fdba74', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 900, color: '#9a3412' }}>🍚 รวมค่าข้าว</span>
                      <span style={{ fontSize: 14, fontWeight: 900, color: '#9a3412', fontFamily: 'monospace' }}>฿{fmt(fTotal)}</span>
                    </div>
                  </div>
                )}

                {/* 💰 รวมทั้งหมด (ค่าน้ำ + ค่าข้าว) */}
                <div style={{ marginTop: 10, padding: 14, background: 'linear-gradient(135deg, #1e293b, #0f172a)', color: '#fff', borderRadius: 12, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: -10, right: -10, width: 80, height: 80, borderRadius: '50%', background: 'radial-gradient(circle, rgba(251,191,36,0.3), transparent)' }} />
                  <p style={{ fontSize: 10, color: '#fbbf24', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 2, margin: '0 0 8px', position: 'relative' }}>💰 รวมทั้งหมด</p>

                  {/* สูตรการบวก */}
                  {drinkRows.length > 0 && foodRows.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 13, marginBottom: 8, opacity: 0.95 }}>
                      <div style={{ flex: 1, padding: '6px 8px', background: 'rgba(94,234,212,0.15)', borderRadius: 6, textAlign: 'center', border: '1px solid rgba(94,234,212,0.3)' }}>
                        <p style={{ margin: 0, fontSize: 9, color: '#5eead4' }}>💧 น้ำ</p>
                        <p style={{ margin: '2px 0 0', fontFamily: 'monospace', fontWeight: 700 }}>฿{fmt(dTotal)}</p>
                      </div>
                      <span style={{ fontSize: 18, fontWeight: 900, color: '#fbbf24' }}>+</span>
                      <div style={{ flex: 1, padding: '6px 8px', background: 'rgba(253,186,116,0.15)', borderRadius: 6, textAlign: 'center', border: '1px solid rgba(253,186,116,0.3)' }}>
                        <p style={{ margin: 0, fontSize: 9, color: '#fdba74' }}>🍚 ข้าว</p>
                        <p style={{ margin: '2px 0 0', fontFamily: 'monospace', fontWeight: 700 }}>฿{fmt(fTotal)}</p>
                      </div>
                      <span style={{ fontSize: 18, fontWeight: 900, color: '#fbbf24' }}>=</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
                    <span style={{ fontSize: 12, opacity: 0.85 }}>ราคาสุทธิ</span>
                    <span style={{ fontSize: 30, fontWeight: 900, fontFamily: 'monospace', letterSpacing: 1, background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>฿{fmt(grand)}</span>
                  </div>
                </div>

                {rp.note && (
                  <div style={{ marginTop: 8, padding: '6px 10px', background: '#fff', border: '1px dashed #cbd5e1', borderRadius: 6 }}>
                    <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>📝 {rp.note}</p>
                  </div>
                )}
              </div>
            );
          })()}

          {/* 🚗 รายละเอียดใบขอใช้รถ — เฉพาะ VEHICLE_BOOKING */}
          {item?.sourceForm === 'VEHICLE_BOOKING' && (rp.routes?.length > 0 || rp.destination || rp.purpose) && (
            <div style={{ background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', border: '1.5px solid #c7d2fe', borderRadius: 12, padding: 14, marginBottom: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 900, color: '#3730a3', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 8px' }}>🚗 รายละเอียดใช้รถ</p>
              {rp.timeStart && <p style={{ fontSize: 12, color: '#1e293b', margin: '0 0 4px' }}>🕐 เวลา: <strong>{rp.timeStart} - {rp.timeEnd}</strong></p>}
              {(rp.routes && rp.routes.length > 0) && rp.routes.map((rt, i) => (
                <p key={i} style={{ fontSize: 12, color: '#1e293b', margin: '0 0 4px' }}>📍 {rt.origin || '-'} → {rt.destination || '-'}</p>
              ))}
              {!rp.routes?.length && rp.destination && <p style={{ fontSize: 12, color: '#1e293b', margin: '0 0 4px' }}>📍 ปลายทาง: {rp.destination}</p>}
              {rp.purpose && <p style={{ fontSize: 12, color: '#1e293b', margin: 0 }}>🎯 {rp.purpose}</p>}
            </div>
          )}

          {/* คำอธิบาย */}
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: 12, fontSize: 12, color: '#1e40af', lineHeight: 1.6 }}>
            <p style={{ margin: 0, fontWeight: 700 }}>💡 หมายเหตุ:</p>
            <p style={{ margin: '4px 0 0' }}>
              {isApproved
                ? 'หัวหน้า/ผู้อนุมัติคนอื่นได้กดอนุมัติเอกสารนี้ก่อนหน้าแล้ว — ลิงก์นี้จึงใช้ไม่ได้ ระบบจะดำเนินการต่อให้อัตโนมัติ'
                : 'หัวหน้าได้ปฏิเสธเอกสารนี้แล้ว — ผู้ขอจะได้รับเหตุผลทางอีเมล'}
            </p>
          </div>

          <p style={{ color: '#cbd5e1', fontSize: 11, marginTop: 16, textAlign: 'center' }}>คุณสามารถปิดหน้านี้ได้</p>
        </div>
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
    const route = WORKFLOW_ROUTES[item.sourceForm];
    const maxSteps = route ? route.steps : 3;
    const isFinalGAStep = item.step >= maxSteps && item.sourceForm === 'VEHICLE_BOOKING' && item.targetType === 'GA';
    const refId = (item.id || '').slice(-12).toUpperCase();
    const rp = item.requestPayload || {};
    // Load chain steps to show all signatures
    if (item.chainId && chainSteps.length === 0) {
      (async () => {
        try {
          const cSnap = await getDocs(query(collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows'), where('chainId', '==', item.chainId)));
          const steps = cSnap.docs.map(d => ({ ...d.data() })).sort((a, b) => (a.step || 0) - (b.step || 0));
          setChainSteps(steps);
        } catch {}
      })();
    }
    // Group signatures: หัวหน้า (step 1) + GA (step สุดท้าย)
    const headStep = chainSteps.find(s => s.step === 1) || (item.step === 1 ? item : null);
    const gaStep = chainSteps.find(s => s.targetType === 'GA') || (isFinalGAStep ? item : null);

    // ถ้าเป็น GA จัดรถเสร็จ → แสดงใบอนุมัติแบบถ่ายส่ง รปภ. ได้
    if (isFinalGAStep) {
      const isAssigned = !gaNoVehicle && gaSelectedVehicle;
      return (
        <div style={{ minHeight: '100vh', fontFamily: 'sans-serif', background: '#f0fdf4', padding: 16 }}>
          <div style={{ maxWidth: 600, margin: '0 auto' }}>
            {/* Banner */}
            <div style={{ textAlign: 'center', padding: '20px 16px', background: '#fff', borderRadius: 16, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: 48, marginBottom: 4 }}>✅</div>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: '#166534', margin: '0 0 4px' }}>GA จัดรถเสร็จเรียบร้อย</h2>
              <p style={{ fontSize: 13, color: '#16a34a', margin: 0 }}>📸 ถ่ายภาพหน้าจอนี้ส่งให้ รปภ. หรือผู้ขอใช้รถ</p>
            </div>

            {/* ใบอนุมัติ — ถ่ายภาพได้ */}
            <div id="approval-certificate" style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', border: '3px solid #16a34a' }}>
              {/* Header */}
              <div style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff', padding: '20px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, opacity: 0.9 }}>TBKK SOC SYSTEMS</div>
                <h1 style={{ fontSize: 22, fontWeight: 900, margin: '6px 0 4px' }}>🚗 ใบอนุมัติใช้รถบริษัท</h1>
                <p style={{ fontSize: 12, opacity: 0.9, margin: 0 }}>VEHICLE APPROVAL CERTIFICATE</p>
                <div style={{ display: 'inline-block', marginTop: 10, padding: '6px 16px', background: 'rgba(255,255,255,0.25)', borderRadius: 999, fontSize: 13, fontWeight: 900, fontFamily: 'monospace', letterSpacing: 2 }}>
                  REF: {refId}
                </div>
              </div>

              {/* ข้อมูล */}
              <div style={{ padding: 20 }}>
                {/* ผู้ขอ */}
                <div style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 6px' }}>👤 ผู้ขอใช้รถ</p>
                  <div style={{ background: '#f8fafc', borderLeft: '3px solid #16a34a', padding: '10px 14px', borderRadius: 6 }}>
                    <p style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', margin: '0 0 2px' }}>{item.requesterName || rp.name || '-'}</p>
                    <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>ID: {item.requesterId || '-'} · {item.requesterDepartment || rp.department || '-'}</p>
                  </div>
                </div>

                {/* วันเวลา */}
                <div style={{ marginBottom: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <p style={{ fontSize: 10, color: '#64748b', fontWeight: 700, margin: '0 0 4px' }}>📅 วันที่ใช้</p>
                    <p style={{ fontSize: 15, fontWeight: 900, color: '#0f172a', margin: 0 }}>{rp.date || '-'}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 10, color: '#64748b', fontWeight: 700, margin: '0 0 4px' }}>🕐 เวลา</p>
                    <p style={{ fontSize: 15, fontWeight: 900, color: '#0f172a', margin: 0 }}>{rp.timeStart || '-'} — {rp.timeEnd || '-'}</p>
                  </div>
                </div>

                {/* เส้นทาง */}
                {rp.destination && (
                  <div style={{ marginBottom: 14 }}>
                    <p style={{ fontSize: 10, color: '#64748b', fontWeight: 700, margin: '0 0 4px' }}>📍 เส้นทาง</p>
                    <p style={{ fontSize: 13, color: '#0f172a', margin: 0, lineHeight: 1.5 }}>{rp.destination}</p>
                  </div>
                )}

                {/* รถที่จัดให้ */}
                {isAssigned ? (
                  <div style={{ background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)', border: '2px solid #16a34a', borderRadius: 12, padding: 16, marginBottom: 14 }}>
                    {/* ระบุประเภทคำขอ */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <p style={{ fontSize: 12, color: '#15803d', fontWeight: 900, margin: 0 }}>🚗 ผลจัดรถ:</p>
                      <span style={{ fontSize: 10, fontWeight: 900, padding: '3px 10px', borderRadius: 999, background: rp.needDriver ? '#dbeafe' : '#fef3c7', color: rp.needDriver ? '#1e40af' : '#92400e', border: `1px solid ${rp.needDriver ? '#93c5fd' : '#fcd34d'}` }}>
                        {rp.needDriver ? '👤 มีคนขับ' : '🚘 ขับเอง'}
                      </span>
                    </div>
                    {/* บรรทัดสรุปแบบ inline (เหมือน workflow list) */}
                    <div style={{ background: 'rgba(255,255,255,0.65)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 13, lineHeight: 1.7 }}>
                      <p style={{ margin: 0 }}>
                        <strong>รถ:</strong> {gaSelectedVehicle.brand || ''} {gaSelectedVehicle.model || ''}{' '}
                        <strong style={{ marginLeft: 4 }}>ทะเบียน:</strong> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{gaSelectedVehicle.plate || '-'}</span>
                      </p>
                      {gaSelectedDriver && (gaSelectedDriver.name || gaSelectedDriver.phone) && (
                        <p style={{ margin: 0 }}>
                          <strong>คนขับ:</strong> {gaSelectedDriver.nickname ? `${gaSelectedDriver.nickname} (${gaSelectedDriver.name})` : (gaSelectedDriver.name || '-')}
                          {gaSelectedDriver.phone && <> <strong style={{ marginLeft: 4 }}>เบอร์โทร:</strong> <span style={{ fontFamily: 'monospace' }}>{gaSelectedDriver.phone}</span></>}
                        </p>
                      )}
                    </div>
                    <p style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', margin: '0 0 4px', fontFamily: 'monospace', letterSpacing: 1 }}>
                      {gaSelectedVehicle.plate || '-'}
                    </p>
                    <p style={{ fontSize: 14, color: '#475569', margin: '0 0 8px' }}>
                      {gaSelectedVehicle.brand || ''} {gaSelectedVehicle.model || ''}
                      {gaSelectedVehicle.color ? ` · สี ${gaSelectedVehicle.color}` : ''}
                    </p>
                    {/* ข้อมูลเสริมรถ — ประเภท / ที่นั่ง */}
                    {(gaSelectedVehicle.type || gaSelectedVehicle.seats) && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, color: '#475569', marginBottom: 8 }}>
                        {gaSelectedVehicle.type && <span style={{ background: '#fff', padding: '3px 8px', borderRadius: 6, border: '1px solid #d1fae5' }}>📋 {gaSelectedVehicle.type}</span>}
                        {gaSelectedVehicle.seats && <span style={{ background: '#fff', padding: '3px 8px', borderRadius: 6, border: '1px solid #d1fae5' }}>💺 {gaSelectedVehicle.seats} ที่นั่ง</span>}
                      </div>
                    )}
                    {/* บัตร/การ์ดเข้า-ออก */}
                    {(gaSelectedVehicle.cardNo || gaSelectedVehicle.accessCard || gaSelectedVehicle.parkingCard) && (
                      <div style={{ marginTop: 8, padding: '8px 12px', background: '#fef9c3', border: '1px solid #fde047', borderRadius: 8 }}>
                        <p style={{ fontSize: 10, color: '#854d0e', fontWeight: 900, margin: '0 0 2px' }}>💳 บัตร/การ์ดเข้า-ออก</p>
                        <p style={{ fontSize: 14, fontWeight: 900, color: '#713f12', margin: 0, fontFamily: 'monospace', letterSpacing: 1 }}>
                          {gaSelectedVehicle.cardNo || gaSelectedVehicle.accessCard || gaSelectedVehicle.parkingCard}
                        </p>
                      </div>
                    )}
                    {/* คนขับ (เฉพาะกรณีขอคนขับ) */}
                    {gaSelectedDriver && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #86efac' }}>
                        <p style={{ fontSize: 10, color: '#15803d', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 4px' }}>👤 คนขับ</p>
                        <p style={{ fontSize: 15, fontWeight: 900, color: '#0f172a', margin: '0 0 2px' }}>
                          {gaSelectedDriver.nickname ? `${gaSelectedDriver.nickname} (${gaSelectedDriver.name})` : gaSelectedDriver.name}
                        </p>
                        {gaSelectedDriver.phone && <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>📞 {gaSelectedDriver.phone}</p>}
                        {gaSelectedDriver.licenseType && <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>ใบขับขี่: <strong>{gaSelectedDriver.licenseType}</strong></p>}
                      </div>
                    )}
                    {/* ขับเอง — แจ้งให้รับกุญแจ */}
                    {!gaSelectedDriver && !rp.needDriver && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #86efac' }}>
                        <p style={{ fontSize: 12, fontWeight: 900, color: '#1e40af', margin: 0 }}>🚘 ขับเอง — รับกุญแจที่ GA</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ background: '#fef3c7', border: '2px solid #f59e0b', borderRadius: 12, padding: 16, marginBottom: 14, textAlign: 'center' }}>
                    <p style={{ fontSize: 16, fontWeight: 900, color: '#78350f', margin: 0 }}>⚠️ ไม่มีรถบริษัทให้ใช้งาน</p>
                    <p style={{ fontSize: 12, color: '#92400e', margin: '4px 0 0' }}>ผู้ขอใช้รถส่วนตัวไปก่อนได้</p>
                  </div>
                )}

                {/* ลายเซ็นทุกคนที่อนุมัติ — 3 คน: ผู้ขอ + หัวหน้า + GA */}
                <div style={{ borderTop: '2px dashed #cbd5e1', paddingTop: 14, marginTop: 14 }}>
                  <p style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 10px' }}>✍️ ลายเซ็นครบทุกฝ่าย (3 คน)</p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    {/* 1. ผู้ขอใช้รถ */}
                    <div style={{ background: '#eff6ff', borderRadius: 10, padding: 10, border: '1px solid #bfdbfe', textAlign: 'center' }}>
                      <p style={{ fontSize: 9, color: '#1e40af', fontWeight: 700, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 1 }}>👤 ผู้ขอใช้รถ</p>
                      {rp.requesterSign ? (
                        <img src={rp.requesterSign} alt="signature" style={{ height: 48, maxWidth: '100%', objectFit: 'contain', display: 'block', margin: '0 auto' }} />
                      ) : (
                        <div style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: 11, fontStyle: 'italic' }}>(ลายเซ็น)</div>
                      )}
                      <div style={{ borderTop: '1px solid #bfdbfe', marginTop: 6, paddingTop: 6 }}>
                        <p style={{ fontSize: 11, fontWeight: 900, color: '#0f172a', margin: 0, lineHeight: 1.2 }}>{item.requesterName || rp.name || '-'}</p>
                        <p style={{ fontSize: 9, color: '#64748b', margin: '2px 0 0' }}>{item.requesterId || '-'}</p>
                      </div>
                    </div>

                    {/* 2. หัวหน้าแผนก — ตราอนุมัติ (ไม่ใช้ลายเซ็นแล้ว) */}
                    <div style={{ background: headStep ? '#f0fdf4' : '#f8fafc', borderRadius: 10, padding: 10, border: headStep ? '2px solid #86efac' : '2px dashed #cbd5e1', textAlign: 'center' }}>
                      <p style={{ fontSize: 9, color: '#15803d', fontWeight: 700, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 1 }}>👨‍💼 หัวหน้าแผนก</p>
                      {headStep ? (
                        <div style={{ background: '#fff', borderRadius: 8, padding: '8px 6px', border: '2px solid #16a34a', position: 'relative', height: 56, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                          <div style={{ fontSize: 10, fontWeight: 900, color: '#16a34a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>✓ APPROVED</div>
                          <div style={{ fontSize: 9, color: '#475569' }}>{headStep.acknowledgedAt ? new Date(headStep.acknowledgedAt).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' }) : ''}</div>
                        </div>
                      ) : (
                        <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: 11, fontStyle: 'italic' }}>(รออนุมัติ)</div>
                      )}
                      <div style={{ borderTop: '1px solid #86efac', marginTop: 6, paddingTop: 6 }}>
                        <p style={{ fontSize: 12, fontWeight: 900, color: '#0f172a', margin: 0, lineHeight: 1.2 }}>{headStep?.approvedBy || '-'}</p>
                        <p style={{ fontSize: 9, color: '#15803d', margin: '2px 0 0' }}>
                          {headStep?.acknowledgedAt ? new Date(headStep.acknowledgedAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                        </p>
                      </div>
                    </div>

                    {/* 3. GA จัดรถ — ตราอนุมัติ */}
                    <div style={{ background: gaStep ? '#f0fdf4' : '#f8fafc', borderRadius: 10, padding: 10, border: gaStep ? '2px solid #86efac' : '2px dashed #cbd5e1', textAlign: 'center' }}>
                      <p style={{ fontSize: 9, color: '#15803d', fontWeight: 700, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 1 }}>🚗 GA จัดรถ</p>
                      {gaStep ? (
                        <div style={{ background: '#fff', borderRadius: 8, padding: '8px 6px', border: '2px solid #16a34a', position: 'relative', height: 56, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                          <div style={{ fontSize: 10, fontWeight: 900, color: '#16a34a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>✓ APPROVED</div>
                          <div style={{ fontSize: 9, color: '#475569' }}>{gaStep.acknowledgedAt ? new Date(gaStep.acknowledgedAt).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' }) : ''}</div>
                        </div>
                      ) : (
                        <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: 11, fontStyle: 'italic' }}>(รอ GA จัดรถ)</div>
                      )}
                      <div style={{ borderTop: '1px solid #86efac', marginTop: 6, paddingTop: 6 }}>
                        <p style={{ fontSize: 12, fontWeight: 900, color: '#0f172a', margin: 0, lineHeight: 1.2 }}>{gaStep?.approvedBy || approverName.trim() || '-'}</p>
                        <p style={{ fontSize: 9, color: '#15803d', margin: '2px 0 0' }}>
                          {gaStep?.acknowledgedAt ? new Date(gaStep.acknowledgedAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : new Date().toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{ background: '#f8fafc', padding: '12px 20px', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 4px', fontWeight: 700 }}>
                  📌 ใช้แสดงต่อ รปภ. ที่ป้อมยาม
                </p>
                <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>
                  รปภ. ตรวจสอบความถูกต้องด้วย REF: {refId}
                </p>
              </div>
            </div>

            {/* ปุ่มจัดการ */}
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <button
                onClick={() => window.print()}
                style={{ flex: 1, padding: '14px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 900, cursor: 'pointer', minWidth: 140 }}
              >
                🖨 พิมพ์ / PDF
              </button>
              <button
                onClick={async () => {
                  try {
                    const url = window.location.href;
                    if (navigator.share) {
                      await navigator.share({ title: 'ใบอนุมัติใช้รถบริษัท', text: `REF: ${refId}`, url });
                    } else {
                      await navigator.clipboard.writeText(`ใบอนุมัติใช้รถ REF: ${refId}\n${url}`);
                      alert('คัดลอกลิงก์แล้ว');
                    }
                  } catch {}
                }}
                style={{ flex: 1, padding: '14px 20px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 900, cursor: 'pointer', minWidth: 140 }}
              >
                📤 ส่งให้ รปภ.
              </button>
            </div>

            <p style={{ textAlign: 'center', fontSize: 11, color: '#64748b', marginTop: 16, lineHeight: 1.6 }}>
              💡 <strong>วิธีส่งให้ รปภ:</strong><br/>
              ถ่ายภาพหน้าจอ (Screenshot) → ส่งทาง LINE/WhatsApp/Outlook<br/>
              หรือกด "ส่งให้ รปภ." ด้านบน
            </p>

            <style>{`
              @media print {
                body { background: white; }
                #approval-certificate { box-shadow: none !important; border: 1px solid #000 !important; }
                button { display: none !important; }
              }
            `}</style>
          </div>
        </div>
      );
    }

    // ☕🍱 GA รับออเดอร์อาหาร/เครื่องดื่ม เสร็จแล้ว → แสดงใบอนุมัติพร้อมปุ่มส่งให้ร้านค้าแยกกัน
    const isOrderForm = ['FOOD_ORDER', 'DRINK_ORDER', 'DRINK_FOOD_ORDER'].includes(item.sourceForm);
    const isFinalGAOrderStep = isOrderForm && item.step >= maxSteps && item.targetType === 'GA';
    if (isFinalGAOrderStep) {
      const drinkRows = item.requestPayload?.drinkRows || (item.sourceForm === 'DRINK_ORDER' ? item.requestPayload?.rows : []) || [];
      const foodRows = item.requestPayload?.foodRows || (item.sourceForm === 'FOOD_ORDER' ? item.requestPayload?.rows : []) || [];
      const hasDrink = drinkRows.length > 0;
      const hasFood = foodRows.length > 0;
      const rp = item.requestPayload || {};
      const fmt = (v) => v == null ? '0' : Number(v).toLocaleString();
      const dTotal = rp.drinkTotalAmount ?? drinkRows.reduce((s, r) => s + (Number(r.lineTotal) || 0), 0);
      const fTotal = rp.foodTotalAmount ?? foodRows.reduce((s, r) => s + (Number(r.lineTotal) || 0), 0);
      const grandTotal = rp.totalAmount ?? (dTotal + fTotal);

      const buildDrinkText = () => {
        let t = `☕ ออเดอร์เครื่องดื่ม TBKK\n━━━━━━━━━━━━━━━━━━━━\n`;
        t += `📋 REF: ${refId}\n`;
        t += `👤 ผู้ขอ: ${item.requesterName} (${item.requesterId})\n`;
        t += `🏢 แผนก: ${rp.department || '-'}\n`;
        t += `📅 ${rp.orderDate || '-'} 🕐 ${rp.orderTime || '-'} น.\n`;
        if (rp.location) t += `📍 ${rp.location}\n`;
        t += `\n📋 รายการ:\n`;
        drinkRows.forEach((r, i) => {
          const name = r.menu || r.details || r.name || '-';
          t += `  ${i + 1}. ${name}`;
          if (r.temp) t += ` (${r.temp})`;
          t += ` × ${r.qty || r.count || 1} = ฿${fmt(r.lineTotal)}\n`;
        });
        t += `\n💰 รวม: ฿${fmt(dTotal)}\n`;
        if (rp.note) t += `\n📝 ${rp.note}\n`;
        t += `\n✅ อนุมัติแล้ว — กรุณาเตรียมตามรายการ\nGA: ${approverName.trim() || item.approvedBy || '-'}`;
        return t;
      };

      const buildFoodText = () => {
        let t = `🍱 ออเดอร์อาหาร TBKK\n━━━━━━━━━━━━━━━━━━━━\n`;
        t += `📋 REF: ${refId}\n`;
        t += `👤 ผู้ขอ: ${item.requesterName} (${item.requesterId})\n`;
        t += `🏢 แผนก: ${rp.department || '-'}\n`;
        t += `📅 ${rp.orderDate || '-'} 🕐 ${rp.orderTime || '-'} น.\n`;
        if (rp.location) t += `📍 ${rp.location}\n`;
        t += `\n📋 รายการ:\n`;
        foodRows.forEach((r, i) => {
          const name = r.menu || r.details || r.name || '-';
          t += `  ${i + 1}. ${name}`;
          const tags = [...(r.proteins || []), ...(r.spicy || []), ...(r.egg || [])].filter(Boolean);
          if (tags.length) t += ` [${tags.join(', ')}]`;
          t += ` × ${r.qty || r.count || 1} = ฿${fmt(r.lineTotal)}\n`;
          if (r.hasAllergy && (r.allergies?.length || r.allergyNames?.length)) {
            t += `     ⚠️ แพ้: ${(r.allergies || []).join(', ')}`;
            if (r.allergyNames?.length) t += ` | ผู้แพ้: ${r.allergyNames.join(', ')}`;
            t += `\n`;
          }
        });
        t += `\n💰 รวม: ฿${fmt(fTotal)}\n`;
        if (rp.note) t += `\n📝 ${rp.note}\n`;
        t += `\n✅ อนุมัติแล้ว — กรุณาเตรียมตามรายการ\nGA: ${approverName.trim() || item.approvedBy || '-'}`;
        return t;
      };

      const shareToShop = async (shopType) => {
        const text = shopType === 'drink' ? buildDrinkText() : buildFoodText();
        const title = shopType === 'drink' ? `ออเดอร์กาแฟ REF:${refId}` : `ออเดอร์อาหาร REF:${refId}`;
        try {
          if (navigator.share) {
            await navigator.share({ title, text });
          } else {
            await navigator.clipboard.writeText(text);
            alert(`✓ คัดลอกข้อความสำหรับ${shopType === 'drink' ? 'ร้านกาแฟ' : 'ร้านข้าว'}แล้ว\nวางใน LINE ส่งให้ร้านได้เลย`);
          }
        } catch (e) {
          if (e?.name !== 'AbortError') {
            try { await navigator.clipboard.writeText(text); alert('✓ คัดลอกแล้ว'); } catch {}
          }
        }
      };

      return (
        <div style={{ minHeight: '100vh', fontFamily: 'sans-serif', background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', padding: 16 }}>
          <div style={{ maxWidth: 560, margin: '0 auto' }}>
            {/* Banner */}
            <div style={{ textAlign: 'center', padding: '20px 16px', background: '#fff', borderRadius: 16, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: 48, marginBottom: 4 }}>✅</div>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: '#166534', margin: '0 0 4px' }}>GA รับออเดอร์เรียบร้อย</h2>
              <p style={{ fontSize: 13, color: '#16a34a', margin: 0 }}>📲 กดปุ่มด้านล่างเพื่อส่งให้ร้านค้าทาง LINE</p>
            </div>

            {/* ใบอนุมัติ — สำหรับถ่าย */}
            <div id="order-certificate" style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', border: '3px solid #16a34a', marginBottom: 16 }}>
              {/* Header */}
              <div style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff', padding: '20px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, opacity: 0.9 }}>TBKK SOC SYSTEMS</div>
                <h1 style={{ fontSize: 22, fontWeight: 900, margin: '6px 0 4px' }}>
                  {hasDrink && hasFood ? '☕🍱 ใบอนุมัติเครื่องดื่ม+อาหาร' : hasDrink ? '☕ ใบอนุมัติเครื่องดื่ม' : '🍱 ใบอนุมัติอาหาร'}
                </h1>
                <p style={{ fontSize: 12, opacity: 0.9, margin: 0 }}>ORDER APPROVAL</p>
                <div style={{ display: 'inline-block', marginTop: 10, padding: '6px 16px', background: 'rgba(255,255,255,0.25)', borderRadius: 999, fontSize: 13, fontWeight: 900, fontFamily: 'monospace', letterSpacing: 2 }}>
                  REF: {refId}
                </div>
              </div>

              {/* ข้อมูลผู้ขอ */}
              <div style={{ padding: 16, background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <p style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', margin: '0 0 4px' }}>👤 {item.requesterName}</p>
                <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                  #{item.requesterId} · {rp.department} · 📅 {rp.orderDate} 🕐 {rp.orderTime} น.
                  {rp.location && <> · 📍 {rp.location}</>}
                </p>
              </div>

              {/* รายการเครื่องดื่ม */}
              {hasDrink && (
                <div style={{ padding: 16, borderBottom: hasFood ? '2px dashed #cbd5e1' : 'none' }}>
                  <p style={{ fontSize: 12, fontWeight: 900, color: '#0f766e', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 1 }}>☕ เครื่องดื่ม ({drinkRows.length} รายการ)</p>
                  {drinkRows.map((r, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < drinkRows.length - 1 ? '1px dashed #e2e8f0' : 'none' }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0 }}>{r.menu || r.details || r.name || '-'} {r.temp && `(${r.temp})`}</p>
                        <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>×{r.qty || r.count || 1} · ฿{fmt(r.unitPrice)}/หน่วย</p>
                      </div>
                      <p style={{ fontSize: 14, fontWeight: 900, color: '#0f766e', margin: 0 }}>฿{fmt(r.lineTotal)}</p>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', marginTop: 6, borderTop: '1px solid #5eead4' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#0f766e' }}>รวมเครื่องดื่ม</span>
                    <span style={{ fontSize: 15, fontWeight: 900, color: '#0f766e' }}>฿{fmt(dTotal)}</span>
                  </div>
                </div>
              )}

              {/* รายการอาหาร */}
              {hasFood && (
                <div style={{ padding: 16 }}>
                  <p style={{ fontSize: 12, fontWeight: 900, color: '#9a3412', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 1 }}>🍱 อาหาร ({foodRows.length} รายการ)</p>
                  {foodRows.map((r, i) => {
                    const tags = [...(r.proteins || []), ...(r.spicy || []), ...(r.egg || [])].filter(Boolean);
                    return (
                      <div key={i} style={{ padding: '6px 0', borderBottom: i < foodRows.length - 1 ? '1px dashed #e2e8f0' : 'none' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0 }}>{r.menu || r.details || r.name || '-'}</p>
                            <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>×{r.qty || r.count || 1} · ฿{fmt(r.unitPrice)}/หน่วย {tags.length > 0 && ` · ${tags.join(', ')}`}</p>
                          </div>
                          <p style={{ fontSize: 14, fontWeight: 900, color: '#9a3412', margin: 0 }}>฿{fmt(r.lineTotal)}</p>
                        </div>
                        {r.hasAllergy && (r.allergies?.length > 0 || r.allergyNames?.length > 0) && (
                          <div style={{ marginTop: 4, padding: '6px 8px', background: '#fef2f2', borderRadius: 6, border: '1px dashed #fca5a5' }}>
                            <p style={{ fontSize: 11, fontWeight: 900, color: '#991b1b', margin: 0 }}>⚠️ แพ้: {(r.allergies || []).join(', ')}</p>
                            {r.allergyNames?.length > 0 && <p style={{ fontSize: 11, color: '#991b1b', margin: '2px 0 0' }}>👤 ผู้แพ้: {r.allergyNames.join(', ')}</p>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', marginTop: 6, borderTop: '1px solid #fdba74' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#9a3412' }}>รวมอาหาร</span>
                    <span style={{ fontSize: 15, fontWeight: 900, color: '#9a3412' }}>฿{fmt(fTotal)}</span>
                  </div>
                </div>
              )}

              {/* รวมทั้งหมด */}
              <div style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', color: '#fff', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1 }}>💰 รวมทั้งหมด</span>
                <span style={{ fontSize: 26, fontWeight: 900, fontFamily: 'monospace', background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>฿{fmt(grandTotal)}</span>
              </div>

              {/* Footer */}
              <div style={{ background: '#f8fafc', padding: '10px 20px', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: '#16a34a', fontWeight: 700, margin: 0 }}>✓ GA อนุมัติโดย: {approverName.trim() || item.approvedBy || '-'}</p>
              </div>
            </div>

            {/* ปุ่มส่ง LINE — แยก 2 ร้าน */}
            <div style={{ display: 'grid', gridTemplateColumns: hasDrink && hasFood ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 12 }}>
              {hasDrink && (
                <button
                  onClick={() => shareToShop('drink')}
                  style={{ padding: '16px 20px', background: 'linear-gradient(135deg, #14b8a6, #0d9488)', color: '#fff', border: 'none', borderRadius: 14, fontSize: 14, fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 12px rgba(20,184,166,0.3)' }}
                >
                  📤 ส่งให้ร้านกาแฟ
                  <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.9, marginTop: 2 }}>☕ ฿{fmt(dTotal)} ({drinkRows.length} รายการ)</div>
                </button>
              )}
              {hasFood && (
                <button
                  onClick={() => shareToShop('food')}
                  style={{ padding: '16px 20px', background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#fff', border: 'none', borderRadius: 14, fontSize: 14, fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 12px rgba(249,115,22,0.3)' }}
                >
                  📤 ส่งให้ร้านข้าว
                  <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.9, marginTop: 2 }}>🍱 ฿{fmt(fTotal)} ({foodRows.length} รายการ)</div>
                </button>
              )}
            </div>

            {/* ปุ่มเพิ่มเติม */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => window.print()}
                style={{ flex: 1, padding: '12px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 900, cursor: 'pointer', minWidth: 130 }}
              >
                🖨 พิมพ์ / PDF
              </button>
              <button
                onClick={async () => {
                  const all = `${hasDrink ? buildDrinkText() : ''}\n\n${hasFood ? buildFoodText() : ''}`.trim();
                  try {
                    await navigator.clipboard.writeText(all);
                    alert('✓ คัดลอกทั้งหมดแล้ว');
                  } catch {}
                }}
                style={{ flex: 1, padding: '12px 16px', background: '#64748b', color: '#fff', border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 900, cursor: 'pointer', minWidth: 130 }}
              >
                📋 คัดลอกทั้งหมด
              </button>
            </div>

            <p style={{ textAlign: 'center', fontSize: 11, color: '#64748b', marginTop: 16, lineHeight: 1.6 }}>
              💡 <strong>วิธีใช้:</strong><br/>
              กดปุ่มสีเขียว/ส้ม → ระบบจะคัดลอกข้อความสำหรับร้านนั้น<br/>
              วางใน LINE ของร้านได้เลย หรือ <strong>ถ่ายภาพหน้าจอ</strong> ส่งทาง LINE
            </p>

            <style>{`
              @media print {
                body { background: white; }
                #order-certificate { box-shadow: none !important; border: 1px solid #000 !important; }
                button { display: none !important; }
              }
            `}</style>
          </div>
        </div>
      );
    }

    const approverDisplay = approverName.trim() || item.approvedBy || '-';
    const approvedTime = new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: 'sans-serif', background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', padding: 16 }}>
        <div style={{ padding: 0, background: '#fff', borderRadius: 24, boxShadow: '0 12px 48px rgba(22,163,74,0.15)', maxWidth: 460, width: '100%', overflow: 'hidden', border: '2px solid #bbf7d0' }}>
          {/* Banner */}
          <div style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)', padding: '32px 24px', textAlign: 'center', color: '#fff' }}>
            <div style={{ fontSize: 64, marginBottom: 8, animation: 'bounce 0.6s' }}>✅</div>
            <h2 style={{ fontSize: 24, fontWeight: 900, margin: '0 0 4px' }}>อนุมัติสำเร็จ!</h2>
            <p style={{ fontSize: 12, opacity: 0.9, margin: 0, letterSpacing: 1 }}>APPROVAL CONFIRMED</p>
          </div>

          {/* ชื่อคนอนุมัติ — เด่นชัด */}
          <div style={{ padding: 24 }}>
            <div style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '2px solid #86efac', borderRadius: 16, padding: 20, textAlign: 'center', marginBottom: 16 }}>
              <p style={{ fontSize: 11, color: '#15803d', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 2, margin: '0 0 8px' }}>✍️ อนุมัติโดย</p>
              {signDataUrl && (
                <div style={{ background: '#fff', borderRadius: 10, padding: 10, marginBottom: 10, border: '1px solid #bbf7d0' }}>
                  <img src={signDataUrl} alt="signature" style={{ height: 50, maxWidth: '100%', objectFit: 'contain' }} />
                </div>
              )}
              <p style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', margin: '0 0 4px' }}>👤 {approverDisplay}</p>
              <p style={{ fontSize: 12, color: '#15803d', margin: 0 }}>📅 {approvedTime}</p>
              <p style={{ fontSize: 11, color: '#16a34a', margin: '6px 0 0', fontWeight: 700 }}>{item.stepLabel || 'ผู้อนุมัติ'}</p>
            </div>

            {/* สถานะถัดไป */}
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: 14, textAlign: 'center', marginBottom: 12 }}>
              <p style={{ fontSize: 13, color: '#1e40af', fontWeight: 700, margin: 0 }}>
                {item.step < maxSteps ? '➡️ ระบบส่งเอกสารให้ผู้อนุมัติคนถัดไปแล้ว' : '🎉 เอกสารผ่านการอนุมัติครบทุกขั้นตอน'}
              </p>
            </div>

            <p style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', margin: 0 }}>
              ✓ ระบบบันทึกชื่อท่านลงในเอกสารเรียบร้อยแล้ว<br/>
              สามารถปิดหน้านี้ได้
            </p>
          </div>
        </div>
        <style>{`
          @keyframes bounce {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.2); }
          }
        `}</style>
      </div>
    );
  }

  if (rejected) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: 'sans-serif', background: '#fef2f2' }}>
        <div style={{ textAlign: 'center', padding: 40, background: '#fff', borderRadius: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.1)', maxWidth: 420 }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>❌</div>
          <h2 style={{ fontSize: 24, fontWeight: 900, color: '#991b1b' }}>ปฏิเสธเอกสารแล้ว</h2>
          <p style={{ color: '#666', fontSize: 14, marginTop: 8 }}>
            ระบบส่งเหตุผลแจ้งกลับผู้ขอเรียบร้อย<br/>
            ผู้ขอสามารถ "แก้ไขส่งใหม่" ได้
          </p>
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 12, marginTop: 16, textAlign: 'left' }}>
            <p style={{ fontSize: 11, color: '#991b1b', fontWeight: 700, margin: '0 0 4px' }}>เหตุผลที่ปฏิเสธ:</p>
            <p style={{ fontSize: 13, color: '#7f1d1d', margin: 0, whiteSpace: 'pre-wrap' }}>{rejectReason}</p>
          </div>
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
                <VCell label="รหัสพนักงาน / ID" value={payload.requesterId || item.requesterId} />
                <VCell label="ชื่อ-นามสกุล / Name" value={payload.name} />
                <VCell label="แผนก / Department" value={payload.department || item.requesterDepartment} />
                <VCell label="อีเมล / Email" value={payload.email || '-'} />
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
                      <th style={{ border: '1px solid #e2e8f0', padding: '6px', width: 100, color: '#3730a3' }}>รหัสพนักงาน</th>
                      <th style={{ border: '1px solid #e2e8f0', padding: '6px', color: '#3730a3' }}>ชื่อ-นามสกุล</th>
                      <th style={{ border: '1px solid #e2e8f0', padding: '6px', width: 130, color: '#3730a3' }}>แผนก</th>
                      <th style={{ border: '1px solid #e2e8f0', padding: '6px', width: 160, color: '#3730a3' }}>อีเมล</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(payload.passengers || []).map((p, i) => (
                      <tr key={i}>
                        <td style={{ border: '1px solid #e2e8f0', padding: '5px', textAlign: 'center' }}>{i + 1}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: '5px', textAlign: 'center', fontFamily: 'monospace' }}>{p.empId || '-'}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: '5px' }}>{p.name || '-'}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: '5px' }}>{p.dept || '-'}</td>
                        <td style={{ border: '1px solid #e2e8f0', padding: '5px', fontFamily: 'monospace', fontSize: 10 }}>{p.email || '-'}</td>
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
              {/* Easy Pass — เมื่อขับเอง (6.1) GA จะเห็นว่าเอาไม่เอา */}
              {(payload.drivingOption === '6.1' || payload.driveSelf) && payload.easyPass && (
                <div style={{ marginTop: 4, marginBottom: 10, padding: 10, background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8 }}>
                  <p style={{ fontSize: 11, fontWeight: 900, color: '#92400e', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 6px' }}>💳 Easy Pass</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <div style={{ padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: payload.easyPass === '6.1.1' ? 900 : 400, background: payload.easyPass === '6.1.1' ? '#16a34a' : '#fff', color: payload.easyPass === '6.1.1' ? '#fff' : '#64748b', border: payload.easyPass === '6.1.1' ? '1px solid #16a34a' : '1px solid #e2e8f0' }}>
                      ✓ <b>6.1.1</b> ต้องการ Easy Pass
                    </div>
                    <div style={{ padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: payload.easyPass === '6.1.2' ? 900 : 400, background: payload.easyPass === '6.1.2' ? '#dc2626' : '#fff', color: payload.easyPass === '6.1.2' ? '#fff' : '#64748b', border: payload.easyPass === '6.1.2' ? '1px solid #dc2626' : '1px solid #e2e8f0' }}>
                      ✕ <b>6.1.2</b> ไม่ต้องการ Easy Pass
                    </div>
                  </div>
                </div>
              )}

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
              {/* 🍱 Section 1: ผู้ขอ — Card สีส้ม */}
              <div style={{ background: 'linear-gradient(135deg, #fff7ed, #ffedd5)', border: '1.5px solid #fed7aa', borderRadius: 14, padding: 16, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13 }}>1</span>
                  <span style={{ fontWeight: 900, color: '#9a3412', fontSize: 14 }}>👤 ผู้ขอ / Requester</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#9a3412', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>ชื่อ-นามสกุล</div>
                    <div style={{ background: '#fff', borderRadius: 8, padding: '6px 10px', border: '1px solid #fed7aa', fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{payload.responsiblePerson || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#9a3412', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>รหัสพนักงาน</div>
                    <div style={{ background: '#fff', borderRadius: 8, padding: '6px 10px', border: '1px solid #fed7aa', fontFamily: 'monospace', fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{payload.employeeId || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#9a3412', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>แผนก</div>
                    <div style={{ background: '#fff', borderRadius: 8, padding: '6px 10px', border: '1px solid #fed7aa', fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{payload.department || '-'}</div>
                  </div>
                </div>
              </div>

              {/* 📅 Section 2: วัน-เวลา — Card สีฟ้า */}
              <div style={{ background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', border: '1.5px solid #bfdbfe', borderRadius: 14, padding: 16, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13 }}>2</span>
                  <span style={{ fontWeight: 900, color: '#1e3a8a', fontSize: 14 }}>📅 วันและเวลา</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#1e3a8a', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>วันที่สั่ง</div>
                    <div style={{ background: '#fff', borderRadius: 8, padding: '6px 10px', border: '1px solid #bfdbfe', fontWeight: 700, color: '#0f172a', fontSize: 14 }}>📆 {payload.orderDate || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#1e3a8a', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>เวลา</div>
                    <div style={{ background: '#fff', borderRadius: 8, padding: '6px 10px', border: '1px solid #bfdbfe', fontWeight: 700, color: '#0f172a', fontSize: 14 }}>🕐 {payload.orderTime || '-'} น.</div>
                  </div>
                </div>
                {(payload.location || payload.purpose) && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 10 }}>
                    {payload.location && (
                      <div>
                        <div style={{ fontSize: 10, color: '#1e3a8a', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>📍 สถานที่</div>
                        <div style={{ background: '#fff', borderRadius: 8, padding: '6px 10px', border: '1px solid #bfdbfe', color: '#0f172a', fontSize: 13 }}>{payload.location}</div>
                      </div>
                    )}
                    {payload.purpose && (
                      <div>
                        <div style={{ fontSize: 10, color: '#1e3a8a', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>🎯 วัตถุประสงค์</div>
                        <div style={{ background: '#fff', borderRadius: 8, padding: '6px 10px', border: '1px solid #bfdbfe', color: '#0f172a', fontSize: 13 }}>{payload.purpose}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 🍱 Section 3: รายการ — Card layout (ไม่มีตาราง) */}
              {(() => {
                const rows = (payload.rows || []).filter(r => r.details);
                if (rows.length === 0) return null;
                const hasPrice = rows.some(r => r.unitPrice != null || r.lineTotal != null);
                const grand = typeof payload.totalAmount === 'number' ? payload.totalAmount : rows.reduce((s, r) => s + (Number(r.lineTotal) || 0), 0);
                const fmt = (v) => v == null ? '-' : `฿${Number(v).toLocaleString()}`;
                const isFood = item.sourceForm === 'FOOD_ORDER';
                const icon = isFood ? '🍱' : '☕';
                const accent = isFood ? '#713f12' : '#0f766e';
                const accentBg = isFood ? '#fef9c3' : '#ccfbf1';
                const cardBg = isFood ? 'linear-gradient(135deg, #fefce8, #fef9c3)' : 'linear-gradient(135deg, #f0fdfa, #ccfbf1)';
                const cardBorder = isFood ? '#fde047' : '#5eead4';
                return (
                  <div style={{ background: cardBg, border: `1.5px solid ${cardBorder}`, borderRadius: 14, padding: 16, marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 28, height: 28, borderRadius: '50%', background: isFood ? 'linear-gradient(135deg, #eab308, #ca8a04)' : 'linear-gradient(135deg, #14b8a6, #0d9488)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13 }}>3</span>
                        <span style={{ fontWeight: 900, color: accent, fontSize: 14 }}>{icon} รายการ{isFood ? 'อาหาร' : 'เครื่องดื่ม'} ({rows.length} รายการ)</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {rows.map((r, i) => (
                        <div key={i} style={{ background: '#fff', border: `1.5px solid ${cardBorder}`, borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                          <div style={{ width: 44, height: 44, borderRadius: 10, background: accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{icon}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0, lineHeight: 1.3 }}>{r.details}</p>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', background: accentBg, color: accent, borderRadius: 999 }}>×{r.count || 1}</span>
                              {r.condition && <span style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>🏷 {r.condition}</span>}
                              {hasPrice && r.unitPrice != null && <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{fmt(r.unitPrice)}/หน่วย</span>}
                            </div>
                          </div>
                          {hasPrice && r.lineTotal != null && (
                            <div style={{ flexShrink: 0, textAlign: 'right' }}>
                              <p style={{ fontSize: 16, fontWeight: 900, color: accent, margin: 0, fontFamily: 'monospace' }}>{fmt(r.lineTotal)}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {hasPrice && (
                      <div style={{ marginTop: 12, padding: '14px 18px', background: 'linear-gradient(135deg, #fed7aa, #fdba74)', borderRadius: 12, border: '2px solid #f97316', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 900, color: '#7c2d12', textTransform: 'uppercase', letterSpacing: 1 }}>💰 รวมทั้งหมด</span>
                        <span style={{ fontSize: 26, fontWeight: 900, color: '#7c2d12', fontFamily: 'monospace', letterSpacing: 1 }}>{fmt(grand)}</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 📝 Section 4: หมายเหตุ */}
              {payload.note && (
                <div style={{ background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: 12, padding: 14, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>📝 หมายเหตุ</div>
                  <div style={{ color: '#0f172a', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{payload.note}</div>
                </div>
              )}

              {/* ✍️ ลายเซ็นผู้สั่ง */}
              {payload.ordererSign && (
                <div style={{ marginTop: 14, padding: 12, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#1e40af', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>✍️ ลายเซ็นผู้สั่ง</div>
                  <img src={payload.ordererSign} alt="signature" style={{ height: 50, maxWidth: 200, objectFit: 'contain' }} />
                </div>
              )}
            </>) : item.sourceForm === 'DRINK_FOOD_ORDER' ? (<>
              {/* 🍔 Menu Card Style (Food Delivery App) */}

              {/* Header — ผู้ขอ + ข้อมูล */}
              <div style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #d946ef)', borderRadius: 20, padding: '20px 24px', color: '#fff', marginBottom: 16, boxShadow: '0 8px 24px rgba(99,102,241,0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(255,255,255,0.25)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0 }}>👤</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 18, fontWeight: 900, margin: 0, lineHeight: 1.2 }}>{payload.responsiblePerson || '-'}</p>
                    <p style={{ fontSize: 12, opacity: 0.9, margin: '2px 0 0' }}>#{payload.employeeId || '-'} · {payload.department || '-'}</p>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginTop: 14 }}>
                  <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '8px 12px' }}>
                    <p style={{ fontSize: 10, opacity: 0.85, margin: 0, textTransform: 'uppercase', letterSpacing: 1 }}>📅 วันเวลา</p>
                    <p style={{ fontSize: 13, fontWeight: 700, margin: '2px 0 0' }}>{payload.orderDate || '-'} · {payload.orderTime || '-'}</p>
                  </div>
                  {payload.location && (
                    <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '8px 12px' }}>
                      <p style={{ fontSize: 10, opacity: 0.85, margin: 0, textTransform: 'uppercase', letterSpacing: 1 }}>📍 สถานที่</p>
                      <p style={{ fontSize: 13, fontWeight: 700, margin: '2px 0 0' }}>{payload.location}</p>
                    </div>
                  )}
                  {payload.purpose && (
                    <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '8px 12px' }}>
                      <p style={{ fontSize: 10, opacity: 0.85, margin: 0, textTransform: 'uppercase', letterSpacing: 1 }}>🎯 วัตถุประสงค์</p>
                      <p style={{ fontSize: 13, fontWeight: 700, margin: '2px 0 0' }}>{payload.purpose}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* รายการ - Menu Card Grid */}
              {(() => {
                const drinkRows = payload.drinkRows || [];
                const foodRows = payload.foodRows || [];
                const hasAny = drinkRows.length > 0 || foodRows.length > 0;
                if (!hasAny) return null;
                const dTotal = typeof payload.drinkTotalAmount === 'number' ? payload.drinkTotalAmount : drinkRows.reduce((s, r) => s + (Number(r.lineTotal) || 0), 0);
                const fTotal = typeof payload.foodTotalAmount === 'number' ? payload.foodTotalAmount : foodRows.reduce((s, r) => s + (Number(r.lineTotal) || 0), 0);
                const grand = dTotal + fTotal;
                const fmt = (v) => v == null ? '0' : Number(v).toLocaleString();

                const detectIcon = (text, isDrink) => {
                  const t = (text || '').toLowerCase();
                  if (isDrink) {
                    if (t.includes('กาแฟ') || t.includes('ลาเต้') || t.includes('คาปูชิ') || t.includes('เอสเปรส') || t.includes('ม็อค')) return '☕';
                    if (t.includes('ชา')) return '🍵';
                    if (t.includes('โซดา') || t.includes('น้ำ')) return '🥤';
                    return '☕';
                  }
                  // Food
                  if (t.includes('กระเพรา') || t.includes('ผัด')) return '🥘';
                  if (t.includes('ไข่')) return '🍳';
                  if (t.includes('ทอด')) return '🍗';
                  if (t.includes('ต้ม') || t.includes('ซุป')) return '🍲';
                  if (t.includes('ปลา')) return '🐟';
                  if (t.includes('เซ็ต')) return '🍱';
                  return '🍛';
                };

                const ItemCard = ({ icon, name, qty, condition, price, total, accent, accentBg, gradient, allergies, allergyNames, hasAllergy, proteins, spicy, egg }) => {
                  const showAllergy = hasAllergy && (allergies?.length > 0 || allergyNames?.length > 0);
                  const tags = [
                    ...(proteins || []),
                    ...(spicy || []),
                    ...(egg || []),
                  ].filter(Boolean);
                  return (
                    <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', border: showAllergy ? '2px solid #ef4444' : `1px solid ${accentBg}`, transition: 'all 0.2s', position: 'relative' }}>
                      {/* Allergy ribbon */}
                      {showAllergy && (
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', fontSize: 10, fontWeight: 900, padding: '4px 10px', textAlign: 'center', letterSpacing: 1.5, zIndex: 2 }}>
                          ⚠️ มีคนแพ้อาหาร — ระวัง!
                        </div>
                      )}
                      <div style={{ height: 80, background: gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', paddingTop: showAllergy ? 18 : 0 }}>
                        <span style={{ fontSize: 44 }}>{icon}</span>
                        <div style={{ position: 'absolute', top: showAllergy ? 26 : 8, right: 8, background: '#fff', color: accent, fontSize: 11, fontWeight: 900, padding: '3px 10px', borderRadius: 999, boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}>×{qty}</div>
                      </div>
                      <div style={{ padding: '10px 12px' }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0, lineHeight: 1.3 }}>{name}</p>
                        {tags.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                            {tags.map((t, ti) => (
                              <span key={ti} style={{ fontSize: 10, padding: '1px 7px', background: accentBg, color: accent, borderRadius: 999, fontWeight: 600 }}>{t}</span>
                            ))}
                          </div>
                        )}
                        {condition && !tags.length && (
                          <p style={{ fontSize: 10, color: '#64748b', margin: '4px 0 0', fontStyle: 'italic' }}>🏷 {condition}</p>
                        )}

                        {/* 🚨 Allergy detail */}
                        {showAllergy && (
                          <div style={{ marginTop: 8, padding: '8px 10px', background: '#fef2f2', borderRadius: 8, border: '1px dashed #fca5a5' }}>
                            {allergyNames?.length > 0 && (
                              <div style={{ marginBottom: 4 }}>
                                <p style={{ fontSize: 9, fontWeight: 900, color: '#991b1b', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: 0.5 }}>👤 ผู้แพ้:</p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                  {allergyNames.map((nm, ni) => (
                                    <span key={ni} style={{ fontSize: 11, padding: '2px 8px', background: '#fee2e2', color: '#991b1b', borderRadius: 999, fontWeight: 700, border: '1px solid #fca5a5' }}>{nm}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {allergies?.length > 0 && (
                              <div>
                                <p style={{ fontSize: 9, fontWeight: 900, color: '#991b1b', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: 0.5 }}>🚫 แพ้:</p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                  {allergies.map((a, ai) => (
                                    <span key={ai} style={{ fontSize: 11, padding: '2px 8px', background: '#fff', color: '#991b1b', borderRadius: 999, fontWeight: 700, border: '1px solid #fca5a5' }}>{a}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px dashed #e2e8f0' }}>
                          <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>฿{fmt(price)}/หน่วย</span>
                          <span style={{ fontSize: 16, fontWeight: 900, color: accent, fontFamily: 'monospace' }}>฿{fmt(total)}</span>
                        </div>
                      </div>
                    </div>
                  );
                };

                return (
                  <>
                    {/* ☕ เครื่องดื่ม */}
                    {drinkRows.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px', marginBottom: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 12, background: 'linear-gradient(135deg, #14b8a6, #0d9488)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, boxShadow: '0 4px 8px rgba(20,184,166,0.25)' }}>☕</div>
                            <div>
                              <p style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', margin: 0 }}>เครื่องดื่ม</p>
                              <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>{drinkRows.length} รายการ</p>
                            </div>
                          </div>
                          <div style={{ background: 'linear-gradient(135deg, #14b8a6, #0d9488)', color: '#fff', padding: '6px 14px', borderRadius: 999, fontSize: 14, fontWeight: 900, boxShadow: '0 2px 8px rgba(20,184,166,0.3)' }}>฿{fmt(dTotal)}</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                          {drinkRows.map((r, i) => {
                            const dispName = r.details || r.menu || r.name || '-';
                            return (
                              <ItemCard
                                key={`d-${i}`}
                                icon={detectIcon(dispName, true)}
                                name={dispName}
                                qty={r.count || r.qty || 1}
                                condition={r.condition || r.temp}
                                price={r.unitPrice}
                                total={r.lineTotal}
                                accent="#0f766e"
                                accentBg="#ccfbf1"
                                gradient="linear-gradient(135deg, #ccfbf1, #5eead4)"
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 🍱 อาหาร */}
                    {foodRows.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px', marginBottom: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 12, background: 'linear-gradient(135deg, #f97316, #ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, boxShadow: '0 4px 8px rgba(249,115,22,0.25)' }}>🍱</div>
                            <div>
                              <p style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', margin: 0 }}>อาหาร</p>
                              <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>{foodRows.length} รายการ</p>
                            </div>
                          </div>
                          <div style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#fff', padding: '6px 14px', borderRadius: 999, fontSize: 14, fontWeight: 900, boxShadow: '0 2px 8px rgba(249,115,22,0.3)' }}>฿{fmt(fTotal)}</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                          {foodRows.map((r, i) => {
                            const dispName = r.details || r.menu || r.name || '-';
                            return (
                              <ItemCard
                                key={`f-${i}`}
                                icon={detectIcon(dispName, false)}
                                name={dispName}
                                qty={r.count || r.qty || 1}
                                condition={r.condition}
                                price={r.unitPrice}
                                total={r.lineTotal}
                                accent="#9a3412"
                                accentBg="#fed7aa"
                                gradient="linear-gradient(135deg, #fed7aa, #fdba74)"
                                hasAllergy={r.hasAllergy}
                                allergies={r.allergies}
                                allergyNames={r.allergyNames}
                                proteins={r.proteins}
                                spicy={r.spicy}
                                egg={r.egg}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 💰 Grand Total — Big Card */}
                    <div style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', borderRadius: 20, padding: '20px 24px', color: '#fff', marginBottom: 12, position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: 'radial-gradient(circle, rgba(249,115,22,0.3), transparent)' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
                        <div>
                          <p style={{ fontSize: 11, opacity: 0.7, margin: 0, textTransform: 'uppercase', letterSpacing: 2 }}>💰 รวมทั้งหมด</p>
                          <p style={{ fontSize: 11, opacity: 0.6, margin: '4px 0 0' }}>☕ ฿{fmt(dTotal)}  +  🍱 ฿{fmt(fTotal)}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: 32, fontWeight: 900, margin: 0, fontFamily: 'monospace', letterSpacing: 1, background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>฿{fmt(grand)}</p>
                        </div>
                      </div>
                    </div>

                    {(payload.drinkNote || payload.foodNote || payload.note) && (
                      <div style={{ background: '#fef3c7', border: '1.5px dashed #f59e0b', borderRadius: 14, padding: 14, marginBottom: 12 }}>
                        <p style={{ fontSize: 11, fontWeight: 900, color: '#92400e', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 6px' }}>📝 หมายเหตุ</p>
                        {payload.drinkNote && <p style={{ fontSize: 13, color: '#78350f', margin: '0 0 4px' }}><strong>เครื่องดื่ม:</strong> {payload.drinkNote}</p>}
                        {payload.foodNote && <p style={{ fontSize: 13, color: '#78350f', margin: 0 }}><strong>อาหาร:</strong> {payload.foodNote}</p>}
                        {payload.note && !payload.drinkNote && !payload.foodNote && <p style={{ fontSize: 13, color: '#78350f', margin: 0 }}>{payload.note}</p>}
                      </div>
                    )}
                  </>
                );
              })()}
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
                          onClick={clickable ? () => setGaSelectedVehicle(v) : undefined}
                          aria-disabled={!clickable}
                          style={{
                            border: selected ? '2px solid #2563eb' : booked ? '2px solid #fca5a5' : isMaint ? '2px solid #fbbf24' : '2px solid #86efac',
                            borderRadius: 12, padding: 10, cursor: clickable ? 'pointer' : 'not-allowed',
                            background: selected ? '#eff6ff' : booked ? '#fef2f2' : isMaint ? '#fefce8' : '#f0fdf4',
                            opacity: clickable ? 1 : 0.5, transition: 'all 0.15s',
                            pointerEvents: clickable ? 'auto' : 'none',
                            userSelect: 'none',
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
                        const isBusy = d.status === 'busy';
                        const isOnLeave = d.status === 'on_leave';
                        const unavailable = booked || isBusy || isOnLeave;
                        const clickable = !unavailable && d.status === 'available';
                        const borderColor = selected ? '#2563eb' : isOnLeave ? '#fca5a5' : isBusy ? '#fbbf24' : booked ? '#fca5a5' : '#86efac';
                        const bgColor = selected ? '#eff6ff' : isOnLeave ? '#fef2f2' : isBusy ? '#fef3c7' : booked ? '#fef2f2' : '#f0fdf4';
                        const statusColor = isOnLeave ? '#dc2626' : isBusy ? '#d97706' : booked ? '#dc2626' : selected ? '#2563eb' : '#16a34a';
                        const statusText = isOnLeave ? '🔴 ลา' : isBusy ? '🟡 ไม่ว่าง' : booked ? 'จองแล้ว' : selected ? '✓ เลือกแล้ว' : '🟢 ว่าง';
                        return (
                          <div key={d.id}
                            onClick={clickable ? () => setGaSelectedDriver(d) : undefined}
                            style={{
                              border: `2px solid ${borderColor}`,
                              borderRadius: 12, padding: 10,
                              cursor: clickable ? 'pointer' : 'not-allowed',
                              background: bgColor,
                              opacity: clickable ? 1 : 0.65,
                              transition: 'all 0.15s',
                              pointerEvents: clickable ? 'auto' : 'none',
                            }}
                          >
                            <div style={{ fontWeight: 700, fontSize: 13 }}>
                              🧑‍✈️ {d.nickname ? `${d.nickname} (${d.name})` : d.name}
                              {d.licenseType && <span style={{ fontSize: 10, padding: '1px 6px', background: '#e0e7ff', color: '#4338ca', borderRadius: 4, marginLeft: 4 }}>{d.licenseType}</span>}
                            </div>
                            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>📞 <b>{d.phone || '-'}</b></div>
                            <div style={{ fontSize: 10, fontWeight: 700, marginTop: 4, color: statusColor }}>
                              {statusText}
                            </div>
                            {(isBusy || isOnLeave) && d.statusNote && (
                              <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2, fontStyle: 'italic' }}>
                                📍 {d.statusNote}
                              </div>
                            )}
                            {(isBusy || isOnLeave) && d.statusUntil && (
                              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>
                                🕐 ถึง {d.statusUntil}
                              </div>
                            )}
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

        {/* Approval Area - กดอนุมัติได้เลย ไม่ต้องเลือกชื่อ ไม่ต้องเซ็น */}
        <div style={{ background: '#fff', borderRadius: 24, padding: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', maxWidth: '100%', boxSizing: 'border-box' }}>
          <h3 style={{ fontSize: 15, fontWeight: 900, color: '#1e40af', marginBottom: 12, textAlign: 'center' }}>อนุมัติเอกสาร</h3>

          {/* ✅ Auto-detect: แสดงชื่อผู้อนุมัติที่ระบบจะบันทึก */}
          {(() => {
            const urlParams = new URLSearchParams(window.location.search);
            const asEmail = urlParams.get('as');

            // มีชื่อแล้ว (จาก URL หรือ candidate) → แสดงยืนยัน
            if (approverName) {
              return (
                <div style={{ marginBottom: 14, padding: 14, background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '2px solid #86efac', borderRadius: 12, textAlign: 'center' }}>
                  <p style={{ fontSize: 10, color: '#15803d', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 6px' }}>
                    ✓ ระบบรู้จักคุณแล้ว
                  </p>
                  <p style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', margin: 0 }}>👤 {approverName}</p>
                  {asEmail && <p style={{ fontSize: 11, color: '#475569', margin: '4px 0 0' }}>📧 {asEmail}</p>}
                  <p style={{ fontSize: 11, color: '#15803d', margin: '6px 0 0', fontWeight: 700 }}>
                    ระบบจะบันทึกชื่อนี้ + วันเวลา ลงในเอกสาร
                  </p>
                </div>
              );
            }

            // ไม่มีชื่อ — fallback: แสดง dropdown
            return (
              <div style={{ marginBottom: 14, padding: 12, background: '#fef9c3', border: '2px solid #facc15', borderRadius: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 900, color: '#854d0e', display: 'block', marginBottom: 8 }}>
                  👤 ท่านคือใคร? <span style={{ color: '#dc2626' }}>*</span>
                </label>
                {approverCandidates.length > 0 && (
                  <select
                    value={selectedCandidateId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedCandidateId(id);
                      if (id === '__manual__') return;
                      const c = approverCandidates.find(u => u.id === id);
                      if (c) setApproverName(c.name || c.displayName || '');
                    }}
                    style={{ width: '100%', padding: '10px 12px', fontSize: 14, fontWeight: 700, border: '2px solid #facc15', borderRadius: 10, background: '#fff', color: '#0f172a', cursor: 'pointer' }}
                  >
                    <option value="">— กรุณาเลือก —</option>
                    {approverCandidates.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.displayName || u.id}{u.approvalLevel ? ` (Lv.${u.approvalLevel})` : ''}
                      </option>
                    ))}
                    <option value="__manual__">✏️ ใส่ชื่อเอง</option>
                  </select>
                )}
                {(approverCandidates.length === 0 || selectedCandidateId === '__manual__') && (
                  <input
                    type="text"
                    placeholder="ชื่อ-นามสกุล ผู้อนุมัติ"
                    value={approverName}
                    onChange={(e) => setApproverName(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', fontSize: 14, fontWeight: 700, border: '2px solid #facc15', borderRadius: 10, background: '#fff', color: '#0f172a', marginTop: approverCandidates.length > 0 ? 8 : 0, boxSizing: 'border-box' }}
                  />
                )}
              </div>
            );
          })()}

          {/* 🔐 Login Status Indicator */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            marginTop: 14,
            padding: '10px 14px',
            background: loginSession?.identity?.staffId ? '#f0fdf4' : '#fffbeb',
            border: `1px solid ${loginSession?.identity?.staffId ? '#86efac' : '#fcd34d'}`,
            borderRadius: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 16 }}>{loginSession?.identity?.staffId ? '✅' : '🔐'}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: loginSession?.identity?.staffId ? '#15803d' : '#92400e', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {loginSession?.identity?.staffId ? 'ยืนยันตัวตนแล้ว' : 'ต้องยืนยันตัวตนก่อนอนุมัติ'}
                </div>
                <div style={{ fontSize: 12, color: loginSession?.identity?.staffId ? '#166534' : '#78350f', fontWeight: 600, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {loginSession?.identity?.staffId
                    ? `${loginSession.identity.displayName || loginSession.identity.name || ''} · ${loginSession.identity.staffId}`
                    : 'จะมีหน้าต่าง Login เด้งขึ้นเมื่อกดอนุมัติ'}
                </div>
              </div>
            </div>
            {loginSession?.identity?.staffId ? (
              <button
                type="button"
                onClick={() => {
                  try { sessionStorage.removeItem('soc_login'); } catch {}
                  setLoginSession(null);
                }}
                style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#64748b', background: 'transparent', border: '1px solid #cbd5e1', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
                title="ออกจากระบบ — ใช้บัญชีอื่น login"
              >
                เปลี่ยนบัญชี
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowLoginPrompt(true)}
                style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: '#fff', background: 'linear-gradient(135deg, #2563eb, #6366f1)', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}
              >
                🔑 Login เลย
              </button>
            )}
          </div>

          {/* ปุ่ม Approve / Reject — ดีไซน์ใหญ่ ชัด */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginTop: 16 }}>
            <button
              onClick={handleApprove}
              disabled={submitting || !approverName}
              style={{
                padding: '18px 24px',
                fontSize: 18,
                fontWeight: 900,
                background: (submitting || !approverName)
                  ? 'linear-gradient(135deg, #cbd5e1, #94a3b8)'
                  : 'linear-gradient(135deg, #16a34a, #15803d)',
                color: '#fff',
                border: 'none',
                borderRadius: 16,
                cursor: (submitting || !approverName) ? 'not-allowed' : 'pointer',
                minHeight: 64,
                boxShadow: (submitting || !approverName) ? 'none' : '0 8px 24px rgba(22,163,74,0.35)',
                transition: 'all 0.2s',
                letterSpacing: 0.5,
              }}
            >
              {submitting ? '⏳ กำลังอนุมัติ...' : '✅ อนุมัติเอกสาร'}
            </button>

            <button
              onClick={() => setShowRejectModal(true)}
              disabled={submitting}
              style={{
                padding: '18px 16px',
                fontSize: 14,
                fontWeight: 900,
                background: '#fff',
                color: '#dc2626',
                border: '2px solid #fecaca',
                borderRadius: 16,
                cursor: submitting ? 'not-allowed' : 'pointer',
                minHeight: 64,
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => { if (!submitting) { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.borderColor = '#fca5a5'; } }}
              onMouseOut={(e) => { if (!submitting) { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#fecaca'; } }}
            >
              ❌ ปฏิเสธ
            </button>
          </div>

          {/* คำอธิบายเล็กๆ */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, padding: '8px 12px', background: '#f8fafc', borderRadius: 10, border: '1px dashed #cbd5e1' }}>
            <span style={{ fontSize: 14 }}>ℹ️</span>
            <p style={{ fontSize: 11, color: '#64748b', margin: 0, lineHeight: 1.5 }}>
              ระบบบันทึก <strong style={{ color: '#0f172a' }}>ชื่อ + วันเวลา</strong> เป็นการยืนยันการอนุมัติ — ไม่ต้องเซ็นลายเซ็น
            </p>
          </div>
        </div>
      </div>

      {/* Reject Modal */}
      {/* 🔐 Login Prompt Modal — บังคับ login ก่อนอนุมัติ */}
      {showLoginPrompt && (
        <LoginPromptModal
          item={item}
          onClose={() => setShowLoginPrompt(false)}
          onLoginSuccess={(identity, role) => {
            saveApproveSession(identity, role);
            setLoginSession({ identity, role, ts: Date.now() });
            setShowLoginPrompt(false);
            // Auto-fill approver name from logged-in identity
            setApproverName(identity.displayName || identity.name || identity.staffId);
          }}
        />
      )}

      {showRejectModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }} onClick={() => !submitting && setShowRejectModal(false)}>
          <div style={{ background: '#fff', borderRadius: 24, maxWidth: 460, width: '100%', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ background: '#dc2626', color: '#fff', padding: '20px 24px' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>❌ ปฏิเสธเอกสาร</h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.9 }}>ระบบจะแจ้งเหตุผลกลับผู้ขอทางอีเมล</p>
            </div>
            <div style={{ padding: 24 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 8 }}>
                เหตุผลที่ปฏิเสธ <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="ระบุเหตุผล เช่น ไม่มีงบประมาณเดือนนี้ / เปลี่ยนเวลาเป็นบ่ายได้ไหม / กรอกข้อมูลไม่ครบ"
                rows={5}
                maxLength={500}
                disabled={submitting}
                autoFocus
                style={{ width: '100%', padding: 12, fontSize: 14, fontFamily: 'inherit', border: '2px solid #e2e8f0', borderRadius: 12, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
                onFocus={e => e.target.style.borderColor = '#dc2626'}
                onBlur={e => e.target.style.borderColor = '#e2e8f0'}
              />
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, textAlign: 'right' }}>{rejectReason.length}/500</div>

              <div style={{ marginTop: 16, padding: 12, background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, fontSize: 12, color: '#78350f' }}>
                ⚠️ การปฏิเสธจะจบ workflow ทันที ผู้ขอจะได้รับเมลแจ้งเหตุผล + สามารถ "แก้ไขส่งใหม่" ได้
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                <button
                  type="button"
                  onClick={() => setShowRejectModal(false)}
                  disabled={submitting}
                  style={{ flex: 1, padding: 12, fontSize: 14, fontWeight: 700, background: '#fff', color: '#64748b', border: '2px solid #e2e8f0', borderRadius: 12, cursor: submitting ? 'not-allowed' : 'pointer' }}
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={submitting || !rejectReason.trim()}
                  style={{ flex: 2, padding: 12, fontSize: 14, fontWeight: 900, background: (!rejectReason.trim() || submitting) ? '#fca5a5' : '#dc2626', color: '#fff', border: 'none', borderRadius: 12, cursor: (!rejectReason.trim() || submitting) ? 'not-allowed' : 'pointer' }}
                >
                  {submitting ? 'กำลังส่ง...' : '❌ ยืนยันปฏิเสธ'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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

// 🔐 Login Prompt Modal — บังคับ login ก่อนอนุมัติ (Medium Security)
function LoginPromptModal({ item, onClose, onLoginSuccess }) {
  const [staffId, setStaffId] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Pre-fill staffId from URL ?as= → user lookup
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const asEmail = urlParams.get('as');
      if (asEmail) {
        // Find user by email — set staffId
        (async () => {
          try {
            const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
            const snap = await getDocs(usersRef);
            const matched = snap.docs.map(d => ({ id: d.id, ...d.data() })).find(u => u.email?.toLowerCase() === asEmail.toLowerCase());
            if (matched) setStaffId(matched.id);
          } catch {}
        })();
      }
    } catch {}
  }, []);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setError('');
    if (!staffId.trim()) { setError('กรุณาระบุรหัสพนักงาน'); return; }
    if (!password) { setError('กรุณาใส่รหัสผ่าน'); return; }
    setLoading(true);
    try {
      const identity = await authenticateUser(staffId.trim(), password);
      onLoginSuccess(identity, identity.role);
    } catch (err) {
      setError(err?.message || 'รหัสผ่านไม่ถูกต้อง');
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }} onClick={() => !loading && onClose()}>
      <div style={{ background: '#fff', borderRadius: 24, maxWidth: 420, width: '100%', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #2563eb, #6366f1)', color: '#fff', padding: '24px 24px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🔐</div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>Login เพื่อยืนยันตัวตน</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.9 }}>ระบบจะใช้ identity ที่ login เป็นผู้อนุมัติ</p>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 24 }}>
          {/* คำอธิบาย */}
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: 12, marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: '#1e40af', margin: 0, fontWeight: 700 }}>
              🛡 ระบบบังคับ Login เพื่อความปลอดภัย
            </p>
            <p style={{ fontSize: 11, color: '#475569', margin: '4px 0 0', lineHeight: 1.5 }}>
              เพื่อยืนยันว่าคุณเป็นเจ้าของบัญชีจริง ก่อนอนุมัติเอกสาร
            </p>
          </div>

          {/* Staff ID */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>🆔 รหัสพนักงาน</label>
            <input
              type="text"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value.toUpperCase())}
              disabled={loading}
              placeholder="เช่น 02007"
              autoFocus
              style={{ width: '100%', padding: '12px 14px', fontSize: 14, fontWeight: 700, border: '2px solid #e2e8f0', borderRadius: 10, fontFamily: 'monospace', boxSizing: 'border-box' }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>🔒 รหัสผ่าน</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                placeholder="ใส่รหัสผ่าน"
                style={{ width: '100%', padding: '12px 40px 12px 14px', fontSize: 14, border: '2px solid #e2e8f0', borderRadius: 10, boxSizing: 'border-box' }}
              />
              <button type="button" onClick={() => setShowPass(!showPass)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 6 }}>
                {showPass ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: 10, marginBottom: 12 }}>
              <p style={{ fontSize: 12, color: '#b91c1c', margin: 0, fontWeight: 700 }}>❌ {error}</p>
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{ flex: 1, padding: '12px 16px', fontSize: 13, fontWeight: 700, background: '#fff', color: '#64748b', border: '2px solid #e2e8f0', borderRadius: 10, cursor: 'pointer' }}
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={loading || !staffId || !password}
              style={{
                flex: 2,
                padding: '12px 16px',
                fontSize: 14,
                fontWeight: 900,
                background: (loading || !staffId || !password) ? '#cbd5e1' : 'linear-gradient(135deg, #2563eb, #6366f1)',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                cursor: (loading || !staffId || !password) ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(37,99,235,0.3)'
              }}
            >
              {loading ? '⏳ กำลัง Login...' : '🔐 Login + อนุมัติ'}
            </button>
          </div>

          <p style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', marginTop: 12, margin: '12px 0 0' }}>
            ลืมรหัสผ่าน? เข้า <a href="/" style={{ color: '#2563eb', fontWeight: 700 }}>หน้า login</a> → "🔑 ตั้งรหัสผ่านเอง"
          </p>
        </form>
      </div>
    </div>
  );
}
