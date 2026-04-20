import React, { useState, useEffect, useRef } from 'react';
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  getDoc,
  doc,
  Timestamp,
} from 'firebase/firestore';
import { db, firebaseReady, appId } from './firebase';
import { Html5Qrcode } from 'html5-qrcode';

const EmployeeLogApp = () => {
  const [employeeForm, setEmployeeForm] = useState({
    staffId: '',
    name: '',
    department: '',
    direction: 'IN',
  });
  const [employeeLogs, setEmployeeLogs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [lookupStatus, setLookupStatus] = useState(null); // null | 'loading' | 'found' | 'notfound'
  const debounceRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const qrScannerRef = useRef(null);

  const todayStr = new Date().toISOString().split('T')[0];
  const [autoScanDone, setAutoScanDone] = useState(false);
  const [autoScanStatus, setAutoScanStatus] = useState(null); // null | 'loading' | 'saved' | 'notfound'

  // Auto-fill + auto-log from URL param ?id=STAFF_ID (when QR scanned by phone)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get('id');
    if (!idParam || autoScanDone) return;
    setAutoScanDone(true);
    const id = idParam.trim().toUpperCase();
    setAutoScanStatus('loading');
    setEmployeeForm(prev => ({ ...prev, staffId: id, name: '', department: '' }));

    const doAutoLog = async () => {
      // Wait for Firebase to be ready (poll up to 3s)
      let waited = 0;
      while ((!firebaseReady || !db) && waited < 3000) {
        await new Promise(r => setTimeout(r, 200));
        waited += 200;
      }
      if (!firebaseReady || !db) { setAutoScanStatus('notfound'); return; }

      try {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', id);
        const snap = await getDoc(docRef);

        let name = '', department = '';
        if (snap.exists()) {
          const d = snap.data();
          name = d.name || '';
          department = d.department || '';
          setEmployeeForm(prev => ({ ...prev, name, department }));
        } else {
          setAutoScanStatus('notfound');
          setEmployeeForm(prev => ({ ...prev, staffId: id }));
          return;
        }

        // Auto-submit log entry
        const now = new Date();
        const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        const logEntry = {
          staffId: id,
          name,
          department: department || '-',
          direction: 'IN',
          time: timeStr,
          date: todayStr,
          timestamp: Timestamp.now(),
        };
        const collRef = collection(db, 'artifacts', appId, 'public', 'data', 'employee_logs');
        await addDoc(collRef, logEntry);
        setAutoScanStatus('saved');
        setEmployeeForm({ staffId: '', name: '', department: '', direction: 'IN' });
        // Clear URL param without reload
        window.history.replaceState({}, '', window.location.pathname);
      } catch {
        setAutoScanStatus('notfound');
      }
    };
    doAutoLog();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!firebaseReady || !db) return;

    const collRef = collection(db, 'artifacts', appId, 'public', 'data', 'employee_logs');
    const q = query(
      collRef,
      where('date', '==', todayStr),
      orderBy('timestamp', 'desc'),
    );

    const unsub = onSnapshot(q, (snap) => {
      setEmployeeLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.warn('EmployeeLog onSnapshot error:', err);
    });

    return () => unsub();
  }, [todayStr]);

  // Auto-lookup employee from Firestore when staffId changes
  const handleStaffIdChange = (e) => {
    const val = e.target.value.toUpperCase();
    setEmployeeForm((prev) => ({ ...prev, staffId: val, name: '', department: '' }));
    setLookupStatus(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim() || val.length < 3) return;

    debounceRef.current = setTimeout(async () => {
      if (!firebaseReady || !db) return;
      setLookupStatus('loading');
      try {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', val.trim());
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          setEmployeeForm((prev) => ({
            ...prev,
            name: data.name || '',
            department: data.department || '',
          }));
          setLookupStatus('found');
        } else {
          setLookupStatus('notfound');
        }
      } catch {
        setLookupStatus('notfound');
      }
    }, 500);
  };

  const handleEmployeeLog = async (e) => {
    e.preventDefault();
    if (!employeeForm.staffId.trim() || !employeeForm.name.trim()) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

    const logEntry = {
      staffId: employeeForm.staffId.trim().toUpperCase(),
      name: employeeForm.name.trim(),
      department: employeeForm.department || '-',
      direction: employeeForm.direction,
      time: timeStr,
      date: todayStr,
      timestamp: Timestamp.now(),
    };

    if (firebaseReady && db) {
      setSaving(true);
      try {
        const collRef = collection(db, 'artifacts', appId, 'public', 'data', 'employee_logs');
        await addDoc(collRef, logEntry);
      } catch (err) {
        console.error('Save employee log error:', err);
        setEmployeeLogs((prev) => [{ id: `local-${Date.now()}`, ...logEntry }, ...prev]);
      } finally {
        setSaving(false);
      }
    } else {
      setEmployeeLogs((prev) => [{ id: `local-${Date.now()}`, ...logEntry }, ...prev]);
    }

    setEmployeeForm({ staffId: '', name: '', department: '', direction: employeeForm.direction });
    setLookupStatus(null);
  };

  const startQRScan = async () => {
    setScanning(true);
    setTimeout(async () => {
      try {
        const scanner = new Html5Qrcode('emp-qr-reader');
        qrScannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          async (text) => {
            const id = text.trim().toUpperCase();
            await scanner.stop();
            qrScannerRef.current = null;
            setScanning(false);
            setEmployeeForm(prev => ({ ...prev, staffId: id, name: '', department: '' }));
            setLookupStatus('loading');
            try {
              const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', id);
              const snap = await getDoc(docRef);
              if (snap.exists()) {
                const d = snap.data();
                setEmployeeForm(prev => ({ ...prev, name: d.name || '', department: d.department || '' }));
                setLookupStatus('found');
              } else {
                setLookupStatus('notfound');
              }
            } catch { setLookupStatus('notfound'); }
          },
          () => {}
        );
      } catch (err) {
        setScanning(false);
        alert('ไม่สามารถเปิดกล้องได้: ' + err.message);
      }
    }, 100);
  };

  const stopQRScan = async () => {
    if (qrScannerRef.current) {
      try { await qrScannerRef.current.stop(); } catch {}
      qrScannerRef.current = null;
    }
    setScanning(false);
  };

  const handleBack = () => {
    if (window.opener) {
      window.close();
    } else {
      window.location.href = '/';
    }
  };

  const lookupBadge = {
    loading: <span className="text-[10px] font-bold text-blue-500 animate-pulse">กำลังค้นหา...</span>,
    found:   <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">✓ พบข้อมูลแล้ว</span>,
    notfound:<span className="text-[10px] font-bold text-red-500 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">ไม่พบในระบบ — กรอกเองได้</span>,
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans">

      {/* Auto-scan status banner */}
      {autoScanStatus === 'loading' && (
        <div className="max-w-5xl mx-auto mb-4 bg-blue-50 border border-blue-200 rounded-2xl p-4 text-center">
          <p className="text-blue-700 font-bold text-sm animate-pulse">กำลังดึงข้อมูลพนักงานและบันทึก...</p>
        </div>
      )}
      {autoScanStatus === 'saved' && (
        <div className="max-w-5xl mx-auto mb-4 bg-emerald-50 border border-emerald-300 rounded-2xl p-5 text-center">
          <p className="text-4xl mb-2">✅</p>
          <p className="text-emerald-700 font-black text-lg">บันทึกเข้าโรงงานสำเร็จ!</p>
          <p className="text-emerald-600 text-sm mt-1">ข้อมูลถูกบันทึกลงระบบแล้ว</p>
        </div>
      )}
      {autoScanStatus === 'notfound' && (
        <div className="max-w-5xl mx-auto mb-4 bg-orange-50 border border-orange-200 rounded-2xl p-4 text-center">
          <p className="text-orange-700 font-bold text-sm">ไม่พบข้อมูลพนักงานในระบบ — กรุณากรอกข้อมูลด้านล่าง</p>
        </div>
      )}

      <div className="max-w-5xl mx-auto mb-6 bg-white border border-slate-200 rounded-2xl shadow-sm p-4 md:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">
            พนักงานเข้า-ออกโรงงาน
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {firebaseReady ? `บันทึกวันที่ ${todayStr} (เชื่อมต่อฐานข้อมูลแล้ว)` : 'โหมด offline'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold"
        >
          ← กลับหน้าหลัก
        </button>
      </div>

      <div className="max-w-5xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-sm p-4 md:p-6 space-y-5">

        {/* QR Scanner */}
        {scanning && (
          <div className="mb-3">
            <div id="emp-qr-reader" className="w-full rounded-xl overflow-hidden" style={{ maxWidth: 360, margin: '0 auto' }} />
            <button type="button" onClick={stopQRScan} className="mt-2 w-full py-2 bg-slate-200 text-slate-700 rounded-xl font-bold text-sm">ยกเลิกสแกน</button>
          </div>
        )}

        <form onSubmit={handleEmployeeLog} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

            {/* Staff ID — with auto-lookup */}
            <div className="sm:col-span-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                รหัสพนักงาน {lookupStatus && lookupBadge[lookupStatus]}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className={`flex-1 border rounded-xl px-3 py-2.5 text-sm font-mono uppercase bg-slate-50 focus:outline-none focus:ring-2 focus:border-transparent transition-all ${
                    lookupStatus === 'found'
                      ? 'border-emerald-400 focus:ring-emerald-100'
                      : lookupStatus === 'notfound'
                      ? 'border-red-300 focus:ring-red-100'
                      : 'border-slate-200 focus:ring-blue-100'
                  }`}
                  placeholder="เช่น EMP-EEE-01"
                  value={employeeForm.staffId}
                  onChange={handleStaffIdChange}
                />
                <button type="button" onClick={startQRScan} className="px-3 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-black transition whitespace-nowrap">
                  📷 สแกน
                </button>
              </div>
            </div>

            {/* Name — auto-filled or manual */}
            <div className="sm:col-span-1 lg:col-span-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">ชื่อ-นามสกุล</label>
              <input
                type="text"
                className={`w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all ${
                  lookupStatus === 'found' ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-semibold' : ''
                }`}
                placeholder="ชื่อ-นามสกุล"
                value={employeeForm.name}
                onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })}
              />
            </div>

            {/* Department — auto-filled or manual */}
            <div className="sm:col-span-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">แผนก</label>
              <input
                type="text"
                className={`w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all ${
                  lookupStatus === 'found' ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-semibold' : ''
                }`}
                placeholder="แผนก"
                value={employeeForm.department}
                onChange={(e) => setEmployeeForm({ ...employeeForm, department: e.target.value })}
              />
            </div>
          </div>

          {/* Direction + Submit */}
          <div className="flex gap-3 items-center">
            <button
              type="button"
              onClick={() => setEmployeeForm((p) => ({ ...p, direction: 'IN' }))}
              className={`flex-1 py-3 rounded-xl text-sm font-black uppercase tracking-widest transition-all border-2 ${
                employeeForm.direction === 'IN'
                  ? 'bg-emerald-500 border-emerald-500 text-white shadow-md'
                  : 'bg-white border-slate-200 text-slate-400 hover:border-emerald-300'
              }`}
            >
              เข้าโรงงาน
            </button>
            <button
              type="button"
              onClick={() => setEmployeeForm((p) => ({ ...p, direction: 'OUT' }))}
              className={`flex-1 py-3 rounded-xl text-sm font-black uppercase tracking-widest transition-all border-2 ${
                employeeForm.direction === 'OUT'
                  ? 'bg-orange-500 border-orange-500 text-white shadow-md'
                  : 'bg-white border-slate-200 text-slate-400 hover:border-orange-300'
              }`}
            >
              ออกจากโรงงาน
            </button>
            <button
              type="submit"
              disabled={saving || !employeeForm.staffId.trim() || !employeeForm.name.trim()}
              className="px-8 py-3 rounded-xl bg-slate-900 text-white text-sm font-black uppercase tracking-widest hover:bg-black active:scale-95 transition disabled:opacity-40 whitespace-nowrap"
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </form>

        {/* Log table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] uppercase tracking-[0.25em] text-slate-400">
                <th className="py-2 pr-4 font-black">เวลา</th>
                <th className="py-2 pr-4 font-black">รหัสพนักงาน</th>
                <th className="py-2 pr-4 font-black">ชื่อพนักงาน</th>
                <th className="py-2 pr-4 font-black">แผนก</th>
                <th className="py-2 pr-2 font-black text-right">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {employeeLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/80">
                  <td className="py-1.5 pr-4 font-mono text-[11px] text-slate-500">{log.time}</td>
                  <td className="py-1.5 pr-4 font-mono text-[11px] text-slate-700">{log.staffId}</td>
                  <td className="py-1.5 pr-4 text-[12px] text-slate-800 font-semibold">{log.name}</td>
                  <td className="py-1.5 pr-4 text-[11px] text-slate-500">{log.department || '-'}</td>
                  <td className="py-1.5 pr-2 text-right">
                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] ${
                      log.direction === 'IN'
                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                        : 'bg-orange-50 text-orange-600 border border-orange-100'
                    }`}>
                      {log.direction === 'IN' ? 'IN' : 'OUT'}
                    </span>
                  </td>
                </tr>
              ))}
              {employeeLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-[11px] text-slate-300 italic">
                    ยังไม่มีข้อมูลบันทึกพนักงานเข้า-ออกในวันนี้
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default EmployeeLogApp;
