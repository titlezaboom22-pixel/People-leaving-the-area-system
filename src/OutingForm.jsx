import React, { useState, useRef, useEffect } from 'react';
import { Printer, FileText, Eraser, CheckCircle2, Upload, PenTool, Send } from 'lucide-react';
import { createApprovalWorkflowRequest } from './approvalNotifications';
import { getHeadEmail, copyHtmlAndOpenOutlook, buildApproveUrl } from './emailHelper';
import { printOutingRequest } from './printDocument';

// --- ส่วนประกอบสำหรับวาดและอัปโหลดลายเซ็น (Advanced Signature Pad) ---
const SignaturePad = ({ onSave, savedImage, label }) => {
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(!savedImage);

  const getPosition = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const { x, y } = getPosition(e, canvas);

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const { x, y } = getPosition(e, canvas);

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
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = '#000080'; // สีน้ำเงินเข้ม
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }, [savedImage]);

  return (
    <div className="flex flex-col items-center group relative w-full h-full">
      <div className="relative w-full h-16 border-b border-black flex items-center justify-center overflow-hidden">
        {savedImage ? (
          <img
            src={savedImage}
            alt="signature"
            className="max-h-full max-w-full object-contain pointer-events-none"
          />
        ) : (
          <canvas
            ref={canvasRef}
            width={300}
            height={80}
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
            {label || 'คลิกเพื่อวาดหรืออัปโหลดลายเซ็น'}
          </div>
        )}

        {/* Floating Controls for UI (Hidden on Print) */}
        <div className="absolute top-0 right-0 flex gap-1 opacity-0 group-hover:opacity-100 transition print:hidden bg-white/80 rounded-bl-lg shadow-sm z-10">
          {!isEmpty && (
            <button type="button" onClick={clear} className="p-1 text-red-500 hover:bg-red-50" title="ล้าง">
              <Eraser size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            className="p-1 text-blue-600 hover:bg-blue-50"
            title="อัปโหลดไฟล์รูปภาพ"
          >
            <Upload size={14} />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/*"
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
};

// --- ตัวแอปฟอร์มใบออกนอกสถานที่ ---
const OutingFormApp = () => {
  const [formData, setFormData] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const name = params.get('name') || '';
    const staffId = params.get('staffId') || '';
    const dept = params.get('dept') || '';
    const rows = Array(4).fill(null).map((_, i) => ({ id: i + 1, name: i === 0 && name ? name : '', destination: '', timeOut: '', timeIn: '', acknowledgeSign: '' }));
    return {
      date: new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }),
      type: 'company',
      exitType: 'temporary',
      rows,
      managerName: name,
      department: dept,
      staffId: staffId,
      managerSign: null,
      approverSign: null,
      requesterSign: null,
      securitySign: null,
      note: '',
      totalCount: '',
      approverTitle: 'หน.แผนก ฝ่ายบริหารงานทั่วไป',
    };
  });

  const updateRow = (id, field, value) => {
    setFormData((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    }));
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

  const handleSend = async () => {
    const payload = {
      form: 'OUTING_REQUEST',
      date: formData.date || '',
      type: formData.type || '',
      exitType: formData.exitType || 'temporary',
      rows: formData.rows || [],
      totalCount: formData.totalCount || '',
      managerName: formData.managerName || '',
      managerSign: formData.managerSign || '',
      approverTitle: formData.approverTitle || '',
      approverSign: formData.approverSign || '',
      note: formData.note || '',
      sentAt: new Date().toISOString(),
    };

    const text =
      `ส่งคำขอ: ใบขออนุญาตออกนอกสถานที่ (TBKK)\n` +
      `วันที่: ${payload.date}\n` +
      `ประเภท: ${payload.type === 'personal' ? 'กิจส่วนตัว' : 'กิจบริษัท'}\n` +
      `จำนวนรวม: ${payload.totalCount || '-'}\n` +
      `\nรายการ:\n` +
      `${(payload.rows || [])
        .filter(r => (r.name || '').trim() || (r.destination || '').trim() || (r.timeOut || '').trim() || (r.timeIn || '').trim())
        .map((r, i) => `${i + 1}) ${r.name || '-'} | ไป: ${r.destination || '-'} | ออก: ${r.timeOut || '-'} | เข้า: ${r.timeIn || '-'}`)
        .join('\n') || '-'}` +
      `\n\nผู้อนุมัติ: ${payload.managerName || '-'} (${payload.approverTitle || '-'})` +
      `\nหมายเหตุ: ${payload.note || '-'}` +
      `\n\n---\nข้อมูล (JSON):\n${JSON.stringify(payload, null, 2)}`;

    let workflowItemId = null;
    try {
      workflowItemId = await createApprovalWorkflowRequest({
        topic: 'เอกสารขอออกนอกสถานที่ รอเซ็นอนุมัติ',
        requesterId: (formData.rows || []).find((r) => (r.name || '').trim())?.name || '-',
        requesterName: formData.managerName || '-',
        requesterDepartment: formData.department || '',
        sourceForm: 'OUTING_REQUEST',
        requestPayload: {
          date: payload.date,
          type: payload.type,
          totalCount: payload.totalCount,
          managerName: payload.managerName,
          approverTitle: payload.approverTitle,
          note: payload.note,
          requesterSign: formData.requesterSign || '',
          managerSign: formData.managerSign || '',
          rows: (payload.rows || []).map((r) => ({
            name: r.name,
            destination: r.destination,
            timeOut: r.timeOut,
            timeIn: r.timeIn,
          })),
        },
      });
    } catch (err) {
      console.error('Approval workflow error:', err);
    }
    printOutingRequest(payload);
    const approveUrl = workflowItemId ? buildApproveUrl(workflowItemId) : '';
    const headEmail = await getHeadEmail(formData.department || payload.department || '');
    if (headEmail) {
      await copyHtmlAndOpenOutlook({
        to: headEmail,
        subject: `[SOC] ใบขอออกนอกสถานที่ รอเซ็นอนุมัติ - ${formData.managerName || '-'}`,
        formType: 'OUTING_REQUEST',
        data: payload,
        approveUrl,
        requesterSign: formData.requesterSign,
      });
    } else {
      alert(`ส่งเอกสารเรียบร้อย!`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-serif overflow-x-auto">
      {/* Menu Bar (Hidden on Print) */}
      <div className="max-w-[850px] mx-auto mb-6 flex flex-wrap justify-between items-center bg-white p-4 rounded-xl shadow-md border border-blue-100 print:hidden">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg text-white">
            <FileText size={24} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 leading-none">ใบขออนุญาตออกนอกสถานที่</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1 font-sans">
              Digital Signature Ready
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-sans font-semibold text-xs tracking-wide"
          >
            ← กลับหน้าหลัก
          </button>
          <button
            type="button"
            onClick={handleSend}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg font-bold transition-all shadow-md active:scale-95"
          >
            <Send size={18} /> ส่งให้
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white px-6 py-2 rounded-lg font-bold transition-all shadow-md active:scale-95"
          >
            <Printer size={18} /> พิมพ์เอกสาร / PDF
          </button>
        </div>
      </div>

      {/* A4 Paper Container */}
      <div className="max-w-[850px] mx-auto bg-white p-[50px] shadow-2xl print:shadow-none print:p-0 min-h-[1050px] border border-gray-200 relative text-black leading-relaxed overflow-hidden">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-[22px] font-bold leading-tight">บริษัท ทีบีเคเค (ประเทศไทย) จำกัด</h1>
          <p className="text-[13px] font-semibold tracking-wider text-gray-600">TBKK ( Thailand ) Co., Ltd.</p>
          <div className="mt-4">
            <h2 className="text-[20px] font-bold underline underline-offset-8 decoration-2">
              ใบขออนุญาตออกนอกสถานที่
            </h2>
            <p className="text-[14px] italic font-medium mt-2 text-gray-500">( Onsite Permit Form )</p>
          </div>
        </div>

        {/* Date and Type Selection */}
        <div className="flex justify-between items-end mt-12 mb-4 text-[15px]">
          <div className="flex flex-wrap gap-x-10 gap-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={formData.type === 'company'}
                onChange={() => setFormData({ ...formData, type: 'company' })}
                className="w-4 h-4 accent-black"
              />
              <span className="font-bold">( / ) กิจบริษัท</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={formData.type === 'personal'}
                onChange={() => setFormData({ ...formData, type: 'personal' })}
                className="w-4 h-4 accent-black"
              />
              <span className="font-bold">( / ) กิจส่วนตัว</span>
            </label>
            <span className="font-bold text-slate-400">|</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={formData.exitType === 'temporary'}
                onChange={() => setFormData({ ...formData, exitType: 'temporary' })}
                className="w-4 h-4 accent-blue-600"
              />
              <span className="font-bold text-blue-700">ออกชั่วคราว</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={formData.exitType === 'permanent'}
                onChange={() => setFormData({ ...formData, exitType: 'permanent' })}
                className="w-4 h-4 accent-red-600"
              />
              <span className="font-bold text-red-700">ออกเลยไม่กลับ</span>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold">วันที่</span>
            <input
              type="text"
              className="w-48 border-b border-black border-dotted focus:outline-none text-center bg-transparent font-medium"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            />
          </div>
        </div>

        {/* Main Records Table */}
        <table className="w-full border-collapse border-[1.5px] border-black text-[14px] mt-2">
          <thead>
            <tr className="bg-slate-50 print:bg-transparent">
              <th className="border-[1.5px] border-black p-2 w-[50px] text-center font-bold">ลำดับ</th>
              <th className="border-[1.5px] border-black p-2 text-center w-[280px] font-bold">ชื่อ - นามสกุล</th>
              <th className="border-[1.5px] border-black p-2 text-center font-bold">สถานที่ไป</th>
              <th colSpan="2" className="border-[1.5px] border-black p-2 text-center w-[160px] font-bold">
                เวลา
              </th>
              <th className="border-[1.5px] border-black p-2 text-center w-[100px] font-bold">รับทราบ</th>
            </tr>
            <tr className="h-8">
              <th className="border-[1.5px] border-black"></th>
              <th className="border-[1.5px] border-black"></th>
              <th className="border-[1.5px] border-black"></th>
              <th className="border-[1.5px] border-black text-[11px] text-center font-bold uppercase tracking-tighter">
                ไป
              </th>
              <th className="border-[1.5px] border-black text-[11px] text-center font-bold uppercase tracking-tighter">
                กลับ
              </th>
              <th className="border-[1.5px] border-black"></th>
            </tr>
          </thead>
          <tbody>
            {formData.rows.map((row, index) => (
              <tr key={row.id} className="h-11">
                <td className="border-[1.5px] border-black text-center font-bold">{index + 1}</td>
                <td className="border-[1.5px] border-black px-2">
                  <input
                    type="text"
                    className="w-full border-none focus:outline-none bg-transparent"
                    value={row.name}
                    onChange={(e) => updateRow(row.id, 'name', e.target.value)}
                  />
                </td>
                <td className="border-[1.5px] border-black px-2">
                  <input
                    type="text"
                    className="w-full border-none focus:outline-none bg-transparent"
                    value={row.destination}
                    onChange={(e) => updateRow(row.id, 'destination', e.target.value)}
                  />
                </td>
                <td className="border-[1.5px] border-black px-2">
                  <input
                    type="time"
                    className="w-full border-none focus:outline-none text-center bg-transparent font-bold text-red-600"
                    value={row.timeOut}
                    onChange={(e) => updateRow(row.id, 'timeOut', e.target.value)}
                  />
                </td>
                <td className="border-[1.5px] border-black px-2">
                  <input
                    type="time"
                    className="w-full border-none focus:outline-none text-center bg-transparent font-bold text-green-600"
                    value={row.timeIn}
                    onChange={(e) => updateRow(row.id, 'timeIn', e.target.value)}
                  />
                </td>
                <td className="border-[1.5px] border-black px-1">
                  <input
                    type="text"
                    className="w-full border-none focus:outline-none text-center bg-transparent text-[11px] italic placeholder:text-gray-300"
                    value={row.acknowledgeSign}
                    onChange={(e) => updateRow(row.id, 'acknowledgeSign', e.target.value)}
                    placeholder="(ลงชื่อ)"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Form Footer / Approval Section */}
        <div className="mt-8 flex flex-col gap-8 text-[15px]">
          <div className="flex justify-between items-start gap-12">
            {/* Left Footer Column */}
            <div className="w-1/2 flex flex-col gap-6">
              <div className="flex flex-col">
                <span className="font-bold mb-1">หน.แผนก / ผู้จัดการฝ่าย:</span>
                <div className="px-4">
                  <SignaturePad
                    label="วาดหรืออัปโหลดลายเซ็นหัวหน้า"
                    savedImage={formData.managerSign}
                    onSave={(img) => setFormData({ ...formData, managerSign: img })}
                  />
                  <input
                    type="text"
                    className="w-full border-none focus:outline-none text-center mt-1 italic text-sm"
                    placeholder="(พิมพ์ชื่อ-นามสกุล หัวหน้า)"
                    value={formData.managerName}
                    onChange={(e) => setFormData({ ...formData, managerName: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex flex-col">
                <span className="font-bold mb-1">หมายเหตุ:</span>
                <div className="relative">
                  <div className="absolute left-0 right-0 top-[27px] border-b border-black border-dotted"></div>
                  <textarea
                    className="w-full focus:outline-none bg-transparent resize-none leading-[27px] min-h-[60px] relative z-10"
                    style={{ backgroundImage: 'none' }}
                    value={formData.note}
                    onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                    rows={2}
                    placeholder="ระบุเหตุผลหรือหมายเหตุอื่นๆ..."
                  />
                </div>
              </div>
            </div>

            {/* Right Footer Column */}
            <div className="w-1/2 flex flex-col gap-6">
              <div className="flex flex-col">
                <span className="font-bold mb-1">อนุมัติโดย:</span>
                <div className="px-4">
                  <SignaturePad
                    label="ลายเซ็นผู้อนุมัติ (ส่วนงานบริหาร)"
                    savedImage={formData.approverSign}
                    onSave={(img) => setFormData({ ...formData, approverSign: img })}
                  />
                </div>
                <input
                  type="text"
                  className="w-full border-none focus:outline-none text-center text-[12px] mt-1 font-bold"
                  value={formData.approverTitle}
                  onChange={(e) => setFormData({ ...formData, approverTitle: e.target.value })}
                />
              </div>

              {/* Security Section Box */}
              <div className="border-[1.5px] border-black p-3 rounded-sm bg-slate-50/50 print:bg-transparent">
                <p className="font-bold underline text-[12px] mb-3">รปภ. บันทึกเวลา</p>
                <div className="flex justify-around items-center">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">ไป:</span>
                    <input
                      type="text"
                      className="w-16 border-b border-black border-dotted text-center outline-none bg-transparent"
                      placeholder="...."
                    />
                    <span className="font-bold text-xs uppercase">น.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">กลับ:</span>
                    <input
                      type="text"
                      className="w-16 border-b border-black border-dotted text-center outline-none bg-transparent"
                      placeholder="...."
                    />
                    <span className="font-bold text-xs uppercase">น.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Totals & Signature Lines */}
          <div className="flex justify-between items-end mt-4">
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg">รวม:</span>
              <input
                type="text"
                className="w-20 border-b-2 border-black text-center focus:outline-none bg-transparent font-bold text-lg"
                value={formData.totalCount}
                onChange={(e) => setFormData({ ...formData, totalCount: e.target.value })}
                placeholder="0"
              />
              <span className="font-bold text-lg">คน</span>
            </div>

            <div className="flex gap-16 mr-6 text-center">
              <div className="flex flex-col items-center min-w-[150px]">
                <div className="w-full">
                  <SignaturePad
                    label="ลงลายเซ็นผู้ขอ"
                    savedImage={formData.requesterSign}
                    onSave={(img) => setFormData({ ...formData, requesterSign: img })}
                  />
                </div>
                <span className="text-[12px] font-bold mt-1">ลงชื่อ.......................(ผู้ขอ)</span>
              </div>
              <div className="flex flex-col items-center min-w-[150px]">
                <div className="w-full">
                  <SignaturePad
                    label="รปภ. รับทราบ"
                    savedImage={formData.securitySign}
                    onSave={(img) => setFormData({ ...formData, securitySign: img })}
                  />
                </div>
                <span className="text-[12px] font-bold mt-1">ลงชื่อ.......................(รปภ.)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Metadata */}
        <div className="absolute bottom-6 left-12 right-12 flex justify-between items-center text-[10px] text-slate-400 font-sans">
          <div>FM-ADM-001 (Rev.01)</div>
          <div className="italic tracking-wider">
            TBKK (THAILAND) CO., LTD. | ONSITE PERMIT DIGITAL SYSTEM
          </div>
        </div>
      </div>

      {/* Styling Overrides for Web & Print */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:ital,wght@0,400;0,700;1,400;1,700&display=swap');
        
        body { 
          font-family: 'Sarabun', sans-serif; 
          -webkit-print-color-adjust: exact;
        }

        @media print {
          @page { size: A4; margin: 0; }
          body { background: white !important; }
          .min-h-screen { background: white !important; padding: 0 !important; }
          .print\\\\:hidden { display: none !important; }
          .shadow-2xl, .shadow-md { box-shadow: none !important; }
          .border-gray-200 { border: none !important; }
          input::placeholder { color: transparent !important; }
          input { border-bottom: none !important; }
          .border-dotted { border-bottom-style: dotted !important; }
          canvas { display: none !important; }
          img { display: block !important; margin: 0 auto; }
        }

        .group:hover canvas {
          background-color: rgba(0, 0, 0, 0.02);
        }
      `,
        }}
      />
    </div>
  );
};

export default OutingFormApp;

