import React, { useState, useRef, useEffect } from 'react';
import { Printer, FileText, Eraser, Upload, ArrowLeft, Send } from 'lucide-react';
import { collection, doc, addDoc, onSnapshot, query, where, Timestamp } from 'firebase/firestore';
import { db, firebaseReady, appId } from './firebase';
import { createApprovalWorkflowRequest } from './approvalNotifications';
import { getHeadEmail, copyHtmlAndOpenOutlook, buildApproveUrl } from './emailHelper';
import { printVehicleBooking } from './printDocument';

function getHeadByDepartment(dept) {
  const key = (dept || '').toString().trim().toUpperCase();
  return { name: `หัวหน้าแผนก ${key || '-'}` };
}

/** แปลง YYYY-MM-DD → DD/MM/YY สำหรับข้อความ */
function formatDateThaiShort(isoYmd) {
  if (!isoYmd || !/^\d{4}-\d{2}-\d{2}$/.test(isoYmd)) return isoYmd || '-';
  const [y, m, d] = isoYmd.split('-');
  return `${d}/${m}/${String(y).slice(-2)}`;
}

/** HH:MM → 14.30 น. */
function formatTimeThai(hm) {
  if (!hm) return '-';
  return `${hm.replace(':', '.')} น.`;
}

// --- ส่วนประกอบสำหรับวาดและอัปโหลดลายเซ็น ---
const SignaturePad = ({ canvasId, onSave, savedImage, width = 250, height = 60 }) => {
  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      let x, y;
      if (e.type.includes('touch')) {
        x = (e.touches[0].clientX - rect.left) * (canvas.width / rect.width);
        y = (e.touches[0].clientY - rect.top) * (canvas.height / rect.height);
      } else {
        x = (e.clientX - rect.left) * (canvas.width / rect.width);
        y = (e.clientY - rect.top) * (canvas.height / rect.height);
      }
      return { x, y };
    };

    const startDraw = (e) => {
      isDrawingRef.current = true;
      const pos = getPos(e);
      lastPosRef.current = pos;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    };

    const draw = (e) => {
      if (!isDrawingRef.current) return;
      const pos = getPos(e);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      lastPosRef.current = pos;
    };

    const endDraw = () => {
      if (isDrawingRef.current) {
        isDrawingRef.current = false;
        if (canvas) {
          onSave(canvas.toDataURL('image/png'));
        }
      }
    };

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', endDraw);
    canvas.addEventListener('mouseout', endDraw);
    canvas.addEventListener('touchstart', (e) => { startDraw(e); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchmove', (e) => { draw(e); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchend', endDraw);

    return () => {
      canvas.removeEventListener('mousedown', startDraw);
      canvas.removeEventListener('mousemove', draw);
      canvas.removeEventListener('mouseup', endDraw);
      canvas.removeEventListener('mouseout', endDraw);
      canvas.removeEventListener('touchstart', startDraw);
      canvas.removeEventListener('touchmove', draw);
      canvas.removeEventListener('touchend', endDraw);
    };
  }, [onSave]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    if (savedImage) {
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const ratio = Math.min(canvas.width / img.width, canvas.height / img.height);
        const x = (canvas.width - img.width * ratio) / 2;
        const y = (canvas.height - img.height * ratio) / 2;
        ctx.drawImage(img, x, y, img.width * ratio, img.height * ratio);
      };
      img.src = savedImage;
    } else {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [savedImage]);

  const clear = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      onSave(null);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        onSave(event.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="signature-wrapper relative mx-auto" style={{ width: `${width}px` }}>
      <div className="no-print absolute -top-5 right-[-10px] flex gap-1 z-10">
        <label className="sig-btn upload-btn cursor-pointer text-[10px] border border-blue-200 px-1.5 py-0.5 rounded bg-white hover:bg-blue-50 text-blue-600 transition">
          เลือกไฟล์
          <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*" />
        </label>
        <button type="button" onClick={clear} className="sig-btn clear-btn text-[10px] border border-red-200 px-1.5 py-0.5 rounded bg-white hover:bg-red-50 text-red-500 transition">
          ล้าง
        </button>
      </div>
      <canvas
        ref={canvasRef}
        id={canvasId}
        className="sig-canvas w-full border-b border-black cursor-crosshair touch-none bg-transparent"
        style={{ borderBottomStyle: 'dotted', borderBottomWidth: '1px' }}
        width={width}
        height={height}
      />
    </div>
  );
};

// --- ตัวแอปฟอร์มใบขออนุญาตใช้รถ ---
const VehicleBookingFormApp = () => {
  const [formData, setFormData] = useState({
    name: '',
    date: '',
    timeStart: '',
    timeEnd: '',
    requesterId: '',
    department: '',
    driveSelf: false,
    needDriver: false,
    companyBusiness: false,
    personalBusiness: false,
    inFactory: false,
    hasCompanions: false,
    companions: Array(6).fill(''),
    purpose: ['', ''],
    destination: '',
    approvedCarNo: '',
    approvedCarBrand: '',
    driver: '',
    outTime: '',
    inTime: '',
    sigUser: null,
    sigManager: null,
    sigEee: null,
    sigGuard: null,
    passengers: [],
  });

  // --- Vehicle selection ---
  const [availableVehicles, setAvailableVehicles] = useState([]);
  const [dateBookings, setDateBookings] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);

  // Read URL params for pre-filled data
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const date = params.get('date');
    const vehicleId = params.get('vehicleId');
    const plate = params.get('plate');
    const brand = params.get('brand');
    const name = params.get('name');
    const staffId = params.get('staffId');
    const dept = params.get('dept');
    if (name) updateField('name', name);
    if (staffId) updateField('requesterId', staffId);
    if (dept) updateField('department', dept);
    if (date) updateField('date', date);
    if (plate) {
      const decodedPlate = decodeURIComponent(plate);
      const decodedBrand = brand ? decodeURIComponent(brand) : '';
      const displayPlate = (!decodedPlate || decodedPlate === 'รอใส่ทะเบียน') ? decodedBrand : decodedPlate;
      updateField('approvedCarNo', displayPlate);
      if (decodedBrand) updateField('approvedCarBrand', decodedBrand);
    }
    if (vehicleId) setSelectedVehicleId(vehicleId);
  }, []);

  // Load vehicles from Firestore
  useEffect(() => {
    if (!firebaseReady) return;
    try {
      const vehiclesRef = collection(db, 'artifacts', appId, 'public', 'data', 'vehicles');
      const unsubscribe = onSnapshot(vehiclesRef, (snapshot) => {
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
        setAvailableVehicles(docs);
      }, (error) => {
        console.error('Vehicles load error:', error);
      });
      return () => unsubscribe();
    } catch (error) {
      console.error('Vehicles setup error:', error);
    }
  }, []);

  // Load bookings for selected date
  useEffect(() => {
    if (!firebaseReady || !formData.date) {
      setDateBookings([]);
      return;
    }
    try {
      const bookingsRef = collection(db, 'artifacts', appId, 'public', 'data', 'vehicle_bookings');
      const unsubscribe = onSnapshot(bookingsRef, (snapshot) => {
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setDateBookings(docs.filter(b => b.date === formData.date));
      }, (error) => {
        console.error('Vehicle bookings load error:', error);
      });
      return () => unsubscribe();
    } catch (error) {
      console.error('Vehicle bookings setup error:', error);
    }
  }, [formData.date]);

  const getVehicleIcon = (type) => {
    switch (type) {
      case 'รถกระบะ': return '\u{1F6FB}';
      case 'รถตู้': return '\u{1F690}';
      case 'SUV': return '\u{1F699}';
      case 'MPV': return '\u{1F699}';
      case 'รถยนต์ไฟฟ้า': return '\u26A1';
      default: return '\u{1F697}';
    }
  };

  const isVehicleBooked = (vehicleId) => {
    return dateBookings.some(b => b.vehicleId === vehicleId);
  };

  const handleSelectVehicle = (v) => {
    if (v.status === 'maintenance' || v.status === 'unavailable') return;
    if (isVehicleBooked(v.id)) return;
    setSelectedVehicleId(v.id);
    const displayPlate = (!v.plate || v.plate === 'รอใส่ทะเบียน') ? v.brand : v.plate;
    updateField('approvedCarNo', displayPlate);
    updateField('approvedCarBrand', v.brand || '');
  };

  // Save booking to vehicle_bookings collection
  const saveVehicleBooking = async () => {
    if (!firebaseReady || !selectedVehicleId || !formData.date) return;
    const vehicle = availableVehicles.find(v => v.id === selectedVehicleId);
    if (!vehicle) return;
    try {
      const bookingsRef = collection(db, 'artifacts', appId, 'public', 'data', 'vehicle_bookings');
      await addDoc(bookingsRef, {
        vehicleId: selectedVehicleId,
        plate: vehicle.plate,
        brand: vehicle.brand,
        date: formData.date,
        timeStart: formData.timeStart || '',
        timeEnd: formData.timeEnd || '',
        bookedBy: formData.requesterId || '-',
        bookedByName: formData.name || '-',
        department: formData.department || '',
        destination: formData.destination || '',
        driver: formData.driver || '',
        status: 'booked',
        createdAt: Timestamp.now(),
      });
    } catch (error) {
      console.error('Error saving vehicle booking:', error);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleBack = () => {
    if (window.opener) {
      window.close();
    } else {
      window.location.href = '/';
    }
  };

  const handleReset = () => {
    if (window.confirm('ต้องการล้างข้อมูลทั้งหมดหรือไม่?')) {
      window.location.reload();
    }
  };

  const handleSend = async () => {
    const head = getHeadByDepartment(formData.department);
    const purposeText = (formData.purpose || []).filter(p => p.trim()).join(', ');
    const payload = {
      form: 'VEHICLE_BOOKING',
      name: formData.name || '',
      date: formData.date || '',
      timeStart: formData.timeStart || '',
      timeEnd: formData.timeEnd || '',
      requesterId: formData.requesterId || '',
      department: formData.department || '',
      targetHead: head.name,
      destination: formData.destination || '',
      purpose: purposeText,
      approvedCarNo: formData.approvedCarNo || '',
      driver: formData.driver || '',
      sigUser: formData.sigUser || '',
      sentAt: new Date().toISOString(),
    };

    const text =
      `ส่งคำขอ: ใบขออนุญาตใช้รถ (TBKK)\n` +
      `ผู้ขอ: ${payload.name}\n` +
      `รหัสพนักงาน: ${payload.requesterId}\n` +
      `แผนก: ${payload.department}\n` +
      `ส่งถึง: ${head.name}\n` +
      `วันที่: ${formatDateThaiShort(payload.date)}\n` +
      `เวลา: ${formatTimeThai(payload.timeStart)} ถึง ${formatTimeThai(payload.timeEnd)}\n` +
      `ปลายทาง: ${payload.destination}\n` +
      `\n---\nข้อมูล (JSON):\n${JSON.stringify(payload, null, 2)}`;

    let workflowItemId = null;
    try {
      workflowItemId = await createApprovalWorkflowRequest({
        topic: 'เอกสารขอใช้รถ รอเซ็นอนุมัติ',
        requesterId: payload.requesterId || '-',
        requesterName: payload.name || '-',
        requesterDepartment: payload.department || '',
        sourceForm: 'VEHICLE_BOOKING',
        requestPayload: {
          name: payload.name,
          requesterId: payload.requesterId,
          department: payload.department,
          date: payload.date,
          timeStart: payload.timeStart,
          timeEnd: payload.timeEnd,
          destination: payload.destination,
          approvedCarNo: payload.approvedCarNo,
          driver: payload.driver,
          purpose: payload.purpose || payload.destination,
          driveSelf: formData.driveSelf,
          needDriver: formData.needDriver,
          companyBusiness: formData.companyBusiness,
          personalBusiness: formData.personalBusiness,
          inFactory: formData.inFactory,
          hasCompanions: formData.hasCompanions,
          companions: (formData.companions || []).filter(c => c.trim()),
          passengers: (formData.passengers || []).filter(p => p.name.trim()).map(p => ({ name: p.name.trim(), empId: (p.empId || '').trim(), dept: (p.dept || '').trim() })),
          requesterSign: formData.sigUser || '',
        },
      });
    } catch (err) {
      console.error('Approval workflow error:', err);
    }
    // บันทึกการจองรถลง vehicle_bookings
    await saveVehicleBooking();

    // เปิดใบเอกสารสวยๆ ในแท็บใหม่
    printVehicleBooking(payload);

    // ส่ง email แจ้งหัวหน้าผ่าน Outlook พร้อมลิงก์เซ็นอนุมัติ
    const approveUrl = workflowItemId ? buildApproveUrl(workflowItemId) : '';
    const headEmail = await getHeadEmail(payload.department);
    if (headEmail) {
      await copyHtmlAndOpenOutlook({
        to: headEmail,
        subject: `[SOC] ใบขออนุญาตใช้รถ รอเซ็นอนุมัติ - ${payload.name || '-'}`,
        formType: 'VEHICLE_BOOKING',
        data: payload,
        approveUrl,
        requesterSign: formData.sigUser,
      });
    }
  };

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updateCompanion = (index, value) => {
    const newCompanions = [...formData.companions];
    newCompanions[index] = value;
    setFormData(prev => ({ ...prev, companions: newCompanions }));
  };

  const updatePurpose = (index, value) => {
    const newPurpose = [...formData.purpose];
    newPurpose[index] = value;
    setFormData(prev => ({ ...prev, purpose: newPurpose }));
  };

  const addPassenger = () => {
    if (formData.passengers.length >= 8) return;
    setFormData(prev => ({ ...prev, passengers: [...prev.passengers, { name: '', empId: '', dept: '' }] }));
  };

  const removePassenger = (index) => {
    setFormData(prev => ({
      ...prev,
      passengers: prev.passengers.filter((_, i) => i !== index),
    }));
  };

  const updatePassenger = (index, field, value) => {
    const updated = [...formData.passengers];
    updated[index] = { ...updated[index], [field]: value };
    setFormData(prev => ({ ...prev, passengers: updated }));
  };

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex flex-col items-center p-2 md:p-5 font-serif">
      {/* Menu Bar */}
      <div className="no-print mb-4 md:mb-6 flex flex-wrap gap-2 md:gap-4 justify-center w-full px-1">
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 bg-gray-500 text-white px-3 md:px-8 py-2 md:py-2.5 rounded shadow-lg hover:bg-gray-600 transition-all font-bold uppercase tracking-wide text-xs md:text-base"
        >
          <ArrowLeft size={14} /> กลับ
        </button>
        <button
          type="button"
          onClick={handleSend}
          className="flex items-center gap-1.5 bg-emerald-600 text-white px-3 md:px-8 py-2 md:py-2.5 rounded shadow-lg hover:bg-emerald-700 transition-all font-bold uppercase tracking-wide text-xs md:text-base"
        >
          <Send size={14} /> ส่งให้
        </button>
        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 bg-blue-700 text-white px-3 md:px-8 py-2 md:py-2.5 rounded shadow-lg hover:bg-blue-800 transition-all font-bold uppercase tracking-wide text-xs md:text-base"
        >
          <Printer size={14} /> Print
        </button>
        <button
          onClick={handleReset}
          className="bg-gray-500 text-white px-3 md:px-8 py-2 md:py-2.5 rounded shadow-lg hover:bg-gray-600 transition-all font-bold uppercase tracking-wide text-xs md:text-base"
        >
          ล้าง
        </button>
      </div>

      {/* Form Container */}
      <div className="form-container bg-white w-full max-w-[210mm] mx-auto min-h-0 md:min-h-[297mm] p-3 md:p-[12mm] shadow-lg border border-gray-300 box-border">
        <div className="main-border border-[1.5px] border-black h-full flex flex-col box-border">
          {/* Header */}
          <div className="text-center py-3 md:py-5 border-b-[1.5px] border-black">
            <h1 className="text-base md:text-2xl font-bold">ใบขออนุญาตใช้รถ/จองรถ เพื่อปฏิบัติงาน</h1>
            <h2 className="text-sm md:text-xl font-semibold">(Vehicle Request form)</h2>
          </div>

          {/* User Info Section */}
          <div className="p-5 border-b-[1.5px] border-black text-[15px] space-y-4">
            <div className="flex items-end overflow-hidden">
              <span className="whitespace-nowrap">ชื่อ-นามสกุล(Name&Nickname).</span>
              <input
                type="text"
                className="editable-line flex-grow h-6 ml-1 border-none border-b border-black bg-transparent outline-none px-1 font-sans text-[15px] focus:bg-gray-50 focus:border-blue-500"
                style={{ borderBottomStyle: 'dotted', borderBottomWidth: '1px' }}
                value={formData.name}
                onChange={(e) => updateField('name', e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-end gap-x-4 gap-y-2 overflow-hidden">
              <div className="flex-grow flex flex-wrap items-center gap-2 min-w-[200px]">
                <span className="whitespace-nowrap">วันที่ขอใช้รถ(Date of using)</span>
                <input
                  type="date"
                  className="editable-line flex-grow min-w-[10.5rem] h-8 ml-1 rounded border border-dotted border-black bg-white px-2 font-sans text-[15px] cursor-pointer focus:bg-gray-50 focus:border-blue-500 focus:outline-none"
                  value={formData.date}
                  onChange={(e) => updateField('date', e.target.value)}
                  title="เลือกวันที่"
                />
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span className="whitespace-nowrap">เวลา (Time)</span>
                <input
                  type="time"
                  step="60"
                  className="editable-line w-[7.25rem] h-8 mx-0.5 rounded border border-dotted border-black bg-white px-1 text-center font-sans text-[15px] cursor-pointer focus:bg-gray-50 focus:border-blue-500 focus:outline-none"
                  value={formData.timeStart}
                  onChange={(e) => updateField('timeStart', e.target.value)}
                  title="เลือกเวลาเริ่ม"
                />
                <span className="whitespace-nowrap">น. ถึง (To)</span>
                <input
                  type="time"
                  step="60"
                  className="editable-line w-[7.25rem] h-8 mx-0.5 rounded border border-dotted border-black bg-white px-1 text-center font-sans text-[15px] cursor-pointer focus:bg-gray-50 focus:border-blue-500 focus:outline-none"
                  value={formData.timeEnd}
                  onChange={(e) => updateField('timeEnd', e.target.value)}
                  title="เลือกเวลาสิ้นสุด"
                />
                <span>น.</span>
              </div>
            </div>
            <div className="flex items-end gap-6 overflow-hidden">
              <div className="w-2/3 flex items-end">
                <span className="whitespace-nowrap">ผู้ขออนุญาต(Postulator) รหัส (ID)</span>
                <input
                  type="text"
                  className="editable-line flex-grow h-6 ml-1 border-none border-b border-dotted border-black bg-transparent outline-none px-1 font-sans text-[15px] uppercase focus:bg-gray-50 focus:border-blue-500"
                  value={formData.requesterId}
                  onChange={(e) => updateField('requesterId', e.target.value)}
                />
              </div>
              <div className="w-1/3 flex items-end">
                <span className="whitespace-nowrap">แผนก(Department)</span>
                <input
                  type="text"
                  className="editable-line flex-grow h-6 ml-1 border-none border-b border-black bg-transparent outline-none px-1 font-sans text-[15px] focus:bg-gray-50 focus:border-blue-500"
                style={{ borderBottomStyle: 'dotted', borderBottomWidth: '1px' }}
                  value={formData.department}
                  onChange={(e) => updateField('department', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Checkbox Selection Section */}
          <div className="p-5 border-b-[1.5px] border-black text-[15px]">
            <div className="grid grid-cols-[1fr_1.2fr] gap-1">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span>1.</span>
                  <input
                    type="checkbox"
                    className="w-4 h-4 border-black cursor-pointer"
                    checked={formData.driveSelf}
                    onChange={(e) => updateField('driveSelf', e.target.checked)}
                  />
                  <span>ต้องการขับเอง</span>
                </div>
                <div className="flex items-center gap-3">
                  <span>2.</span>
                  <input
                    type="checkbox"
                    className="w-4 h-4 border-black cursor-pointer"
                    checked={formData.needDriver}
                    onChange={(e) => updateField('needDriver', e.target.checked)}
                  />
                  <span>ต้องการใช้พนักงานขับรถให้</span>
                </div>
                <div className="flex items-center gap-3">
                  <span>5.</span>
                  <input
                    type="checkbox"
                    className="w-4 h-4 border-black cursor-pointer"
                    checked={formData.inFactory}
                    onChange={(e) => updateField('inFactory', e.target.checked)}
                  />
                  <span>บริเวณในโรงงาน</span>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span>3.</span>
                  <input
                    type="checkbox"
                    className="w-4 h-4 border-black cursor-pointer"
                    checked={formData.companyBusiness}
                    onChange={(e) => updateField('companyBusiness', e.target.checked)}
                  />
                  <span>ติดต่องานบริษัท</span>
                </div>
                <div className="flex items-center gap-3">
                  <span>4.</span>
                  <input
                    type="checkbox"
                    className="w-4 h-4 border-black cursor-pointer"
                    checked={formData.personalBusiness}
                    onChange={(e) => updateField('personalBusiness', e.target.checked)}
                  />
                  <span>ธุระส่วนตัว</span>
                </div>
                <div className="flex items-center gap-3">
                  <span>6.</span>
                  <input
                    type="checkbox"
                    className="w-4 h-4 border-black cursor-pointer"
                    checked={formData.hasCompanions}
                    onChange={(e) => updateField('hasCompanions', e.target.checked)}
                  />
                  <span>เคยมีผู้ร่วมเดินทาง ดังนี้</span>
                </div>
              </div>
            </div>

            {/* Travel Companions List - show only when checked */}
            {formData.hasCompanions && (
              <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2">
                {formData.companions.map((companion, index) => (
                  <div key={index} className="flex items-end overflow-hidden">
                    <span>{index + 1}.</span>
                    <input
                      type="text"
                      placeholder="ชื่อ-นามสกุล"
                      className="editable-line flex-grow h-6 ml-1 border-none border-b border-black bg-transparent outline-none px-1 font-sans text-[15px] focus:bg-gray-50 focus:border-blue-500"
                      style={{ borderBottomStyle: 'dotted', borderBottomWidth: '1px' }}
                      value={companion}
                      onChange={(e) => updateCompanion(index, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Purpose and Area */}
          <div className="p-5 border-b-[1.5px] border-black text-[15px] space-y-5">
            <div className="overflow-hidden">
              วัตถุประสงค์ในการใช้รถ (ให้ระบุรายละเอียดเพื่อให้ทราบเหตุผล)
              <div className="mt-2 space-y-3">
                {formData.purpose.map((p, index) => (
                  <input
                    key={index}
                    type="text"
                    className="editable-line w-full h-6 border-none border-b border-black bg-transparent outline-none px-1 font-sans text-[15px] focus:bg-gray-50 focus:border-blue-500"
                    style={{ borderBottomStyle: 'dotted', borderBottomWidth: '1px' }}
                    value={p}
                    onChange={(e) => updatePurpose(index, e.target.value)}
                  />
                ))}
              </div>
            </div>
            <div className="overflow-hidden">
              บริเวณที่ไป
              <div className="mt-2 space-y-3">
                <input
                  type="text"
                  className="editable-line w-full h-6 border-none border-b border-dotted border-black bg-transparent outline-none px-1 font-sans text-[15px] focus:bg-gray-50 focus:border-blue-500"
                  value={formData.destination}
                  onChange={(e) => updateField('destination', e.target.value)}
                />
              </div>
            </div>

            {/* Passengers Section */}
            <div className="overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="font-semibold">ผู้ร่วมเดินทาง (Passengers)</span>
                {formData.passengers.length < 8 && (
                  <button
                    type="button"
                    onClick={addPassenger}
                    className="no-print text-[13px] border border-blue-400 text-blue-600 px-3 py-0.5 rounded hover:bg-blue-50 transition"
                  >
                    + เพิ่มผู้ร่วมเดินทาง
                  </button>
                )}
              </div>
              {formData.passengers.length > 0 && (
                <div className="mt-2 space-y-2">
                  {/* Header row */}
                  <div className="no-print grid gap-1 text-[12px] text-gray-500 font-semibold px-5" style={{ gridTemplateColumns: '1.5rem 2fr 1fr 1.5fr auto' }}>
                    <span>#</span>
                    <span>ชื่อ-นามสกุล</span>
                    <span>รหัสพนักงาน</span>
                    <span>แผนก</span>
                    <span></span>
                  </div>
                  {formData.passengers.map((passenger, index) => (
                    <div key={index} className="grid items-end gap-1 overflow-hidden" style={{ gridTemplateColumns: '1.5rem 2fr 1fr 1.5fr auto' }}>
                      <span className="whitespace-nowrap text-[15px]">{index + 1}.</span>
                      <input
                        type="text"
                        placeholder="ชื่อ-นามสกุล"
                        className="editable-line h-6 border-none border-b border-black bg-transparent outline-none px-1 font-sans text-[15px] focus:bg-gray-50 focus:border-blue-500"
                        style={{ borderBottomStyle: 'dotted', borderBottomWidth: '1px' }}
                        value={passenger.name}
                        onChange={(e) => updatePassenger(index, 'name', e.target.value)}
                      />
                      <input
                        type="text"
                        placeholder="รหัส"
                        className="editable-line h-6 border-none border-b border-black bg-transparent outline-none px-1 font-sans text-[14px] uppercase focus:bg-gray-50 focus:border-blue-500"
                        style={{ borderBottomStyle: 'dotted', borderBottomWidth: '1px' }}
                        value={passenger.empId || ''}
                        onChange={(e) => updatePassenger(index, 'empId', e.target.value)}
                      />
                      <input
                        type="text"
                        placeholder="แผนก"
                        className="editable-line h-6 border-none border-b border-black bg-transparent outline-none px-1 font-sans text-[14px] focus:bg-gray-50 focus:border-blue-500"
                        style={{ borderBottomStyle: 'dotted', borderBottomWidth: '1px' }}
                        value={passenger.dept || ''}
                        onChange={(e) => updatePassenger(index, 'dept', e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => removePassenger(index)}
                        className="no-print text-[12px] border border-red-300 text-red-500 px-2 py-0.5 rounded hover:bg-red-50 transition whitespace-nowrap"
                      >
                        ลบ
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {formData.passengers.length === 0 && (
                <p className="no-print text-[13px] text-gray-400 mt-1 ml-1">ไม่มีผู้ร่วมเดินทาง — กด "+ เพิ่ม" เพื่อเพิ่มรายชื่อ</p>
              )}
            </div>
          </div>

          {/* Digital Signatures Section */}
          <div className="grid grid-cols-2 text-[14px] py-10 border-b-[1.5px] border-black">
            <div className="text-center space-y-2">
              <SignaturePad
                canvasId="sig-user"
                savedImage={formData.sigUser}
                onSave={(img) => updateField('sigUser', img)}
              />
              <p>ผู้ขออนุญาต(Pos)</p>
            </div>
            <div className="text-center space-y-2 px-4 leading-tight">
              <SignaturePad
                canvasId="sig-manager"
                savedImage={formData.sigManager}
                onSave={(img) => updateField('sigManager', img)}
              />
              <p>หน.แผนก/ผู้จัดการฝ่าย(Section chief/Dept manager)</p>
            </div>
          </div>

          {/* Bottom Records */}
          <div className="flex flex-col md:flex-row flex-grow items-stretch overflow-hidden">
            {/* Admin Column */}
            <div className="w-full md:w-[60%] border-b-[1.5px] md:border-b-0 md:border-r-[1.5px] border-black p-3 md:p-5 text-[13px] md:text-[15px] flex flex-col min-w-0">
              <div className="text-center font-bold mb-6">ฝ่ายบริหารทั่วไป</div>
              <div className="space-y-6 flex-grow">
                <div className="flex items-end overflow-hidden">
                  <span className="whitespace-nowrap">ทะเบียนรถที่อนุมัติ:</span>
                  <input
                    type="text"
                    className="editable-line flex-grow h-6 ml-1 border-none border-b border-black bg-transparent outline-none px-1 font-sans text-[15px] focus:bg-gray-50 focus:border-blue-500"
                    style={{ borderBottomStyle: 'dotted', borderBottomWidth: '1px' }}
                    value={formData.approvedCarNo}
                    onChange={(e) => updateField('approvedCarNo', e.target.value)}
                  />
                </div>
                {formData.approvedCarBrand && (
                  <div className="flex items-end overflow-hidden">
                    <span className="whitespace-nowrap">ยี่ห้อรถ (Brand):</span>
                    <input
                      type="text"
                      className="editable-line flex-grow h-6 ml-1 border-none border-b border-black bg-transparent outline-none px-1 font-sans text-[15px] focus:bg-gray-50 focus:border-blue-500"
                      style={{ borderBottomStyle: 'dotted', borderBottomWidth: '1px' }}
                      value={formData.approvedCarBrand}
                      onChange={(e) => updateField('approvedCarBrand', e.target.value)}
                    />
                  </div>
                )}
                <div className="flex items-end overflow-hidden">
                  <span className="whitespace-nowrap">ผู้ขับขี่ (Driver)</span>
                  <input
                    type="text"
                    className="editable-line flex-grow h-6 ml-1 border-none border-b border-black bg-transparent outline-none px-1 font-sans text-[15px] focus:bg-gray-50 focus:border-blue-500"
                style={{ borderBottomStyle: 'dotted', borderBottomWidth: '1px' }}
                    value={formData.driver}
                    onChange={(e) => updateField('driver', e.target.value)}
                  />
                </div>
                <div className="pt-6 text-center">
                  <SignaturePad
                    canvasId="sig-eee"
                    savedImage={formData.sigEee}
                    onSave={(img) => updateField('sigEee', img)}
                  />
                  <p className="mt-2">ผจก.ฝ่าย EEE</p>
                </div>
              </div>
            </div>

            {/* Guard Column */}
            <div className="w-full md:w-[40%] p-3 md:p-5 text-[13px] md:text-[15px] flex flex-col min-w-0">
              <div className="text-center font-bold mb-6">รปภ. บันทึก</div>
              <div className="space-y-6 flex-grow">
                <div className="flex items-center flex-wrap gap-2 overflow-hidden">
                  <span className="whitespace-nowrap">เวลาไป (Out)</span>
                  <input
                    type="time"
                    step="60"
                    className="editable-line w-[7.25rem] h-8 mx-1 rounded border border-dotted border-black bg-white px-1 text-center font-sans text-[15px] cursor-pointer focus:bg-gray-50 focus:border-blue-500 focus:outline-none"
                    value={formData.outTime}
                    onChange={(e) => updateField('outTime', e.target.value)}
                    title="เลือกเวลาออก"
                  />
                  <span>น.</span>
                </div>
                <div className="flex items-center flex-wrap gap-2 overflow-hidden">
                  <span className="whitespace-nowrap">เวลากลับ (In)</span>
                  <input
                    type="time"
                    step="60"
                    className="editable-line w-[7.25rem] h-8 mx-1 rounded border border-dotted border-black bg-white px-1 text-center font-sans text-[15px] cursor-pointer focus:bg-gray-50 focus:border-blue-500 focus:outline-none"
                    value={formData.inTime}
                    onChange={(e) => updateField('inTime', e.target.value)}
                    title="เลือกเวลากลับ"
                  />
                  <span>น.</span>
                </div>
                <div className="pt-6 text-center">
                  <SignaturePad
                    canvasId="sig-guard"
                    savedImage={formData.sigGuard}
                    onSave={(img) => updateField('sigGuard', img)}
                    width={180}
                    height={60}
                  />
                  <p className="mt-2">รปภ.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Remarks */}
          <div className="p-4 border-t-[1.5px] border-black text-[11px] leading-relaxed bg-gray-50">
            <p className="font-bold mb-1">หมายเหตุ :</p>
            <div className="grid grid-cols-1 gap-0.5">
              <p>1. การขอใช้รถในกรณีที่ไม่มีพนักงานขับรถและขับรถเอง หากเกิดอุบัติเหตุและเป็นฝ่ายผิดคุณจะต้องรับผิดชอบค่าใช้จ่ายขั้นแรก 2,000 บาท</p>
              <p>2. ในกรณีได้รับอนุญาตให้ขับรถเอง สามารถขับรถออกนอกโรงงานได้ ในกรณีที่มีใบขับขี่ที่ยังไม่หมดอายุ</p>
              <p>3. ผู้ที่สามารถขับรถได้จะต้องมีใบอนุญาตขับขี่ที่ยังไม่หมดอายุเท่านั้น</p>
              <p>4. ในกรณีที่ ผจก. GA ไม่อยู่จะต้องเป็นผู้จัดการทั่วไป (GM) เป็นผู้อนุมัติ</p>
              <p>5. กรณีที่มีผู้ระบุตามข้อ 4 ไม่อยู่จะต้องเป็นผู้จัดการทั่วไป/ผู้ที่อยู่ในฝ่ายบริหารเท่านั้นเป็นผู้อนุมัติ</p>
              <p>6. จะต้องจองรถอย่างน้อย 4 ชม. ยกเว้นกรณีฉุกเฉินเท่านั้น</p>
            </div>
          </div>
        </div>
      </div>

      {/* Styling Overrides for Web & Print */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap');
        
        body { 
          font-family: 'Sarabun', sans-serif; 
          -webkit-print-color-adjust: exact;
        }

        .editable-line {
          border-bottom-style: dotted !important;
          border-bottom-width: 1px !important;
        }
        
        .sig-canvas {
          border-bottom-style: dotted !important;
          border-bottom-width: 1px !important;
        }

        @media (max-width: 768px) {
          .form-container { font-size: 13px; }
          .form-container input { font-size: 13px !important; }
          .form-container .text-\\[15px\\] { font-size: 13px !important; }
        }

        @media print {
          @page { size: A4; margin: 0; }
          body { background: white !important; padding: 0 !important; }
          .min-h-screen { background: white !important; padding: 0 !important; }
          .no-print { display: none !important; }
          .form-container { box-shadow: none !important; border: none !important; margin: 0 !important; padding: 10mm !important; width: 210mm !important; max-width: 210mm !important; }
          .editable-line { border-bottom: 1px dotted black !important; border-bottom-style: dotted !important; }
          .sig-canvas { border-bottom: 1px dotted black !important; border-bottom-style: dotted !important; }
          input::placeholder { color: transparent !important; }
          canvas { display: none !important; }
          img { display: block !important; margin: 0 auto; border-bottom: 1px dotted black !important; }
        }
      `,
        }}
      />
    </div>
  );
};

export default VehicleBookingFormApp;
