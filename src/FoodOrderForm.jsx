import React, { useState, useRef, useEffect } from 'react';
import { Printer, FileText, Eraser, Upload, CheckCircle2, Send } from 'lucide-react';
import { createApprovalWorkflowRequest } from './approvalNotifications';
import { getHeadEmail, copyHtmlAndOpenOutlook, buildApproveUrl } from './emailHelper';
import { printFoodOrder } from './printDocument';

function getHeadByDepartment(dept) {
  const key = (dept || '').toString().trim().toUpperCase();
  return { name: `หัวหน้าแผนก ${key || '-'}` };
}

// --- ส่วนประกอบสำหรับวาดและอัปโหลดลายเซ็น (Advanced Signature Pad) ---
const SignaturePad = ({ onSave, savedImage, label }) => {
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(!savedImage);

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    setIsEmpty(false);
  };

  const endDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (canvasRef.current) {
      onSave(canvasRef.current.toDataURL('image/png'));
    }
  };

  const clear = (e) => {
    e.stopPropagation();
    onSave(null);
    setIsEmpty(true);
    
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        onSave(event.target.result);
        setIsEmpty(false);
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    const initCanvas = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = '#000080'; 
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    };
    initCanvas();
  }, [savedImage]);

  return (
    <div className="flex flex-col items-center group relative w-full h-full">
      <div className="relative w-full h-14 border-b border-black flex items-center justify-center overflow-hidden bg-transparent">
        {savedImage ? (
          <img 
            src={savedImage} 
            alt="signature" 
            className="max-h-full max-w-full object-contain pointer-events-none" 
          />
        ) : (
          <canvas
            ref={canvasRef}
            width={250}
            height={60}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={endDrawing}
            onMouseOut={endDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={endDrawing}
            className="w-full h-full cursor-crosshair touch-none print:hidden"
          />
        )}
        
        {!isDrawing && isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-300 pointer-events-none text-[10px] italic print:hidden">
            {label || 'ลงชื่อ'}
          </div>
        )}

        <div className="absolute top-0 right-0 flex gap-1 opacity-0 group-hover:opacity-100 transition print:hidden bg-white/80 rounded-bl-lg z-10">
          {!isEmpty && (
            <button type="button" onClick={clear} className="p-1 text-red-500">
              <Eraser size={12} />
            </button>
          )}
          <button type="button" onClick={() => fileInputRef.current && fileInputRef.current.click()} className="p-1 text-blue-600">
            <Upload size={12} />
          </button>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />
        </div>
      </div>
    </div>
  );
};

// --- ตัวแอปหลัก ---
const FoodOrderFormApp = () => {
  const [formData, setFormData] = useState({
    responsiblePerson: '',
    employeeId: '',
    department: '',
    orderDate: new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }),
    orderTime: '',
    rows: [
      { id: 1, details: '', count: '', condition: '' },
      { id: 2, details: '', count: '', condition: '' },
      { id: 3, details: '', count: '', condition: '' },
      { id: 4, details: '', count: '', condition: '' },
    ],
    note: '',
    ordererSign: null,
    deptManagerSign: null,
    generalAdminSign: null,
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
        ...(name && { responsiblePerson: name }),
        ...(staffId && { employeeId: staffId }),
        ...(dept && { department: dept }),
      }));
    }
  }, []);

  const updateRow = (id, field, value) => {
    setFormData((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    }));
  };

  const handleSend = async () => {
    const head = getHeadByDepartment(formData.department);
    const payload = {
      form: 'FOOD_ORDER',
      responsiblePerson: formData.responsiblePerson || '',
      employeeId: formData.employeeId || '',
      department: formData.department || '',
      targetHead: head.name,
      orderDate: formData.orderDate || '',
      orderTime: formData.orderTime || '',
      rows: formData.rows || [],
      note: formData.note || '',
      sentAt: new Date().toISOString(),
    };

    const text =
      `ส่งคำขอ: แบบการสั่งอาหารเพื่อลูกค้า (TBKK)\n` +
      `ผู้รับผิดชอบ: ${payload.responsiblePerson}\n` +
      `รหัสพนักงาน: ${payload.employeeId}\n` +
      `แผนก: ${payload.department}\n` +
      `ส่งถึง: ${head.name}\n` +
      `วันที่/เวลา: ${payload.orderDate} ${payload.orderTime}\n` +
      `\nรายการ:\n` +
      `${(payload.rows || [])
        .filter(r => (r.details || '').trim() || (r.count || '').toString().trim() || (r.condition || '').trim())
        .map((r, i) => `${i + 1}) ${r.details || '-'} | จำนวน: ${r.count || '-'} | เงื่อนไข: ${r.condition || '-'}`)
        .join('\n') || '-'}` +
      `\n\nหมายเหตุ: ${payload.note || '-'}` +
      `\n\n---\nข้อมูล (JSON):\n${JSON.stringify(payload, null, 2)}`;

    let workflowItemId = null;
    try {
      workflowItemId = await createApprovalWorkflowRequest({
        topic: 'เอกสารสั่งอาหาร รอเซ็นอนุมัติ',
        requesterId: payload.employeeId || '-',
        requesterName: payload.responsiblePerson || '-',
        requesterDepartment: payload.department || '',
        sourceForm: 'FOOD_ORDER',
        requestPayload: {
          responsiblePerson: payload.responsiblePerson,
          employeeId: payload.employeeId,
          department: payload.department,
          orderDate: payload.orderDate,
          orderTime: payload.orderTime,
          note: payload.note,
          rows: (payload.rows || []).map((r) => ({
            details: r.details,
            count: r.count,
            condition: r.condition,
          })),
        },
      });
    } catch (err) {
      console.error('Approval workflow error:', err);
    }
    printFoodOrder(payload);
    const approveUrl = workflowItemId ? buildApproveUrl(workflowItemId) : '';
    const headEmail = await getHeadEmail(payload.department);
    if (headEmail) {
      await copyHtmlAndOpenOutlook({
        to: headEmail,
        subject: `[SOC] เอกสารสั่งอาหาร รอเซ็นอนุมัติ - ${payload.responsiblePerson || '-'}`,
        formType: 'FOOD_ORDER',
        data: payload,
        approveUrl,
        requesterSign: formData.ordererSign,
      });
    } else {
      alert(`ส่งเอกสารเรียบร้อย! / Submitted!\nปลายทาง / To: ${head.name}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-serif overflow-x-auto">
      {/* Menu Bar */}
      <div className="max-w-[850px] mx-auto mb-6 flex justify-between items-center bg-white p-4 rounded-xl shadow-md border border-blue-100 print:hidden">
        <div className="flex items-center gap-3">
          <div className="bg-orange-600 p-2 rounded-lg text-white">
            <FileText size={24} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 leading-none">แบบการสั่งอาหารเพื่อลูกค้า / Food Order for Customer</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1 font-sans tracking-tighter">
              Food Request for Customer / Visitor
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              if (window.opener) {
                window.close();
              } else {
                window.location.href = '/';
              }
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-sans font-semibold text-xs tracking-wide"
          >
            ← กลับหน้าหลัก / Back
          </button>
          <button
            type="button"
            onClick={handleSend}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg font-bold transition-all shadow-md active:scale-95"
          >
            <Send size={18} /> ส่งให้ / Send
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-slate-800 hover:bg-black text-white px-6 py-2 rounded-lg font-bold transition-all shadow-md active:scale-95"
          >
            <Printer size={18} /> พิมพ์ / Print PDF
          </button>
        </div>
      </div>

      {/* A4 Paper */}
      <div className="max-w-[850px] mx-auto bg-white p-[50px] shadow-2xl print:shadow-none print:p-0 min-h-[1050px] border border-gray-200 relative text-black leading-relaxed overflow-hidden">
        {/* Header Section */}
        <div className="flex justify-between items-start mb-2">
          <div className="w-1/4"></div>
          <div className="w-3/4 flex flex-col items-end">
            <div className="flex items-center gap-4 mb-4">
              <div className="text-right">
                <h1 className="text-[18px] font-bold">บริษัท ทีบีเคเค (ประเทศไทย) จำกัด</h1>
                <p className="text-[13px] font-bold">TBKK ( Thailand ) Co., Ltd.</p>
              </div>
              <div className="border-[3px] border-black rounded-full w-16 h-16 flex items-center justify-center">
                <span className="text-2xl font-black italic tracking-tighter">BIKK</span>
              </div>
            </div>
            <div className="w-full text-center pr-20">
              <h2 className="text-[16px] font-bold underline underline-offset-4">
                แบบการสั่งอาหารเพื่อลูกค้า / ผู้มาติดต่อ
              </h2>
              <p className="text-[13px] font-bold italic mt-1">( Food request for Customer / Visitor )</p>
            </div>
          </div>
        </div>

        {/* Top Info */}
        <div className="mt-8 space-y-3 text-[14px]">
          <div className="flex items-end gap-2">
            <span className="font-bold whitespace-nowrap">ชื่อผู้รับรอง :</span>
            <input
              type="text"
              className="flex-grow border-b border-black border-dotted outline-none bg-transparent px-2"
              value={formData.responsiblePerson}
              onChange={(e) => setFormData({ ...formData, responsiblePerson: e.target.value })}
            />
          </div>
          <div className="flex gap-4">
            <div className="flex items-end gap-2 flex-1">
              <span className="font-bold whitespace-nowrap">รหัสพนักงาน :</span>
              <input
                type="text"
                className="flex-grow border-b border-black border-dotted outline-none bg-transparent px-2"
                value={formData.employeeId}
                onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
              />
            </div>
            <div className="flex items-end gap-2 flex-1">
              <span className="font-bold whitespace-nowrap">ฝ่าย :</span>
              <input
                type="text"
                className="flex-grow border-b border-black border-dotted outline-none bg-transparent px-2"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex items-end gap-2 flex-1">
              <span className="font-bold whitespace-nowrap">วันที่สั่ง :</span>
              <input
                type="text"
                className="flex-grow border-b border-black border-dotted outline-none bg-transparent px-2"
                value={formData.orderDate}
                onChange={(e) => setFormData({ ...formData, orderDate: e.target.value })}
              />
            </div>
            <div className="flex items-end gap-2 flex-1">
              <span className="font-bold whitespace-nowrap">เวลา :</span>
              <input
                type="text"
                className="flex-grow border-b border-black border-dotted outline-none bg-transparent px-2"
                value={formData.orderTime}
                onChange={(e) => setFormData({ ...formData, orderTime: e.target.value })}
              />
            </div>
          </div>
          <p className="font-bold pt-2 tracking-tight">
            มีความประสงค์จะสั่งอาหารโดยเบิกเป็นค่าใช้จ่ายของบริษัทฯดังนี้
          </p>
        </div>

        {/* Main Table */}
        <table className="w-full border-collapse border-2 border-black text-[14px] mt-4">
          <thead>
            <tr>
              <th className="border-2 border-black p-2 w-[60px] text-center">ลำดับ</th>
              <th className="border-2 border-black p-2 text-center">
                รายละเอียด ( ชื่อบริษัทลูกค้า / ผู้มาติดต่อ )
              </th>
              <th className="border-2 border-black p-2 w-[100px] text-center">จำนวนคน</th>
              <th className="border-2 border-black p-2 w-[200px] text-center">เงื่อนไขพิเศษ</th>
            </tr>
          </thead>
          <tbody>
            {formData.rows.map((row, index) => (
              <tr key={row.id} className="h-12">
                <td className="border-2 border-black text-center font-bold">{index + 1}</td>
                <td className="border-2 border-black p-0">
                  <input
                    type="text"
                    className="w-full h-full px-2 border-none outline-none bg-transparent"
                    value={row.details}
                    onChange={(e) => updateRow(row.id, 'details', e.target.value)}
                  />
                </td>
                <td className="border-2 border-black p-0">
                  <input
                    type="text"
                    className="w-full h-full text-center border-none outline-none bg-transparent"
                    value={row.count}
                    onChange={(e) => updateRow(row.id, 'count', e.target.value)}
                  />
                </td>
                <td className="border-2 border-black p-0">
                  <input
                    type="text"
                    className="w-full h-full px-2 border-none outline-none bg-transparent"
                    value={row.condition}
                    onChange={(e) => updateRow(row.id, 'condition', e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer Grid */}
        <div className="mt-8 border-2 border-black flex h-[240px]">
          {/* Left Part */}
          <div className="w-3/5 border-r-2 border-black flex flex-col">
            <div className="p-2 border-b-2 border-black h-[100px] flex items-start">
              <span className="font-bold mr-2 text-[14px]">หมายเหตุ</span>
              <textarea
                className="flex-grow h-full border-none outline-none bg-transparent resize-none text-[13px]"
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              />
            </div>
            <div className="flex flex-1">
              <div className="w-1/2 border-r-2 border-black flex flex-col items-center justify-between p-2">
                <span className="font-bold text-[14px]">ชื่อผู้สั่ง</span>
                <div className="w-full h-14">
                  <SignaturePad
                    label="เซ็นชื่อ"
                    savedImage={formData.ordererSign}
                    onSave={(img) => setFormData({ ...formData, ordererSign: img })}
                  />
                </div>
              </div>
              <div className="w-1/2 flex flex-col items-center justify-between p-2">
                <span className="font-bold text-[14px]">ผู้จัดการฝ่าย</span>
                <div className="w-full h-14">
                  <SignaturePad
                    label="เซ็นชื่อ"
                    savedImage={formData.deptManagerSign}
                    onSave={(img) => setFormData({ ...formData, deptManagerSign: img })}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Part */}
          <div className="w-2/5 flex flex-col">
            <div className="flex-1 border-b-2 border-black flex items-center justify-center p-2 text-center">
              <span className="font-bold text-[15px]">ฝ่ายที่สั่ง</span>
            </div>
            <div className="flex-1 flex flex-col items-center justify-between p-2 text-center relative">
              <span className="font-bold text-[14px]">ฝ่ายบริหารงานทั่วไป</span>
              <div className="w-full h-14 mt-auto">
                <SignaturePad
                  label="ลงนามอนุมัติ"
                  savedImage={formData.generalAdminSign}
                  onSave={(img) => setFormData({ ...formData, generalAdminSign: img })}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Metadata Footer */}
        <div className="absolute bottom-6 left-12 right-12 flex justify-between items-center text-[10px] text-gray-400 font-sans tracking-tight">
          <div>TBKK-FR-002 (Rev.02)</div>
          <div className="italic">Printed via TBKK Food Management System</div>
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:ital,wght@0,400;0,700;1,400;1,700&display=swap');
        body { font-family: 'Sarabun', sans-serif; }
        @media print {
          @page { size: A4; margin: 0; }
          body { background: white !important; }
          .min-h-screen { background: white !important; padding: 0 !important; }
          .print\\\\:hidden { display: none !important; }
          .shadow-2xl { box-shadow: none !important; }
          .border-gray-200 { border: none !important; }
          input::placeholder { color: transparent !important; }
        }
      `,
        }}
      />
    </div>
  );
};

export default FoodOrderFormApp;

