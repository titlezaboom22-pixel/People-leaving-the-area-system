import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  addDoc,
  doc,
  Timestamp,
  getDocs,
} from 'firebase/firestore';
import { db, firebaseReady, appId } from './firebase';
import { WORKFLOW_ROUTES, SPECIAL_EMAILS } from './constants';
import { LogOut, Truck, Car, User, Phone, CheckCircle, XCircle, Clock, Coffee, UtensilsCrossed, Check, Download, FileSpreadsheet, AlertTriangle, MapPin, Package, FileText, Eye, X, Send } from 'lucide-react';
import * as XLSX from 'xlsx';
import VehicleTimeAlert from './VehicleTimeAlert';
import SupportTickets from './SupportTickets';
import PoolCarRecord from './PoolCarRecord';
import ExternalVehicleRental, { ExternalVehicleRentalInline } from './ExternalVehicleRental';
import { notifyWorkflowCompleted } from './notifyEmail';
import { rejectNotification } from './approvalNotifications';
import { printVehicleBooking } from './printDocument';

export default function GAView({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('vehicle'); // 'vehicle' | 'food' | 'missing' | 'history'
  const [vehicleSubTab, setVehicleSubTab] = useState('company'); // 'company' | 'external'
  const [pendingRequests, setPendingRequests] = useState([]);
  const [historyOrders, setHistoryOrders] = useState([]); // ประวัติออเดอร์อาหาร/เครื่องดื่มที่ GA อนุมัติแล้ว
  // Doc viewer modal — แสดงเอกสารพร้อมลายเซ็น 3 ฝ่าย (เหมือนหน้าพนักงาน)
  const [docViewerBooking, setDocViewerBooking] = useState(null);
  const [docViewerSteps, setDocViewerSteps] = useState([]);
  const [docViewerLoading, setDocViewerLoading] = useState(false);

  const openDocViewer = async (booking) => {
    if (!booking) return;
    setDocViewerBooking(booking);
    setDocViewerSteps([]);
    if (!booking.chainId) return;
    setDocViewerLoading(true);
    try {
      const wfRef = collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows');
      const snap = await getDocs(query(wfRef, where('chainId', '==', booking.chainId)));
      const steps = snap.docs.map(d => ({ ...d.data() }))
        .filter(s => s.status === 'approved')
        .sort((a, b) => (a.step || 1) - (b.step || 1));
      setDocViewerSteps(steps);
    } catch (e) {
      console.warn('Load doc steps error:', e);
    }
    setDocViewerLoading(false);
  };

  const closeDocViewer = () => {
    setDocViewerBooking(null);
    setDocViewerSteps([]);
  };
  const [foodOrders, setFoodOrders] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [allBookings, setAllBookings] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [noVehicle, setNoVehicle] = useState(false);
  const [processing, setProcessing] = useState(false);
  // Reject state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  // --- Missing goods follow-up (ส่งจาก รปภ. เมื่อของกลับไม่ครบ) ---
  const [missingGoods, setMissingGoods] = useState([]);
  const [selectedMissing, setSelectedMissing] = useState(null);
  const [followupNote, setFollowupNote] = useState('');

  // Load all pending GA requests
  useEffect(() => {
    if (!firebaseReady) return;
    const collRef = collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows');
    const q = query(collRef, where('targetType', '==', 'GA'), where('status', '==', 'pending'));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
      docs.sort((a, b) => (b.forwardedAt || b.createdAt || '').localeCompare(a.forwardedAt || a.createdAt || ''));
      setPendingRequests(docs.filter(d => d.sourceForm === 'VEHICLE_BOOKING'));
      setFoodOrders(docs.filter(d => d.sourceForm === 'DRINK_ORDER' || d.sourceForm === 'FOOD_ORDER' || d.sourceForm === 'DRINK_FOOD_ORDER'));
    });
    return () => unsub();
  }, []);

  // 📜 Load history — ออเดอร์ที่ GA อนุมัติแล้ว (ดูย้อนหลังได้)
  useEffect(() => {
    if (!firebaseReady) return;
    const collRef = collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows');
    const q = query(collRef, where('targetType', '==', 'GA'), where('status', '==', 'approved'));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
      const orderDocs = docs.filter(d => ['DRINK_ORDER', 'FOOD_ORDER', 'DRINK_FOOD_ORDER'].includes(d.sourceForm));
      // เรียงจากใหม่ → เก่า
      orderDocs.sort((a, b) => (b.acknowledgedAt || b.createdAt || '').localeCompare(a.acknowledgedAt || a.createdAt || ''));
      setHistoryOrders(orderDocs);
    });
    return () => unsub();
  }, []);

  // Load vehicles
  useEffect(() => {
    if (!firebaseReady) return;
    const ref = collection(db, 'artifacts', appId, 'public', 'data', 'vehicles');
    const unsub = onSnapshot(ref, (snap) => {
      setVehicles(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.id.localeCompare(b.id)));
    });
    return () => unsub();
  }, []);

  // Load drivers
  useEffect(() => {
    if (!firebaseReady) return;
    const ref = collection(db, 'artifacts', appId, 'public', 'data', 'drivers');
    const unsub = onSnapshot(ref, (snap) => {
      setDrivers(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.id.localeCompare(b.id)));
    });
    return () => unsub();
  }, []);

  // Load all vehicle bookings
  useEffect(() => {
    if (!firebaseReady) return;
    const ref = collection(db, 'artifacts', appId, 'public', 'data', 'vehicle_bookings');
    const unsub = onSnapshot(ref, (snap) => {
      setAllBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // Load missing goods follow-ups (ของค้าง/ไม่ครบ จาก รปภ.)
  useEffect(() => {
    if (!firebaseReady) return;
    const collRef = collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows');
    const q = query(collRef, where('escalatedToGA', '==', true));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs
        .map(d => ({ ...d.data(), _docId: d.id }))
        .filter(d => d.followupStatus !== 'resolved')
        .sort((a, b) => (b.escalatedToGAAt || '').localeCompare(a.escalatedToGAAt || ''));
      setMissingGoods(docs);
    }, (err) => {
      console.warn('Missing goods listener error:', err);
    });
    return () => unsub();
  }, []);

  const getDateBookings = (date) => allBookings.filter(b => b.date === date);
  const isVehicleBooked = (vehicleId, date) => getDateBookings(date).some(b => b.vehicleId === vehicleId);
  const isDriverBooked = (driverId, date) => getDateBookings(date).some(b => b.driverId === driverId);

  // Get real-time vehicle status for dashboard
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  const getVehicleStatus = (vehicle) => {
    const todayBookings = allBookings.filter(b => b.vehicleId === vehicle.id && b.date === today);
    if (todayBookings.length === 0) return { status: 'available', label: 'ว่าง', color: 'emerald', booking: null };

    // Find active booking (current time is between timeStart and timeEnd)
    for (const b of todayBookings) {
      const [sh, sm] = (b.timeStart || '00:00').split(':').map(Number);
      const [eh, em] = (b.timeEnd || '23:59').split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      const nowMin = now.getHours() * 60 + now.getMinutes();

      if (b.returned) continue; // รถกลับแล้ว ข้ามไป

      if (nowMin >= startMin && nowMin <= endMin) {
        return { status: 'in_use', label: 'กำลังใช้งาน', color: 'red', booking: b };
      }
      if (nowMin > endMin) {
        return { status: 'overdue', label: 'เลยเวลา!', color: 'red', booking: b, overdue: true };
      }
      if (nowMin < startMin) {
        return { status: 'reserved', label: `จองไว้ ${b.timeStart}`, color: 'amber', booking: b };
      }
    }
    return { status: 'available', label: 'ว่าง', color: 'emerald', booking: null };
  };

  // Mark vehicle as returned
  const handleMarkReturned = async (booking) => {
    if (!booking?.id) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'vehicle_bookings', booking.id);
      await updateDoc(docRef, {
        returned: true,
        returnedAt: new Date().toISOString(),
        returnedBy: 'GA',
      });
      alert(`✅ บันทึกแล้ว — รถ ${booking.plate || ''} กลับเรียบร้อย`);
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    }
  };

  const handleSelectRequest = (req) => {
    setSelectedRequest(req);
    setSelectedVehicle(null);
    setSelectedDriver(null);
    setNoVehicle(false);
    setRejectReason('');
  };

  // GA reject เอกสาร
  const handleRejectVehicle = async () => {
    if (!selectedRequest) return;
    const reason = rejectReason.trim();
    if (!reason) {
      alert('กรุณาระบุเหตุผลในการปฏิเสธ');
      return;
    }
    setProcessing(true);
    try {
      await rejectNotification(selectedRequest.id, {
        rejectedBy: user?.displayName || 'GA',
        rejectedByRole: 'GA',
        rejectReason: reason,
      });
      alert('ปฏิเสธเอกสารแล้ว — ระบบส่งเหตุผลแจ้งผู้ขอทางอีเมล');
      setShowRejectModal(false);
      setRejectReason('');
      setSelectedRequest(null);
    } catch (err) {
      alert('ไม่สำเร็จ: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedRequest) return;
    const payload = selectedRequest.requestPayload || {};

    if (!noVehicle && !selectedVehicle) {
      alert('กรุณาเลือกรถ หรือกด "ไม่มีรถ"');
      return;
    }
    if (!noVehicle && payload.needDriver && !selectedDriver) {
      alert('พนักงานต้องการคนขับ กรุณาเลือกคนขับ');
      return;
    }

    setProcessing(true);
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'approval_workflows', selectedRequest._docId);
      const now = new Date().toISOString();
      const approveDate = new Date().toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const approveTime = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

      const vehicleAssignment = {};
      if (noVehicle) {
        vehicleAssignment.vehicleResult = 'no_vehicle';
        vehicleAssignment.vehicleMessage = 'ไม่มีรถให้ใช้งาน ท่านสามารถเอารถของคุณไปใช้';
      } else {
        vehicleAssignment.vehicleResult = 'assigned';
        vehicleAssignment.assignedVehicle = selectedVehicle;
        if (selectedDriver) {
          vehicleAssignment.assignedDriver = selectedDriver;
        }
      }

      await updateDoc(docRef, {
        status: 'approved',
        acknowledgedAt: now,
        approvedBy: 'GA',
        approvedDate: approveDate,
        approvedTime: approveTime,
        ...vehicleAssignment,
      });

      // แจ้งผู้ขอทางอีเมลว่า GA จัดรถให้แล้ว/ไม่มีรถ
      try {
        notifyWorkflowCompleted({
          ...selectedRequest,
          status: 'approved',
          acknowledgedAt: now,
          approvedBy: 'GA',
          ...vehicleAssignment,
        });
      } catch {}

      // Save vehicle booking
      if (!noVehicle && selectedVehicle) {
        const bookingRef = collection(db, 'artifacts', appId, 'public', 'data', 'vehicle_bookings');
        await addDoc(bookingRef, {
          vehicleId: selectedVehicle.id,
          plate: selectedVehicle.plate,
          brand: selectedVehicle.brand,
          driverId: selectedDriver?.id || null,
          driverName: selectedDriver?.name || null,
          driverPhone: selectedDriver?.phone || null,
          date: payload.date || '',
          timeStart: payload.timeStart || '',
          timeEnd: payload.timeEnd || '',
          requesterId: selectedRequest.requesterId,
          requesterName: selectedRequest.requesterName,
          chainId: selectedRequest.chainId,
          createdAt: Timestamp.now(),
        });
      }

      alert(noVehicle ? 'แจ้งพนักงานว่าไม่มีรถแล้ว' : `จัดรถ ${selectedVehicle.brand} (${selectedVehicle.plate}) ให้พนักงานแล้ว`);
      setSelectedRequest(null);
      setSelectedVehicle(null);
      setSelectedDriver(null);
      setNoVehicle(false);
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    }
    setProcessing(false);
  };

  // Acknowledge food/drink order
  const handleAcknowledgeOrder = async (order) => {
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'approval_workflows', order._docId);
      const now = new Date().toISOString();
      const approveDate = new Date().toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const approveTime = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
      await updateDoc(docRef, {
        status: 'approved',
        acknowledgedAt: now,
        approvedBy: 'GA',
        approvedDate: approveDate,
        approvedTime: approveTime,
      });
      // แจ้งผู้ขอทางอีเมลว่า GA รับออเดอร์แล้ว
      try {
        notifyWorkflowCompleted({ ...order, status: 'approved', acknowledgedAt: now, approvedBy: 'GA' });
      } catch {}
      alert('รับออเดอร์เรียบร้อย!');
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    }
  };

  const reqPayload = selectedRequest?.requestPayload || {};
  const reqDate = reqPayload.date || '';

  const vehicleCount = pendingRequests.length;
  const foodCount = foodOrders.length;
  const missingCount = missingGoods.length;

  // GA: เริ่มติดตาม / resolve missing goods
  const handleMissingStart = async (row) => {
    if (!firebaseReady || !row?._docId) return;
    try {
      const ref = doc(db, 'artifacts', appId, 'public', 'data', 'approval_workflows', row._docId);
      await updateDoc(ref, {
        followupStatus: 'in_progress',
        followupStartedAt: new Date().toISOString(),
        followupHistory: [
          ...(row.followupHistory || []),
          { by: 'GA', action: 'start_followup', at: new Date().toISOString(), note: '' },
        ],
      });
    } catch (err) {
      alert('ไม่สำเร็จ: ' + err.message);
    }
  };

  const handleMissingResolve = async () => {
    if (!firebaseReady || !selectedMissing?._docId) return;
    if (!window.confirm('ยืนยันว่าได้ติดตามของเรียบร้อย — ปิดเรื่องนี้?')) return;
    try {
      const ref = doc(db, 'artifacts', appId, 'public', 'data', 'approval_workflows', selectedMissing._docId);
      await updateDoc(ref, {
        followupStatus: 'resolved',
        followupResolvedAt: new Date().toISOString(),
        followupResolvedNote: followupNote || '',
        escalatedToGA: false,
        followupHistory: [
          ...(selectedMissing.followupHistory || []),
          { by: 'GA', action: 'resolve', at: new Date().toISOString(), note: followupNote || '' },
        ],
      });
      setSelectedMissing(null);
      setFollowupNote('');
      alert('ปิดเรื่องเรียบร้อย ✓');
    } catch (err) {
      alert('ไม่สำเร็จ: ' + err.message);
    }
  };

  // 🍱☕ Export Food + Drink orders to Excel — แยกแผนก + วันเดือนปี
  const handleExportFoodDrinkExcel = async () => {
    try {
      const collRef = collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows');
      const snap = await getDocs(collRef);
      const all = snap.docs
        .map(d => ({ ...d.data(), _docId: d.id }))
        .filter(d => ['FOOD_ORDER', 'DRINK_ORDER', 'DRINK_FOOD_ORDER'].includes(d.sourceForm));

      if (all.length === 0) {
        alert('ไม่มีข้อมูลอาหาร/เครื่องดื่ม');
        return;
      }

      // Helpers
      const fmtDate = (s) => {
        if (!s) return '-';
        try {
          const d = new Date(s);
          if (isNaN(d.getTime())) return s;
          return d.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch { return s; }
      };
      const monthYear = (s) => {
        if (!s) return '-';
        try {
          const d = new Date(s);
          if (isNaN(d.getTime())) return '-';
          return d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
        } catch { return '-'; }
      };
      const statusTH = (st) => st === 'approved' ? 'อนุมัติ/ส่งแล้ว' : st === 'rejected' ? 'ไม่อนุมัติ' : 'รอดำเนินการ';

      // Flatten — 1 รายการเมนู = 1 row
      const drinkRows = [];
      const foodRows = [];

      all.forEach(wf => {
        const p = wf.requestPayload || {};
        const isCombined = wf.sourceForm === 'DRINK_FOOD_ORDER';
        const isDrink = wf.sourceForm === 'DRINK_ORDER';
        const isFood = wf.sourceForm === 'FOOD_ORDER';

        const drinks = isCombined ? (p.drinkRows || []) : (isDrink ? (p.rows || []) : []);
        const foods = isCombined ? (p.foodRows || []) : (isFood ? (p.rows || []) : []);

        const useDate = p.orderDate || p.date || wf.createdAt;
        const dept = p.department || wf.requesterDepartment || '-';
        const reqId = p.requesterId || wf.requesterId || '-';
        const reqName = p.requesterName || wf.requesterName || '-';
        const time = p.orderTime || '-';
        const loc = p.location || '-';
        const status = statusTH(wf.status);

        // 🥤 Drink rows
        drinks.forEach(r => {
          const qty = Number(r.qty || r.count || 1);
          const price = Number(r.price || 0);
          drinkRows.push({
            'วันที่ใช้': fmtDate(useDate),
            'เดือน-ปี': monthYear(useDate),
            'แผนก': dept,
            'รหัสผู้ขอ': reqId,
            'ผู้ขอ': reqName,
            'เวลา': time,
            'สถานที่': loc,
            'รายการ': r.menu || r.details || r.name || '-',
            'จำนวน': qty,
            'ราคา/หน่วย': price,
            'รวม (บาท)': qty * price,
            'หมายเหตุ': r.note || r.remark || '-',
            'สถานะ': status,
          });
        });

        // 🍱 Food rows
        foods.forEach(r => {
          const qty = Number(r.qty || r.count || 1);
          const price = Number(r.price || 0);
          const allergyText = (r.hasAllergy && (r.allergies?.length || r.allergyNames?.length))
            ? `⚠️ แพ้: ${(r.allergies || r.allergyNames || []).join(', ')}`
            : '';
          foodRows.push({
            'วันที่ใช้': fmtDate(useDate),
            'เดือน-ปี': monthYear(useDate),
            'แผนก': dept,
            'รหัสผู้ขอ': reqId,
            'ผู้ขอ': reqName,
            'เวลา': time,
            'สถานที่': loc,
            'รายการ': r.menu || r.details || r.name || '-',
            'จำนวน': qty,
            'ราคา/หน่วย': price,
            'รวม (บาท)': qty * price,
            'แพ้อาหาร': allergyText || '-',
            'หมายเหตุ': r.note || r.remark || '-',
            'สถานะ': status,
          });
        });
      });

      // 📊 Summary by Department × Month — รวมเมนูที่สั่งด้วย
      const summaryMap = {};
      const menuTally = {}; // key → { drinks: { menu: qty }, foods: { menu: qty } }

      [...drinkRows.map(r => ({ ...r, _type: 'drink' })), ...foodRows.map(r => ({ ...r, _type: 'food' }))].forEach(r => {
        const key = `${r['แผนก']}__${r['เดือน-ปี']}`;
        if (!summaryMap[key]) {
          summaryMap[key] = {
            'แผนก': r['แผนก'],
            'เดือน-ปี': r['เดือน-ปี'],
            'จำนวนรายการเครื่องดื่ม': 0,
            'ยอดเครื่องดื่ม (บาท)': 0,
            'เมนูเครื่องดื่มที่สั่ง': '',
            'จำนวนรายการอาหาร': 0,
            'ยอดอาหาร (บาท)': 0,
            'เมนูอาหารที่สั่ง': '',
            'ยอดรวมทั้งสิ้น (บาท)': 0,
          };
          menuTally[key] = { drinks: {}, foods: {} };
        }
        const s = summaryMap[key];
        const menuName = r['รายการ'] || '-';
        if (r._type === 'drink') {
          s['จำนวนรายการเครื่องดื่ม'] += r['จำนวน'];
          s['ยอดเครื่องดื่ม (บาท)'] += r['รวม (บาท)'];
          menuTally[key].drinks[menuName] = (menuTally[key].drinks[menuName] || 0) + r['จำนวน'];
        } else {
          s['จำนวนรายการอาหาร'] += r['จำนวน'];
          s['ยอดอาหาร (บาท)'] += r['รวม (บาท)'];
          menuTally[key].foods[menuName] = (menuTally[key].foods[menuName] || 0) + r['จำนวน'];
        }
        s['ยอดรวมทั้งสิ้น (บาท)'] = s['ยอดเครื่องดื่ม (บาท)'] + s['ยอดอาหาร (บาท)'];
      });

      // รวบเมนูเป็น text "ลาเต้ ×5, คาปูชิโน่ ×3" — เรียงตามจำนวนสั่งมากสุด
      const formatMenu = (tally) =>
        Object.entries(tally)
          .sort((a, b) => b[1] - a[1])
          .map(([menu, qty]) => `${menu} ×${qty}`)
          .join(', ');

      Object.keys(summaryMap).forEach(key => {
        summaryMap[key]['เมนูเครื่องดื่มที่สั่ง'] = formatMenu(menuTally[key].drinks) || '-';
        summaryMap[key]['เมนูอาหารที่สั่ง'] = formatMenu(menuTally[key].foods) || '-';
      });

      const summary = Object.values(summaryMap).sort((a, b) => {
        if (a['แผนก'] !== b['แผนก']) return a['แผนก'].localeCompare(b['แผนก']);
        return a['เดือน-ปี'].localeCompare(b['เดือน-ปี']);
      });

      // Sort by department + date
      const sortByDeptDate = (a, b) => {
        if (a['แผนก'] !== b['แผนก']) return a['แผนก'].localeCompare(b['แผนก']);
        return a['วันที่ใช้'].localeCompare(b['วันที่ใช้']);
      };
      drinkRows.sort(sortByDeptDate);
      foodRows.sort(sortByDeptDate);

      // Build workbook
      const wb = XLSX.utils.book_new();

      // Sheet 1: สรุปตามแผนก × เดือน
      if (summary.length > 0) {
        const wsSum = XLSX.utils.json_to_sheet(summary);
        wsSum['!cols'] = [
          { wch: 22 }, // แผนก
          { wch: 18 }, // เดือน-ปี
          { wch: 14 }, // จำนวนเครื่องดื่ม
          { wch: 14 }, // ยอดเครื่องดื่ม
          { wch: 50 }, // เมนูเครื่องดื่มที่สั่ง
          { wch: 12 }, // จำนวนอาหาร
          { wch: 14 }, // ยอดอาหาร
          { wch: 50 }, // เมนูอาหารที่สั่ง
          { wch: 18 }, // ยอดรวม
        ];
        // Wrap text สำหรับ column เมนู (E และ H)
        const range = XLSX.utils.decode_range(wsSum['!ref']);
        for (let R = range.s.r + 1; R <= range.e.r; R++) {
          ['E', 'H'].forEach(col => {
            const cell = wsSum[`${col}${R + 1}`];
            if (cell) cell.s = { alignment: { wrapText: true, vertical: 'top' } };
          });
        }
        XLSX.utils.book_append_sheet(wb, wsSum, '📊 สรุปตามแผนก');
      }

      // Sheet 2: เครื่องดื่ม
      if (drinkRows.length > 0) {
        const wsD = XLSX.utils.json_to_sheet(drinkRows);
        wsD['!cols'] = [
          { wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 10 }, { wch: 22 }, { wch: 8 },
          { wch: 18 }, { wch: 24 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 14 }
        ];
        XLSX.utils.book_append_sheet(wb, wsD, '☕ เครื่องดื่ม');
      }

      // Sheet 3: อาหาร
      if (foodRows.length > 0) {
        const wsF = XLSX.utils.json_to_sheet(foodRows);
        wsF['!cols'] = [
          { wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 10 }, { wch: 22 }, { wch: 8 },
          { wch: 18 }, { wch: 24 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 24 }, { wch: 18 }, { wch: 14 }
        ];
        XLSX.utils.book_append_sheet(wb, wsF, '🍱 อาหาร');
      }

      const today = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
      XLSX.writeFile(wb, `Food_Drink_Report_${today}.xlsx`);
    } catch (err) {
      console.error('Export Food/Drink error:', err);
      alert('เกิดข้อผิดพลาดในการ Export: ' + err.message);
    }
  };

  // Export vehicle bookings to Excel
  const handleExportExcel = async () => {
    try {
      // Load ALL vehicle booking workflows (pending + approved)
      const collRef = collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows');
      const q = query(collRef, where('sourceForm', '==', 'VEHICLE_BOOKING'));
      const snap = await getDocs(q);
      const allVehicleWorkflows = snap.docs.map(d => ({ ...d.data(), _docId: d.id }));

      // Sort by date
      allVehicleWorkflows.sort((a, b) => {
        const dateA = a.requestPayload?.date || a.createdAt || '';
        const dateB = b.requestPayload?.date || b.createdAt || '';
        return dateB.localeCompare(dateA);
      });

      // Format date helper
      const fmtDate = (dateStr) => {
        if (!dateStr) return '-';
        try {
          const d = new Date(dateStr);
          return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-');
        } catch { return dateStr; }
      };

      // Build rows matching the Excel format from image
      const rows = allVehicleWorkflows.map(wf => {
        const p = wf.requestPayload || {};
        const companions = (p.companions || []).filter(c => c && c.trim());
        const passengers = (p.passengers || []).filter(pp => pp?.name?.trim());
        const participantNames = [
          ...companions,
          ...passengers.map(pp => `${pp.name}${pp.dept ? ` (${pp.dept})` : ''}`)
        ].join(', ');

        // Vehicle info from GA assignment
        const assignedVehicle = wf.assignedVehicle || {};
        const assignedDriver = wf.assignedDriver || {};
        const vehicleResult = wf.vehicleResult;
        let carType = '';
        let driverName = '';

        if (vehicleResult === 'no_vehicle') {
          carType = 'ใช้รถส่วนตัว';
          driverName = p.needDriver ? '-' : 'ขับเอง';
        } else if (vehicleResult === 'assigned') {
          carType = `${assignedVehicle.brand || ''} ${assignedVehicle.plate || ''}`.trim();
          driverName = assignedDriver.name || (p.needDriver ? 'รอจัดคนขับ' : 'ขับเอง');
        } else {
          // Pending - not yet assigned
          carType = 'รอ GA จัดรถ';
          driverName = p.needDriver ? 'ต้องการคนขับ' : 'ขับเอง';
        }

        return {
          'Date\nวันที่ขอ': fmtDate(wf.createdAt),
          'Date\nวันที่ใช้บริการ': fmtDate(p.date),
          'ID\nรหัส': p.requesterId || '-',
          'Requestor\nผู้ขอใช้บริการ': p.name || wf.requesterName || '-',
          'Participants\nผู้ร่วมเดินทาง': participantNames || '-',
          'Division\nแผนก': p.department || wf.requesterDepartment || '-',
          'Venue\nสถานที่': p.destination || '-',
          'Purpose\nวัตถุประสงค์การใช้รถ': p.purpose || '-',
          'Type of Car/Van\nประเภทรถ': carType,
          'Driver\nคนขับรถ': driverName,
          'Status\nสถานะ': wf.status === 'approved' ? 'อนุมัติแล้ว' : wf.status === 'rejected' ? 'ไม่อนุมัติ' : 'รอดำเนินการ',
        };
      });

      if (rows.length === 0) {
        alert('ไม่มีข้อมูลการจองรถ');
        return;
      }

      // Create workbook
      const ws = XLSX.utils.json_to_sheet(rows);

      // Set column widths
      ws['!cols'] = [
        { wch: 14 }, // วันที่ขอ
        { wch: 14 }, // วันที่ใช้
        { wch: 10 }, // รหัส
        { wch: 25 }, // ผู้ขอ
        { wch: 30 }, // ผู้ร่วมเดินทาง
        { wch: 12 }, // แผนก
        { wch: 25 }, // สถานที่
        { wch: 30 }, // วัตถุประสงค์
        { wch: 20 }, // ประเภทรถ
        { wch: 20 }, // คนขับ
        { wch: 14 }, // สถานะ
      ];

      const wb = XLSX.utils.book_new();
      const year = new Date().getFullYear();
      XLSX.utils.book_append_sheet(wb, ws, `Pool Car ${year}`);

      // Add title row
      XLSX.utils.sheet_add_aoa(ws, [[`${year} Pool car / van record (บันทึกการขอใช้รถบริษัท)`]], { origin: 'A1' });
      // Shift data down by re-creating
      const ws2 = XLSX.utils.json_to_sheet(rows, { origin: 'A3' });
      XLSX.utils.sheet_add_aoa(ws2, [[`${year} Pool car / van record (บันทึกการขอใช้รถบริษัท)`]], { origin: 'A1' });
      ws2['!cols'] = ws['!cols'];

      const wb2 = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb2, ws2, `Pool Car ${year}`);

      // Download
      XLSX.writeFile(wb2, `Pool_Car_Record_${year}.xlsx`);
    } catch (err) {
      console.error('Export error:', err);
      alert('เกิดข้อผิดพลาดในการ Export: ' + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Navbar */}
      <nav className="border-b border-slate-200 bg-white/90 backdrop-blur-md sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg shadow-md">
              <Car className="text-white w-6 h-6" />
            </div>
            <h1 className="font-bold text-sm md:text-lg text-slate-900 uppercase tracking-tighter">GA <span className="text-amber-600 font-black">Management</span></h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-slate-600">GA</span>
            <button onClick={onLogout} className="p-2.5 hover:bg-red-50 rounded-xl transition-all text-slate-400 hover:text-red-600 border border-slate-100 hover:border-red-100">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-3 md:p-8">
        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-4 md:mb-6">
          <button
            onClick={() => { setActiveTab('vehicle'); setSelectedRequest(null); }}
            className={`flex items-center gap-1.5 px-3 md:px-5 py-2 md:py-2.5 rounded-xl font-bold text-xs md:text-sm transition-all ${
              activeTab === 'vehicle' ? 'bg-amber-500 text-white shadow-lg' : 'bg-white text-slate-600 border border-slate-200 hover:border-amber-300'
            }`}
          >
            <Car size={14} /> จัดรถ
            {vehicleCount > 0 && <span className={`px-1.5 py-0.5 rounded-full text-[10px] md:text-xs font-black ${activeTab === 'vehicle' ? 'bg-white text-amber-600' : 'bg-amber-100 text-amber-700'}`}>{vehicleCount}</span>}
          </button>
          <button
            onClick={() => { setActiveTab('food'); setSelectedRequest(null); }}
            className={`flex items-center gap-1.5 px-3 md:px-5 py-2 md:py-2.5 rounded-xl font-bold text-xs md:text-sm transition-all ${
              activeTab === 'food' ? 'bg-orange-500 text-white shadow-lg' : 'bg-white text-slate-600 border border-slate-200 hover:border-orange-300'
            }`}
          >
            <UtensilsCrossed size={14} /> อาหาร/เครื่องดื่ม
            {foodCount > 0 && <span className={`px-1.5 py-0.5 rounded-full text-[10px] md:text-xs font-black ${activeTab === 'food' ? 'bg-white text-orange-600' : 'bg-orange-100 text-orange-700'}`}>{foodCount}</span>}
          </button>

          <button
            onClick={() => { setActiveTab('missing'); setSelectedRequest(null); setSelectedMissing(null); }}
            className={`flex items-center gap-1.5 px-3 md:px-5 py-2 md:py-2.5 rounded-xl font-bold text-xs md:text-sm transition-all ${
              activeTab === 'missing' ? 'bg-red-600 text-white shadow-lg' : 'bg-white text-slate-600 border border-slate-200 hover:border-red-300'
            } ${missingCount > 0 && activeTab !== 'missing' ? 'ring-2 ring-red-300 animate-pulse' : ''}`}
          >
            <Package size={14} /> ของไม่ครบ / ค้างออก
            {missingCount > 0 && <span className={`px-1.5 py-0.5 rounded-full text-[10px] md:text-xs font-black ${activeTab === 'missing' ? 'bg-white text-red-600' : 'bg-red-100 text-red-700'}`}>{missingCount}</span>}
          </button>

          {/* 📜 ประวัติออเดอร์ */}
          <button
            onClick={() => { setActiveTab('history'); setSelectedRequest(null); }}
            className={`flex items-center gap-1.5 px-3 md:px-5 py-2 md:py-2.5 rounded-xl font-bold text-xs md:text-sm transition-all ${
              activeTab === 'history' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-300'
            }`}
            title="ประวัติออเดอร์ที่ส่งให้ร้านค้าไปแล้ว"
          >
            📜 ประวัติร้านค้า
            {historyOrders.length > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] md:text-xs font-black ${activeTab === 'history' ? 'bg-white text-indigo-600' : 'bg-indigo-100 text-indigo-700'}`}>
                {historyOrders.length}
              </span>
            )}
          </button>

          {/* Export Excel Buttons — context-aware */}
          <div className="ml-auto flex items-center gap-2">
            {(activeTab === 'food' || activeTab === 'history') ? (
              <button
                onClick={handleExportFoodDrinkExcel}
                className="flex items-center gap-1.5 px-3 md:px-5 py-2 md:py-2.5 rounded-xl font-bold text-xs md:text-sm transition-all bg-orange-600 text-white hover:bg-orange-700 active:scale-[0.98] shadow-lg ring-2 ring-orange-300"
                title="Export อาหาร+เครื่องดื่ม แยกแผนก × เดือน-ปี"
              >
                <FileSpreadsheet size={14} /> 🍱☕ Export อาหาร/น้ำ
              </button>
            ) : activeTab === 'vehicle' ? (
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-3 md:px-5 py-2 md:py-2.5 rounded-xl font-bold text-xs md:text-sm transition-all bg-amber-600 text-white hover:bg-amber-700 active:scale-[0.98] shadow-lg ring-2 ring-amber-300"
                title="Export ใบขอใช้รถ"
              >
                <FileSpreadsheet size={14} /> 🚗 Export ใบรถ
              </button>
            ) : null}
          </div>
        </div>

        {/* Vehicle Tab */}
        {activeTab === 'vehicle' && (
          <>
          {/* 🚗🆚🚐 Sub-tab Switcher: รถบริษัท / รถเช่าภายนอก */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex p-1 bg-slate-100 rounded-2xl shadow-inner">
              <button
                onClick={() => setVehicleSubTab('company')}
                className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${
                  vehicleSubTab === 'company'
                    ? 'bg-white text-emerald-700 shadow-md'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                🚗 รถบริษัท
              </button>
              <button
                onClick={() => setVehicleSubTab('external')}
                className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${
                  vehicleSubTab === 'external'
                    ? 'bg-white text-violet-700 shadow-md'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                🚐 รถเช่าภายนอก
              </button>
            </div>
            {vehicleSubTab === 'company' && <PoolCarRecord />}
          </div>

          {/* === 🚐 รถเช่าภายนอก View === */}
          {vehicleSubTab === 'external' && (
            <ExternalVehicleRentalInline />
          )}

          {/* === 🚗 รถบริษัท View (ของเดิม) === */}
          {vehicleSubTab === 'company' && (
          <>

          {/* Vehicle Status Dashboard */}
          <div className="mb-6 bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <h2 className="font-black text-slate-800 text-sm flex items-center gap-2 mb-4">
              <Car size={16} className="text-blue-500" />
              สถานะรถทั้งหมด (วันนี้)
              <span className="text-xs font-normal text-slate-400">
                อัพเดตอัตโนมัติ
              </span>
            </h2>
            {vehicles.length === 0 ? (
              <p className="text-slate-300 text-sm text-center py-4">ยังไม่มีข้อมูลรถในระบบ</p>
            ) : (
              <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 md:gap-3">
                {vehicles.map(v => {
                  const vs = getVehicleStatus(v);
                  const isMaint = v.status === 'maintenance' || v.status === 'unavailable';
                  return (
                    <div key={v.id} className={`relative border-2 rounded-xl p-2.5 md:p-3 transition-all ${
                      isMaint ? 'border-yellow-300 bg-yellow-50' :
                      vs.status === 'available' ? 'border-emerald-300 bg-emerald-50' :
                      vs.status === 'reserved' ? 'border-amber-300 bg-amber-50' :
                      vs.status === 'overdue' ? 'border-red-400 bg-red-50 animate-pulse' :
                      'border-red-300 bg-red-50'
                    }`}>
                      {/* Status dot */}
                      <div className={`absolute top-2 right-2 w-3 h-3 rounded-full ${
                        isMaint ? 'bg-yellow-400' :
                        vs.status === 'available' ? 'bg-emerald-400' :
                        vs.status === 'overdue' ? 'bg-red-500 animate-ping' :
                        vs.status === 'in_use' ? 'bg-red-400' :
                        'bg-amber-400'
                      }`} />
                      <div className="font-bold text-sm">{v.brand || v.id}</div>
                      <div className="text-xs text-slate-500 font-mono">{v.plate}</div>
                      <div className="text-[10px] text-slate-400">{v.type || '-'} · {v.seats || '-'} ที่นั่ง</div>

                      {/* Status label */}
                      <div className={`mt-2 text-[10px] font-black px-2 py-0.5 rounded-full inline-block ${
                        isMaint ? 'bg-yellow-200 text-yellow-800' :
                        vs.status === 'available' ? 'bg-emerald-200 text-emerald-800' :
                        vs.status === 'reserved' ? 'bg-amber-200 text-amber-800' :
                        vs.status === 'overdue' ? 'bg-red-300 text-red-900' :
                        'bg-red-200 text-red-800'
                      }`}>
                        {isMaint ? '🔧 ซ่อมบำรุง' :
                         vs.status === 'available' ? '✅ ว่าง' :
                         vs.status === 'reserved' ? `🟡 ${vs.label}` :
                         vs.status === 'overdue' ? '🚨 เลยเวลา!' :
                         '🔴 กำลังใช้งาน'}
                      </div>

                      {/* Booking info */}
                      {vs.booking && !isMaint && (
                        <div className="mt-2 text-[10px] text-slate-500 space-y-0.5 border-t border-slate-200 pt-2">
                          <p>👤 {vs.booking.requesterName || '-'}</p>
                          <p>🕐 {vs.booking.timeStart} - {vs.booking.timeEnd}</p>
                          {vs.booking.driverName && <p>🧑‍✈️ {vs.booking.driverName}</p>}
                        </div>
                      )}

                      {/* Return button — show for in_use or overdue */}
                      {(vs.status === 'in_use' || vs.status === 'overdue') && vs.booking && (
                        <button
                          onClick={() => handleMarkReturned(vs.booking)}
                          className="mt-2 w-full py-1.5 rounded-lg text-[11px] font-black bg-emerald-500 text-white hover:bg-emerald-600 active:scale-[0.97] transition-all"
                        >
                          <CheckCircle size={12} className="inline mr-1" />
                          รถกลับแล้ว
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-slate-100 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /> ว่าง</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> จองไว้</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" /> กำลังใช้งาน</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping inline-block" /> เลยเวลา!</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" /> ซ่อมบำรุง</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">

          {/* Left: Pending Requests */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <h2 className="font-black text-slate-800 text-sm flex items-center gap-2 mb-4">
                <Clock size={16} className="text-amber-500" />
                คำขอใช้รถรอจัดรถ
                {pendingRequests.length > 0 && (
                  <span className="bg-amber-500 text-white px-2.5 py-0.5 rounded-full text-xs font-black">{pendingRequests.length}</span>
                )}
              </h2>
              {pendingRequests.length === 0 ? (
                <p className="text-slate-300 text-sm text-center py-8">ไม่มีคำขอรอดำเนินการ</p>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {pendingRequests.map((req) => {
                    const p = req.requestPayload || {};
                    const isSelected = selectedRequest?._docId === req._docId;
                    return (
                      <div
                        key={req._docId}
                        onClick={() => handleSelectRequest(req)}
                        className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${
                          isSelected
                            ? 'border-amber-500 bg-amber-50 shadow-md'
                            : 'border-slate-200 bg-slate-50 hover:border-amber-300 hover:shadow-sm'
                        }`}
                      >
                        <p className="font-bold text-sm text-slate-800">{req.requesterName || '-'}</p>
                        <p className="text-[11px] text-slate-500">{p.department || '-'} · {p.date || '-'}</p>
                        <p className="text-[11px] text-slate-500">{p.timeStart || '-'} - {p.timeEnd || '-'} · {p.destination || '-'}</p>
                        <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${p.needDriver ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {p.needDriver ? '🧑‍✈️ ต้องการคนขับ' : '🚘 ขับเอง'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right: Vehicle Assignment */}
          <div className="lg:col-span-2">
            {!selectedRequest ? (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
                <Car size={48} className="text-slate-200 mx-auto mb-4" />
                <p className="text-slate-400 text-sm">เลือกคำขอจากรายการด้านซ้ายเพื่อจัดรถ</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Request Info */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                  <h3 className="font-black text-slate-800 text-sm mb-3">📋 รายละเอียดคำขอ</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="font-bold text-slate-500">ชื่อ:</span> {reqPayload.name || selectedRequest.requesterName}</div>
                    <div><span className="font-bold text-slate-500">แผนก:</span> {reqPayload.department || '-'}</div>
                    <div><span className="font-bold text-slate-500">วันที่:</span> {reqPayload.date || '-'}</div>
                    <div><span className="font-bold text-slate-500">เวลา:</span> {reqPayload.timeStart || '-'} - {reqPayload.timeEnd || '-'}</div>
                    <div><span className="font-bold text-slate-500">ปลายทาง:</span> {reqPayload.destination || '-'}</div>
                    <div>
                      <span className="font-bold text-slate-500">ประเภท:</span>{' '}
                      <span className={`font-bold ${reqPayload.needDriver ? 'text-red-600' : 'text-emerald-600'}`}>
                        {reqPayload.needDriver ? '🧑‍✈️ ต้องการคนขับ' : '🚘 ขับเอง'}
                      </span>
                    </div>
                  </div>
                  {reqPayload.purpose && <p className="text-sm mt-2"><span className="font-bold text-slate-500">วัตถุประสงค์:</span> {reqPayload.purpose}</p>}
                </div>

                {/* No Vehicle Toggle */}
                <label className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${noVehicle ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white hover:border-red-200'}`}>
                  <input type="checkbox" checked={noVehicle} onChange={e => { setNoVehicle(e.target.checked); if (e.target.checked) { setSelectedVehicle(null); setSelectedDriver(null); } }}
                    className="w-5 h-5 accent-red-500" />
                  <span className={`font-bold ${noVehicle ? 'text-red-700' : 'text-slate-600'}`}>❌ ไม่มีรถให้ใช้งาน (แจ้งพนักงานใช้รถส่วนตัว)</span>
                </label>

                {!noVehicle && (
                  <>
                    {/* Vehicle Selection */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                      <h3 className="font-black text-slate-800 text-sm mb-3 flex items-center gap-2">
                        <Car size={16} className="text-blue-500" /> เลือกรถ
                        {reqDate && <span className="text-slate-400 font-normal text-xs">({reqDate})</span>}
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {vehicles.map(v => {
                          const booked = reqDate ? isVehicleBooked(v.id, reqDate) : false;
                          const isMaint = v.status === 'maintenance' || v.status === 'unavailable';
                          const selected = selectedVehicle?.id === v.id;
                          const clickable = !booked && !isMaint;
                          return (
                            <div key={v.id}
                              onClick={() => clickable && setSelectedVehicle(v)}
                              className={`border-2 rounded-xl p-3 transition-all cursor-pointer ${
                                selected ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200 shadow-lg' :
                                booked ? 'border-red-300 bg-red-50 opacity-50 cursor-not-allowed' :
                                isMaint ? 'border-yellow-300 bg-yellow-50 opacity-50 cursor-not-allowed' :
                                'border-emerald-300 bg-emerald-50 hover:border-emerald-500 hover:shadow-md'
                              }`}
                            >
                              <div className="font-bold text-sm">{v.brand}</div>
                              <div className="text-xs text-slate-500 font-mono">{v.plate}</div>
                              <div className="text-[10px] text-slate-400">{v.type} · {v.seats} ที่นั่ง</div>
                              <div className={`text-[10px] font-bold mt-1 ${booked ? 'text-red-600' : isMaint ? 'text-yellow-600' : selected ? 'text-blue-600' : 'text-emerald-600'}`}>
                                {booked ? '❌ จองแล้ว' : isMaint ? '🔧 ซ่อม' : selected ? '✅ เลือกแล้ว' : '✅ ว่าง'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Driver Selection — only if needDriver */}
                    {reqPayload.needDriver && (
                      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                        <h3 className="font-black text-slate-800 text-sm mb-3 flex items-center gap-2">
                          <User size={16} className="text-purple-500" /> เลือกคนขับ
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {drivers.map(d => {
                            const booked = reqDate ? isDriverBooked(d.id, reqDate) : false;
                            const selected = selectedDriver?.id === d.id;
                            const isBusy = d.status === 'busy';
                            const isOnLeave = d.status === 'on_leave';
                            const unavailable = booked || isBusy || isOnLeave;
                            const clickable = !unavailable && d.status === 'available';
                            const cardClass = selected ? 'border-purple-600 bg-purple-50 ring-2 ring-purple-200 shadow-lg'
                              : isOnLeave ? 'border-red-300 bg-red-50 opacity-60'
                              : isBusy ? 'border-amber-300 bg-amber-50 opacity-70'
                              : booked ? 'border-red-300 bg-red-50 opacity-50'
                              : 'border-emerald-300 bg-emerald-50 hover:border-purple-400 hover:shadow-md';
                            const statusText = isOnLeave ? '🔴 ลา' : isBusy ? '🟡 ไม่ว่าง' : booked ? '❌ จองแล้ว' : selected ? '✅ เลือกแล้ว' : '🟢 ว่าง';
                            const statusColor = isOnLeave ? 'text-red-600' : isBusy ? 'text-amber-600' : booked ? 'text-red-600' : selected ? 'text-purple-600' : 'text-emerald-600';
                            return (
                              <div key={d.id}
                                onClick={clickable ? () => setSelectedDriver(d) : undefined}
                                className={`border-2 rounded-xl p-3 transition-all ${cardClass}`}
                                style={{ cursor: clickable ? 'pointer' : 'not-allowed', pointerEvents: clickable ? 'auto' : 'none' }}
                              >
                                <div className="font-bold text-sm">🧑‍✈️ {d.nickname ? `${d.nickname} (${d.name})` : d.name}</div>
                                <div className="text-xs text-slate-500 flex items-center gap-1"><Phone size={10} /> {d.phone}</div>
                                <div className={`text-[10px] font-bold mt-1 ${statusColor}`}>
                                  {statusText}
                                </div>
                                {(isBusy || isOnLeave) && d.statusNote && (
                                  <div className="text-[10px] text-slate-600 mt-1 italic">📍 {d.statusNote}</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Summary + Approve Button */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                  <h3 className="font-black text-slate-800 text-sm mb-3">📝 สรุป</h3>
                  {noVehicle ? (
                    <p className="text-red-600 font-bold text-sm">❌ ไม่มีรถให้ใช้งาน — แจ้งพนักงานใช้รถส่วนตัว</p>
                  ) : (
                    <div className="text-sm space-y-1">
                      {selectedVehicle ? (
                        <p>🚗 <strong>{selectedVehicle.brand}</strong> ทะเบียน <strong>{selectedVehicle.plate}</strong></p>
                      ) : (
                        <p className="text-amber-500">⚠️ ยังไม่ได้เลือกรถ</p>
                      )}
                      {reqPayload.needDriver && (
                        selectedDriver ? (
                          <p>🧑‍✈️ คนขับ: <strong>{selectedDriver.name}</strong> 📞 <strong>{selectedDriver.phone}</strong></p>
                        ) : (
                          <p className="text-amber-500">⚠️ ยังไม่ได้เลือกคนขับ</p>
                        )
                      )}
                    </div>
                  )}
                  <button
                    onClick={handleApprove}
                    disabled={processing}
                    className={`w-full mt-4 py-3 rounded-xl font-black text-white text-sm transition-all ${
                      processing ? 'bg-slate-400 cursor-not-allowed' :
                      noVehicle ? 'bg-red-500 hover:bg-red-600 active:scale-[0.98]' :
                      'bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98]'
                    }`}
                  >
                    {processing ? '⏳ กำลังดำเนินการ...' : noVehicle ? '❌ แจ้งไม่มีรถ' : '✅ อนุมัติจัดรถ'}
                  </button>
                  <button
                    onClick={() => { setRejectReason(''); setShowRejectModal(true); }}
                    disabled={processing}
                    className="w-full mt-2 py-2.5 rounded-xl font-black text-red-600 text-sm border-2 border-red-200 bg-white hover:bg-red-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ✗ ปฏิเสธคำขอ (ระบุเหตุผล)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Today's Bookings Overview */}
        <div className="mt-8 bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <h2 className="font-black text-slate-800 text-sm flex items-center gap-2 mb-4">
            <Truck size={16} className="text-blue-500" /> การจองรถวันนี้
            <span className="text-xs font-normal text-slate-400">({new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })})</span>
          </h2>
          {(() => {
            const today = new Date().toISOString().split('T')[0];
            const todayBookings = allBookings.filter(b => b.date === today);
            if (todayBookings.length === 0) return <p className="text-slate-300 text-sm text-center py-4">ไม่มีการจองรถวันนี้</p>;
            return (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left">
                      <th className="py-2 px-3 font-bold text-slate-500">รถ</th>
                      <th className="py-2 px-3 font-bold text-slate-500">ทะเบียน</th>
                      <th className="py-2 px-3 font-bold text-slate-500">คนขับ</th>
                      <th className="py-2 px-3 font-bold text-slate-500">เวลา</th>
                      <th className="py-2 px-3 font-bold text-slate-500">ผู้ขอ</th>
                      <th className="py-2 px-3 font-bold text-slate-500 text-center">เอกสาร</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayBookings.map((b, i) => (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2 px-3">{b.brand || '-'}</td>
                        <td className="py-2 px-3 font-mono">{b.plate || '-'}</td>
                        <td className="py-2 px-3">{b.driverName || 'ขับเอง'} {b.driverPhone ? `(${b.driverPhone})` : ''}</td>
                        <td className="py-2 px-3">{b.timeStart || '-'} - {b.timeEnd || '-'}</td>
                        <td className="py-2 px-3">{b.requesterName || '-'}</td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => openDocViewer(b)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold transition active:scale-95"
                            title="ดูเอกสาร + ลายเซ็น 3 ฝ่าย + PDF + ส่งให้ รปภ."
                          >
                            <Eye size={13} /> ดูเอกสาร
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
          </>
          )}
          </>
        )}

        {/* Food/Drink Tab */}
        {activeTab === 'food' && (
          <div className="space-y-4">
            {/* Summary: รวมยอดรอดำเนินการ (สำหรับ GA รวมเป็นบิลแผนก) */}
            {foodOrders.length > 0 && (() => {
              // Compute totals
              let grandTotal = 0;
              let grandDrink = 0;
              let grandFood = 0;
              let hasUnpriced = false;
              const byDept = {};
              for (const o of foodOrders) {
                const p = o.requestPayload || {};
                const isCombined = o.sourceForm === 'DRINK_FOOD_ORDER';
                const isDrink = o.sourceForm === 'DRINK_ORDER';
                let drinkSum = 0;
                let foodSum = 0;
                if (isCombined) {
                  if (typeof p.drinkTotalAmount === 'number') drinkSum = p.drinkTotalAmount;
                  else for (const r of (p.drinkRows || [])) {
                    if (typeof r.lineTotal === 'number') drinkSum += r.lineTotal; else hasUnpriced = true;
                  }
                  if (typeof p.foodTotalAmount === 'number') foodSum = p.foodTotalAmount;
                  else for (const r of (p.foodRows || [])) {
                    if (typeof r.lineTotal === 'number') foodSum += r.lineTotal; else hasUnpriced = true;
                  }
                } else {
                  let orderTotal = 0;
                  if (typeof p.totalAmount === 'number') orderTotal = p.totalAmount;
                  else for (const r of (p.rows || [])) {
                    if (typeof r.lineTotal === 'number') orderTotal += r.lineTotal; else hasUnpriced = true;
                  }
                  if (p.totalAmount == null && (p.rows || []).some(r => r.lineTotal == null)) hasUnpriced = true;
                  if (isDrink) drinkSum = orderTotal; else foodSum = orderTotal;
                }
                const orderTotal = drinkSum + foodSum;
                grandTotal += orderTotal;
                grandDrink += drinkSum;
                grandFood += foodSum;
                const dept = p.department || o.requesterDepartment || '-';
                byDept[dept] = (byDept[dept] || 0) + orderTotal;
              }
              const topDepts = Object.entries(byDept).sort((a, b) => b[1] - a[1]);
              return (
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white rounded-2xl shadow-lg p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-black text-base flex items-center gap-2">
                      📊 สรุปออเดอร์รอดำเนินการ
                    </h3>
                    <span className="text-xs text-slate-300">{foodOrders.length} ออเดอร์</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="bg-white/10 rounded-xl p-3">
                      <p className="text-[10px] text-slate-300 uppercase font-bold">☕ เครื่องดื่ม</p>
                      <p className="text-2xl font-black">฿{grandDrink.toLocaleString()}</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3">
                      <p className="text-[10px] text-slate-300 uppercase font-bold">🍱 อาหาร</p>
                      <p className="text-2xl font-black">฿{grandFood.toLocaleString()}</p>
                    </div>
                    <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl p-3 col-span-2 sm:col-span-2">
                      <p className="text-[10px] text-white/80 uppercase font-bold">💰 รวมทั้งหมด</p>
                      <p className="text-3xl font-black">฿{grandTotal.toLocaleString()}</p>
                      {hasUnpriced && (
                        <p className="text-[10px] text-white/80 mt-1">⚠ บางรายการยังรอกำหนดราคา</p>
                      )}
                    </div>
                  </div>
                  {topDepts.length > 0 && (
                    <div>
                      <p className="text-[10px] text-slate-300 uppercase font-bold mb-2">แยกตามแผนก</p>
                      <div className="flex flex-wrap gap-2">
                        {topDepts.map(([d, v]) => (
                          <span key={d} className="bg-white/10 px-3 py-1 rounded-full text-xs">
                            <span className="font-bold">{d}</span>: ฿{v.toLocaleString()}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {foodOrders.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
                <UtensilsCrossed size={48} className="text-slate-200 mx-auto mb-4" />
                <p className="text-slate-400 text-sm">ไม่มีออเดอร์อาหาร/เครื่องดื่มรอดำเนินการ</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {foodOrders.map((order) => {
                  const p = order.requestPayload || {};
                  const isCombined = order.sourceForm === 'DRINK_FOOD_ORDER';
                  const isDrink = order.sourceForm === 'DRINK_ORDER';
                  // Flatten rows — combined orders tag each row with ประเภท
                  let rows;
                  if (isCombined) {
                    const drinkRows = (p.drinkRows || []).map(r => ({ ...r, _kind: 'เครื่องดื่ม' }));
                    const foodRows = (p.foodRows || []).map(r => ({ ...r, _kind: 'อาหาร' }));
                    rows = [...drinkRows, ...foodRows];
                  } else {
                    rows = p.rows || [];
                  }
                  // คำนวณยอดรวมออเดอร์
                  let orderTotal = 0;
                  let orderHasUnpriced = false;
                  if (isCombined) {
                    if (typeof p.drinkTotalAmount === 'number') orderTotal += p.drinkTotalAmount;
                    if (typeof p.foodTotalAmount === 'number') orderTotal += p.foodTotalAmount;
                    if (rows.some(r => r.lineTotal == null)) orderHasUnpriced = true;
                  } else {
                    if (typeof p.totalAmount === 'number') orderTotal = p.totalAmount;
                    for (const r of rows) {
                      if (r.lineTotal == null) orderHasUnpriced = true;
                      else if (typeof p.totalAmount !== 'number') orderTotal += r.lineTotal;
                    }
                  }
                  const borderClass = isCombined ? 'border-purple-200' : (isDrink ? 'border-emerald-200' : 'border-orange-200');
                  const bgClass = isCombined ? 'bg-purple-50' : (isDrink ? 'bg-emerald-50' : 'bg-orange-50');
                  const badgeClass = isCombined ? 'bg-purple-100 text-purple-700' : (isDrink ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700');
                  const btnClass = isCombined ? 'bg-purple-500 hover:bg-purple-600' : (isDrink ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-orange-500 hover:bg-orange-600');
                  return (
                    <div key={order._docId} className={`bg-white rounded-2xl shadow-sm border-2 p-5 ${borderClass}`}>
                      {/* Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {isCombined ? (<><Coffee size={16} className="text-purple-500" /><UtensilsCrossed size={16} className="text-purple-500" /></>) : isDrink ? <Coffee size={18} className="text-emerald-500" /> : <UtensilsCrossed size={18} className="text-orange-500" />}
                          <span className={`text-xs font-black px-2 py-0.5 rounded-full ${badgeClass}`}>
                            {isCombined ? 'เครื่องดื่ม + อาหาร' : isDrink ? 'เครื่องดื่ม' : 'อาหาร'}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {order.forwardedAt ? new Date(order.forwardedAt).toLocaleString('th-TH') : '-'}
                        </span>
                      </div>

                      {/* Info */}
                      <div className="text-sm space-y-1 mb-3">
                        <p><span className="font-bold text-slate-500">ผู้สั่ง:</span> {p.responsiblePerson || order.requesterName || '-'}</p>
                        <p><span className="font-bold text-slate-500">แผนก:</span> {p.department || '-'} · <span className="font-bold text-slate-500">เวลา:</span> {p.orderTime || '-'}</p>
                      </div>

                      {/* Order Items */}
                      <div className={`rounded-xl p-3 mb-3 ${bgClass}`}>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-[10px] font-bold text-slate-500">
                              <th className="pb-1">#</th>
                              {isCombined && <th className="pb-1">ประเภท</th>}
                              <th className="pb-1">รายการ</th>
                              <th className="pb-1 text-center">จำนวน</th>
                              <th className="pb-1 text-right">ราคา/หน่วย</th>
                              <th className="pb-1 text-right">รวม</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r, i) => (
                              <tr key={i} className="border-t border-slate-100">
                                <td className="py-1 text-slate-400">{i + 1}</td>
                                {isCombined && (
                                  <td className="py-1 text-[10px] font-bold">
                                    <span className={`px-1.5 py-0.5 rounded ${r._kind === 'เครื่องดื่ม' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>{r._kind}</span>
                                  </td>
                                )}
                                <td className="py-1 font-bold">
                                  {r.details || '-'}
                                  <span className="block text-[10px] font-normal text-slate-400">{r.condition || ''}</span>
                                </td>
                                <td className="py-1 text-center">{r.count || '-'}</td>
                                <td className="py-1 text-right text-slate-600">
                                  {r.unitPrice != null ? `฿${r.unitPrice}` : <span className="text-slate-300 italic">—</span>}
                                </td>
                                <td className="py-1 text-right font-bold">
                                  {r.lineTotal != null ? `฿${r.lineTotal}` : <span className="text-slate-300 italic">—</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-slate-300">
                              <td colSpan={isCombined ? 5 : 4} className="py-2 text-right text-xs font-black text-slate-600 uppercase">💰 รวมออเดอร์</td>
                              <td className="py-2 text-right font-black text-base text-amber-700">
                                {orderHasUnpriced ? (
                                  <span className="text-xs text-slate-400">รอกำหนด</span>
                                ) : (
                                  `฿${orderTotal.toLocaleString()}`
                                )}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                        {(p.note || p.drinkNote || p.foodNote) && (
                          <div className="text-xs text-slate-500 mt-2 pt-1 border-t border-slate-200 space-y-0.5">
                            {p.note && <p>📝 {p.note}</p>}
                            {p.drinkNote && <p>☕ {p.drinkNote}</p>}
                            {p.foodNote && <p>🍱 {p.foodNote}</p>}
                          </div>
                        )}
                      </div>

                      {/* Acknowledge Button */}
                      <button
                        onClick={() => handleAcknowledgeOrder(order)}
                        className={`w-full py-2.5 rounded-xl font-black text-white text-sm transition-all active:scale-[0.98] ${btnClass}`}
                      >
                        <Check size={14} className="inline mr-1" /> รับออเดอร์
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 📜 ประวัติร้านค้า — ออเดอร์ที่ GA อนุมัติแล้ว */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-indigo-600 to-purple-700 text-white rounded-2xl shadow-lg p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-black text-base flex items-center gap-2">
                  📜 ประวัติออเดอร์ที่ส่งให้ร้านค้า
                </h3>
                <span className="text-xs text-indigo-100">{historyOrders.length} รายการ</span>
              </div>
              <p className="text-xs text-indigo-100">รายการออเดอร์ที่ GA อนุมัติและส่งให้ร้านค้าไปแล้ว — ดูย้อนหลังได้</p>
            </div>

            {historyOrders.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
                <p className="text-5xl mb-4">📭</p>
                <p className="text-slate-400 text-sm">ยังไม่มีประวัติออเดอร์</p>
                <p className="text-slate-300 text-xs mt-1">หลัง GA อนุมัติออเดอร์ จะแสดงที่นี่</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {historyOrders.map((order) => {
                  const p = order.requestPayload || {};
                  const isCombined = order.sourceForm === 'DRINK_FOOD_ORDER';
                  const isDrink = order.sourceForm === 'DRINK_ORDER';
                  const isFood = order.sourceForm === 'FOOD_ORDER';
                  const drinkRows = isCombined ? (p.drinkRows || []) : (isDrink ? (p.rows || []) : []);
                  const foodRows = isCombined ? (p.foodRows || []) : (isFood ? (p.rows || []) : []);
                  const dTotal = isCombined ? (p.drinkTotalAmount ?? 0) : (isDrink ? (p.totalAmount ?? 0) : 0);
                  const fTotal = isCombined ? (p.foodTotalAmount ?? 0) : (isFood ? (p.totalAmount ?? 0) : 0);
                  const grandTotal = p.totalAmount ?? (dTotal + fTotal);
                  const refCode = (order.id || '').slice(-12).toUpperCase();
                  const approvedAt = order.acknowledgedAt
                    ? new Date(order.acknowledgedAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
                    : '-';

                  // ตรวจ allergy
                  const hasAllergy = foodRows.some(r => r.hasAllergy && (r.allergies?.length > 0 || r.allergyNames?.length > 0));

                  // Determine which shop(s) this was sent to
                  const sentTo = [];
                  if (drinkRows.length > 0) sentTo.push({ icon: '☕', label: 'ร้านกาแฟ', total: dTotal, count: drinkRows.length });
                  if (foodRows.length > 0) sentTo.push({ icon: '🍱', label: 'ร้านข้าว OT', total: fTotal, count: foodRows.length });

                  return (
                    <div key={order._docId} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition">
                      {/* Header */}
                      <div className="bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-3 border-b border-slate-200">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[10px] font-mono font-black text-slate-500">REF: {refCode}</p>
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">✓ ส่งแล้ว</span>
                        </div>
                        <p className="font-bold text-slate-900 text-sm">👤 {order.requesterName || '-'}</p>
                        <p className="text-[11px] text-slate-500">#{order.requesterId} · {p.department || order.requesterDepartment}</p>
                      </div>

                      {/* Body */}
                      <div className="p-4">
                        {/* วัน-เวลา */}
                        <div className="flex items-center gap-3 text-[11px] text-slate-600 mb-3 pb-2 border-b border-slate-100">
                          <span>📅 {p.orderDate || '-'}</span>
                          <span>🕐 {p.orderTime || '-'}</span>
                          {p.location && <span>📍 {p.location}</span>}
                        </div>

                        {/* ร้านที่ส่ง — chip */}
                        <div className="flex flex-wrap gap-2 mb-3">
                          {sentTo.map((s, i) => (
                            <div key={i} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${s.icon === '☕' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-orange-50 text-orange-700 border border-orange-200'}`}>
                              <span>{s.icon}</span>
                              <span>{s.label}</span>
                              <span className="text-[10px] opacity-75">·</span>
                              <span>{s.count} รายการ</span>
                              <span className="text-[10px] opacity-75">·</span>
                              <span className="font-mono">฿{Number(s.total).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>

                        {/* รายการสรุป */}
                        <div className="text-[12px] text-slate-700 space-y-1 mb-3">
                          {drinkRows.length > 0 && (
                            <div>
                              <span className="font-bold">☕ </span>
                              {drinkRows.map(r => `${r.menu || r.details || r.name}${r.qty || r.count ? `(×${r.qty || r.count})` : ''}`).join(', ')}
                            </div>
                          )}
                          {foodRows.length > 0 && (
                            <div>
                              <span className="font-bold">🍱 </span>
                              {foodRows.map(r => `${r.menu || r.details || r.name}${r.qty || r.count ? `(×${r.qty || r.count})` : ''}`).join(', ')}
                            </div>
                          )}
                        </div>

                        {/* Allergy warning */}
                        {hasAllergy && (
                          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
                            <p className="text-[11px] font-bold text-red-700">⚠️ มีคนแพ้อาหาร — ดูรายละเอียดก่อนทำ</p>
                          </div>
                        )}

                        {/* Footer: total + approved by */}
                        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                          <div>
                            <p className="text-[10px] text-slate-400 font-bold">รวม</p>
                            <p className="text-lg font-black text-slate-900 font-mono">฿{Number(grandTotal).toLocaleString()}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-slate-400">อนุมัติโดย</p>
                            <p className="text-[12px] font-bold text-slate-700">{order.approvedBy || '-'}</p>
                            <p className="text-[10px] text-slate-400">{approvedAt}</p>
                          </div>
                        </div>

                        {/* Action button */}
                        <button
                          type="button"
                          onClick={() => window.open(`/index.html?approve=${order.id}&as=${encodeURIComponent(user?.email || '')}`, '_blank')}
                          className="w-full mt-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-200 transition"
                        >
                          📄 ดู / ส่งให้ร้านค้าซ้ำ
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Missing Goods Follow-up Tab (ของไม่ครบ/ค้างออก จาก รปภ.) */}
        {activeTab === 'missing' && (
          <div className="space-y-4">
            <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={20} />
                <div>
                  <h3 className="font-black text-red-800 text-sm">ของไม่ครบ / ค้างออก — รอติดตาม</h3>
                  <p className="text-xs text-red-600 mt-1">รปภ. ตรวจพบของกลับไม่ครบ หรือยังไม่กลับ → ส่งเรื่องมาให้ GA ติดตามกับแผนกเจ้าของ</p>
                </div>
              </div>
            </div>

            {missingGoods.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
                <Package size={48} className="text-slate-200 mx-auto mb-4" />
                <p className="text-slate-400 text-sm">ไม่มีเรื่องของไม่ครบรอติดตาม ✓</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {missingGoods.map((g) => {
                  const isInProgress = g.followupStatus === 'in_progress';
                  const missing = g.missingItems || [];
                  return (
                    <div key={g._docId} className={`bg-white rounded-2xl shadow-sm border-2 p-5 ${isInProgress ? 'border-amber-300' : 'border-red-200'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Package size={18} className={isInProgress ? 'text-amber-500' : 'text-red-500'} />
                          <span className={`text-xs font-black px-2 py-0.5 rounded-full ${isInProgress ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                            {isInProgress ? 'กำลังติดตาม' : 'รอติดตาม'}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {g.escalatedToGAAt ? new Date(g.escalatedToGAAt).toLocaleString('th-TH') : '-'}
                        </span>
                      </div>

                      <div className="text-sm space-y-1 mb-3">
                        <p><span className="font-bold text-slate-500">ผู้นำของ:</span> {(g.requestPayload?.person) || g.requesterName || '-'}</p>
                        <p><span className="font-bold text-slate-500">แผนก:</span> {g.department || g.requesterDepartment || '-'}</p>
                        <p><span className="font-bold text-slate-500">ประเภท:</span> {g.sourceForm === 'GOODS_IN_OUT' ? 'นำของเข้า/ออก' : (g.sourceForm || '-')}</p>
                        {g.returnNote && <p className="text-xs text-slate-500 italic">📝 หมายเหตุ รปภ.: {g.returnNote}</p>}
                      </div>

                      <div className="bg-red-50 rounded-xl p-3 mb-3">
                        <p className="text-[10px] font-black text-red-700 uppercase mb-2">รายการที่ขาด ({missing.length})</p>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left font-bold text-slate-500">
                              <th className="pb-1">รายการ</th>
                              <th className="pb-1 text-center">ออก</th>
                              <th className="pb-1 text-center">กลับ</th>
                              <th className="pb-1 text-center text-red-700">ขาด</th>
                            </tr>
                          </thead>
                          <tbody>
                            {missing.map((m, i) => (
                              <tr key={i} className="border-t border-red-100">
                                <td className="py-1 font-bold">{m.description || '-'}</td>
                                <td className="py-1 text-center">{m.qtyOut} {m.unit}</td>
                                <td className="py-1 text-center">{m.qtyReturned} {m.unit}</td>
                                <td className="py-1 text-center font-black text-red-700">{m.qtyMissing} {m.unit}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex gap-2">
                        {!isInProgress && (
                          <button
                            onClick={() => handleMissingStart(g)}
                            className="flex-1 py-2.5 rounded-xl font-black text-white text-sm transition-all active:scale-[0.98] bg-amber-500 hover:bg-amber-600"
                          >
                            <Phone size={14} className="inline mr-1" /> เริ่มติดตาม
                          </button>
                        )}
                        <button
                          onClick={() => { setSelectedMissing(g); setFollowupNote(''); }}
                          className="flex-1 py-2.5 rounded-xl font-black text-white text-sm transition-all active:scale-[0.98] bg-emerald-600 hover:bg-emerald-700"
                        >
                          <Check size={14} className="inline mr-1" /> ปิดเรื่อง
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Resolve modal */}
        {selectedMissing && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelectedMissing(null)}>
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle className="text-emerald-600" size={24} />
                <h3 className="font-black text-slate-900">ปิดเรื่อง — ของไม่ครบ</h3>
              </div>
              <p className="text-sm text-slate-600 mb-4">
                ผู้นำของ: <b>{(selectedMissing.requestPayload?.person) || selectedMissing.requesterName || '-'}</b><br/>
                แผนก: <b>{selectedMissing.department || selectedMissing.requesterDepartment || '-'}</b>
              </p>
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest">บันทึกผลติดตาม (optional)</label>
              <textarea
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mt-2 min-h-[80px] focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500 outline-none"
                placeholder="เช่น: พนักงานนำของมาคืนแล้ว / หักค่าเสียหาย / แจ้งหัวหน้าแผนกแล้ว..."
                value={followupNote}
                onChange={e => setFollowupNote(e.target.value)}
              />
              <div className="flex gap-2 mt-4">
                <button onClick={() => setSelectedMissing(null)} className="flex-1 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">ยกเลิก</button>
                <button onClick={handleMissingResolve} className="flex-1 py-2.5 rounded-xl font-black text-white bg-emerald-600 hover:bg-emerald-700">ยืนยันปิดเรื่อง</button>
              </div>
            </div>
          </div>
        )}
      </main>
      <VehicleTimeAlert userRole="GA" />
      <SupportTickets user={user} role="GA" />

      {/* Reject Modal — GA ปฏิเสธใบขอใช้รถ */}
      {showRejectModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => !processing && setShowRejectModal(false)}>
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="bg-red-600 text-white px-6 py-4">
              <h3 className="font-black text-lg">❌ ปฏิเสธคำขอใช้รถ</h3>
              <p className="text-xs opacity-90 mt-1">ระบบจะส่งเหตุผลแจ้งกลับผู้ขอทางอีเมล</p>
            </div>
            <div className="p-6">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 text-xs">
                <p className="text-slate-500">ผู้ขอ:</p>
                <p className="font-bold text-slate-800">{selectedRequest.requesterName} ({selectedRequest.requesterId})</p>
                <p className="text-slate-500 mt-1">วันที่ใช้:</p>
                <p className="font-bold text-slate-800">{selectedRequest.requestPayload?.date || '-'} {selectedRequest.requestPayload?.timeStart} - {selectedRequest.requestPayload?.timeEnd}</p>
              </div>

              <label className="block text-sm font-bold text-slate-700 mb-2">
                เหตุผลที่ปฏิเสธ <span className="text-red-500">*</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="ระบุเหตุผล เช่น ไม่มีรถว่างในเวลาที่ขอ / เอกสารไม่ครบ / ผู้ขอแก้ไขแล้วส่งใหม่"
                rows={4}
                maxLength={500}
                disabled={processing}
                autoFocus
                className="w-full px-3 py-3 text-sm border-2 border-slate-200 rounded-xl focus:border-red-500 focus:outline-none resize-y"
              />
              <div className="text-[10px] text-slate-400 mt-1 text-right">{rejectReason.length}/500</div>

              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                ⚠️ การปฏิเสธจะจบ workflow ทันที ผู้ขอจะ "แก้ไขส่งใหม่" ได้
              </div>

              <div className="flex gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setShowRejectModal(false)}
                  disabled={processing}
                  className="flex-1 py-3 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleRejectVehicle}
                  disabled={processing || !rejectReason.trim()}
                  className="flex-[2] py-3 rounded-xl text-sm font-black text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed"
                >
                  {processing ? 'กำลังส่ง...' : '❌ ยืนยันปฏิเสธ'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === 📄 Doc Viewer Modal — ดูเอกสารพร้อมลายเซ็น 3 ฝ่าย === */}
      {docViewerBooking && (() => {
        const b = docViewerBooking;
        const headStep = docViewerSteps.find(s => (s.step || 0) === 1) || null;
        const gaStep = docViewerSteps.find(s => s.targetType === 'GA') || null;
        const rp = (gaStep || headStep)?.requestPayload || {};
        const refCode = (gaStep?.id || headStep?.id || b.chainId || '').slice(-12).toUpperCase();
        const noVeh = gaStep?.vehicleResult === 'no_vehicle';
        const vAssigned = gaStep?.assignedVehicle;
        const dAssigned = gaStep?.assignedDriver;

        const handleOpenPDF = () => {
          printVehicleBooking({
            requesterId: b.requesterId,
            name: b.requesterName,
            staffId: b.requesterId,
            department: b.department,
            email: rp.email,
            passengers: rp.passengers,
            routes: rp.routes,
            destination: b.destination || rp.destination,
            date: b.date || rp.date,
            timeStart: b.timeStart,
            timeEnd: b.timeEnd,
            purpose: b.purpose || rp.purpose,
            drivingOption: rp.drivingOption || (rp.driveSelf ? '6.1' : rp.needDriver ? '6.2' : ''),
            easyPass: rp.easyPass,
            note: b.note || rp.note,
            sigUser: rp.requesterSign,
            headSign: headStep?.approvedSign,
            headName: headStep?.approvedBy,
            headApprovedAt: headStep?.acknowledgedAt ? new Date(headStep.acknowledgedAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '',
            gaSign: gaStep?.approvedSign,
            gaName: gaStep?.approvedBy,
            gaApprovedAt: gaStep?.acknowledgedAt ? new Date(gaStep.acknowledgedAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '',
            gaPlate: vAssigned?.plate || b.plate,
            gaBrand: vAssigned?.brand || b.brand,
            gaModel: vAssigned?.model,
            gaDriverName: dAssigned ? (dAssigned.nickname ? `${dAssigned.nickname} (${dAssigned.name})` : dAssigned.name) : b.driverName,
            gaDriverPhone: dAssigned?.phone || b.driverPhone,
            gaNoVehicle: noVeh,
            refCode,
          });
        };

        const handleShareToSec = async () => {
          const summary = noVeh
            ? `🚗 ใบขอใช้รถ TBKK\nREF: ${refCode}\nผู้ขอ: ${b.requesterName} (${b.requesterId})\nวันที่: ${b.date} ${b.timeStart}-${b.timeEnd}\n\n⚠️ ไม่มีรถบริษัท`
            : `🚗 ใบขอใช้รถ TBKK\nREF: ${refCode}\nผู้ขอ: ${b.requesterName} (${b.requesterId})\nวันที่: ${b.date} ${b.timeStart}-${b.timeEnd}\nรถ: ${b.brand} ทะเบียน: ${b.plate}\n${b.driverName ? `คนขับ: ${b.driverName} โทร: ${b.driverPhone || '-'}` : 'ขับเอง'}\n\n📌 ตรวจสอบที่ป้อม รปภ. ด้วยรหัส ${refCode}`;
          const text = summary;
          try {
            if (navigator.share) {
              await navigator.share({ title: `ใบขอใช้รถ REF: ${refCode}`, text });
            } else {
              await navigator.clipboard.writeText(text);
              alert(`✓ คัดลอกข้อมูลเอกสารแล้ว\nวางใน LINE ส่งให้ รปภ. ได้เลย\n\nREF: ${refCode}`);
            }
          } catch (e) {
            if (e?.name !== 'AbortError') {
              try { await navigator.clipboard.writeText(text); alert('✓ คัดลอกข้อมูลแล้ว'); } catch {}
            }
          }
        };

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4" onClick={closeDocViewer}>
            <div className="w-full max-w-3xl bg-white rounded-3xl border border-slate-200 shadow-2xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white px-6 py-5 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black">📄 ใบขอใช้รถ</h3>
                  <p className="text-xs opacity-90 mt-1">ผู้ขอ: <strong>{b.requesterName || '-'}</strong> · REF: <span className="font-mono">{refCode}</span></p>
                </div>
                <button onClick={closeDocViewer} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 transition">
                  <X size={20} />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                {docViewerLoading && (
                  <div className="text-center py-12 text-slate-400">⏳ กำลังโหลดข้อมูลเอกสาร...</div>
                )}

                {!docViewerLoading && (
                  <>
                    {/* ข้อมูลผู้ขอ */}
                    <div className="bg-white rounded-2xl border border-blue-200 p-4 mb-4 shadow-sm">
                      <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest mb-2">👤 ผู้ขอใช้รถ</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[10px] text-slate-500 font-bold">ชื่อ-นามสกุล</p>
                          <p className="text-sm font-bold text-slate-900">{b.requesterName || '-'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 font-bold">รหัสพนักงาน</p>
                          <p className="text-sm font-bold font-mono text-slate-900">{b.requesterId || '-'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 font-bold">แผนก</p>
                          <p className="text-sm font-bold text-slate-900">{b.department || '-'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 font-bold">วันที่ขอใช้รถ</p>
                          <p className="text-sm font-bold text-slate-900">{b.date || '-'} · {b.timeStart}-{b.timeEnd}</p>
                        </div>
                      </div>
                      {b.destination && (
                        <div className="mt-2 pt-2 border-t border-slate-100">
                          <p className="text-[10px] text-slate-500 font-bold">📍 ปลายทาง / เส้นทาง</p>
                          <p className="text-sm text-slate-800">{b.destination}</p>
                        </div>
                      )}
                      {b.purpose && (
                        <div className="mt-2">
                          <p className="text-[10px] text-slate-500 font-bold">🎯 วัตถุประสงค์</p>
                          <p className="text-sm text-slate-800">{b.purpose}</p>
                        </div>
                      )}
                    </div>

                    {/* ผลจัดรถ */}
                    {!noVeh && (
                      <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-2xl border-2 border-emerald-300 p-4 mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[12px] font-black text-emerald-800">🚗 ผลจัดรถ:</p>
                          <span className="text-[10px] font-mono font-black bg-white text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-300">REF: {refCode}</span>
                        </div>
                        <div className="bg-white/70 rounded-md px-3 py-2 text-[13px] space-y-0.5">
                          <p><span className="font-bold">รถ:</span> {b.brand || '-'} <span className="font-bold ml-2">ทะเบียน:</span> <span className="font-mono font-bold">{b.plate || '-'}</span></p>
                          {b.driverName && <p><span className="font-bold">คนขับ:</span> {b.driverName} {b.driverPhone && (<><span className="font-bold ml-2">เบอร์โทร:</span> <span className="font-mono">{b.driverPhone}</span></>)}</p>}
                        </div>
                      </div>
                    )}
                    {noVeh && (
                      <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4 mb-4">
                        <p className="text-[12px] font-black text-red-700 mb-1">🚗 ผลจัดรถ:</p>
                        <p className="text-sm font-bold text-red-800">⚠️ ไม่มีรถให้ใช้งาน — ผู้ขอใช้รถส่วนตัว</p>
                      </div>
                    )}

                    {/* ลายเซ็น 3 ฝ่าย */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 text-center">✍️ ลายเซ็นครบทุกฝ่าย (3 คน)</p>
                      <div className="grid grid-cols-3 gap-3">
                        {/* 1. ผู้ขอ */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                          <p className="text-[9px] font-black text-blue-700 uppercase mb-1">👤 ผู้ขอ</p>
                          <div className="h-12 flex items-center justify-center">
                            {rp.requesterSign ? <img src={rp.requesterSign} alt="sig" className="h-10 max-w-full object-contain" /> : <span className="text-[10px] text-slate-300 italic">(ลายเซ็น)</span>}
                          </div>
                          <div className="border-t border-blue-200 mt-2 pt-1">
                            <p className="text-[11px] font-bold text-slate-800 truncate">{b.requesterName || '-'}</p>
                            <p className="text-[9px] text-slate-500 font-mono">{b.requesterId || '-'}</p>
                          </div>
                        </div>
                        {/* 2. หัวหน้า */}
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                          <p className="text-[9px] font-black text-emerald-700 uppercase mb-1">👨‍💼 หัวหน้าแผนก</p>
                          <div className="h-12 flex items-center justify-center">
                            {headStep?.approvedSign ? <img src={headStep.approvedSign} alt="sig" className="h-10 max-w-full object-contain" /> : <span className="text-[10px] text-slate-300 italic">(รอ)</span>}
                          </div>
                          <div className="border-t border-emerald-200 mt-2 pt-1">
                            <p className="text-[11px] font-bold text-slate-800 truncate">{headStep?.approvedBy || '-'}</p>
                            <p className="text-[9px] text-emerald-700">{headStep?.acknowledgedAt ? new Date(headStep.acknowledgedAt).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' }) : ''}</p>
                          </div>
                        </div>
                        {/* 3. GA */}
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                          <p className="text-[9px] font-black text-emerald-700 uppercase mb-1">🚗 GA จัดรถ</p>
                          <div className="h-12 flex items-center justify-center">
                            {gaStep?.approvedSign ? <img src={gaStep.approvedSign} alt="sig" className="h-10 max-w-full object-contain" /> : <span className="text-[10px] text-slate-300 italic">(รอ)</span>}
                          </div>
                          <div className="border-t border-emerald-200 mt-2 pt-1">
                            <p className="text-[11px] font-bold text-slate-800 truncate">{gaStep?.approvedBy || '-'}</p>
                            <p className="text-[9px] text-emerald-700">{gaStep?.acknowledgedAt ? new Date(gaStep.acknowledgedAt).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' }) : ''}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t border-slate-200 bg-white flex justify-end gap-2 flex-wrap">
                <button onClick={closeDocViewer} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-bold transition">
                  ปิด
                </button>
                <button onClick={handleOpenPDF} className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 text-white hover:from-rose-700 hover:to-red-700 text-sm font-black shadow-md flex items-center gap-2 transition">
                  📄 ดาวน์โหลด PDF
                </button>
                <button onClick={handleShareToSec} className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 text-white hover:from-emerald-700 hover:to-green-700 text-sm font-black shadow-md flex items-center gap-2 transition">
                  <Send size={14} /> ส่งให้ รปภ.
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
