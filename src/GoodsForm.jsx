import React, { useState, useRef, useEffect } from 'react';
import { Truck, FileText, Send, Plus, Trash2, ImagePlus, X } from 'lucide-react';
import { createApprovalWorkflowRequest } from './approvalNotifications';
import { getHeadEmail, copyHtmlAndOpenOutlook, buildApproveUrl } from './emailHelper';
import { printGoodsInOut } from './printDocument';

function getHeadByDepartment(dept) {
  const key = (dept || '').toString().trim().toUpperCase();
  return { name: `หัวหน้าแผนก ${key || '-'}` };
}

const emptyLine = () => ({
  description: '',
  qty: '1',
  unit: 'ชิ้น',
  photos: [], // { dataUrl: string, name: string }[]
});

/** ลดขนาดรูปก่อนเก็บใน state / JSON (คัดลอกส่ง LINE) */
function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result;
      if (typeof dataUrl !== 'string') {
        reject(new Error('read failed'));
        return;
      }
      const img = new Image();
      img.onload = () => {
        const maxW = 1280;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > maxW) {
          h = Math.round((h * maxW) / w);
          w = maxW;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('image load failed'));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error('file read failed'));
    reader.readAsDataURL(file);
  });
}

const GoodsFormApp = () => {
  const [form, setForm] = useState({
    direction: 'IN',
    docNo: '',
    gate: 'ประตู 1',
    carrierName: '',
    staffId: '',
    dept: '',
    vehiclePlate: '',
    sealNo: '',
    deliveryDate: '',
    deliveryTime: '',
    note: '',
    lines: [emptyLine(), emptyLine()],
    carrierSign: '', // ลายเซ็นผู้นำของ (base64)
  });
  // Auto-fill from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const name = params.get('name');
    const staffId = params.get('staffId');
    const dept = params.get('dept');
    if (name || staffId || dept) {
      setForm(prev => ({
        ...prev,
        ...(name && { carrierName: name }),
        ...(staffId && { staffId }),
        ...(dept && { dept }),
      }));
    }
  }, []);

  const [uploading, setUploading] = useState(false);
  const fileInputRefs = useRef({});
  const signCanvasRef = useRef(null);
  const signDrawingRef = useRef(false);
  const signFileRef = useRef(null);

  // --- Signature functions ---
  const startSign = (e) => {
    signDrawingRef.current = true;
    const canvas = signCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    ctx.beginPath();
    ctx.moveTo(x * (canvas.width / rect.width), y * (canvas.height / rect.height));
  };
  const drawSign = (e) => {
    if (!signDrawingRef.current) return;
    const canvas = signCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#000';
    ctx.lineTo(x * (canvas.width / rect.width), y * (canvas.height / rect.height));
    ctx.stroke();
    e.preventDefault();
  };
  const endSign = () => {
    signDrawingRef.current = false;
    const canvas = signCanvasRef.current;
    if (canvas) setForm(prev => ({ ...prev, carrierSign: canvas.toDataURL() }));
  };
  const clearSign = () => {
    const canvas = signCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setForm(prev => ({ ...prev, carrierSign: '' }));
  };
  const uploadSign = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setForm(prev => ({ ...prev, carrierSign: ev.target.result }));
      const img = new Image();
      img.onload = () => {
        const canvas = signCanvasRef.current;
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

  const handleBack = () => {
    if (window.opener) {
      window.close();
    } else {
      window.location.href = '/';
    }
  };

  const setLine = (idx, key, value) => {
    setForm((prev) => {
      const lines = [...prev.lines];
      lines[idx] = { ...lines[idx], [key]: value };
      return { ...prev, lines };
    });
  };

  const addLine = () => setForm((prev) => ({ ...prev, lines: [...prev.lines, emptyLine()] }));

  const removeLine = (idx) => {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.length > 1 ? prev.lines.filter((_, i) => i !== idx) : prev.lines,
    }));
  };

  const addPhotosToLine = async (lineIdx, fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    setUploading(true);
    try {
      const newPhotos = [];
      for (const file of files) {
        try {
          const dataUrl = await compressImageFile(file);
          newPhotos.push({ dataUrl, name: file.name || 'photo.jpg' });
        } catch {
          /* skip broken file */
        }
      }
      setForm((prev) => {
        const lines = [...prev.lines];
        const line = { ...lines[lineIdx] };
        line.photos = [...(line.photos || []), ...newPhotos];
        lines[lineIdx] = line;
        return { ...prev, lines };
      });
    } finally {
      setUploading(false);
    }
  };

  const removePhotoFromLine = (lineIdx, photoIdx) => {
    setForm((prev) => {
      const lines = [...prev.lines];
      const line = { ...lines[lineIdx] };
      line.photos = (line.photos || []).filter((_, i) => i !== photoIdx);
      lines[lineIdx] = line;
      return { ...prev, lines };
    });
  };

  const handleSend = async () => {
    const head = getHeadByDepartment(form.dept);
    const payload = {
      form: 'GOODS_IN_OUT',
      ...form,
      targetHead: head.name,
      // เก็บรูปเป็น data URL ใน JSON (สำหรับส่งต่อ/บันทึก) — ข้อความอาจยาวมากถ้ามีหลายรูป
      sentAt: new Date().toISOString(),
    };
    const dirLabel = form.direction === 'IN' ? 'นำของเข้า' : 'นำของออก';
    const linesText = form.lines
      .filter((l) => (l.description || '').trim() || (l.photos && l.photos.length))
      .map((l, i) => {
        const n = (l.photos || []).length;
        const photoNote = n ? ` [แนบรูปชิ้นงาน ${n} ภาพ]` : '';
        return `${i + 1}. ${(l.description || '(ไม่ระบุชื่อ)').trim()} — จำนวน ${l.qty || '-'} ${l.unit || ''}${photoNote}`;
      })
      .join('\n');

    const totalPhotos = form.lines.reduce((acc, l) => acc + (l.photos?.length || 0), 0);

    const text =
      `ส่งคำขอ: นำของเข้า / ของออก (TBKK)\n` +
      `ประเภท: ${dirLabel}\n` +
      (form.docNo ? `เลขที่เอกสาร/ใบนำของ: ${form.docNo}\n` : '') +
      `จุดประตู: ${form.gate}\n` +
      `ผู้นำของ / ผู้รับผิดชอบ: ${form.carrierName || '-'}\n` +
      `รหัสพนักงาน: ${form.staffId || '-'}\n` +
      `แผนก: ${form.dept || '-'}\n` +
      `ส่งถึง: ${head.name}\n` +
      `ทะเบียนรถ (ถ้ามี): ${form.vehiclePlate || '-'}\n` +
      (form.sealNo ? `เลข Seal: ${form.sealNo}\n` : '') +
      (form.deliveryDate ? `วันที่รับ/ส่งสินค้า: ${form.deliveryDate}\n` : '') +
      (form.deliveryTime ? `เวลารับ/ส่งสินค้า: ${form.deliveryTime}\n` : '') +
      `\nรายการสินค้า:\n${linesText || '-'}\n` +
      (totalPhotos ? `\n(รวมรูปชิ้นงานทั้งหมด ${totalPhotos} ภาพ — ดูใน JSON ด้านล่าง หรือแนบรูปจากหน้าจอแยก)\n` : '') +
      (form.note ? `\nหมายเหตุ: ${form.note}\n` : '') +
      `\n---\nข้อมูล (JSON):\n${JSON.stringify(payload, null, 2)}`;

    const jsonLen = JSON.stringify(payload).length;
    if (jsonLen > 900_000) {
      const ok = window.confirm(
        `ข้อมูลรวมรูปมีขนาดใหญ่มาก (~${Math.round(jsonLen / 1000)} KB) การคัดลอกอาจล้มเหลวหรือช้า ต้องการดำเนินการต่อหรือไม่?`
      );
      if (!ok) return;
    }

    let workflowItemId = null;
    try {
      workflowItemId = await createApprovalWorkflowRequest({
        topic: 'เอกสารนำของเข้า/ออก รอเซ็นอนุมัติ',
        requesterId: form.staffId || '-',
        requesterName: form.carrierName || '-',
        requesterDepartment: form.dept || '',
        sourceForm: 'GOODS_IN_OUT',
        requestPayload: {
          direction: form.direction,
          gate: form.gate,
          docNo: form.docNo,
          sealNo: form.sealNo,
          carrierName: form.carrierName,
          staffId: form.staffId,
          dept: form.dept,
          vehiclePlate: form.vehiclePlate,
          deliveryDate: form.deliveryDate,
          deliveryTime: form.deliveryTime,
          note: form.note,
          lines: form.lines.map((l) => ({
            description: l.description,
            qty: l.qty,
            unit: l.unit,
            photosCount: (l.photos || []).length,
            photos: (l.photos || []).map((p) => p.dataUrl),
          })),
          carrierSign: form.carrierSign || '',
        },
      });
    } catch (err) {
      console.error('Approval workflow error:', err);
    }
    printGoodsInOut(form);
    const approveUrl = workflowItemId ? buildApproveUrl(workflowItemId) : '';
    const headEmail = await getHeadEmail(form.dept);
    if (headEmail) {
      await copyHtmlAndOpenOutlook({
        to: headEmail,
        subject: `[SOC] เอกสารนำของเข้า/ออก รอเซ็นอนุมัติ - ${form.carrierName || '-'}`,
        formType: 'GOODS_IN_OUT',
        data: form,
        approveUrl,
      });
    } else {
      alert(`ส่งเอกสารเรียบร้อย!\nปลายทาง: ${head.name}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans text-slate-800">
      <div className="max-w-5xl mx-auto mb-6 bg-white border border-slate-200 rounded-2xl shadow-sm p-4 md:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-amber-600 text-white p-2 rounded-xl">
            <Truck size={22} />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">
              แบบฟอร์มนำของเข้า / ของออก
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              กรอกข้อมูลเพื่อแจ้ง รปภ. / ฝ่ายที่เกี่ยวข้อง — แนบรูปชิ้นงานได้ต่อรายการ
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold"
          >
            ← กลับหน้าหลัก
          </button>
          {form.lines.every(l => !l.photos || l.photos.length === 0) && (
            <span className="text-[11px] text-orange-600 font-bold flex items-center gap-1">⚠️ ยังไม่ได้แนบรูปสินค้า</span>
          )}
          <button
            type="button"
            onClick={handleSend}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-sm active:scale-95 transition disabled:opacity-60"
          >
            <Send size={16} /> ส่งให้
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-8">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <FileText size={18} className="text-slate-500" />
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-700">
            รายละเอียดการนำของ
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-xs font-bold text-slate-500">
            ประเภท
            <select
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:ring-2 focus:ring-amber-200 outline-none"
              value={form.direction}
              onChange={(e) => setForm({ ...form, direction: e.target.value })}
            >
              <option value="IN">นำของเข้า</option>
              <option value="OUT">นำของออก</option>
            </select>
          </label>
          <label className="text-xs font-bold text-slate-500">
            จุดประตู / ทางเข้า
            <select
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50"
              value={form.gate}
              onChange={(e) => setForm({ ...form, gate: e.target.value })}
            >
              <option value="ประตู 1">ประตู 1</option>
              <option value="ประตู 2">ประตู 2</option>
              <option value="ประตู 3">ประตู 3</option>
              <option value="ประตูหลัก">ประตูหลัก</option>
            </select>
          </label>
          <label className="text-xs font-bold text-slate-500">
            เลขที่เอกสาร / ใบนำของ (ถ้ามี)
            <input
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 font-mono"
              value={form.docNo}
              onChange={(e) => setForm({ ...form, docNo: e.target.value })}
            />
          </label>
          <label className="text-xs font-bold text-slate-500">
            เลข Seal (ถ้ามี)
            <input
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 font-mono"
              value={form.sealNo}
              onChange={(e) => setForm({ ...form, sealNo: e.target.value })}
            />
          </label>
          <label className="text-xs font-bold text-slate-500">
            ชื่อผู้นำของ / ผู้รับผิดชอบ
            <input
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50"
              value={form.carrierName}
              onChange={(e) => setForm({ ...form, carrierName: e.target.value })}
              required
            />
          </label>
          <label className="text-xs font-bold text-slate-500">
            รหัสพนักงาน (ถ้ามี)
            <input
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 font-mono uppercase"
              value={form.staffId}
              onChange={(e) => setForm({ ...form, staffId: e.target.value })}
            />
          </label>
          <label className="text-xs font-bold text-slate-500 md:col-span-2">
            แผนก
            <input
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50"
              value={form.dept}
              onChange={(e) => setForm({ ...form, dept: e.target.value })}
            />
          </label>
          <label className="text-xs font-bold text-slate-500 md:col-span-2">
            ทะเบียนรถขนส่ง (ถ้ามี)
            <input
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 font-mono uppercase"
              value={form.vehiclePlate}
              onChange={(e) => setForm({ ...form, vehiclePlate: e.target.value })}
              placeholder="เช่น กข 1234"
            />
          </label>
          <label className="text-xs font-bold text-slate-500">
            วันที่รับ/ส่งสินค้า
            <input
              type="date"
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50"
              value={form.deliveryDate}
              onChange={(e) => setForm({ ...form, deliveryDate: e.target.value })}
            />
          </label>
          <label className="text-xs font-bold text-slate-500">
            เวลารับ/ส่งสินค้า
            <input
              type="time"
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50"
              value={form.deliveryTime}
              onChange={(e) => setForm({ ...form, deliveryTime: e.target.value })}
            />
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-600">
              รายการสินค้า (แนบรูปชิ้นงานได้ต่อรายการ)
            </p>
            <button
              type="button"
              onClick={addLine}
              className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-900"
            >
              <Plus size={14} /> เพิ่มแถว
            </button>
          </div>
          <div className="space-y-4">
            {form.lines.map((line, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_88px_100px_auto] gap-2 items-end">
                  <label className="text-[10px] font-bold text-slate-400 sm:col-span-1">
                    รายการ
                    <input
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white"
                      value={line.description}
                      onChange={(e) => setLine(idx, 'description', e.target.value)}
                      placeholder="ชื่อ/รายละเอียดสินค้า"
                    />
                  </label>
                  <label className="text-[10px] font-bold text-slate-400">
                    จำนวน
                    <input
                      type="number"
                      min="0"
                      step="any"
                      className="mt-1 w-full border border-slate-200 rounded-xl px-2 py-2 text-sm bg-white"
                      value={line.qty}
                      onChange={(e) => setLine(idx, 'qty', e.target.value)}
                    />
                  </label>
                  <label className="text-[10px] font-bold text-slate-400">
                    หน่วย
                    <input
                      className="mt-1 w-full border border-slate-200 rounded-xl px-2 py-2 text-sm bg-white"
                      value={line.unit}
                      onChange={(e) => setLine(idx, 'unit', e.target.value)}
                      placeholder="ชิ้น, กล่อง"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-600 hover:border-red-100 justify-self-end"
                    title="ลบแถว"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="pt-1 border-t border-slate-200/80">
                  <p className="text-[10px] font-bold text-slate-500 mb-2 flex items-center gap-1.5">
                    <ImagePlus size={12} className="text-amber-600" />
                    รูปภาพชิ้นงาน (นำเข้า / นำออก)
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={(el) => {
                        fileInputRefs.current[idx] = el;
                      }}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        addPhotosToLine(idx, e.target.files);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => fileInputRefs.current[idx]?.click()}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-amber-300 bg-amber-50/80 text-amber-900 text-[11px] font-bold hover:bg-amber-100 transition disabled:opacity-50"
                    >
                      <ImagePlus size={14} />
                      {uploading ? 'กำลังประมวลผล...' : 'เลือกรูป / ถ่ายรูป'}
                    </button>
                    <span className="text-[10px] text-slate-400">
                      {(line.photos || []).length} ภาพ
                    </span>
                  </div>
                  {(line.photos || []).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(line.photos || []).map((ph, pIdx) => (
                        <div
                          key={`${idx}-${pIdx}`}
                          className="relative group w-24 h-24 rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm"
                        >
                          <img
                            src={ph.dataUrl}
                            alt={ph.name || `รูป ${pIdx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removePhotoFromLine(idx, pIdx)}
                            className="absolute top-1 right-1 p-1 rounded-lg bg-black/60 text-white opacity-0 group-hover:opacity-100 transition hover:bg-red-600"
                            title="ลบรูป"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <label className="text-xs font-bold text-slate-500 block">
          หมายเหตุเพิ่มเติม
          <textarea
            className="mt-1 w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm bg-slate-50 min-h-[88px] focus:ring-2 focus:ring-amber-200 outline-none"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="เช่น เวลานัดรับ, ข้อควรระวังในการตรวจ"
          />
        </label>

        {/* ลายเซ็นผู้นำของ */}
        <div className="pt-4 border-t border-slate-200">
          <h3 className="text-sm font-black text-slate-700 mb-3">ลายเซ็นผู้นำของ (Prepare)</h3>
          <div className="flex gap-2 mb-2">
            <button type="button" onClick={() => signFileRef.current?.click()} className="px-3 py-1.5 text-xs font-bold bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200">📁 อัปโหลดลายเซ็น</button>
            <button type="button" onClick={clearSign} className="px-3 py-1.5 text-xs font-bold bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200">ล้าง</button>
            <input ref={signFileRef} type="file" accept="image/*" className="hidden" onChange={uploadSign} />
          </div>
          <p className="text-[10px] text-slate-400 mb-1">หรือวาดด้วยนิ้ว/เมาส์:</p>
          <canvas
            ref={signCanvasRef}
            width={400}
            height={100}
            className="border-2 border-slate-200 rounded-xl w-full bg-slate-50 cursor-crosshair"
            style={{ height: 100, touchAction: 'none' }}
            onMouseDown={startSign}
            onMouseMove={drawSign}
            onMouseUp={endSign}
            onMouseLeave={endSign}
            onTouchStart={startSign}
            onTouchMove={drawSign}
            onTouchEnd={endSign}
          />
          {form.carrierSign && <p className="text-[10px] text-emerald-600 font-bold mt-1">✅ ลายเซ็นพร้อมส่ง</p>}
        </div>
      </div>
    </div>
  );
};

export default GoodsFormApp;
