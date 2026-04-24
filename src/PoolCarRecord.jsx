import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, firebaseReady, appId } from './firebase';
import { FileText, X } from 'lucide-react';

/**
 * Pool Car / Van Record — shared component
 * แสดงปุ่มและ modal สำหรับดูบันทึกการขอใช้รถบริษัท
 *
 * Props:
 *   buttonClassName  - custom class สำหรับปุ่ม (override default)
 *   buttonLabel      - custom label (default: "บันทึกการขอใช้รถบริษัท")
 */
export default function PoolCarRecord({ buttonClassName, buttonLabel }) {
  const [showRecordBook, setShowRecordBook] = useState(false);
  const [allVehicleBookings, setAllVehicleBookings] = useState([]);
  const [recordBookLoading, setRecordBookLoading] = useState(false);
  const [recordBookYear, setRecordBookYear] = useState(new Date().getFullYear());

  // Load all vehicle bookings for the record book
  const loadAllVehicleBookings = async () => {
    if (!firebaseReady || !db) return;
    setRecordBookLoading(true);
    try {
      const bookingsRef = collection(db, 'artifacts', appId, 'public', 'data', 'vehicle_bookings');
      const snap = await getDocs(bookingsRef);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Enrich from approval_workflows
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

  // Thai date helper: "DD-MMM-YY"
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

  // Extract booking "ID" — prefer login ID ของผู้ขอ
  const bookingShortId = (b) => {
    if (b.bookedBy && b.bookedBy !== '-') return b.bookedBy;
    if (b.requesterId && b.requesterId !== '-') return b.requesterId;
    if (b.bookingNo) return b.bookingNo;
    if (b.chainId) {
      const tail = String(b.chainId).split('-').pop();
      return tail?.slice(-5) || tail || '-';
    }
    return (b.id || '').slice(-5) || '-';
  };

  const participantsList = (b) => {
    const list = [];
    if (Array.isArray(b.passengers)) b.passengers.forEach(p => { if (p) list.push(typeof p === 'string' ? p : (p.name || '')); });
    if (Array.isArray(b.companions)) b.companions.forEach(p => { if (p) list.push(typeof p === 'string' ? p : (p.name || '')); });
    return list.filter(Boolean).join(' , ');
  };

  const vehicleTypeLabel = (b) => {
    if (b.plate && b.plate !== 'รอใส่ทะเบียน') return b.plate;
    if (b.brand) return b.brand;
    if (b.vehicleId) return b.vehicleId;
    return 'Driver';
  };

  const driverLabel = (b) => {
    if (b.driverName) return b.driverName;
    if (b.driver) return typeof b.driver === 'string' ? b.driver : (b.driver.name || 'Driver');
    if (b.selfDrive && b.bookedByName) return b.bookedByName;
    return 'Driver';
  };

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

  const defaultBtnClass = 'bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm flex items-center gap-2 transition active:scale-95';

  return (
    <>
      <button
        onClick={openRecordBook}
        className={buttonClassName || defaultBtnClass}
      >
        <FileText size={16} /> {buttonLabel || 'บันทึกการขอใช้รถบริษัท (Pool car record)'}
      </button>

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
                <button
                  onClick={async () => {
                    const { exportToExcel, formatTs } = await import('./exportExcel');
                    exportToExcel(recordBookRows, [
                      { label: 'วันที่ขอ', value: (b) => formatShortDate(b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate().toISOString() : new Date(b.createdAt).toISOString?.() || b.createdAt) : b.date) },
                      { label: 'วันที่ใช้บริการ', value: (b) => formatShortDate(b.date) },
                      { label: 'รหัส (ID)', value: (b) => bookingShortId(b) },
                      { label: 'ผู้ขอใช้บริการ', value: (b) => b.bookedByName || b.requesterName || '-' },
                      { label: 'ผู้ร่วมเดินทาง', value: (b) => participantsList(b) },
                      { label: 'แผนก', value: (b) => b.department || '-' },
                      { label: 'สถานที่', value: (b) => b.destination || '-' },
                      { label: 'วัตถุประสงค์', value: (b) => b.purpose || '-' },
                      { label: 'ประเภทรถ', value: (b) => vehicleTypeLabel(b) },
                      { label: 'คนขับรถ', value: (b) => driverLabel(b) },
                      { label: 'เวลาออก', value: (b) => b.timeStart || '-' },
                      { label: 'เวลากลับ', value: (b) => b.timeEnd || '-' },
                      { label: 'คืนรถ', value: (b) => b.returned ? 'คืนแล้ว' : 'ยังไม่คืน' },
                      { label: 'เลขไมล์คืน', value: (b) => b.returnMileage || '-' },
                    ], `PoolCarRecord_${recordBookYear}`, `Pool Car ${recordBookYear}`);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm flex items-center gap-1.5 transition active:scale-95"
                >
                  📊 Excel
                </button>
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
                        <tr key={b.id} className="hover:bg-teal-50/50">
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
              💡 กด "📊 Excel" เพื่อ download ไฟล์ · "🖨️ พิมพ์" เพื่อออก PDF/กระดาษ
            </div>
          </div>
        </div>
      )}
    </>
  );
}
