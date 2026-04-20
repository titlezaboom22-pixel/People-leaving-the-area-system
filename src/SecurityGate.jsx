import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  addDoc,
  doc,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db, firebaseReady, appId } from './firebase';
import { STATUS } from './constants';
import { Html5Qrcode } from 'html5-qrcode';

import {
  UserPlus,
  Package,
  Users,
  LogOut,
  LogIn,
  Search,
  ShieldCheck,
  Truck,
  UserCheck,
  Clock,
  LayoutDashboard,
  Menu,
  X,
  Plus,
  Eye,
  FileText,
  MapPin,
  Camera,
  Car,
} from 'lucide-react';

function SecurityGate({ appointments: externalAppointments, user, onLogout }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [showDailyReport, setShowDailyReport] = useState(false);

  // State for Detail Modal
  const [selectedItem, setSelectedItem] = useState(null);
  const [detailType, setDetailType] = useState(null);

  // Firestore data
  const [visitors, setVisitors] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [approvedDocs, setApprovedDocs] = useState([]);
  const [todayVehicleBookings, setTodayVehicleBookings] = useState([]);
  const [showRecordBook, setShowRecordBook] = useState(false);
  const [allVehicleBookings, setAllVehicleBookings] = useState([]);
  const [recordBookLoading, setRecordBookLoading] = useState(false);
  const [recordBookYear, setRecordBookYear] = useState(new Date().getFullYear());

  const [newVisitor, setNewVisitor] = useState({ name: '', company: '', plate: '', purpose: '', note: '', contactPhone: '' });
  const [clockStr, setClockStr] = useState('');
  const [dateStr2, setDateStr2] = useState('');

  // Section refs for scroll-to
  const secVisitors = useRef(null);
  const secEmployees = useRef(null);
  const secMaterials = useRef(null);
  const secDocs = useRef(null);
  const secVehicles = useRef(null);

  const scrollTo = (ref) => ref?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClockStr(now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setDateStr2(now.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const getCurrentTime = () => new Date().toLocaleString('th-TH');
  const todayStr = new Date().toISOString().split('T')[0];

  // Load visitors from appointments (Firestore)
  useEffect(() => {
    if (externalAppointments && externalAppointments.length > 0) {
      const mapped = externalAppointments.map(a => ({
        id: a.id,
        _docId: a.id,
        name: a.name || a.visitorName || '-',
        company: a.company || a.formData?.company || '-',
        plate: a.licensePlate || a.formData?.vehiclePlate || '-',
        purpose: a.purpose || a.formData?.purpose || '-',
        entryTime: a.appointmentDate || a.formData?.appointmentDate || a.createdAt || '-',
        exitTime: a.status === STATUS.COMPLETED ? (a.updatedAt || '-') : null,
        status: a.status === STATUS.INSIDE ? 'IN' : a.status === STATUS.COMPLETED ? 'OUT' : 'PENDING',
        note: a.note || a.formData?.note || '',
        contactPhone: a.phone || a.formData?.phone || '',
        hostStaffId: a.hostStaffId || '-',
        department: a.department || a.formData?.department || '-',
        refCode: a.refCode || '',
        rawStatus: a.status,
        count: a.count || 1,
        vehicleType: a.vehicleType || '-',
        cardNumber: a.cardNumber || '',
        headApprovalSign: a.headApprovalSign || null,
        headApprovalBy: a.headApprovalBy || '',
        headApprovalAt: a.headApprovalAt || '',
      }));
      setVisitors(mapped);
    }
  }, [externalAppointments]);

  // Load approved documents for security (ขอออกข้างนอก, นำของ, ขอใช้รถ)
  useEffect(() => {
    if (!firebaseReady || !db) return;
    const collRef = collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows');
    const q = query(
      collRef,
      where('targetType', '==', 'SECURITY'),
      where('status', '==', 'pending'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setApprovedDocs(snap.docs.map(d => ({ _docId: d.id, ...d.data() })));
    }, (err) => console.warn('Security docs error:', err));
    return () => unsub();
  }, []);

  // Load employee logs
  useEffect(() => {
    if (!firebaseReady || !db) return;
    const collRef = collection(db, 'artifacts', appId, 'public', 'data', 'employee_logs');
    const q = query(collRef, where('date', '==', todayStr), orderBy('timestamp', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Group by staffId, show latest status
      const grouped = {};
      for (const log of logs) {
        if (!grouped[log.staffId]) {
          grouped[log.staffId] = {
            id: log.id,
            name: log.name,
            empId: log.staffId,
            department: log.department,
            timeOut: log.direction === 'OUT' ? log.time : null,
            timeIn: log.direction === 'IN' ? log.time : null,
            status: log.direction === 'OUT' ? 'OUT' : 'IN',
            reason: '',
            destination: '',
          };
        }
      }
      setEmployees(Object.values(grouped));
    }, (err) => console.warn('Employee logs error:', err));
    return () => unsub();
  }, [todayStr]);

  // Load materials from goods approval workflows
  useEffect(() => {
    if (!firebaseReady || !db) return;
    const collRef = collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows');
    const q = query(collRef, where('sourceForm', '==', 'GOODS_IN_OUT'));
    const unsub = onSnapshot(q, (snap) => {
      // Group all steps by chainId to show approval progress
      const allDocs = snap.docs.map(d => ({ ...d.data(), _firestoreId: d.id }));
      const chains = {};
      allDocs.forEach(d => {
        const cid = d.chainId || d.id;
        if (!chains[cid]) chains[cid] = [];
        chains[cid].push(d);
      });
      // For each chain, pick the latest step and build approval summary
      const goods = Object.entries(chains).map(([cid, steps]) => {
        steps.sort((a, b) => (a.step || 1) - (b.step || 1));
        const latest = steps[steps.length - 1];
        const first = steps[0];
        const payload = first.requestPayload || {};
        // Build approval summary
        const approvalSteps = steps.map(s => ({
          step: s.step || 1,
          label: s.stepLabel || `ขั้น ${s.step || 1}`,
          status: s.status,
          approvedBy: s.approvedBy || null,
          approvedAt: s.approvedAt || s.acknowledgedAt || '',
          approvedSign: s.approvedSign || null,
          _docId: s._firestoreId,
        }));
        const headApproved = steps.some(s => s.step === 1 && s.status === 'approved');
        const hrApproved = steps.some(s => s.step === 2 && s.status === 'approved');
        const secApproved = steps.some(s => s.step === 3 && s.status === 'approved');
        return {
          id: latest._firestoreId,
          item: payload.lines?.[0]?.description || 'สิ่งของ',
          type: payload.direction === 'OUT' ? 'OUT' : 'IN',
          person: first.requesterName || '-',
          department: first.requesterDepartment || '-',
          time: first.createdAt?.split('T')[0] || '-',
          note: payload.note || '-',
          refNo: cid,
          status: latest.status,
          gate: payload.gate || '-',
          vehiclePlate: payload.vehiclePlate || '',
          sealNo: payload.sealNo || '',
          deliveryDate: payload.deliveryDate || '',
          deliveryTime: payload.deliveryTime || '',
          lines: payload.lines || [],
          carrierSign: payload.carrierSign || '',
          returnStatus: latest.returnStatus || 'none',
          returnLines: latest.returnLines || [],
          returnDate: latest.returnDate || '',
          returnNote: latest.returnNote || '',
          requesterDepartment: first.requesterDepartment || '-',
          step: latest.step || 1,
          stepLabel: latest.stepLabel || '',
          approvedBy: latest.approvedBy || null,
          approvedAt: latest.approvedAt || '',
          chainId: cid,
          approvalSteps,
          headApproved,
          hrApproved,
          secApproved,
        };
      });
      // เรียงลำดับ: พร้อมให้ รปภ. กดก่อน → รอ HR → รอหัวหน้า → อนุมัติครบแล้ว
      goods.sort((a, b) => {
        const priority = (m) => {
          if (m.hrApproved && !m.secApproved) return 0; // พร้อมให้ รปภ. อนุมัติ
          if (m.headApproved && !m.hrApproved) return 1; // รอ HR
          if (!m.headApproved) return 2; // รอหัวหน้า
          return 3; // อนุมัติครบแล้ว
        };
        return priority(a) - priority(b);
      });
      setMaterials(goods);
    }, (err) => console.warn('Materials error:', err));
    return () => unsub();
  }, []);

  // Load today's vehicle bookings + เติมข้อมูลที่ขาดจาก approval_workflows
  useEffect(() => {
    if (!firebaseReady || !db) return;
    const today = new Date().toISOString().split('T')[0];
    const bookingsRef = collection(db, 'artifacts', appId, 'public', 'data', 'vehicle_bookings');
    const unsub = onSnapshot(bookingsRef, async (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(b => b.date === today)
        .sort((a, b) => (a.timeStart || '').localeCompare(b.timeStart || ''));

      // เติมข้อมูล (ผู้จอง/แผนก/ปลายทาง/วัตถุประสงค์/ผู้ร่วมเดินทาง) จาก approval_workflows
      try {
        const wfRef = collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows');
        const wfSnap = await getDocs(query(wfRef, where('sourceForm', '==', 'VEHICLE_BOOKING')));
        const allWf = wfSnap.docs.map(d => d.data());
        const enriched = docs.map(b => {
          const missing = !b.destination || !b.department || !b.purpose || (Array.isArray(b.purpose) && b.purpose.length === 0) || !b.bookedByName;
          if (!missing) return b;
          let match = null;
          if (b.chainId) {
            match = allWf.find(s => s.chainId === b.chainId && (s.step || 1) === 1) || allWf.find(s => s.chainId === b.chainId);
          }
          if (!match) {
            const reqId = (b.bookedBy || b.requesterId || '').toUpperCase();
            if (reqId) {
              match = allWf.find(s => (s.requesterId || '').toUpperCase() === reqId && (s.requestPayload?.date || '') === b.date && (s.step || 1) === 1)
                   || allWf.find(s => (s.requesterId || '').toUpperCase() === reqId && (s.requestPayload?.date || '') === b.date);
            }
          }
          if (!match) return b;
          const rp = match.requestPayload || {};
          return {
            ...b,
            bookedByName: b.bookedByName || match.requesterName || rp.name || '-',
            bookedBy: b.bookedBy || match.requesterId || rp.requesterId || '',
            department: b.department || match.requesterDepartment || rp.department || '',
            destination: b.destination || rp.destination || '',
            purpose: b.purpose || (Array.isArray(rp.purpose) ? rp.purpose.filter(p => p).join(', ') : rp.purpose) || '',
            passengers: (b.passengers && b.passengers.length) ? b.passengers : (rp.passengers || []),
            companions: (b.companions && b.companions.length) ? b.companions : (rp.companions || []),
            note: b.note || rp.note || '',
          };
        });
        setTodayVehicleBookings(enriched);
      } catch (e) {
        console.warn('Enrich bookings error:', e);
        setTodayVehicleBookings(docs);
      }
    }, (err) => console.warn('Vehicle bookings error:', err));
    return () => unsub();
  }, []);

  // Load all vehicle bookings for the record book (Pool car / van record)
  const loadAllVehicleBookings = async () => {
    if (!firebaseReady || !db) return;
    setRecordBookLoading(true);
    try {
      const bookingsRef = collection(db, 'artifacts', appId, 'public', 'data', 'vehicle_bookings');
      const snap = await getDocs(bookingsRef);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Enrich from approval_workflows (same logic as today's)
      const wfRef = collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows');
      const wfSnap = await getDocs(query(wfRef, where('sourceForm', '==', 'VEHICLE_BOOKING')));
      const allWf = wfSnap.docs.map(d => d.data());
      const enriched = docs.map(b => {
        const missing = !b.destination || !b.department || !b.purpose || (Array.isArray(b.purpose) && b.purpose.length === 0) || !b.bookedByName;
        if (!missing) return b;
        let match = null;
        if (b.chainId) {
          match = allWf.find(s => s.chainId === b.chainId && (s.step || 1) === 1) || allWf.find(s => s.chainId === b.chainId);
        }
        if (!match) {
          const reqId = (b.bookedBy || b.requesterId || '').toUpperCase();
          if (reqId) {
            match = allWf.find(s => (s.requesterId || '').toUpperCase() === reqId && (s.requestPayload?.date || '') === b.date && (s.step || 1) === 1)
                 || allWf.find(s => (s.requesterId || '').toUpperCase() === reqId && (s.requestPayload?.date || '') === b.date);
          }
        }
        if (!match) return b;
        const rp = match.requestPayload || {};
        return {
          ...b,
          bookedByName: b.bookedByName || match.requesterName || rp.name || '-',
          bookedBy: b.bookedBy || match.requesterId || rp.requesterId || '',
          department: b.department || match.requesterDepartment || rp.department || '',
          destination: b.destination || rp.destination || '',
          purpose: b.purpose || (Array.isArray(rp.purpose) ? rp.purpose.filter(p => p).join(', ') : rp.purpose) || '',
          passengers: (b.passengers && b.passengers.length) ? b.passengers : (rp.passengers || []),
          companions: (b.companions && b.companions.length) ? b.companions : (rp.companions || []),
          note: b.note || rp.note || '',
        };
      });
      // Sort by date descending (newest first)
      enriched.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.timeStart || '').localeCompare(a.timeStart || ''));
      setAllVehicleBookings(enriched);
    } catch (e) {
      console.warn('Load all bookings error:', e);
      setAllVehicleBookings([]);
    }
    setRecordBookLoading(false);
  };

  const openRecordBook = () => {
    setShowRecordBook(true);
    loadAllVehicleBookings();
  };

  // Thai date helper: returns "DD-MMM-YY" (e.g. "31-Mar-26")
  const formatShortDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const day = String(d.getDate()).padStart(2, '0');
      const mon = months[d.getMonth()];
      const yr = String(d.getFullYear()).slice(-2);
      return `${day}-${mon}-${yr}`;
    } catch { return dateStr; }
  };

  // Extract booking "ID" — prefer chainId tail / plate / doc id
  const bookingShortId = (b) => {
    if (b.bookingNo) return b.bookingNo;
    if (b.chainId) {
      const tail = String(b.chainId).split('-').pop();
      return tail?.slice(-5) || tail || '-';
    }
    return (b.id || '').slice(-5) || '-';
  };

  // Participants list (ผู้ร่วมเดินทาง)
  const participantsList = (b) => {
    const list = [];
    if (Array.isArray(b.passengers)) b.passengers.forEach(p => { if (p) list.push(typeof p === 'string' ? p : (p.name || '')); });
    if (Array.isArray(b.companions)) b.companions.forEach(p => { if (p) list.push(typeof p === 'string' ? p : (p.name || '')); });
    return list.filter(Boolean).join(' , ');
  };

  // Vehicle type label
  const vehicleTypeLabel = (b) => {
    if (b.plate && b.plate !== 'รอใส่ทะเบียน') return b.plate;
    if (b.brand) return b.brand;
    if (b.vehicleId) return b.vehicleId;
    return 'Driver';
  };

  // Driver label
  const driverLabel = (b) => {
    if (b.driverName) return b.driverName;
    if (b.driver) return typeof b.driver === 'string' ? b.driver : (b.driver.name || 'Driver');
    // If no driver assigned, default to Driver
    if (b.selfDrive && b.bookedByName) return b.bookedByName;
    return 'Driver';
  };

  // Filter by year
  const recordBookRows = useMemo(() => {
    return allVehicleBookings.filter(b => {
      const d = b.date ? new Date(b.date) : null;
      if (!d || isNaN(d.getTime())) return false;
      return d.getFullYear() === recordBookYear;
    });
  }, [allVehicleBookings, recordBookYear]);

  const recordBookYears = useMemo(() => {
    const years = new Set();
    allVehicleBookings.forEach(b => {
      const d = b.date ? new Date(b.date) : null;
      if (d && !isNaN(d.getTime())) years.add(d.getFullYear());
    });
    years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [allVehicleBookings]);

  const printRecordBook = () => {
    const rows = recordBookRows;
    const year = recordBookYear;
    const rowsHtml = rows.map(b => `
      <tr>
        <td>${formatShortDate(b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate().toISOString() : new Date(b.createdAt).toISOString()) : b.date)}</td>
        <td>${formatShortDate(b.date)}</td>
        <td class="center">${bookingShortId(b)}</td>
        <td>${b.bookedByName || b.requesterName || '-'}</td>
        <td class="small">${participantsList(b)}</td>
        <td class="center">${b.department || '-'}</td>
        <td>${b.destination || '-'}</td>
        <td>${b.purpose || '-'}</td>
        <td class="center">${vehicleTypeLabel(b)}</td>
        <td>${driverLabel(b)}</td>
      </tr>
    `).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${year} Pool car / van record</title>
      <style>
        @page { size: A4 landscape; margin: 10mm; }
        * { box-sizing: border-box; }
        body { font-family: 'Sarabun', 'Tahoma', sans-serif; margin: 0; padding: 12px; color: #111; }
        h2 { text-align: center; font-size: 14px; margin: 0 0 10px 0; }
        table { width: 100%; border-collapse: collapse; font-size: 10px; }
        th, td { border: 1px solid #333; padding: 4px 6px; vertical-align: middle; }
        th { background: #f3f4f6; text-align: center; font-weight: 700; line-height: 1.2; }
        td { line-height: 1.3; }
        td.center { text-align: center; }
        td.small { font-size: 9px; }
        tbody tr:nth-child(even) { background: #fafafa; }
        .btn { position: fixed; top: 10px; right: 10px; padding: 8px 16px; background: #2563eb; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 700; }
        @media print { .btn { display: none; } }
      </style>
      </head><body>
      <button class="btn" onclick="window.print()">พิมพ์</button>
      <h2>${year} Pool car / van record (บันทึกการขอใช้รถบริษัท)</h2>
      <table>
        <thead>
          <tr>
            <th>Date<br/>วันที่ขอ</th>
            <th>Date<br/>วันที่ใช้บริการ</th>
            <th>ID<br/>รหัส</th>
            <th>Requestor<br/>ผู้ขอใช้บริการ</th>
            <th>Participants<br/>ผู้ร่วมเดินทาง</th>
            <th>Division<br/>แผนก</th>
            <th>Venue<br/>สถานที่</th>
            <th>Purpose<br/>วัตถุประสงค์การใช้รถ</th>
            <th>Type of Car/Van<br/>ประเภทรถ</th>
            <th>Driver<br/>คนขับรถ</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="10" style="text-align:center;padding:20px;color:#888;">ไม่มีข้อมูล</td></tr>'}
        </tbody>
      </table>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { alert('กรุณาอนุญาต popup เพื่อพิมพ์'); return; }
    w.document.write(html);
    w.document.close();
  };

  // Return check state
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnItem, setReturnItem] = useState(null);

  // ล็อค body scroll เมื่อ modal เปิด (ป้องกัน bounce กลับบน mobile)
  useEffect(() => {
    const isOpen = !!selectedItem || showReturnModal;
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [selectedItem, showReturnModal]);
  const [returnLines, setReturnLines] = useState([]);
  const [returnNote, setReturnNote] = useState('');

  const [cardNumber, setCardNumber] = useState('');
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [qrScanResult, setQrScanResult] = useState(null);
  const qrScannerRef = useRef(null);

  // QR Scanner functions
  const startQRScanner = () => {
    setShowQRScanner(true);
    setQrScanResult(null);
    setTimeout(() => {
      const scanner = new Html5Qrcode('qr-reader');
      qrScannerRef.current = scanner;
      scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          // สแกนสำเร็จ
          scanner.stop().catch(() => {});
          qrScannerRef.current = null;
          handleQRResult(decodedText);
        },
        () => {} // ignore errors
      ).catch((err) => {
        console.warn('QR Scanner error:', err);
        setQrScanResult({ error: 'ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการใช้กล้อง' });
      });
    }, 300);
  };

  const stopQRScanner = () => {
    try {
      if (qrScannerRef.current) {
        qrScannerRef.current.stop().then(() => {
          qrScannerRef.current.clear();
        }).catch(() => {});
        qrScannerRef.current = null;
      }
    } catch {}
    setShowQRScanner(false);
    setQrScanResult(null);
  };

  const handleQRResult = (text) => {
    setShowQRScanner(false);
    const searchText = text.trim().toUpperCase();

    // ค้นหาจากทุก field ที่เป็นไปได้
    const findVisitor = (key) => {
      return visitors.find(v => {
        const ref = (v.refCode || '').toUpperCase();
        const name = (v.name || '').toUpperCase();
        const id = (v.id || '').toString().toUpperCase();
        return ref === key || name === key || id === key;
      });
    };

    try {
      const data = JSON.parse(text);
      // QR เป็น JSON — ลองค้นหาจาก refCode, ref, code, id
      const code = (data.refCode || data.ref || data.code || data.id || '').toUpperCase();
      const found = findVisitor(code) || visitors.find(v => (v.refCode || '').toUpperCase() === code);
      if (found) {
        setSelectedItem(found);
        setDetailType('visitor');
      } else {
        setQrScanResult({ error: `ไม่พบนัดหมายรหัส "${code}" ในระบบ`, data, code });
      }
    } catch {
      // ไม่ใช่ JSON — ลองค้นหาจาก text ตรงๆ
      const found = findVisitor(searchText);
      if (found) {
        setSelectedItem(found);
        setDetailType('visitor');
      } else {
        setQrScanResult({ error: `ไม่พบข้อมูลรหัส "${searchText}" ในระบบ`, raw: text });
      }
    }
  };

  const handleVisitorEntry = (e) => {
    e.preventDefault();
    // TODO: save to Firestore
    const entry = {
      ...newVisitor,
      id: Date.now(),
      entryTime: getCurrentTime(),
      exitTime: null,
      status: 'IN'
    };
    setVisitors([entry, ...visitors]);
    setNewVisitor({ name: '', company: '', plate: '', purpose: '', note: '', contactPhone: '' });
    setShowEntryForm(false);
  };

  // อนุมัติเข้าโรงงาน (PENDING → IN)
  const handleApproveEntry = async (id, cardNo) => {
    const visitor = visitors.find(v => v.id === id || v._docId === id);
    if (visitor && visitor._docId && firebaseReady && db) {
      try {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'appointments', visitor._docId);
        await updateDoc(docRef, {
          status: STATUS.INSIDE,
          cardNumber: cardNo || '',
          entryTime: new Date().toISOString(),
          approvedEntryBy: 'SECURITY',
          approvedEntryAt: new Date().toISOString(),
        });
      } catch (err) {
        console.warn('Entry approve error:', err);
      }
    }
    setVisitors(visitors.map(v =>
      (v.id === id || v._docId === id) ? { ...v, status: 'IN', entryTime: getCurrentTime(), cardNumber: cardNo } : v
    ));
    setCardNumber('');
    setSelectedItem(null);
    setDetailType(null);
  };

  // อนุมัติออกจากโรงงาน (IN → OUT)
  const handleVisitorExit = async (id) => {
    const visitor = visitors.find(v => v.id === id || v._docId === id);
    if (visitor && visitor._docId && firebaseReady && db) {
      try {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'appointments', visitor._docId);
        await updateDoc(docRef, {
          status: STATUS.COMPLETED,
          exitTime: new Date().toISOString(),
          approvedExitBy: 'SECURITY',
          approvedExitAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.warn('Exit update error:', err);
      }
    }
    setVisitors(visitors.map(v =>
      (v.id === id || v._docId === id) ? { ...v, exitTime: getCurrentTime(), status: 'OUT' } : v
    ));
    if (selectedItem?.id === id) { setSelectedItem(null); setDetailType(null); }
  };

  const handleAcknowledgeDoc = async (docItem) => {
    if (!firebaseReady || !db) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'approval_workflows', docItem._docId);
      await updateDoc(docRef, {
        status: 'approved',
        acknowledgedAt: new Date().toISOString(),
        approvedBy: 'SECURITY',
      });
    } catch (err) {
      console.warn('Acknowledge error:', err);
    }
  };

  // บันทึกรถออก
  const handleVehicleExit = async (booking) => {
    if (!firebaseReady || !db) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'vehicle_bookings', booking.id);
      await updateDoc(docRef, {
        vehicleStatus: 'out',
        exitTime: new Date().toISOString(),
        exitRecordedBy: 'SECURITY',
      });
    } catch (err) {
      console.warn('Vehicle exit error:', err);
    }
  };

  // บันทึกรถกลับ
  const handleVehicleReturn = async (booking) => {
    if (!firebaseReady || !db) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'vehicle_bookings', booking.id);
      await updateDoc(docRef, {
        vehicleStatus: 'returned',
        returnTime: new Date().toISOString(),
        returnRecordedBy: 'SECURITY',
      });
    } catch (err) {
      console.warn('Vehicle return error:', err);
    }
  };

  // บันทึกพนักงานกลับเข้าโรงงาน
  const handleEmployeeReturn = async (emp) => {
    if (!firebaseReady || !db) return;
    try {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'employee_logs'), {
        staffId: emp.empId,
        name: emp.name,
        department: emp.department || '-',
        direction: 'IN',
        time: timeStr,
        date: todayStr,
        timestamp: Timestamp.now(),
        recordedBy: 'SECURITY',
      });
    } catch (err) {
      console.warn('Employee return error:', err);
    }
  };

  // ยืนยันสินค้าผ่านประตู (รปภ. step 3)
  const handleConfirmGoodsGate = async (e, m) => {
    e.stopPropagation();
    if (!firebaseReady || !db) return;
    const step3 = (m.approvalSteps || []).find(s => s.step === 3 && s.status === 'pending');
    const pendingStep = (m.approvalSteps || []).find(s => s.status === 'pending');
    const docId = step3?._docId || pendingStep?._docId || m.id;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'approval_workflows', docId);
      await updateDoc(docRef, { status: 'approved', acknowledgedAt: new Date().toISOString(), approvedBy: 'SECURITY' });
    } catch (err) {
      console.error('Confirm goods gate error:', err);
    }
  };

  // เปิด modal ตรวจรับของกลับ
  const openReturnCheck = (m) => {
    const linesForCheck = (m.lines || []).filter(l => l.description).map((l, i) => ({
      idx: i,
      description: l.description,
      qtyOut: Number(l.qty) || 1,
      unit: l.unit || '',
      qtyReturned: (m.returnLines?.[i]?.qtyReturned) ?? (Number(l.qty) || 1),
    }));
    setReturnItem(m);
    setReturnLines(linesForCheck);
    setShowReturnModal(true);
  };

  // บันทึกผลตรวจรับของกลับ
  const handleSaveReturn = async () => {
    if (!returnItem || !firebaseReady || !db) return;
    const allFull = returnLines.every(l => l.qtyReturned >= l.qtyOut);
    const newStatus = allFull ? 'returned' : 'partial';
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'approval_workflows', returnItem.id);
      await updateDoc(docRef, {
        returnStatus: newStatus,
        returnLines: returnLines.map(l => ({ description: l.description, qtyOut: l.qtyOut, qtyReturned: l.qtyReturned, unit: l.unit })),
        returnDate: new Date().toISOString(),
        returnRecordedBy: 'SECURITY',
        returnNote: returnNote || '',
      });
      if (!allFull) {
        const missing = returnLines.filter(l => l.qtyReturned < l.qtyOut).map(l => `${l.description}: ออก ${l.qtyOut} กลับ ${l.qtyReturned} ${l.unit}`).join('\n');
        alert(`⚠️ ของกลับไม่ครบ!\n\n${missing}\n\nระบบจะแจ้งหัวหน้าแผนก ${returnItem.department}`);
      } else {
        alert('✅ ของกลับครบทุกรายการ');
      }
    } catch (err) {
      console.warn('Return save error:', err);
      alert('เกิดข้อผิดพลาด: ' + err.message);
    }
    setShowReturnModal(false);
    setReturnItem(null);
    setReturnLines([]);
    setReturnNote('');
    setSelectedItem(null);
    setDetailType(null);
  };

  // ของที่ออกไปแล้วยังไม่กลับ/กลับไม่ครบ
  const outstandingItems = useMemo(() =>
    materials.filter(m => m.type === 'OUT' && m.returnStatus !== 'returned' && (m.status === 'approved' || m.status === 'pending'))
  , [materials]);

  const stats = useMemo(() => ({
    inside: visitors.filter(v => v.status === 'IN').length,
    empOut: employees.filter(e => e.status === 'OUT').length,
    materialToday: materials.length,
    pendingDocs: approvedDocs.length,
    vehicleToday: todayVehicleBookings.length,
    outstandingGoods: outstandingItems.length,
  }), [visitors, employees, materials, approvedDocs, todayVehicleBookings, outstandingItems]);

  const Badge = ({ status, type }) => {
    const colors = (status === 'IN' || status === 'PENDING')
      ? 'bg-green-100 text-green-800 border-green-200'
      : 'bg-slate-100 text-slate-600 border-slate-200';

    let label = status === 'IN' ? 'อยู่ข้างใน' : status === 'PENDING' ? 'รอเข้า' : 'ออกแล้ว';
    if (type === 'employee') label = status === 'OUT' ? 'อยู่นอกพื้นที่' : 'กลับมาแล้ว';
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colors}`}>
        {label}
      </span>
    );
  };

  const navItems = [
    { id: 'dashboard', label: 'หน้าหลัก', icon: LayoutDashboard },
    { id: 'visitors', label: 'ผู้มาติดต่อ', icon: UserPlus },
    { id: 'materials', label: 'ของเข้า-ออก', icon: Package },
    { id: 'employees', label: 'ออกนอก', icon: Users },
    { id: 'vehicleBookings', label: 'รถ', icon: Car },
    { id: 'documents', label: 'เอกสาร', icon: FileText, count: approvedDocs.length },
  ];

  const filteredVisitors = visitors.filter(v =>
    (v.name || '').includes(searchTerm) || (v.company || '').includes(searchTerm) || (v.plate || '').includes(searchTerm)
  );

  // Detail Modal
  const DetailModal = () => {
    if (!selectedItem) return null;
    return (
      <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-end sm:items-center justify-center p-4">
        <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl max-h-[92vh] flex flex-col">
          <div className="shrink-0 p-5 border-b flex justify-between items-center bg-white rounded-t-3xl">
            <h3 className="text-xl font-bold flex items-center gap-2 text-slate-800">
              <FileText className="text-blue-600" size={24} /> รายละเอียดข้อมูล
            </h3>
            <button onClick={() => { setSelectedItem(null); setDetailType(null); }} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 space-y-3" style={{WebkitOverflowScrolling:'touch'}}>
            {detailType === 'visitor' && (
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">ชื่อผู้มาติดต่อ</p>
                    <p className="text-2xl font-black text-slate-900">{selectedItem.name}</p>
                    {selectedItem.refCode && <p className="text-xs text-blue-600 font-bold mt-1">รหัส: {selectedItem.refCode}</p>}
                  </div>
                  <Badge status={selectedItem.status} />
                </div>
                <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                  <div><p className="text-xs font-bold text-slate-400 uppercase">บริษัท</p><p className="font-semibold text-slate-700">{selectedItem.company}</p></div>
                  <div><p className="text-xs font-bold text-slate-400 uppercase">เบอร์โทร</p><p className="font-semibold text-slate-700">{selectedItem.contactPhone || '-'}</p></div>
                  <div><p className="text-xs font-bold text-slate-400 uppercase">ทะเบียนรถ</p><p className="font-semibold text-slate-700">{selectedItem.plate || '-'}</p></div>
                  <div><p className="text-xs font-bold text-slate-400 uppercase">วัตถุประสงค์</p><p className="font-semibold text-slate-700">{selectedItem.purpose}</p></div>
                  <div><p className="text-xs font-bold text-slate-400 uppercase">พบ</p><p className="font-semibold text-slate-700">{selectedItem.hostStaffId}</p></div>
                  <div><p className="text-xs font-bold text-slate-400 uppercase">แผนก</p><p className="font-semibold text-slate-700">{selectedItem.department}</p></div>
                  <div><p className="text-xs font-bold text-slate-400 uppercase">จำนวนคน</p><p className="font-semibold text-slate-700">{selectedItem.count || 1}</p></div>
                  <div><p className="text-xs font-bold text-slate-400 uppercase">ยานพาหนะ</p><p className="font-semibold text-slate-700">{selectedItem.vehicleType || '-'}</p></div>
                </div>

                {/* เวลาเข้า-ออก */}
                <div className="space-y-3 pt-4 border-t border-slate-100">
                  {selectedItem.status !== 'PENDING' && (
                    <div className="flex items-center gap-3"><LogIn size={18} className="text-green-500" /><div><p className="text-[10px] font-bold text-slate-400 uppercase">เวลาเข้า</p><p className="text-sm font-bold">{selectedItem.entryTime}</p></div></div>
                  )}
                  {selectedItem.cardNumber && (
                    <div className="flex items-center gap-3"><ShieldCheck size={18} className="text-blue-500" /><div><p className="text-[10px] font-bold text-slate-400 uppercase">เลขบัตรที่มอบ</p><p className="text-sm font-bold text-blue-600">{selectedItem.cardNumber}</p></div></div>
                  )}
                  {selectedItem.exitTime && (
                    <div className="flex items-center gap-3"><LogOut size={18} className="text-red-400" /><div><p className="text-[10px] font-bold text-slate-400 uppercase">เวลาออก</p><p className="text-sm font-bold">{selectedItem.exitTime}</p></div></div>
                  )}
                </div>

                {/* ลายเซ็นหัวหน้า (สำหรับอนุมัติออก) */}
                {selectedItem.status === 'IN' && selectedItem.headApprovalSign && (
                  <div className="p-4 bg-green-50 rounded-2xl border border-green-200">
                    <p className="text-[10px] font-bold text-green-600 uppercase mb-2">✅ หัวหน้าอนุมัติให้ออกแล้ว</p>
                    <p className="text-sm font-bold text-green-800 mb-2">เซ็นโดย: {selectedItem.headApprovalBy || '-'}</p>
                    <img src={selectedItem.headApprovalSign} alt="ลายเซ็นหัวหน้า" className="h-12 object-contain bg-white rounded-lg border p-1" />
                  </div>
                )}

                {/* กรอกเลขบัตร (สำหรับอนุมัติเข้า) */}
                {selectedItem.status === 'PENDING' && (
                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200">
                    <p className="text-xs font-bold text-amber-700 mb-3">มอบบัตรผู้มาติดต่อ</p>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">เลขบัตรที่มอบ *</label>
                    <input
                      type="text"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      placeholder="เช่น V-001, C-012"
                      className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-lg font-mono font-bold text-center uppercase"
                    />
                  </div>
                )}

                {selectedItem.note && <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100"><p className="text-[10px] font-bold text-blue-400 uppercase mb-1">หมายเหตุ</p><p className="text-sm text-blue-900">{selectedItem.note}</p></div>}
              </div>
            )}
            {detailType === 'material' && (
              <div className="space-y-2">
                <div className="flex justify-between items-start">
                  <div><p className="text-lg font-black text-slate-900">{selectedItem.item}</p><p className="text-[10px] text-blue-600 font-bold">{selectedItem.refNo}</p></div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${selectedItem.type === 'IN' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>{selectedItem.type === 'IN' ? 'นำเข้า' : 'นำออก'}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-slate-100">
                  <div><p className="text-[9px] font-bold text-slate-400 uppercase">ผู้รับผิดชอบ</p><p className="font-semibold text-slate-700">{selectedItem.person}</p></div>
                  <div><p className="text-[9px] font-bold text-slate-400 uppercase">แผนก</p><p className="font-semibold text-slate-700">{selectedItem.department}</p></div>
                  <div><p className="text-[9px] font-bold text-slate-400 uppercase">ประตู</p><p className="font-semibold text-slate-700">{selectedItem.gate}</p></div>
                  <div><p className="text-[9px] font-bold text-slate-400 uppercase">วันที่</p><p className="font-semibold text-slate-700">{selectedItem.time}</p></div>
                  {selectedItem.vehiclePlate && <div><p className="text-[9px] font-bold text-slate-400 uppercase">ทะเบียนรถ</p><p className="font-semibold text-slate-700">{selectedItem.vehiclePlate}</p></div>}
                  {selectedItem.sealNo && <div><p className="text-[9px] font-bold text-slate-400 uppercase">Seal</p><p className="font-semibold text-slate-700">{selectedItem.sealNo}</p></div>}
                  {selectedItem.deliveryDate && <div><p className="text-[9px] font-bold text-slate-400 uppercase">วันที่รับ/ส่งสินค้า</p><p className="font-semibold text-slate-700">{selectedItem.deliveryDate}</p></div>}
                  {selectedItem.deliveryTime && <div><p className="text-[9px] font-bold text-slate-400 uppercase">เวลารับ/ส่ง</p><p className="font-semibold text-slate-700">{selectedItem.deliveryTime}</p></div>}
                </div>
                {/* สถานะการอนุมัติ */}
                {(selectedItem.approvalSteps || []).length > 0 && (
                  <div className="pt-2 border-t border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">สถานะการอนุมัติ</p>
                    <div className="space-y-1">
                      {selectedItem.approvalSteps.map((s, i) => (
                        <div key={i} className={`p-2 rounded-lg flex items-center gap-2 ${s.status === 'approved' ? 'bg-green-50' : s.status === 'pending' ? 'bg-yellow-50' : 'bg-slate-50'}`}>
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 ${s.status === 'approved' ? 'bg-green-500' : s.status === 'pending' ? 'bg-yellow-400' : 'bg-slate-300'}`}>
                            {s.status === 'approved' ? '✓' : s.step}
                          </span>
                          <div className="flex-1 min-w-0">
                            <span className={`text-xs font-bold ${s.status === 'approved' ? 'text-green-800' : s.status === 'pending' ? 'text-yellow-800' : 'text-slate-400'}`}>{s.label}</span>
                            {s.approvedBy && <span className="text-[10px] text-green-600 ml-1">({s.approvedBy})</span>}
                          </div>
                          {s.approvedSign && <img src={s.approvedSign} alt="sign" className="h-8 object-contain bg-white rounded border p-0.5 shrink-0" />}
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${s.status === 'approved' ? 'bg-green-200 text-green-800' : s.status === 'pending' ? 'bg-yellow-200 text-yellow-800' : 'bg-slate-200 text-slate-500'}`}>
                            {s.status === 'approved' ? 'เซ็นแล้ว' : s.status === 'pending' ? 'รอเซ็น' : 'รอ'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* รายการสินค้าพร้อมจำนวน */}
                {(selectedItem.lines || []).filter(l => l.description).length > 0 && (
                  <div className="pt-4 border-t border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase mb-2">รายการสินค้า</p>
                    <div className="space-y-3">
                      {selectedItem.lines.filter(l => l.description).map((l, idx) => (
                        <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="flex justify-between items-center">
                            <p className="font-bold text-slate-800">{idx+1}. {l.description}</p>
                            <p className="text-sm font-mono text-slate-600">{l.qty || '-'} {l.unit || ''}</p>
                          </div>
                          {(l.photos || []).length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {l.photos.map((src, pi) => (
                                <img key={pi} src={src} alt={`รูป ${idx+1}-${pi+1}`} className="w-20 h-20 object-cover rounded-lg border border-slate-300 cursor-pointer hover:opacity-80" onClick={() => window.open(src, '_blank')} />
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* ลายเซ็นผู้นำของ */}
                {selectedItem.carrierSign && (
                  <div className="pt-4 border-t border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase mb-2">ลายเซ็นผู้นำของ</p>
                    <img src={selectedItem.carrierSign} alt="ลายเซ็นผู้นำของ" className="max-w-[200px] max-h-[100px] border border-slate-300 rounded-lg bg-white p-1" />
                  </div>
                )}
                {selectedItem.note && selectedItem.note !== '-' && <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100"><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">หมายเหตุ</p><p className="text-sm text-slate-700">{selectedItem.note}</p></div>}

                {/* ปุ่ม action */}
                <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                  {!selectedItem.secApproved && (
                    <button
                      onClick={async () => {
                        const step3 = (selectedItem.approvalSteps || []).find(s => s.step === 3 && s.status === 'pending');
                        const pendingStep = (selectedItem.approvalSteps || []).find(s => s.status === 'pending');
                        const docId = step3?._docId || pendingStep?._docId || selectedItem.id;
                        try {
                          const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'approval_workflows', docId);
                          await updateDoc(docRef, { status: 'approved', acknowledgedAt: new Date().toISOString(), approvedBy: 'SECURITY' });
                          alert('✅ รปภ. รับทราบเรียบร้อย');
                        } catch (err) { alert('เกิดข้อผิดพลาด: ' + err.message); }
                        setSelectedItem(null); setDetailType(null);
                      }}
                      className={`w-full py-2.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 ${selectedItem.hrApproved ? 'bg-green-600 text-white' : 'bg-orange-500 text-white'}`}
                    >
                      <ShieldCheck size={18} /> {selectedItem.hrApproved ? 'รปภ. รับทราบ / อนุมัติ' : 'รปภ. รับทราบ (ยังไม่ผ่าน HR)'}
                    </button>
                  )}
                  {selectedItem.secApproved && <p className="text-green-700 font-bold text-xs text-center">✅ รปภ. รับทราบแล้ว</p>}
                  {selectedItem.type === 'OUT' && selectedItem.returnStatus !== 'returned' && (
                    <button onClick={() => openReturnCheck(selectedItem)} className="w-full bg-amber-500 text-white py-2.5 rounded-xl font-black text-sm flex items-center justify-center gap-2">
                      <Package size={18} /> ตรวจรับของกลับ
                    </button>
                  )}
                  {selectedItem.returnStatus === 'returned' && <p className="text-green-700 font-bold text-xs text-center">✅ ของกลับครบแล้ว</p>}
                  {selectedItem.returnStatus === 'partial' && (
                    <div className="p-2 bg-red-50 rounded-lg text-center text-[11px]">
                      <p className="text-red-700 font-bold">⚠️ ของกลับไม่ครบ</p>
                      {(selectedItem.returnLines || []).filter(l => l.qtyReturned < l.qtyOut).map((l, i) => (
                        <p key={i} className="text-red-600">{l.description}: ออก {l.qtyOut} กลับ {l.qtyReturned}</p>
                      ))}
                      {selectedItem.returnNote && <p className="text-red-800 font-bold">เหตุผล: {selectedItem.returnNote}</p>}
                    </div>
                  )}
                </div>
              </div>
            )}
            {detailType === 'vehicleBooking' && (
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">ทะเบียนรถ</p>
                    <p className="text-2xl font-black text-slate-900">{selectedItem.plate || '-'}</p>
                    <p className="text-xs text-teal-600 font-bold mt-1">{selectedItem.brand || selectedItem.vehicleId || '-'}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                    selectedItem.vehicleStatus === 'returned' ? 'bg-green-100 text-green-800 border-green-200' :
                    selectedItem.vehicleStatus === 'out' ? 'bg-red-100 text-red-800 border-red-200' :
                    'bg-yellow-100 text-yellow-800 border-yellow-200'
                  }`}>
                    {selectedItem.vehicleStatus === 'returned' ? 'กลับแล้ว' : selectedItem.vehicleStatus === 'out' ? 'ออกแล้ว' : 'รอออก'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                  <div><p className="text-xs font-bold text-slate-400 uppercase">ผู้จอง</p><p className="font-semibold text-slate-700">{selectedItem.bookedByName || selectedItem.requesterName || selectedItem.bookedBy || selectedItem.requesterId || '-'}</p></div>
                  <div><p className="text-xs font-bold text-slate-400 uppercase">แผนก</p><p className="font-semibold text-slate-700">{selectedItem.department || selectedItem.requesterDepartment || '-'}</p></div>
                  <div><p className="text-xs font-bold text-slate-400 uppercase">ปลายทาง</p><p className="font-semibold text-slate-700">{selectedItem.destination || '-'}</p></div>
                  <div><p className="text-xs font-bold text-slate-400 uppercase">วัตถุประสงค์</p><p className="font-semibold text-slate-700">{Array.isArray(selectedItem.purpose) ? (selectedItem.purpose.filter(p => p).join(', ') || '-') : (selectedItem.purpose || '-')}</p></div>
                  <div><p className="text-xs font-bold text-slate-400 uppercase">วันที่</p><p className="font-semibold text-slate-700">{selectedItem.date || '-'}</p></div>
                  <div><p className="text-xs font-bold text-slate-400 uppercase">ผู้ร่วมเดินทาง</p><p className="font-semibold text-slate-700">{Array.isArray(selectedItem.passengers) ? (selectedItem.passengers.length > 0 ? `${selectedItem.passengers.length} คน` : '-') : (selectedItem.passengers || '-')}</p></div>
                </div>
                {selectedItem.driverName && (
                  <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-6">
                    <div><p className="text-xs font-bold text-slate-400 uppercase">พนักงานขับรถ</p><p className="font-semibold text-slate-700">{selectedItem.driverName}</p></div>
                    {selectedItem.driverPhone && <div><p className="text-xs font-bold text-slate-400 uppercase">เบอร์โทร</p><p className="font-semibold text-slate-700">{selectedItem.driverPhone}</p></div>}
                  </div>
                )}
                {Array.isArray(selectedItem.passengers) && selectedItem.passengers.length > 0 && (
                  <div className="pt-3 border-t border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase mb-2">รายชื่อผู้ร่วมเดินทาง</p>
                    <div className="space-y-1.5">
                      {selectedItem.passengers.map((p, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl text-sm">
                          <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-[10px] font-black shrink-0">{i+1}</span>
                          <span className="font-semibold text-slate-800 flex-1">{p.name || '-'}</span>
                          {p.empId && <span className="text-[10px] text-slate-400 font-mono">{p.empId}</span>}
                          {p.dept && <span className="text-[10px] px-1.5 py-0.5 bg-teal-50 text-teal-700 rounded-full font-bold">{p.dept}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                  <div className="p-4 bg-red-50 rounded-2xl border border-red-100 text-center">
                    <p className="text-[10px] font-bold text-red-400 uppercase">เวลาออก (แผน)</p>
                    <p className="text-lg font-bold text-red-600">{selectedItem.timeStart || '-'}</p>
                    {selectedItem.exitTime && <p className="text-[10px] text-red-500 mt-1">ออกจริง: {new Date(selectedItem.exitTime).toLocaleTimeString('th-TH')}</p>}
                  </div>
                  <div className="p-4 bg-green-50 rounded-2xl border border-green-100 text-center">
                    <p className="text-[10px] font-bold text-green-400 uppercase">เวลากลับ (แผน)</p>
                    <p className="text-lg font-bold text-green-600">{selectedItem.timeEnd || '-'}</p>
                    {selectedItem.returnTime && <p className="text-[10px] text-green-500 mt-1">กลับจริง: {new Date(selectedItem.returnTime).toLocaleTimeString('th-TH')}</p>}
                  </div>
                </div>
                {selectedItem.note && <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100"><p className="text-[10px] font-bold text-blue-400 uppercase mb-1">หมายเหตุ</p><p className="text-sm text-blue-900">{selectedItem.note}</p></div>}
              </div>
            )}
            {detailType === 'employee' && (
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div><p className="text-xs font-bold text-slate-400 uppercase">ชื่อพนักงาน</p><p className="text-2xl font-black text-slate-900">{selectedItem.name}</p><p className="text-xs text-slate-500 font-bold mt-1">ID: {selectedItem.empId}</p></div>
                  <Badge status={selectedItem.status} type="employee" />
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4">
                  <div className="p-4 bg-red-50 rounded-2xl border border-red-100 text-center"><p className="text-[10px] font-bold text-red-400 uppercase">เวลาออก</p><p className="text-lg font-bold text-red-600">{selectedItem.timeOut || '-'}</p></div>
                  <div className="p-4 bg-green-50 rounded-2xl border border-green-100 text-center"><p className="text-[10px] font-bold text-green-400 uppercase">เวลากลับ</p><p className="text-lg font-bold text-green-600">{selectedItem.timeIn || 'ยังไม่กลับ'}</p></div>
                </div>
              </div>
            )}
          </div>

          {/* ปุ่ม action — sticky footer ไม่ต้อง scroll ก็เห็น */}
          <div className="shrink-0 flex flex-col gap-3 p-5 border-t border-slate-100 bg-white rounded-b-3xl">
              {/* ปุ่มอนุมัติเข้า (PENDING → IN) */}
              {detailType === 'visitor' && selectedItem.status === 'PENDING' && (
                <button
                  onClick={() => handleApproveEntry(selectedItem.id || selectedItem._docId, cardNumber)}
                  disabled={!cardNumber.trim()}
                  className="w-full bg-green-600 text-white py-4 rounded-xl font-black text-lg hover:bg-green-700 transition-colors shadow-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <LogIn size={22} /> บันทึกข้อมูล + อนุมัติเข้าโรงงาน
                </button>
              )}
              {/* ปุ่มอนุมัติออก (IN → OUT) */}
              {detailType === 'visitor' && selectedItem.status === 'IN' && selectedItem.headApprovalSign && (
                <button
                  onClick={() => handleVisitorExit(selectedItem.id || selectedItem._docId)}
                  className="w-full bg-red-600 text-white py-4 rounded-xl font-black text-lg hover:bg-red-700 transition-colors shadow-lg flex items-center justify-center gap-2"
                >
                  <LogOut size={22} /> อนุมัติออกจากโรงงาน + เก็บบัตรคืน
                </button>
              )}
              {/* ปุ่มบันทึกออก (vehicleBooking) */}
              {detailType === 'vehicleBooking' && (!selectedItem.vehicleStatus || selectedItem.vehicleStatus === 'pending') && (
                <button
                  onClick={() => { handleVehicleExit(selectedItem); setSelectedItem(null); setDetailType(null); }}
                  className="w-full bg-red-600 text-white py-4 rounded-xl font-black text-lg hover:bg-red-700 transition-colors shadow-lg flex items-center justify-center gap-2"
                >
                  <LogOut size={22} /> บันทึกออก
                </button>
              )}
              {/* ปุ่มบันทึกกลับ (vehicleBooking) */}
              {detailType === 'vehicleBooking' && selectedItem.vehicleStatus === 'out' && (
                <button
                  onClick={() => { handleVehicleReturn(selectedItem); setSelectedItem(null); setDetailType(null); }}
                  className="w-full bg-green-600 text-white py-4 rounded-xl font-black text-lg hover:bg-green-700 transition-colors shadow-lg flex items-center justify-center gap-2"
                >
                  <LogIn size={22} /> บันทึกกลับ
                </button>
              )}
              {/* แจ้งว่ารอหัวหน้าเซ็น */}
              {detailType === 'visitor' && selectedItem.status === 'IN' && !selectedItem.headApprovalSign && (
                <div className="w-full p-4 bg-amber-50 rounded-xl border border-amber-200 text-center">
                  <p className="text-amber-700 font-bold text-sm">⏳ รอหัวหน้าแผนกอนุมัติให้ออก</p>
                  <p className="text-amber-600 text-xs mt-1">เมื่อหัวหน้าเซ็นอนุมัติแล้ว ปุ่มจะขึ้นให้กด</p>
                </div>
              )}
              <button onClick={() => { setSelectedItem(null); setDetailType(null); setCardNumber(''); }} className="w-full bg-white border border-slate-200 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-100 transition-colors">ปิด</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 overflow-x-hidden">
      {DetailModal()}

      {/* Return Check Modal */}
      {showReturnModal && returnItem && (
        <div className="fixed inset-0 bg-slate-900/60 z-[110] flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto overscroll-none" style={{WebkitOverflowScrolling:'touch'}}>
            <div className="sticky top-0 z-10 p-5 border-b bg-orange-50 rounded-t-3xl">
              <h3 className="text-xl font-bold flex items-center gap-2 text-orange-800">
                <Package className="text-orange-600" size={24} /> ตรวจรับของกลับ
              </h3>
              <p className="text-sm text-orange-600 mt-1">ผู้นำของ: {returnItem.person} | แผนก: {returnItem.department}</p>
            </div>
            <div className="p-6 space-y-4">
              {returnLines.map((l, idx) => (
                <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <p className="font-bold text-slate-800 mb-2">{idx+1}. {l.description}</p>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">จำนวนออก</p>
                      <p className="text-lg font-black text-red-600">{l.qtyOut} {l.unit}</p>
                    </div>
                    <div className="text-center flex-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">จำนวนกลับ</p>
                      <input
                        type="number"
                        min="0"
                        max={l.qtyOut}
                        value={l.qtyReturned}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '') { setReturnLines(prev => prev.map((rl, ri) => ri === idx ? { ...rl, qtyReturned: 0 } : rl)); return; }
                          const val = Math.max(0, Math.min(l.qtyOut, parseInt(raw, 10) || 0));
                          setReturnLines(prev => prev.map((rl, ri) => ri === idx ? { ...rl, qtyReturned: val } : rl));
                        }}
                        className="w-full p-3 border-2 border-slate-300 rounded-xl text-center text-lg font-black focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none"
                      />
                    </div>
                    <div className="text-center">
                      {l.qtyReturned >= l.qtyOut
                        ? <span className="text-green-600 font-bold text-xl">✅</span>
                        : <span className="text-red-600 font-bold text-xl">⚠️</span>
                      }
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {/* ช่องเหตุผล — แสดงเมื่อของไม่ครบ */}
            {!returnLines.every(l => l.qtyReturned >= l.qtyOut) && (
              <div className="px-6 pb-2">
                <label className="text-xs font-bold text-red-600 uppercase block mb-2">เหตุผลที่กลับไม่ครบ *</label>
                <textarea
                  value={returnNote}
                  onChange={(e) => setReturnNote(e.target.value)}
                  placeholder="เช่น ของเสียหาย, ส่งซ่อม, ฝากไว้ที่ลูกค้า..."
                  className="w-full p-3 border-2 border-red-300 rounded-xl outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200 text-sm h-20 resize-none"
                />
              </div>
            )}
            <div className="px-6 pb-6 pt-4 border-t border-slate-100 flex flex-col gap-3">
              <button
                onClick={handleSaveReturn}
                disabled={!returnLines.every(l => l.qtyReturned >= l.qtyOut) && !returnNote.trim()}
                className={`w-full py-4 rounded-xl font-black text-lg shadow-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  returnLines.every(l => l.qtyReturned >= l.qtyOut)
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                {returnLines.every(l => l.qtyReturned >= l.qtyOut)
                  ? <><ShieldCheck size={22} /> ยืนยัน — ของกลับครบ</>
                  : <><Package size={22} /> ยืนยัน — ของกลับไม่ครบ (แจ้งหัวหน้า)</>
                }
              </button>
              <button onClick={() => { setShowReturnModal(false); setReturnItem(null); setReturnNote(''); }} className="w-full bg-white border border-slate-200 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-100">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}

      {/* Top Navigation */}
      <nav className="fixed top-0 w-full bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-700 z-50 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="bg-blue-500 p-2.5 rounded-xl shadow-lg shadow-blue-500/30"><ShieldCheck className="text-white w-7 h-7" /></div>
            <h1 className="font-black text-xl text-white tracking-tight hidden lg:block">Security<span className="text-blue-400">Gate</span></h1>
          </div>
          <div className="hidden md:flex items-center gap-3 flex-1 justify-center overflow-x-auto mx-4" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {navItems.map((item) => (
              <button key={item.id} onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all whitespace-nowrap flex-shrink-0 ${activeTab === item.id ? 'bg-white text-slate-900 shadow-lg' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}>
                <item.icon size={18} />
                {item.label}
                {item.count > 0 && <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full ml-1 animate-pulse">{item.count}</span>}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={startQRScanner} className="bg-emerald-500 text-white px-5 py-3 rounded-xl text-sm font-black hover:bg-emerald-400 flex items-center gap-2 shadow-lg shadow-emerald-500/30 transition-all active:scale-95">
              <Camera size={20} /> <span className="hidden sm:inline">สแกน QR</span>
            </button>
            {onLogout && <button onClick={onLogout} className="p-3 hover:bg-red-500/20 rounded-xl text-slate-400 hover:text-red-400 transition-all" title="ออกจากระบบ"><LogOut size={22} /></button>}
            <button className="md:hidden p-3 text-slate-300 hover:bg-white/10 rounded-lg" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-16 left-0 w-full bg-white border-b border-slate-200 shadow-xl py-4 flex flex-col gap-1 px-4">
            {navItems.map((item) => (
              <button key={item.id} onClick={() => { setActiveTab(item.id); setIsMobileMenuOpen(false); }}
                className={`flex items-center gap-3 p-3 rounded-xl text-sm font-medium ${activeTab === item.id ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50'}`}>
                <item.icon size={20} /> {item.label}
                {item.count > 0 && <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-auto">{item.count}</span>}
              </button>
            ))}
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main className="pt-28 pb-12 px-4 md:px-8 max-w-7xl mx-auto w-full">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">{navItems.find(n => n.id === activeTab)?.label}</h2>
            <p className="text-slate-500 text-sm mt-0.5">กำลังตรวจสอบพื้นที่ - {getCurrentTime()}</p>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type="text" placeholder="ค้นหาข้อมูล..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </div>

        {/* Dashboard — Clean Auto-Sort Card Grid + All Sections */}
        {activeTab === 'dashboard' && (() => {
          const allVisitors = visitors; // ทุกสถานะ
          const empOut = employees.filter(e => e.status === 'OUT');
          const matsIn = materials.filter(m => m.type === 'IN' && m.time === todayStr);
          const matsOut = materials.filter(m => m.type === 'OUT' && m.time === todayStr);
          const pendingDocsList = approvedDocs.filter(d => d.status === 'pending');

          // แยกกลุ่มผู้มาติดต่อ 4 กลุ่ม
          const vToday    = allVisitors.filter(v => v.rawStatus !== STATUS.INSIDE && v.rawStatus !== STATUS.APPROVED_OUT && v.rawStatus !== STATUS.COMPLETED && v.entryTime && v.entryTime.slice(0,10) === todayStr);
          const vFuture   = allVisitors.filter(v => v.rawStatus !== STATUS.INSIDE && v.rawStatus !== STATUS.APPROVED_OUT && v.rawStatus !== STATUS.COMPLETED && v.entryTime && v.entryTime.slice(0,10) > todayStr);
          const vInside   = allVisitors.filter(v => v.rawStatus === STATUS.INSIDE);
          const vApprOut  = allVisitors.filter(v => v.rawStatus === STATUS.APPROVED_OUT);

          // Define all cards
          const cards = [
            {
              id: 'vToday',
              title: 'รอเข้า — มาวันนี้',
              icon: <UserCheck size={18} />,
              count: vToday.length,
              alert: vToday.length > 0,
              alertText: `${vToday.length} ราย`,
              activeColor: 'border-yellow-500 bg-slate-900',
              headerColor: 'bg-yellow-500',
              emptyText: 'ไม่มีผู้มาติดต่อวันนี้',
              ref: secVisitors,
              rows: vToday.map(v => ({
                key: v.id,
                main: v.name,
                sub: `${v.company} · ติดต่อ ${v.hostStaffId}`,
                badge: { label: 'รอเข้า', color: 'bg-yellow-500' },
                onClick: () => { setSelectedItem(v); setDetailType('visitor'); },
              })),
            },
            {
              id: 'vApprOut',
              title: 'รอออก — หัวหน้าอนุมัติแล้ว',
              icon: <LogOut size={18} />,
              count: vApprOut.length,
              alert: vApprOut.length > 0,
              alertText: `${vApprOut.length} ราย`,
              activeColor: 'border-orange-500 bg-slate-900',
              headerColor: 'bg-orange-500',
              emptyText: 'ไม่มีผู้รอออก',
              ref: null,
              rows: vApprOut.map(v => ({
                key: v.id,
                main: v.name,
                sub: `${v.company} · ติดต่อ ${v.hostStaffId}`,
                badge: { label: '✅ รอออก', color: 'bg-orange-500' },
                onClick: () => { setSelectedItem(v); setDetailType('visitor'); },
              })),
            },
            {
              id: 'vInside',
              title: 'อยู่ในโรงงาน',
              icon: <ShieldCheck size={18} />,
              count: vInside.length,
              alert: false,
              activeColor: 'border-green-500 bg-slate-900',
              headerColor: 'bg-green-600',
              emptyText: 'ไม่มีผู้มาติดต่ออยู่ในโรงงาน',
              ref: null,
              rows: vInside.map(v => ({
                key: v.id,
                main: v.name,
                sub: `${v.company} · ติดต่อ ${v.hostStaffId}`,
                badge: { label: 'อยู่ใน', color: 'bg-green-500' },
                onClick: () => { setSelectedItem(v); setDetailType('visitor'); },
              })),
            },
            {
              id: 'vFuture',
              title: 'นัดล่วงหน้า',
              icon: <UserPlus size={18} />,
              count: vFuture.length,
              alert: false,
              activeColor: 'border-blue-400 bg-slate-900',
              headerColor: 'bg-blue-500',
              emptyText: 'ไม่มีนัดล่วงหน้า',
              ref: null,
              rows: vFuture.map(v => ({
                key: v.id,
                main: v.name,
                sub: `${v.company} · ${v.entryTime?.slice(0,10) || '-'}`,
                badge: { label: 'ล่วงหน้า', color: 'bg-blue-500' },
                onClick: () => { setSelectedItem(v); setDetailType('visitor'); },
              })),
            },
            {
              id: 'employees',
              title: 'พนักงานออกข้างนอก',
              icon: <Clock size={18} />,
              count: empOut.length,
              alert: false,
              activeColor: 'border-orange-500 bg-slate-900',
              headerColor: 'bg-orange-500',
              emptyText: 'พนักงานทุกคนอยู่ในโรงงาน ✓',
              ref: secEmployees,
              rows: empOut.map((e, i) => ({
                key: i,
                main: e.name,
                sub: `${e.department} · ออก ${e.time}`,
                badge: { label: 'บันทึกกลับ', color: 'bg-orange-500 cursor-pointer hover:bg-orange-400', onClick: (ev) => { ev.stopPropagation(); handleEmployeeReturn(e); } },
              })),
            },
            {
              id: 'matsOut',
              title: 'พัสดุออกวันนี้',
              icon: <LogOut size={18} />,
              count: matsOut.length,
              alert: stats.outstandingGoods > 0,
              alertText: `⚠️ ค้างออก ${stats.outstandingGoods} รายการ`,
              activeColor: 'border-rose-500 bg-slate-900',
              headerColor: 'bg-rose-600',
              emptyText: 'ยังไม่มีพัสดุออก',
              ref: secMaterials,
              rows: matsOut.map((m, i) => ({
                key: i,
                main: m.item || '-',
                sub: `${m.person || '-'} · ${m.department || '-'} · ${m.time || '-'}`,
                badge: m.hrApproved && !m.secApproved ? { label: 'ยืนยันผ่าน', color: 'bg-emerald-500 cursor-pointer hover:bg-emerald-400', onClick: (ev) => { ev.stopPropagation(); handleConfirmGoodsGate(ev, m); } } : m.headApproved && !m.hrApproved ? { label: 'รอ HR', color: 'bg-yellow-500' } : !m.headApproved ? { label: 'รอหน.', color: 'bg-slate-500' } : undefined,
                onClick: () => { setSelectedItem(m); setDetailType('material'); },
              })),
            },
            {
              id: 'matsIn',
              title: 'พัสดุเข้าวันนี้',
              icon: <LogIn size={18} />,
              count: matsIn.length,
              alert: false,
              activeColor: 'border-emerald-500 bg-slate-900',
              headerColor: 'bg-emerald-600',
              emptyText: 'ยังไม่มีพัสดุเข้า',
              ref: null,
              rows: matsIn.map((m, i) => ({
                key: i,
                main: m.item || '-',
                sub: `${m.person || '-'} · ${m.department || '-'} · ${m.time || '-'}`,
                badge: m.hrApproved && !m.secApproved ? { label: 'ยืนยันผ่าน', color: 'bg-emerald-500 cursor-pointer hover:bg-emerald-400', onClick: (ev) => { ev.stopPropagation(); handleConfirmGoodsGate(ev, m); } } : undefined,
                onClick: () => { setSelectedItem(m); setDetailType('material'); },
              })),
            },
            {
              id: 'docs',
              title: 'เอกสารรอรับทราบ',
              icon: <FileText size={18} />,
              count: pendingDocsList.length,
              alert: pendingDocsList.length > 0,
              alertText: `${pendingDocsList.length} รายการรอดำเนินการ`,
              activeColor: 'border-red-500 bg-slate-900',
              headerColor: 'bg-red-600',
              emptyText: 'ไม่มีเอกสารรอดำเนินการ ✓',
              ref: secDocs,
              rows: pendingDocsList.map((d, i) => ({
                key: i,
                main: d.topic || d.form || '-',
                sub: `${d.requesterName || d.requesterId || '-'} · ${d.department || '-'}`,
                badge: { label: 'รอดำเนินการ', color: 'bg-red-500' },
              })),
            },
            {
              id: 'vehicles',
              title: 'รถออกวันนี้',
              icon: <Car size={18} />,
              count: stats.vehicleToday,
              alert: false,
              activeColor: 'border-teal-500 bg-slate-900',
              headerColor: 'bg-teal-600',
              emptyText: 'ยังไม่มีรถออกวันนี้',
              ref: secVehicles,
              rows: todayVehicleBookings.map((b, i) => ({
                key: i,
                main: `${b.bookedByName || b.requesterName || b.bookedBy || b.requesterId || '-'} · ${(!b.plate || b.plate === 'รอใส่ทะเบียน') ? (b.brand || '-') : b.plate}`,
                sub: `${b.destination || '-'} · ${b.timeStart || '-'}–${b.timeEnd || '-'}`,
                onClick: async () => {
                  setSelectedItem(b);
                  setDetailType('vehicleBooking');
                  // ถ้าข้อมูลขาด ปลายทาง/วัตถุประสงค์/แผนก/ผู้ร่วมเดินทาง → ดึงจาก approval_workflows ผ่าน chainId
                  const missing = !b.destination || !b.department || !b.purpose || (Array.isArray(b.purpose) && b.purpose.length === 0);
                  if (missing && firebaseReady && db) {
                    try {
                      const wfRef = collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows');
                      let snapDocs = [];
                      if (b.chainId) {
                        const q1 = query(wfRef, where('chainId', '==', b.chainId));
                        const s1 = await getDocs(q1);
                        snapDocs = s1.docs.map(d => d.data());
                      }
                      if (snapDocs.length === 0) {
                        // fallback: จับคู่ด้วย requesterId + sourceForm + วันที่
                        const reqId = (b.bookedBy || b.requesterId || '').toUpperCase();
                        if (reqId) {
                          const q2 = query(wfRef, where('sourceForm', '==', 'VEHICLE_BOOKING'), where('requesterId', '==', reqId));
                          const s2 = await getDocs(q2);
                          snapDocs = s2.docs.map(d => d.data()).filter(s => s.requestPayload?.date === b.date);
                        }
                      }
                      const step1 = snapDocs.find(s => (s.step || 1) === 1) || snapDocs[0];
                      const rp = step1?.requestPayload || {};
                      setSelectedItem(prev => prev && prev.id === b.id ? {
                        ...prev,
                        department: prev.department || step1?.requesterDepartment || rp.department || '',
                        destination: prev.destination || rp.destination || '',
                        purpose: prev.purpose || (Array.isArray(rp.purpose) ? rp.purpose.filter(p => p).join(', ') : rp.purpose) || '',
                        passengers: (prev.passengers && prev.passengers.length) ? prev.passengers : (rp.passengers || []),
                        companions: prev.companions || rp.companions || [],
                        note: prev.note || rp.note || '',
                      } : prev);
                    } catch (e) { console.warn('enrich vehicle booking error:', e); }
                  }
                },
                badge: b.vehicleStatus === 'pending' ? { label: 'บันทึกออก', color: 'bg-red-500 cursor-pointer hover:bg-red-600', onClick: (ev) => { ev.stopPropagation(); handleVehicleExit(b); } } : b.vehicleStatus === 'out' ? { label: 'บันทึกกลับ', color: 'bg-green-500 cursor-pointer hover:bg-green-600', onClick: (ev) => { ev.stopPropagation(); handleVehicleReturn(b); } } : { label: 'เสร็จสิ้น', color: 'bg-slate-600' },
              })),
            },
          ];

          // Auto-sort: alert first → has data → empty
          const sorted = [...cards].sort((a, b) => {
            const scoreA = a.alert ? 2 : a.count > 0 ? 1 : 0;
            const scoreB = b.alert ? 2 : b.count > 0 ? 1 : 0;
            return scoreB - scoreA;
          });

          return (
            <div className="space-y-3">

              {/* Live Header */}
              <div className="bg-slate-900 rounded-2xl px-5 py-3 flex items-center justify-between border border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                  <span className="text-green-400 text-xs font-black uppercase tracking-widest">LIVE</span>
                  <span className="text-slate-400 text-sm">{dateStr2}</span>
                </div>
                <span className="text-white text-3xl font-black tracking-widest tabular-nums">{clockStr}</span>
                <button onClick={() => setShowDailyReport(true)}
                  className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-xl font-bold text-xs transition">
                  <FileText size={13} /> รายงานประจำวัน
                </button>
              </div>

              {/* Auto-sorted card grid */}
              <div className="grid grid-cols-3 gap-3">
                {sorted.map(card => {
                  const isEmpty = card.count === 0 && !card.alert;
                  return (
                    <div
                      key={card.id}
                      ref={card.ref}
                      className={`rounded-2xl border overflow-hidden flex flex-col transition-all ${isEmpty ? 'border-slate-800 bg-slate-900/50 opacity-60' : card.activeColor} ${card.alert ? 'ring-2 ring-yellow-400/60' : ''}`}
                    >
                      {/* Card Header */}
                      <div className={`px-4 py-3 flex items-center justify-between ${isEmpty ? 'bg-slate-800' : card.headerColor}`}>
                        <div className="flex items-center gap-2 text-white">
                          {card.icon}
                          <span className="font-black text-sm">{card.title}</span>
                          {card.alert && <span className="ml-1 text-[10px] font-black bg-yellow-400 text-slate-900 px-2 py-0.5 rounded-full animate-pulse">{card.alertText}</span>}
                        </div>
                        <span className={`text-2xl font-black ${isEmpty ? 'text-slate-500' : 'text-white'}`}>{card.count}</span>
                      </div>

                      {/* Card Rows */}
                      <div className="flex-1 divide-y divide-slate-800/60">
                        {card.rows.length === 0
                          ? <div className="flex items-center justify-center py-6 text-slate-600 text-sm font-bold">{card.emptyText}</div>
                          : card.rows.map(row => (
                            <div key={row.key}
                              className={`px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-800/80 transition ${row.onClick ? 'cursor-pointer' : ''}`}
                              onClick={row.onClick}>
                              <div className="min-w-0">
                                <p className="text-white font-bold text-sm truncate">{row.main}</p>
                                <p className="text-slate-400 text-[11px] truncate">{row.sub}</p>
                              </div>
                              {row.badge && (
                                <button
                                  className={`shrink-0 text-[10px] font-black text-white px-2.5 py-1 rounded-full ${row.badge.color}`}
                                  onClick={row.badge.onClick}
                                >{row.badge.label}</button>
                              )}
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          );
        })()}

        {/* Visitors Tab */}
        {activeTab === 'visitors' && (
          <div className="space-y-6">
            {showEntryForm && (
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl mb-8 max-w-3xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-xl font-black flex items-center gap-3 text-blue-600"><UserPlus size={26} /> บันทึกเข้าพื้นที่ใหม่</h3>
                  <button onClick={() => setShowEntryForm(false)} className="p-2 hover:bg-slate-100 rounded-full"><X size={24} className="text-slate-400" /></button>
                </div>
                <form onSubmit={handleVisitorEntry} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2"><label className="text-xs font-bold text-slate-500 uppercase ml-1">ชื่อ-นามสกุล</label><input required type="text" className="w-full p-3 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none" placeholder="ระบุชื่อ" value={newVisitor.name} onChange={(e) => setNewVisitor({ ...newVisitor, name: e.target.value })} /></div>
                  <div className="space-y-2"><label className="text-xs font-bold text-slate-500 uppercase ml-1">บริษัท/สังกัด</label><input required type="text" className="w-full p-3 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none" placeholder="ระบุบริษัท" value={newVisitor.company} onChange={(e) => setNewVisitor({ ...newVisitor, company: e.target.value })} /></div>
                  <div className="space-y-2"><label className="text-xs font-bold text-slate-500 uppercase ml-1">เบอร์โทร</label><input type="text" className="w-full p-3 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none" placeholder="08x-xxx-xxxx" value={newVisitor.contactPhone} onChange={(e) => setNewVisitor({ ...newVisitor, contactPhone: e.target.value })} /></div>
                  <div className="space-y-2"><label className="text-xs font-bold text-slate-500 uppercase ml-1">ทะเบียนรถ</label><input type="text" className="w-full p-3 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none" placeholder="กข 1234" value={newVisitor.plate} onChange={(e) => setNewVisitor({ ...newVisitor, plate: e.target.value })} /></div>
                  <div className="space-y-2"><label className="text-xs font-bold text-slate-500 uppercase ml-1">วัตถุประสงค์</label>
                    <select className="w-full p-3 border border-slate-200 rounded-2xl outline-none bg-white" value={newVisitor.purpose} onChange={(e) => setNewVisitor({ ...newVisitor, purpose: e.target.value })}>
                      <option value="">เลือก...</option><option value="ติดต่อธุรกิจ">ติดต่อธุรกิจ</option><option value="ซ่อมบำรุง">ซ่อมบำรุง</option><option value="ส่งของ">ส่งของ</option><option value="สัมภาษณ์งาน">สัมภาษณ์งาน</option><option value="อื่นๆ">อื่นๆ</option>
                    </select>
                  </div>
                  <div className="space-y-2 md:col-span-2"><label className="text-xs font-bold text-slate-500 uppercase ml-1">หมายเหตุ</label><textarea className="w-full p-3 border border-slate-200 rounded-2xl outline-none h-24" placeholder="รายละเอียดเพิ่มเติม..." value={newVisitor.note} onChange={(e) => setNewVisitor({ ...newVisitor, note: e.target.value })}></textarea></div>
                  <div className="md:col-span-2 pt-4"><button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black hover:bg-blue-700 shadow-xl shadow-blue-200 flex items-center justify-center gap-2"><LogIn size={20} /> ยืนยันบันทึกเข้าพื้นที่</button></div>
                </form>
              </div>
            )}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/30">
                <div className="flex items-center gap-3"><div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><Users size={20} /></div><h3 className="font-bold text-slate-800 text-lg">ผู้มาติดต่อทั้งหมด</h3></div>
                {!showEntryForm && <button onClick={() => setShowEntryForm(true)} className="bg-blue-600 text-white px-6 py-2.5 rounded-2xl text-sm font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 flex items-center gap-2"><Plus size={18} /> ลงทะเบียนใหม่</button>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead><tr className="bg-slate-50/50 text-slate-500 text-xs uppercase tracking-widest border-b border-slate-100"><th className="p-5 font-bold">ผู้มาติดต่อ</th><th className="p-5 font-bold">บริษัท/ทะเบียน</th><th className="p-5 font-bold">เวลา</th><th className="p-5 font-bold">สถานะ</th><th className="p-5 font-bold text-center">จัดการ</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredVisitors.map(v => (
                      <tr key={v.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => { setSelectedItem(v); setDetailType('visitor'); }}>
                        <td className="p-5"><div className="font-bold text-slate-800">{v.name}</div><div className="text-[10px] font-bold text-slate-400 uppercase">{v.purpose}</div></td>
                        <td className="p-5"><div className="text-sm font-semibold text-slate-700">{v.company}</div><div className="text-xs text-slate-400">{v.plate || '-'}</div></td>
                        <td className="p-5"><div className="flex items-center gap-2 text-[11px] text-green-600 font-bold"><LogIn size={12} /> {v.entryTime}</div>{v.exitTime && <div className="flex items-center gap-2 text-[11px] text-slate-400"><LogOut size={12} /> {v.exitTime}</div>}</td>
                        <td className="p-5"><Badge status={v.status} /></td>
                        <td className="p-5 text-center"><div className="flex items-center justify-center gap-2" onClick={e => e.stopPropagation()}><button onClick={() => { setSelectedItem(v); setDetailType('visitor'); }} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl"><Eye size={20} /></button>{v.status === 'IN' && <button onClick={() => handleVisitorExit(v.id || v._docId)} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-600 shadow-sm">ออก</button>}</div></td>
                      </tr>
                    ))}
                    {filteredVisitors.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">ไม่มีข้อมูล</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Materials Tab */}
        {activeTab === 'materials' && (<>
          {/* ของค้างออก */}
          {outstandingItems.length > 0 && (
            <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded-3xl border-2 border-red-200 shadow-sm overflow-hidden mb-4">
              <div className="p-5 border-b border-red-200 flex justify-between items-center">
                <h3 className="font-black text-red-700 flex items-center gap-2 text-lg">
                  <Package className="text-red-500" size={20} /> ของค้างออก ({outstandingItems.length})
                </h3>
              </div>
              <div className="divide-y divide-red-100">
                {outstandingItems.map(m => {
                  const daysDiff = Math.floor((Date.now() - new Date(m.time).getTime()) / 86400000);
                  const isOverdue = daysDiff >= 3;
                  return (
                    <div key={m.id} className={`p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-red-100/50 ${isOverdue ? 'animate-pulse bg-red-100/30' : ''}`} onClick={() => { setSelectedItem(m); setDetailType('material'); }}>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 truncate">{m.item}</p>
                        <p className="text-xs text-slate-500">{m.person} • {m.department} • ออกไป {m.time}</p>
                        {m.returnStatus === 'partial' && (
                          <p className="text-xs text-red-600 font-bold mt-1">⚠️ กลับไม่ครบ</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isOverdue && <span className="px-2 py-0.5 bg-red-600 text-white text-[10px] font-bold rounded-full">ค้าง {daysDiff} วัน</span>}
                        <button onClick={(e) => { e.stopPropagation(); openReturnCheck(m); }} className="bg-orange-500 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-orange-600 shadow-sm">ตรวจรับ</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ของออก */}
          <div className="bg-white rounded-3xl border-2 border-orange-200 shadow-sm overflow-hidden mb-4">
            <div className="p-6 border-b border-orange-100 flex justify-between items-center bg-orange-50/50">
              <h3 className="font-bold text-orange-800 flex items-center gap-2 text-lg"><LogOut className="text-orange-500" size={20} /> นำของออก ({materials.filter(m => m.type === 'OUT').length})</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-orange-50/50 text-slate-500 text-xs uppercase tracking-widest"><tr><th className="p-5 font-bold">รายการ</th><th className="p-5 font-bold text-center">รูป</th><th className="p-5 font-bold">ผู้รับผิดชอบ</th><th className="p-5 font-bold">การอนุมัติ</th><th className="p-5 font-bold text-center">จัดการ</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {materials.filter(m => m.type === 'OUT').map(m => {
                    const allPhotos = (m.lines || []).flatMap(l => (l.photos || []).map(p => typeof p === 'string' ? p : (p?.dataUrl || '')).filter(Boolean));
                    return (
                    <tr key={m.id} className="text-sm hover:bg-orange-50/30 cursor-pointer" onClick={() => { setSelectedItem(m); setDetailType('material'); }}>
                      <td className="p-5 font-bold text-slate-800">{m.item}</td>
                      <td className="p-5 text-center">
                        {allPhotos.length === 0 ? <span className="text-[11px] text-slate-300">—</span> : (
                          <div className="flex gap-1 justify-center items-center">
                            {allPhotos.slice(0, 3).map((src, i) => (
                              <img key={i} src={src} alt="" className="w-10 h-10 object-cover rounded-lg border border-slate-200 hover:scale-110 transition" onClick={(e) => { e.stopPropagation(); window.open(src, '_blank'); }} />
                            ))}
                            {allPhotos.length > 3 && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">+{allPhotos.length - 3}</span>}
                          </div>
                        )}
                      </td>
                      <td className="p-5"><div className="font-bold text-slate-700">{m.person}</div><div className="text-[10px] text-slate-400 font-bold uppercase">{m.department}</div></td>
                      <td className="p-5">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${m.headApproved ? 'bg-green-500' : 'bg-yellow-400'}`}>{m.headApproved ? '✓' : '1'}</span>
                            <span className={`text-[11px] font-bold ${m.headApproved ? 'text-green-700' : 'text-yellow-700'}`}>{m.headApproved ? 'หน.เซ็นแล้ว' : 'รอหน.เซ็น'}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${m.hrApproved ? 'bg-green-500' : m.headApproved ? 'bg-yellow-400' : 'bg-slate-300'}`}>{m.hrApproved ? '✓' : '2'}</span>
                            <span className={`text-[11px] font-bold ${m.hrApproved ? 'text-green-700' : m.headApproved ? 'text-yellow-700' : 'text-slate-400'}`}>{m.hrApproved ? 'HR เซ็นแล้ว' : m.headApproved ? 'รอ HR' : 'รอ'}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${m.secApproved ? 'bg-green-500' : m.hrApproved ? 'bg-yellow-400' : 'bg-slate-300'}`}>{m.secApproved ? '✓' : '3'}</span>
                            <span className={`text-[11px] font-bold ${m.secApproved ? 'text-green-700' : m.hrApproved ? 'text-yellow-700' : 'text-slate-400'}`}>{m.secApproved ? 'รปภ.รับทราบ' : m.hrApproved ? 'รอรปภ.' : 'รอ'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {m.hrApproved && !m.secApproved && (
                            <button
                              onClick={(e) => handleConfirmGoodsGate(e, m)}
                              className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-black transition active:scale-95 whitespace-nowrap"
                            >ยืนยันผ่านแล้ว</button>
                          )}
                          <button onClick={(e) => { e.stopPropagation(); setSelectedItem(m); setDetailType('material'); }} className="p-2 text-slate-300 hover:text-orange-600"><Eye size={18} /></button>
                        </div>
                      </td>
                    </tr>
                  );})}
                  {materials.filter(m => m.type === 'OUT').length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">ไม่มีรายการนำออก</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* ของเข้า */}
          <div className="bg-white rounded-3xl border-2 border-blue-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-blue-100 flex justify-between items-center bg-blue-50/50">
              <h3 className="font-bold text-blue-800 flex items-center gap-2 text-lg"><LogIn className="text-blue-500" size={20} /> นำของเข้า ({materials.filter(m => m.type === 'IN').length})</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-blue-50/50 text-slate-500 text-xs uppercase tracking-widest"><tr><th className="p-5 font-bold">รายการ</th><th className="p-5 font-bold text-center">รูป</th><th className="p-5 font-bold">ผู้รับผิดชอบ</th><th className="p-5 font-bold">การอนุมัติ</th><th className="p-5 font-bold text-center">จัดการ</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {materials.filter(m => m.type === 'IN').map(m => {
                    const allPhotos = (m.lines || []).flatMap(l => (l.photos || []).map(p => typeof p === 'string' ? p : (p?.dataUrl || '')).filter(Boolean));
                    return (
                    <tr key={m.id} className="text-sm hover:bg-blue-50/30 cursor-pointer" onClick={() => { setSelectedItem(m); setDetailType('material'); }}>
                      <td className="p-5 font-bold text-slate-800">{m.item}</td>
                      <td className="p-5 text-center">
                        {allPhotos.length === 0 ? <span className="text-[11px] text-slate-300">—</span> : (
                          <div className="flex gap-1 justify-center items-center">
                            {allPhotos.slice(0, 3).map((src, i) => (
                              <img key={i} src={src} alt="" className="w-10 h-10 object-cover rounded-lg border border-slate-200 hover:scale-110 transition" onClick={(e) => { e.stopPropagation(); window.open(src, '_blank'); }} />
                            ))}
                            {allPhotos.length > 3 && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">+{allPhotos.length - 3}</span>}
                          </div>
                        )}
                      </td>
                      <td className="p-5"><div className="font-bold text-slate-700">{m.person}</div><div className="text-[10px] text-slate-400 font-bold uppercase">{m.department}</div></td>
                      <td className="p-5">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${m.headApproved ? 'bg-green-500' : 'bg-yellow-400'}`}>{m.headApproved ? '✓' : '1'}</span>
                            <span className={`text-[11px] font-bold ${m.headApproved ? 'text-green-700' : 'text-yellow-700'}`}>{m.headApproved ? 'หน.เซ็นแล้ว' : 'รอหน.เซ็น'}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${m.hrApproved ? 'bg-green-500' : m.headApproved ? 'bg-yellow-400' : 'bg-slate-300'}`}>{m.hrApproved ? '✓' : '2'}</span>
                            <span className={`text-[11px] font-bold ${m.hrApproved ? 'text-green-700' : m.headApproved ? 'text-yellow-700' : 'text-slate-400'}`}>{m.hrApproved ? 'HR เซ็นแล้ว' : m.headApproved ? 'รอ HR' : 'รอ'}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${m.secApproved ? 'bg-green-500' : m.hrApproved ? 'bg-yellow-400' : 'bg-slate-300'}`}>{m.secApproved ? '✓' : '3'}</span>
                            <span className={`text-[11px] font-bold ${m.secApproved ? 'text-green-700' : m.hrApproved ? 'text-yellow-700' : 'text-slate-400'}`}>{m.secApproved ? 'รปภ.รับทราบ' : m.hrApproved ? 'รอรปภ.' : 'รอ'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {m.hrApproved && !m.secApproved && (
                            <button
                              onClick={(e) => handleConfirmGoodsGate(e, m)}
                              className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-black transition active:scale-95 whitespace-nowrap"
                            >ยืนยันผ่านแล้ว</button>
                          )}
                          <button onClick={(e) => { e.stopPropagation(); setSelectedItem(m); setDetailType('material'); }} className="p-2 text-slate-300 hover:text-blue-600"><Eye size={18} /></button>
                        </div>
                      </td>
                    </tr>
                  );})}
                  {materials.filter(m => m.type === 'IN').length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">ไม่มีรายการนำเข้า</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>)}

        {/* Employees Tab */}
        {activeTab === 'employees' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-lg"><Users className="text-blue-600" size={20} /> พนักงานออกพื้นที่</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/80 text-slate-500 text-xs uppercase tracking-widest"><tr><th className="p-5 font-bold">พนักงาน</th><th className="p-5 font-bold">เวลา</th><th className="p-5 font-bold">สถานะ</th><th className="p-5 font-bold text-center">จัดการ</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {employees.map(e => (
                    <tr key={e.id} className="text-sm hover:bg-slate-50/50 cursor-pointer" onClick={() => { setSelectedItem(e); setDetailType('employee'); }}>
                      <td className="p-5"><div className="font-bold text-slate-800">{e.name}</div><div className="text-[10px] font-bold text-slate-400 uppercase">ID: {e.empId}</div></td>
                      <td className="p-5"><div className="flex gap-4"><div><p className="text-[10px] font-bold text-slate-400 uppercase">ออก</p><p className="text-red-500 font-bold">{e.timeOut || '-'}</p></div><div><p className="text-[10px] font-bold text-slate-400 uppercase">เข้า</p><p className="text-green-600 font-bold">{e.timeIn || '-'}</p></div></div></td>
                      <td className="p-5"><Badge status={e.status} type="employee" /></td>
                      <td className="p-5 text-center" onClick={ev => ev.stopPropagation()}>
                        {e.status === 'OUT' ? (
                          <button
                            onClick={() => handleEmployeeReturn(e)}
                            className="bg-green-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-green-700 shadow-sm whitespace-nowrap flex items-center gap-1 mx-auto"
                          >
                            <LogIn size={14} /> บันทึกกลับ
                          </button>
                        ) : (
                          <button className="p-2 text-slate-300 hover:text-blue-600" onClick={() => { setSelectedItem(e); setDetailType('employee'); }}><Eye size={18} /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {employees.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-400">ไม่มีข้อมูลวันนี้</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Vehicle Bookings Tab */}
        {activeTab === 'vehicleBookings' && (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 flex-wrap gap-3">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 text-lg"><Car className="text-teal-600" size={20} /> รถออก-เข้าวันนี้</h3>
                <div className="flex items-center gap-3">
                  <button
                    onClick={openRecordBook}
                    className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm flex items-center gap-2 transition active:scale-95"
                  >
                    <FileText size={16} /> บันทึกการขอใช้รถบริษัท (Pool car record)
                  </button>
                  <span className="text-sm text-slate-400 font-bold">{todayVehicleBookings.length} รายการ</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/80 text-slate-500 text-xs uppercase tracking-widest">
                    <tr>
                      <th className="p-5 font-bold">ทะเบียนรถ</th>
                      <th className="p-5 font-bold">ยี่ห้อ</th>
                      <th className="p-5 font-bold">ผู้จอง</th>
                      <th className="p-5 font-bold hidden md:table-cell">แผนก</th>
                      <th className="p-5 font-bold hidden md:table-cell">ปลายทาง</th>
                      <th className="p-5 font-bold">เวลาออก-กลับ</th>
                      <th className="p-5 font-bold">สถานะ</th>
                      <th className="p-5 font-bold text-center">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {todayVehicleBookings.map(b => {
                      const vStatus = b.vehicleStatus || 'pending';
                      const statusBadge = vStatus === 'returned'
                        ? { color: 'bg-green-100 text-green-800 border-green-200', label: 'กลับแล้ว' }
                        : vStatus === 'out'
                        ? { color: 'bg-red-100 text-red-800 border-red-200', label: 'ออกแล้ว' }
                        : { color: 'bg-yellow-100 text-yellow-800 border-yellow-200', label: 'รอออก' };
                      return (
                        <tr key={b.id} className="text-sm hover:bg-slate-50/50 cursor-pointer" onClick={() => { setSelectedItem(b); setDetailType('vehicleBooking'); }}>
                          <td className="p-5 font-bold text-slate-800">{(!b.plate || b.plate === 'รอใส่ทะเบียน') ? (b.brand || '-') : b.plate}</td>
                          <td className="p-5 text-slate-700">{b.brand || b.vehicleId || '-'}</td>
                          <td className="p-5"><div className="font-bold text-slate-700">{b.bookedByName || b.requesterName || b.bookedBy || b.requesterId || '-'}</div></td>
                          <td className="p-5 hidden md:table-cell text-slate-500">{b.department || b.requesterDepartment || '-'}</td>
                          <td className="p-5 hidden md:table-cell text-slate-500">{b.destination || '-'}</td>
                          <td className="p-5">
                            <div className="text-xs"><span className="text-red-500 font-bold">{b.timeStart || '-'}</span> - <span className="text-green-600 font-bold">{b.timeEnd || '-'}</span></div>
                          </td>
                          <td className="p-5">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBadge.color}`}>{statusBadge.label}</span>
                          </td>
                          <td className="p-5 text-center" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-2">
                              {vStatus === 'pending' && (
                                <button onClick={() => handleVehicleExit(b)} className="bg-red-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-red-700 shadow-sm whitespace-nowrap">บันทึกออก</button>
                              )}
                              {vStatus === 'out' && (
                                <button onClick={() => handleVehicleReturn(b)} className="bg-green-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-green-700 shadow-sm whitespace-nowrap">บันทึกกลับ</button>
                              )}
                              {vStatus === 'returned' && (
                                <span className="text-green-500 text-xs font-bold">เสร็จสิ้น</span>
                              )}
                              <button onClick={() => { setSelectedItem(b); setDetailType('vehicleBooking'); }} className="p-2 text-slate-300 hover:text-blue-600"><Eye size={18} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {todayVehicleBookings.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-400">ไม่มีรถจองวันนี้</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === 'documents' && (
          <div className="space-y-4">
            {approvedDocs.length === 0 && <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center text-slate-400"><FileText size={48} className="mx-auto mb-4 text-slate-200" /><p className="text-lg font-bold">ไม่มีเอกสารรอรับทราบ</p></div>}
            {approvedDocs.map(d => (
              <div key={d._docId} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 hover:shadow-md transition-all">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-2xl ${d.sourceForm === 'VEHICLE_BOOKING' ? 'bg-blue-50 text-blue-600' : d.sourceForm === 'OUTING_REQUEST' ? 'bg-orange-50 text-orange-600' : 'bg-purple-50 text-purple-600'}`}>
                      {d.sourceForm === 'VEHICLE_BOOKING' ? <Truck size={24} /> : d.sourceForm === 'OUTING_REQUEST' ? <MapPin size={24} /> : <Package size={24} />}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-lg">{d.topic}</h4>
                      <p className="text-sm text-slate-500">ผู้ขอ: {d.requesterName} ({d.requesterId})</p>
                      <p className="text-xs text-slate-400">แผนก: {d.requesterDepartment} - {d.createdAt?.split('T')[0]}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded text-[10px] font-bold uppercase">หัวหน้าแผนกอนุมัติแล้ว</span>
                        <span className="bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded text-[10px] font-bold uppercase">HR อนุมัติแล้ว</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => handleAcknowledgeDoc(d)} className="bg-green-600 text-white px-8 py-3 rounded-2xl font-black hover:bg-green-700 shadow-lg shadow-green-200 transition-all flex items-center gap-2 whitespace-nowrap">
                    <ShieldCheck size={20} /> รับทราบ
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* QR Scanner Modal */}
      {showQRScanner && (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4" onClick={stopQRScanner}>
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-black flex items-center gap-2"><Camera size={22} className="text-green-600" /> สแกน QR Code</h3>
              <button onClick={stopQRScanner} className="p-2 hover:bg-red-100 rounded-full bg-slate-100"><X size={22} className="text-red-500" /></button>
            </div>
            <div id="qr-reader" style={{ width: '100%', minHeight: 300 }}></div>
            <div className="p-4">
              <button onClick={stopQRScanner} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold text-center">ปิดกล้อง</button>
            </div>
          </div>
        </div>
      )}

      {/* QR Scan Error */}
      {qrScanResult?.error && (
        <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl">
            <div className="text-5xl mb-4">❌</div>
            <h3 className="text-lg font-black text-red-600 mb-2">ไม่พบข้อมูล</h3>
            <p className="text-sm text-slate-500 mb-6">{qrScanResult.error}</p>
            <button onClick={() => setQrScanResult(null)} className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold">ปิด</button>
          </div>
        </div>
      )}

      {/* Daily Report Modal */}
      {showDailyReport && (
        <div className="fixed inset-0 bg-black/60 z-[300] flex items-center justify-center p-4" onClick={() => setShowDailyReport(false)}>
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl max-h-[92vh] overflow-y-auto overscroll-none" style={{WebkitOverflowScrolling:'touch'}} onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 z-10 p-6 border-b bg-slate-900 text-white flex justify-between items-center rounded-t-3xl">
              <div>
                <h3 className="font-black text-lg flex items-center gap-2"><FileText size={20} /> รายงานสรุปประจำวัน</h3>
                <p className="text-slate-400 text-xs mt-1">{todayStr}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="bg-white text-slate-900 px-4 py-2 rounded-xl text-xs font-black hover:bg-slate-100 transition">🖨️ พิมพ์</button>
                <button onClick={() => setShowDailyReport(false)} className="p-2 hover:bg-white/20 rounded-xl"><X size={20} /></button>
              </div>
            </div>
            <div className="p-6 space-y-6 text-sm" id="daily-report-content">
              {/* Visitors Summary — กรองเฉพาะวันนี้ */}
              {(() => {
                const todayVisitors = visitors.filter(v => v.entryTime?.slice(0,10) === todayStr || v.rawStatus === STATUS.INSIDE || v.rawStatus === STATUS.APPROVED_OUT);
                const todayMaterials = materials.filter(m => m.time === todayStr);
                return (<>
              <div>
                <h4 className="font-black text-slate-700 uppercase tracking-widest text-xs mb-3 flex items-center gap-2"><span className="w-2 h-2 bg-blue-500 rounded-full inline-block"></span> ผู้มาติดต่อวันนี้ ({todayVisitors.length} ราย)</h4>
                {todayVisitors.length === 0 ? <p className="text-slate-400 text-xs">ไม่มีผู้มาติดต่อ</p> : (
                  <table className="w-full border-collapse text-xs">
                    <thead><tr className="bg-slate-50 text-slate-400 uppercase text-[10px]"><th className="p-2 text-left">ชื่อ</th><th className="p-2 text-left">บริษัท</th><th className="p-2 text-left">วัตถุประสงค์</th><th className="p-2 text-left">เข้า</th><th className="p-2 text-left">ออก</th><th className="p-2 text-left">สถานะ</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {todayVisitors.map((v, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="p-2 font-bold">{v.name}</td>
                          <td className="p-2 text-slate-500">{v.company}</td>
                          <td className="p-2 text-slate-500">{v.purpose}</td>
                          <td className="p-2 text-green-600">{v.entryTime || '-'}</td>
                          <td className="p-2 text-slate-400">{v.exitTime || '-'}</td>
                          <td className="p-2"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${v.rawStatus === STATUS.INSIDE ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{v.rawStatus === STATUS.INSIDE ? 'ยังอยู่' : 'ออกแล้ว'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Employees Summary */}
              <div>
                <h4 className="font-black text-slate-700 uppercase tracking-widest text-xs mb-3 flex items-center gap-2"><span className="w-2 h-2 bg-orange-500 rounded-full inline-block"></span> พนักงานออกพื้นที่ ({employees.length} คน)</h4>
                {employees.length === 0 ? <p className="text-slate-400 text-xs">ไม่มีข้อมูล</p> : (
                  <table className="w-full border-collapse text-xs">
                    <thead><tr className="bg-slate-50 text-slate-400 uppercase text-[10px]"><th className="p-2 text-left">รหัส</th><th className="p-2 text-left">ชื่อ</th><th className="p-2 text-left">แผนก</th><th className="p-2 text-left">เวลาออก</th><th className="p-2 text-left">เวลากลับ</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {employees.map((e, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="p-2 font-mono text-slate-500">{e.empId}</td>
                          <td className="p-2 font-bold">{e.name}</td>
                          <td className="p-2 text-slate-500">{e.department || '-'}</td>
                          <td className="p-2 text-red-500">{e.timeOut || '-'}</td>
                          <td className="p-2 text-green-600">{e.timeIn || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Materials Summary */}
              <div>
                <h4 className="font-black text-slate-700 uppercase tracking-widest text-xs mb-3 flex items-center gap-2"><span className="w-2 h-2 bg-amber-500 rounded-full inline-block"></span> ของเข้า-ออกวันนี้ ({todayMaterials.length} รายการ)</h4>
                {todayMaterials.length === 0 ? <p className="text-slate-400 text-xs">ไม่มีข้อมูล</p> : (
                  <table className="w-full border-collapse text-xs">
                    <thead><tr className="bg-slate-50 text-slate-400 uppercase text-[10px]"><th className="p-2 text-left">รายการ</th><th className="p-2 text-left">ประเภท</th><th className="p-2 text-left">ผู้รับผิดชอบ</th><th className="p-2 text-left">สถานะ</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {todayMaterials.map((m, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="p-2 font-bold">{m.item}</td>
                          <td className="p-2"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${m.type === 'OUT' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>{m.type === 'OUT' ? 'นำออก' : 'นำเข้า'}</span></td>
                          <td className="p-2 text-slate-500">{m.person}</td>
                          <td className="p-2">{m.secApproved ? '✅ ผ่านแล้ว' : m.hrApproved ? '🟡 รอรปภ.' : '⏳ รออนุมัติ'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Summary Box */}
              <div className="bg-slate-50 rounded-2xl p-4 grid grid-cols-3 gap-4 text-center border border-slate-200">
                <div><p className="text-2xl font-black text-blue-600">{todayVisitors.length}</p><p className="text-[10px] font-bold text-slate-400 uppercase">ผู้มาติดต่อ</p></div>
                <div><p className="text-2xl font-black text-orange-500">{employees.length}</p><p className="text-[10px] font-bold text-slate-400 uppercase">พนักงานออกพื้นที่</p></div>
                <div><p className="text-2xl font-black text-amber-600">{todayMaterials.length}</p><p className="text-[10px] font-bold text-slate-400 uppercase">รายการของ</p></div>
              </div>
              </>);
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Record Book Modal — Pool car / van record */}
      {showRecordBook && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-3" onClick={() => setShowRecordBook(false)}>
          <div className="bg-white rounded-2xl w-full max-w-[98vw] max-h-[95vh] overflow-hidden flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <FileText className="text-teal-600" size={22} />
                <h3 className="font-bold text-slate-800 text-lg">บันทึกการขอใช้รถบริษัท (Pool car / van record)</h3>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={recordBookYear}
                  onChange={e => setRecordBookYear(Number(e.target.value))}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-bold focus:ring-2 focus:ring-teal-400 focus:outline-none"
                >
                  {recordBookYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <span className="text-xs text-slate-500 font-bold">{recordBookRows.length} รายการ</span>
                <button onClick={printRecordBook} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm flex items-center gap-1.5 transition active:scale-95">
                  🖨️ พิมพ์
                </button>
                <button onClick={() => setShowRecordBook(false)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 p-2 rounded-lg transition"><X size={18} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <h2 className="text-center font-bold text-base mb-3">{recordBookYear} Pool car / van record (บันทึกการขอใช้รถบริษัท)</h2>
              {recordBookLoading ? (
                <div className="p-12 text-center text-slate-400 font-bold">กำลังโหลด...</div>
              ) : (
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700">
                      <th className="border border-slate-400 p-2 whitespace-nowrap leading-tight">Date<br/><span className="text-[10px] font-normal">วันที่ขอ</span></th>
                      <th className="border border-slate-400 p-2 whitespace-nowrap leading-tight">Date<br/><span className="text-[10px] font-normal">วันที่ใช้บริการ</span></th>
                      <th className="border border-slate-400 p-2 whitespace-nowrap leading-tight">ID<br/><span className="text-[10px] font-normal">รหัส</span></th>
                      <th className="border border-slate-400 p-2 leading-tight">Requestor<br/><span className="text-[10px] font-normal">ผู้ขอใช้บริการ</span></th>
                      <th className="border border-slate-400 p-2 leading-tight">Participants<br/><span className="text-[10px] font-normal">ผู้ร่วมเดินทาง</span></th>
                      <th className="border border-slate-400 p-2 whitespace-nowrap leading-tight">Division<br/><span className="text-[10px] font-normal">แผนก</span></th>
                      <th className="border border-slate-400 p-2 leading-tight">Venue<br/><span className="text-[10px] font-normal">สถานที่</span></th>
                      <th className="border border-slate-400 p-2 leading-tight">Purpose<br/><span className="text-[10px] font-normal">วัตถุประสงค์การใช้รถ</span></th>
                      <th className="border border-slate-400 p-2 whitespace-nowrap leading-tight">Type of Car/Van<br/><span className="text-[10px] font-normal">ประเภทรถ</span></th>
                      <th className="border border-slate-400 p-2 whitespace-nowrap leading-tight">Driver<br/><span className="text-[10px] font-normal">คนขับรถ</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {recordBookRows.length === 0 && (
                      <tr><td colSpan={10} className="border border-slate-300 p-8 text-center text-slate-400">ไม่มีข้อมูลในปี {recordBookYear}</td></tr>
                    )}
                    {recordBookRows.map(b => {
                      const createdStr = b.createdAt
                        ? (b.createdAt.toDate ? b.createdAt.toDate().toISOString() : new Date(b.createdAt).toISOString?.() || b.createdAt)
                        : b.date;
                      return (
                        <tr key={b.id} className="hover:bg-teal-50/50 cursor-pointer" onClick={() => { setSelectedItem(b); setDetailType('vehicleBooking'); setShowRecordBook(false); }}>
                          <td className="border border-slate-300 p-2 text-center whitespace-nowrap">{formatShortDate(createdStr)}</td>
                          <td className="border border-slate-300 p-2 text-center whitespace-nowrap">{formatShortDate(b.date)}</td>
                          <td className="border border-slate-300 p-2 text-center font-mono">{bookingShortId(b)}</td>
                          <td className="border border-slate-300 p-2">{b.bookedByName || b.requesterName || '-'}</td>
                          <td className="border border-slate-300 p-2 text-[11px]">{participantsList(b)}</td>
                          <td className="border border-slate-300 p-2 text-center font-bold">{b.department || '-'}</td>
                          <td className="border border-slate-300 p-2">{b.destination || '-'}</td>
                          <td className="border border-slate-300 p-2">{b.purpose || '-'}</td>
                          <td className="border border-slate-300 p-2 text-center">{vehicleTypeLabel(b)}</td>
                          <td className="border border-slate-300 p-2">{driverLabel(b)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="p-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-500 text-center">
              💡 คลิกแถวเพื่อดูรายละเอียด · กด "พิมพ์" เพื่อส่งออกเป็น PDF/กระดาษ
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default SecurityGate;
