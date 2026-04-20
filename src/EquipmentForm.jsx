import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Printer, ArrowLeft, Save } from 'lucide-react';
import { collection, doc, addDoc, updateDoc, getDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { app, auth, db, firebaseReady, appId } from './firebase';

// --- ส่วนประกอบสำหรับวาดและอัปโหลดลายเซ็น ---
const SignaturePad = ({ canvasId, onSave, savedImage, width = 200, height = 40 }) => {
  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
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
    window.addEventListener('mouseup', endDraw);
    canvas.addEventListener('touchstart', (e) => { startDraw(e); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchmove', (e) => { draw(e); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchend', endDraw);

    return () => {
      canvas.removeEventListener('mousedown', startDraw);
      canvas.removeEventListener('mousemove', draw);
      window.removeEventListener('mouseup', endDraw);
      canvas.removeEventListener('touchstart', startDraw);
      canvas.removeEventListener('touchmove', draw);
      canvas.removeEventListener('touchend', endDraw);
    };
  }, [onSave]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !savedImage) return;
    
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
      <div className="no-print absolute -top-[18px] right-0 flex gap-3 z-50">
        <label className="sig-btn upload-btn cursor-pointer text-[10px] border-b-[1.5px] border-blue-600 text-blue-600 hover:border-b-2 font-semibold transition">
          เลือกไฟล์
          <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*" />
        </label>
        <button type="button" onClick={clear} className="sig-btn clear-btn text-[10px] border-b-[1.5px] border-red-500 text-red-500 hover:border-b-2 font-semibold transition">
          ล้าง
        </button>
      </div>
      <canvas
        ref={canvasRef}
        id={canvasId}
        className="sig-canvas w-full border-b border-dotted border-black cursor-crosshair touch-none bg-transparent"
        width={width}
        height={height}
        style={{ borderBottomStyle: 'dotted', borderBottomWidth: '1px' }}
      />
    </div>
  );
};

// --- ตัวแอปฟอร์มเบิกอุปกรณ์ในสำนักงาน ---
const EquipmentFormApp = () => {
  const [user, setUser] = useState(null);
  const [formId, setFormId] = useState(null);
  const isEditingRef = useRef(false);
  const [formData, setFormData] = useState({
    date: '',
    deptCode: '',
    employeeId: '',
    employeeName: '',
    sigGa: null,
    sigMgr: null,
    quantities: {},
    names: {}
  });

  // Auto-fill from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const name = params.get('name');
    const staffId = params.get('staffId');
    const dept = params.get('dept');
    if (name || staffId || dept) {
      setFormData(prev => ({
        ...prev,
        ...(name && { employeeName: name }),
        ...(staffId && { employeeId: staffId }),
        ...(dept && { deptCode: dept }),
      }));
    }
  }, []);

  // Initialize Firebase auth
  useEffect(() => {
    if (!firebaseReady) {
      // ถ้า Firebase ไม่พร้อม ให้รอสักครู่แล้วลองอีกครั้ง
      const timer = setTimeout(() => {
        if (window.__firebase_config) {
          window.location.reload();
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
    const initAuth = async () => {
      try {
        if (typeof window.__initial_auth_token !== 'undefined' && window.__initial_auth_token) {
          await signInWithCustomToken(auth, window.__initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth Error:", error);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, [firebaseReady]);

  // Stock status: { [code]: boolean } where false = out of stock
  const [stockStatus, setStockStatus] = useState({});

  // Load equipment stock status from Firestore (real-time)
  useEffect(() => {
    if (!firebaseReady || !db) return;
    try {
      const stockRef = collection(db, 'artifacts', appId, 'public', 'data', 'equipment_stock');
      const unsubscribe = onSnapshot(stockRef, (snapshot) => {
        const status = {};
        snapshot.docs.forEach((d) => {
          const data = d.data();
          status[data.code] = data.available !== false; // default true if field missing
        });
        setStockStatus(status);
      }, (error) => {
        console.error('Error loading equipment stock:', error);
      });
      return () => unsubscribe();
    } catch (error) {
      console.error('Equipment stock setup error:', error);
    }
  }, [firebaseReady]);

  // Load form data once if editing (no real-time subscription to avoid flicker)
  useEffect(() => {
    const loadOnce = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const id = urlParams.get('id');
      if (!id || !firebaseReady || !user) return;

      try {
        setFormId(id);
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'equipment_requests', id);
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
          const data = snapshot.data();
          setFormData({
            date: data.date || '',
            deptCode: data.deptCode || '',
            employeeId: data.employeeId || '',
            employeeName: data.employeeName || '',
            sigGa: data.sigGa || null,
            sigMgr: data.sigMgr || null,
            quantities: data.quantities || {},
            names: data.names || {}
          });
        }
      } catch (error) {
        console.error('Error loading equipment form:', error);
      }
    };

    loadOnce();
  }, [user, firebaseReady]);

  const data1 = [
    ["A01", "กระดาษสีฟ้า"], ["A02", "กระดาษสีเขียว"], ["A03", "กระดาษสีชมพู"],
    ["A04", "กระดาษสีเหลือง"], ["A05", "กระดาษ A4"], ["A06", "กระดาษ A3"],
    ["A07", "กระดาษการ์ดขาวหน้าบาง"], ["A08", "กระดาษการ์ดขาวหน้าหนา"],
    ["A09", "กระดาษคาร์บอน"], ["A10", "สมุดปกแข็ง"], ["A11", "สมุดปกอ่อน"],
    ["A12", "กระดาษกาวบ่น"], ["A13", "กระดาษบันทึก"], ["B01", "แฟ้ม 125 F"],
    ["B02", "แฟ้ม 120 F"], ["B03", "แฟ้ม No 210 F"], ["B04", "แฟ้มพลาสติก"],
    ["B05", "แฟ้มกระดาษ"], ["B06", "แฟ้มหูรู"], ["B07", "สันแฟ้มพลาสติก"],
    ["B08", "สันแฟ้มทองเหลือง"]
  ];

  const data2 = [
    ["C01", "ตาไก่"], ["C02", "คลิปเบอร์ 1"], ["C03", "คลิปหนีบกระดาษ 2 ขา 108"],
    ["C04", "คลิปหนีบกระดาษ 2 ขา 111"], ["C05", "คลิปหนีบกระดาษ 2 ขา 112"],
    ["C06", "ลูกแม็ก No. 10"], ["C07", "ลูกแม็ก No. 35"], ["C08", "สก๊อตเทปใส เล็ก"],
    ["C09", "สก๊อตเทปใส ใหญ่"], ["C10", "กาวรูบี้"], ["C11", "เทปผ้า"],
    ["C12", "ถ่านไฟฉาย Size C"], ["C13", "ถ่านไฟฉาย Size D"], ["C14", "ถ่านไฟฉาย Size AAA"],
    ["C15", "ถ่านไฟฉาย Size AA"], ["D01", "ปากกาสีดำ"], ["D02", "ปากกาสีแดง"],
    ["D03", "ปากกาสีน้ำเงิน"], ["D04", "ปากกาเน้นข้อความ สีเหลือง"], ["D05", "ปากกาเน้นข้อความ สีเขียว"],
    ["D06", "ปากกาเน้นข้อความ สีชมพู"]
  ];

  const data3 = [
    ["D07", "ปากกาเน้นข้อความ สีส้ม"], ["D08", "ดินสอ"], ["D09", "ไส้ดินสอ"],
    ["D10", "ลิควิดเปเปอร์"], ["D11", "ปากกาไวท์บอร์ด สีดำ"], ["D12", "ปากกาไวท์บอร์ด สีแดง"],
    ["D13", "ปากกาไวท์บอร์ด สีน้ำเงิน"], ["D14", "หมึกเติมแท่นแสตมป์ สีน้ำเงิน"],
    ["D15", "หมึกเติมแท่นแสตมป์ สีแดง"], ["D16", "หมึกเติมแท่นแสตมป์ สีดำ"],
    ["D17", "ปากกาดำ Hybrid 0.5mm"], ["D18", "ยางลบ"], ["D19", "ซองออร์ก้า A4"],
    ["E01", "พลาสติกเคลือบบัตร A4"], ["E02", "แท่นประทับตรา"], ["E03", "แผ่นเคลือบบัตร A3"],
    ["E04", "คัตเตอร์"], ["E05", "ใบมีดคัตเตอร์ใหญ่"], ["E06", "ใบมีดคัตเตอร์เล็ก"],
    ["E07", "ไม้บรรทัด"], ["E08", "แปรงลบกระดาษ"]
  ];

  const handleSave = async () => {
    if (!firebaseReady || !user) {
      alert('Firebase ไม่พร้อมใช้งาน');
      return;
    }
    try {
      // Set editing flag to prevent onSnapshot from updating while saving
      isEditingRef.current = true;
      
      const dataToSave = {
        ...formData,
        updatedAt: Timestamp.now()
      };
      if (formId) {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'equipment_requests', formId);
        await updateDoc(docRef, dataToSave);
        alert('บันทึกข้อมูลสำเร็จ');
      } else {
        const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'equipment_requests'), {
          ...dataToSave,
          createdAt: Timestamp.now()
        });
        setFormId(docRef.id);
        alert('บันทึกข้อมูลสำเร็จ');
      }
      
      // Reset editing flag after a delay to allow onSnapshot to sync
      setTimeout(() => {
        isEditingRef.current = false;
      }, 500);
    } catch (error) {
      console.error('Error saving form:', error);
      alert('เกิดข้อผิดพลาด: ' + error.message);
      isEditingRef.current = false;
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
      setFormData({
        date: '',
        deptCode: '',
        employeeId: '',
        employeeName: '',
        sigGa: null,
        sigMgr: null,
        quantities: {},
        names: {}
      });
      setFormId(null);
    }
  };

  const updateQuantity = (code, value) => {
    setFormData(prev => ({
      ...prev,
      quantities: { ...prev.quantities, [code]: value }
    }));
  };

  const updateName = (code, value) => {
    setFormData(prev => ({
      ...prev,
      names: { ...prev.names, [code]: value }
    }));
  };

  const stockStatusKey = JSON.stringify(stockStatus);

  const renderTableRows = useMemo(() => {
    const createRows = (data) => {
      return data.map((item, idx) => {
        const code = item[0];
        const defaultName = item[1];
        const name = formData.names[code] !== undefined ? formData.names[code] : defaultName;
        // Check stock: if stockStatus has the code and it's false, item is out of stock
        const isOutOfStock = stockStatus[code] === false;
        return (
          <tr
            key={`${code}-${idx}`}
            style={{ pointerEvents: 'auto' }}
            className={isOutOfStock ? 'bg-red-100' : ''}
          >
            <td className="text-center font-bold border border-black p-1 h-[22px]">{code}</td>
            <td className="border border-black p-1 h-[22px]">
              <input
                key={`name-${code}`}
                type="text"
                className={`name-input w-full border-none outline-none cursor-text px-1 ${isOutOfStock ? 'bg-red-100' : 'bg-transparent'}`}
                value={isOutOfStock ? `${name} (หมด)` : name}
                onChange={(e) => {
                  if (isOutOfStock) return;
                  isEditingRef.current = true;
                  updateName(code, e.target.value);
                }}
                onBlur={() => {
                  setTimeout(() => {
                    isEditingRef.current = false;
                  }, 200);
                }}
                onFocus={() => {
                  isEditingRef.current = true;
                }}
                readOnly={isOutOfStock}
              />
            </td>
            <td className="border border-black p-1 h-[22px]">
              <input
                key={`qty-${code}`}
                type="text"
                className={`qty-input w-full border-none text-center outline-none ${isOutOfStock ? 'bg-red-100 cursor-not-allowed text-gray-400' : 'bg-transparent cursor-text'}`}
                value={formData.quantities[code] || ''}
                onChange={(e) => {
                  if (isOutOfStock) return;
                  isEditingRef.current = true;
                  updateQuantity(code, e.target.value);
                }}
                onBlur={() => {
                  setTimeout(() => {
                    isEditingRef.current = false;
                  }, 100);
                }}
                onFocus={() => {
                  isEditingRef.current = true;
                }}
                disabled={isOutOfStock}
              />
            </td>
          </tr>
        );
      });
    };

    return {
      data1: createRows(data1),
      data2: createRows(data2),
      data3: createRows(data3)
    };
  }, [namesKey, quantitiesKey, stockStatusKey]);

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex flex-col items-center p-5 font-serif overflow-x-auto">
      {/* Menu Bar */}
      <div className="no-print mb-6 flex gap-4">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 bg-gray-500 text-white px-8 py-2.5 rounded shadow-lg hover:bg-gray-600 transition-all font-bold uppercase tracking-wide"
        >
          <ArrowLeft size={16} /> กลับหน้าหลัก
        </button>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 bg-emerald-600 text-white px-8 py-2.5 rounded shadow-lg hover:bg-emerald-700 transition-all font-bold uppercase tracking-wide"
        >
          <Save size={18} /> บันทึกข้อมูล
        </button>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 bg-blue-700 text-white px-8 py-2.5 rounded shadow-lg hover:bg-blue-800 transition-all font-bold uppercase tracking-wide"
        >
          <Printer size={18} /> พิมพ์ / บันทึก PDF
        </button>
        <button
          onClick={handleReset}
          className="bg-gray-500 text-white px-8 py-2.5 rounded shadow-lg hover:bg-gray-600 transition-all font-bold uppercase tracking-wide"
        >
          ล้างข้อมูลทั้งหมด
        </button>
      </div>

      {/* Form Container */}
      <div className="form-container bg-white w-[210mm] min-h-[297mm] p-[10mm] shadow-lg border border-gray-300 box-border">
        <div className="main-border border-[1.5px] border-black h-full flex flex-col box-border p-1">
          {/* Header Section */}
          <div className="flex justify-between items-start mb-2">
            <div className="flex flex-col items-center">
              <div className="border-[3px] border-black px-3 py-1 italic font-black text-2xl tracking-tighter leading-none">
                TBKK
              </div>
            </div>
            <div className="text-center flex-grow pt-4">
              <h1 className="text-xl font-bold">ฟอร์มการเบิกอุปกรณ์ภายในสำนักงาน</h1>
              <h2 className="text-sm">( Stationary request form )</h2>
            </div>
            <div className="w-64 text-xs">
              <table className="header-info w-full">
                <tbody>
                  <tr>
                    <td className="w-24 border-none p-0.5">วัน / เดือน / ปี</td>
                    <td className="border-none p-0.5">
                      : <input
                        type="text"
                        className="editable-line w-28 border-none border-b border-dotted border-black bg-transparent outline-none px-1 focus:bg-gray-50 focus:border-blue-500 cursor-text"
                        placeholder="วว/ดด/ปป"
                        value={formData.date}
                        onChange={(e) => {
                          e.stopPropagation();
                          isEditingRef.current = true;
                          setFormData({...formData, date: e.target.value});
                        }}
                        onBlur={() => {
                          setTimeout(() => {
                            isEditingRef.current = false;
                          }, 100);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.target.focus();
                        }}
                        onFocus={(e) => {
                          e.stopPropagation();
                          isEditingRef.current = true;
                          e.target.select();
                        }}
                        tabIndex={0}
                        style={{ borderBottomStyle: 'dotted', borderBottomWidth: '1px', pointerEvents: 'auto', zIndex: 20, position: 'relative' }}
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="border-none p-0.5">รหัสฝ่าย</td>
                    <td className="border-none p-0.5">
                      : <input
                        type="text"
                        className="editable-line w-28 border-none border-b border-dotted border-black bg-transparent outline-none px-1 focus:bg-gray-50 focus:border-blue-500 cursor-text"
                        value={formData.deptCode}
                        onChange={(e) => {
                          e.stopPropagation();
                          isEditingRef.current = true;
                          setFormData({...formData, deptCode: e.target.value});
                        }}
                        onBlur={() => {
                          setTimeout(() => {
                            isEditingRef.current = false;
                          }, 100);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.target.focus();
                        }}
                        onFocus={(e) => {
                          e.stopPropagation();
                          isEditingRef.current = true;
                          e.target.select();
                        }}
                        tabIndex={0}
                        style={{ borderBottomStyle: 'dotted', borderBottomWidth: '1px', pointerEvents: 'auto', zIndex: 20, position: 'relative' }}
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="border-none p-0.5">รหัสพนักงาน</td>
                    <td className="border-none p-0.5">
                      : <input
                        type="text"
                        className="editable-line w-28 border-none border-b border-dotted border-black bg-transparent outline-none px-1 focus:bg-gray-50 focus:border-blue-500 uppercase cursor-text"
                        value={formData.employeeId}
                        onChange={(e) => {
                          e.stopPropagation();
                          isEditingRef.current = true;
                          setFormData({...formData, employeeId: e.target.value.toUpperCase()});
                        }}
                        onBlur={() => {
                          setTimeout(() => {
                            isEditingRef.current = false;
                          }, 100);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.target.focus();
                        }}
                        onFocus={(e) => {
                          e.stopPropagation();
                          isEditingRef.current = true;
                          e.target.select();
                        }}
                        tabIndex={0}
                        style={{ borderBottomStyle: 'dotted', borderBottomWidth: '1px', pointerEvents: 'auto', zIndex: 20, position: 'relative' }}
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="border-none p-0.5">ชื่อ - นามสกุล</td>
                    <td className="border-none p-0.5">
                      : <input
                        type="text"
                        className="editable-line w-28 border-none border-b border-dotted border-black bg-transparent outline-none px-1 focus:bg-gray-50 focus:border-blue-500 cursor-text"
                        value={formData.employeeName}
                        onChange={(e) => {
                          e.stopPropagation();
                          isEditingRef.current = true;
                          setFormData({...formData, employeeName: e.target.value});
                        }}
                        onBlur={() => {
                          setTimeout(() => {
                            isEditingRef.current = false;
                          }, 100);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.target.focus();
                        }}
                        onFocus={(e) => {
                          e.stopPropagation();
                          isEditingRef.current = true;
                          e.target.select();
                        }}
                        tabIndex={0}
                        style={{ borderBottomStyle: 'dotted', borderBottomWidth: '1px', pointerEvents: 'auto', zIndex: 20, position: 'relative' }}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Approval Section */}
          <div className="flex justify-end mb-4 text-[11px]">
            <div className="border border-black p-2 w-80">
              <div className="text-center font-bold underline mb-4">อนุมัติโดย</div>
              <div className="flex flex-col gap-1">
                <div className="flex flex-col gap-1 mb-1">
                  <div className="flex items-end">
                    <span className="whitespace-nowrap">จ่ายอุปกรณ์โดย</span>
                    <div className="signature-wrapper flex-grow ml-1">
                      <SignaturePad
                        canvasId="sig-ga"
                        savedImage={formData.sigGa}
                        onSave={(img) => setFormData({...formData, sigGa: img})}
                        width={200}
                        height={40}
                      />
                    </div>
                  </div>
                  <div className="text-center text-[10px] leading-none">( เจ้าหน้าที่แผนก GA )</div>
                </div>
                
                <div className="signature-wrapper w-full mt-3">
                  <SignaturePad
                    canvasId="sig-mgr"
                    savedImage={formData.sigMgr}
                    onSave={(img) => setFormData({...formData, sigMgr: img})}
                    width={300}
                    height={50}
                  />
                </div>
                <div className="text-center text-[10px] leading-none">( หัวหน้าแผนกขึ้นไป )</div>
              </div>
            </div>
          </div>

          {/* Main Table Section (3 Columns) */}
          <div className="flex gap-1" style={{ pointerEvents: 'auto', overflow: 'visible' }}>
            <div className="flex-1" style={{ pointerEvents: 'auto' }}>
              <table className="w-full border-collapse text-[11px]" style={{ pointerEvents: 'auto' }}>
                <thead>
                  <tr>
                    <th className="w-10 border border-black p-1 h-[22px] bg-gray-200 text-center font-bold">Code</th>
                    <th className="border border-black p-1 h-[22px] bg-gray-200 text-center font-bold">Name</th>
                    <th className="w-10 border border-black p-1 h-[22px] bg-gray-200 text-center font-bold">Q'ty</th>
                  </tr>
                </thead>
                <tbody style={{ pointerEvents: 'auto' }}>{renderTableRows.data1}</tbody>
              </table>
            </div>
            <div className="flex-1" style={{ pointerEvents: 'auto' }}>
              <table className="w-full border-collapse text-[11px]" style={{ pointerEvents: 'auto' }}>
                <thead>
                  <tr>
                    <th className="w-10 border border-black p-1 h-[22px] bg-gray-200 text-center font-bold">Code</th>
                    <th className="border border-black p-1 h-[22px] bg-gray-200 text-center font-bold">Name</th>
                    <th className="w-10 border border-black p-1 h-[22px] bg-gray-200 text-center font-bold">Q'ty</th>
                  </tr>
                </thead>
                <tbody style={{ pointerEvents: 'auto' }}>{renderTableRows.data2}</tbody>
              </table>
            </div>
            <div className="flex-1" style={{ pointerEvents: 'auto' }}>
              <table className="w-full border-collapse text-[11px]" style={{ pointerEvents: 'auto' }}>
                <thead>
                  <tr>
                    <th className="w-10 border border-black p-1 h-[22px] bg-gray-200 text-center font-bold">Code</th>
                    <th className="border border-black p-1 h-[22px] bg-gray-200 text-center font-bold">Name</th>
                    <th className="w-10 border border-black p-1 h-[22px] bg-gray-200 text-center font-bold">Q'ty</th>
                  </tr>
                </thead>
                <tbody style={{ pointerEvents: 'auto' }}>{renderTableRows.data3}</tbody>
              </table>
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

        .editable-line, .qty-input, .name-input {
          pointer-events: auto !important;
          cursor: text !important;
          z-index: 20 !important;
          position: relative !important;
        }

        .editable-line:focus, .qty-input:focus, .name-input:focus {
          background-color: #f0f9ff !important;
          border: 1px solid #3b82f6 !important;
          border-radius: 2px !important;
          outline: none !important;
        }

        table td input {
          cursor: text !important;
        }

        input[type="text"]:focus {
          outline: 2px solid #3b82f6 !important;
          outline-offset: 2px !important;
          background-color: #f0f9ff !important;
        }

        .name-input:focus,
        .qty-input:focus {
          background-color: #f0f9ff !important;
          outline: 2px solid #3b82f6 !important;
          outline-offset: -1px !important;
        }

        .qty-input {
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          appearance: none !important;
        }

        .qty-input:focus {
          background-color: #f0f9ff !important;
          border: 1px solid #3b82f6 !important;
          border-radius: 2px !important;
        }

        @media print {
          @page { size: A4; margin: 0; }
          body { background: white !important; padding: 0 !important; }
          .min-h-screen { background: white !important; padding: 0 !important; }
          .no-print { display: none !important; }
          .form-container { box-shadow: none !important; border: none !important; margin: 0 !important; padding: 5mm !important; }
          .editable-line { border-bottom: 1px dotted black !important; }
          .qty-input { border: none !important; }
          input::placeholder { color: transparent !important; }
          canvas { display: none !important; }
          img { display: block !important; margin: 0 auto; }
        }
      `,
        }}
      />
    </div>
  );
};

export default EquipmentFormApp;
