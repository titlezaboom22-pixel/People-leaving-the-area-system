import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Printer, Trash2, Calculator, Coffee, Utensils, ClipboardCheck, MapPin,
  CheckSquare, Square, Send, X, Eraser, Upload,
} from 'lucide-react';
import { createApprovalWorkflowRequest } from './approvalNotifications';

// =================== Menu definitions (prices match TBKK canteen / To Be Coffee) ===================

const FOOD_ITEMS = [
  // category, menu, options (proteins), defaultPrice
  { category: 'Stir-Fried (ผัด)',     menu: 'กระเพรา (Basil Stir Fry)',            options: ['หมู', 'ไก่'], defaultPrice: 40 },
  { category: 'Stir-Fried (ผัด)',     menu: 'ผัดพริกแกง (Chili Paste Stir Fry)',    options: ['หมู', 'ไก่'], defaultPrice: 40 },
  { category: 'Stir-Fried (ผัด)',     menu: 'ผัดผัก (Stir-Fried Vegetables)',       options: [],           defaultPrice: 40 },
  { category: 'Stir-Fried (ผัด)',     menu: 'ผัดกระเทียม (Garlic Stir Fry)',        options: ['หมู', 'ไก่'], defaultPrice: 40 },
  { category: 'Soup & Curry (ต้ม/แกง)', menu: 'ต้มจืด (Clear Soup)',                 options: ['หมู', 'ไก่'], defaultPrice: 45 },
  { category: 'Soup & Curry (ต้ม/แกง)', menu: 'ต้มยำ (Tom Yum)',                     options: ['หมู', 'ไก่'], defaultPrice: 50 },
  { category: 'Soup & Curry (ต้ม/แกง)', menu: 'เกาเหลา (Soup with Meat)',            options: ['หมู', 'ไก่'], defaultPrice: 45 },
  { category: 'Soup & Curry (ต้ม/แกง)', menu: 'ต้มข่าไก่ (Chicken Coconut Soup)',     options: ['ไก่'],       defaultPrice: 50 },
  { category: 'Fried (ทอด)',          menu: 'ทอด (Fried Dish)',                    options: ['หมู', 'ไก่'], defaultPrice: 45 },
];

const BEVERAGE_ITEMS = [
  { menu: 'กาแฟ (Coffee)',            type: 'กาแฟดำ (Americano)',           defaultPrice: 40 },
  { menu: 'กาแฟ (Coffee)',            type: 'เอสเปรสโซ (Espresso)',          defaultPrice: 40 },
  { menu: 'กาแฟ (Coffee)',            type: 'ลาเต้ (Latte)',                 defaultPrice: 45 },
  { menu: 'กาแฟ (Coffee)',            type: 'คาปูชิโน่ (Cappuccino)',         defaultPrice: 45 },
  { menu: 'กาแฟ (Coffee)',            type: 'มอคค่า (Mocha)',                defaultPrice: 45 },
  { menu: 'ชา (Tea)',                 type: 'ชาเขียว (Green Tea)',           defaultPrice: 40 },
  { menu: 'ชา (Tea)',                 type: 'ชาไทย (Thai Tea)',              defaultPrice: 40 },
  { menu: 'ชา (Tea)',                 type: 'ชาพีช (Peach Tea)',             defaultPrice: 40 },
  { menu: 'เครื่องดื่มอื่นๆ (Others)', type: 'เลมอนโซดา (Lemon Soda)',       defaultPrice: 35 },
  { menu: 'เครื่องดื่มอื่นๆ (Others)', type: 'แดงโซดา (Red Soda)',            defaultPrice: 35 },
  { menu: 'เครื่องดื่มอื่นๆ (Others)', type: 'แดงโซดามะนาว (Red Soda Lime)',  defaultPrice: 35 },
  { menu: 'เครื่องดื่มอื่นๆ (Others)', type: 'บลูฮาวายโซดา (Blue Hawaii Soda)', defaultPrice: 35 },
  { menu: 'เครื่องดื่มอื่นๆ (Others)', type: 'บลูเบอรี่โซดา (Blueberry Soda)', defaultPrice: 35 },
  { menu: 'เครื่องดื่มอื่นๆ (Others)', type: 'พีชโซดา (Peach Soda)',          defaultPrice: 35 },
];

const LOCATIONS = [
  'โรงอาหาร (Canteen)',
  'ห้องออดิทอเรียม (ซ้าย) (Auditorium - Left)',
  'ห้องออดิทอเรียม (ขวา) (Auditorium - Right)',
  'ห้องราชพฤกษ์ (Ratchapruek Room)',
  'ห้องจันทบุรี (Chanthaburi Room)',
  'ห้องระยอง (Rayong Room)',
  'ห้องชลบุรี (Chonburi Room)',
  'ห้องสุวรรณภูมิ (Suvarnabhumi Room)',
  'ห้องกรุงเทพ (Bangkok Room)',
  'ห้อง R1 (Room R1)',
  'ห้อง R2 (Room R2)',
];

const PURPOSES = [
  'อบรม (Training)',
  'ลูกค้า (Customer)',
  'ซัพพลายเออร์ (Supplier)',
  'หน่วยงานราชการ (Government)',
  'อื่นๆ (Others)',
];

// =================== Signature pad (same as other forms) ===================
const SignaturePad = ({ onSave, savedImage, label }) => {
  const canvasRef = useRef(null);
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
    if (canvasRef.current) onSave(canvasRef.current.toDataURL('image/png'));
  };

  const clear = (e) => {
    e?.stopPropagation?.();
    onSave(null);
    setIsEmpty(true);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const upload = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
      onSave(ev.target.result);
      setIsEmpty(false);
    };
    r.readAsDataURL(f);
    // reset so selecting the same file again still fires onChange
    e.target.value = '';
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#1e3a8a';
    if (savedImage) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = savedImage;
      setIsEmpty(false);
    }
  }, [savedImage]);

  return (
    <div className="w-full">
      <div className="relative w-full aspect-[3/1] border-2 border-dashed border-slate-300 rounded-xl bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="w-full h-full touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={endDrawing}
          onMouseLeave={endDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={endDrawing}
        />
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-300 text-sm pointer-events-none">
            {label || 'วาดลายเซ็นที่นี่ / Draw signature here'}
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center gap-3 flex-wrap">
        <label className="cursor-pointer text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 border border-indigo-200 px-2 py-1 rounded-md bg-white hover:bg-indigo-50 font-medium">
          <Upload size={14} /> อัปโหลดลายเซ็น / Upload
          <input type="file" className="hidden" onChange={upload} accept="image/*" />
        </label>
        {!isEmpty && (
          <button
            type="button"
            onClick={clear}
            className="text-xs text-slate-500 hover:text-rose-600 flex items-center gap-1"
          >
            <Eraser size={14} /> ล้างลายเซ็น / Clear
          </button>
        )}
      </div>
    </div>
  );
};

// =================== Main form ===================

const CompanyOrderForm = () => {
  const [formData, setFormData] = useState(() => {
    // Read URL params for auto-fill
    const params = new URLSearchParams(window.location.search);
    return {
      requesterName: params.get('name') || '',
      employeeId: params.get('staffId') || '',
      department: params.get('dept') || '',
      date: new Date().toISOString().split('T')[0],
      time: '',
      location: '',
      purpose: '',
      purposeOther: '',
      foodItems: FOOD_ITEMS.map(x => ({ ...x, proteins: [], qty: 0, price: x.defaultPrice })),
      externalCatering: { name: '', details: '' },
      beverages: BEVERAGE_ITEMS.map(x => ({ ...x, qty: 0, price: x.defaultPrice })),
      requesterSign: null,
      note: '',
    };
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null); // { ok, msg }

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const toggleProtein = (itemIndex, protein) => {
    const newFoodItems = [...formData.foodItems];
    const currentProteins = newFoodItems[itemIndex].proteins;
    newFoodItems[itemIndex].proteins = currentProteins.includes(protein)
      ? currentProteins.filter(p => p !== protein)
      : [...currentProteins, protein];
    setFormData(prev => ({ ...prev, foodItems: newFoodItems }));
  };

  const handleItemChange = (index, field, value, type = 'food') => {
    const listName = type === 'food' ? 'foodItems' : 'beverages';
    const newList = [...formData[listName]];
    newList[index][field] = field === 'qty' || field === 'price' ? parseFloat(value) || 0 : value;
    setFormData(prev => ({ ...prev, [listName]: newList }));
  };

  const totalFoodCost = useMemo(
    () => formData.foodItems.reduce((a, it) => a + (it.qty * it.price), 0),
    [formData.foodItems]
  );
  const totalBevCost = useMemo(
    () => formData.beverages.reduce((a, it) => a + (it.qty * it.price), 0),
    [formData.beverages]
  );
  const grandTotal = totalFoodCost + totalBevCost;

  const handlePrint = () => window.print();

  const resetForm = () => {
    if (window.confirm('คุณต้องการล้างข้อมูลทั้งหมดใช่หรือไม่?')) window.location.reload();
  };

  // --- Submit handler: save Firestore + create workflow ---
  const handleSubmit = async () => {
    setSubmitResult(null);

    // Validate
    if (!formData.requesterName.trim()) {
      setSubmitResult({ ok: false, msg: 'กรุณากรอกชื่อผู้ขอ / Please enter requester name' });
      return;
    }
    if (!formData.employeeId.trim()) {
      setSubmitResult({ ok: false, msg: 'กรุณากรอกรหัสพนักงาน / Please enter employee ID' });
      return;
    }
    if (!formData.department.trim()) {
      setSubmitResult({ ok: false, msg: 'กรุณาเลือก/กรอกแผนก / Please select/enter department' });
      return;
    }

    const selectedFood = formData.foodItems.filter(it => it.qty > 0);
    const selectedBev = formData.beverages.filter(it => it.qty > 0);
    const hasExternal = (formData.externalCatering.name || '').trim() || (formData.externalCatering.details || '').trim();

    if (selectedFood.length === 0 && selectedBev.length === 0 && !hasExternal) {
      setSubmitResult({ ok: false, msg: 'กรุณาสั่งอาหารหรือเครื่องดื่มอย่างน้อย 1 รายการ / Please order at least 1 food or drink item' });
      return;
    }

    if (!formData.location) {
      setSubmitResult({ ok: false, msg: 'กรุณาเลือกสถานที่จัด / Please select location' });
      return;
    }

    if (!formData.purpose) {
      setSubmitResult({ ok: false, msg: 'กรุณาเลือกวัตถุประสงค์ / Please select purpose' });
      return;
    }

    setSubmitting(true);

    try {
      // Build rows in the shape expected by GAView
      const foodRows = selectedFood.map(it => ({
        menu: it.menu,
        category: it.category,
        proteins: it.proteins,
        qty: it.qty,
        unitPrice: it.price,
        lineTotal: it.qty * it.price,
      }));

      const drinkRows = selectedBev.map(it => ({
        name: it.type,
        menu: it.menu,
        category: it.menu, // for compatibility
        temp: 'เย็น',
        qty: it.qty,
        unitPrice: it.price,
        lineTotal: it.qty * it.price,
      }));

      const purposeText = formData.purpose === 'อื่นๆ (Others)'
        ? `อื่นๆ: ${formData.purposeOther || '-'}`
        : formData.purpose;

      // Decide workflow type
      const hasFood = foodRows.length > 0 || hasExternal;
      const hasDrink = drinkRows.length > 0;

      let sourceForm;
      let topic;
      let payload;

      const base = {
        responsiblePerson: formData.requesterName.trim(),
        employeeId: formData.employeeId.trim().toUpperCase(),
        department: formData.department.trim(),
        orderDate: formData.date,
        orderTime: formData.time,
        location: formData.location,
        purpose: purposeText,
        ordererSign: formData.requesterSign || null,
        externalCatering: hasExternal ? formData.externalCatering : null,
        note: formData.note || '',
      };

      if (hasFood && hasDrink) {
        sourceForm = 'DRINK_FOOD_ORDER';
        topic = 'เอกสารสั่งเครื่องดื่มและอาหาร - GA รับออเดอร์';
        payload = {
          ...base,
          drinkRows,
          foodRows,
          drinkTotalAmount: totalBevCost,
          foodTotalAmount: totalFoodCost,
          totalAmount: grandTotal,
        };
      } else if (hasFood) {
        sourceForm = 'FOOD_ORDER';
        topic = 'เอกสารสั่งอาหาร - GA รับออเดอร์';
        payload = {
          ...base,
          rows: foodRows,
          totalAmount: totalFoodCost,
        };
      } else {
        sourceForm = 'DRINK_ORDER';
        topic = 'เอกสารสั่งเครื่องดื่ม - GA รับออเดอร์';
        payload = {
          ...base,
          rows: drinkRows,
          totalAmount: totalBevCost,
        };
      }

      const workflowId = await createApprovalWorkflowRequest({
        topic,
        requesterId: base.employeeId || '-',
        requesterName: base.responsiblePerson || '-',
        requesterDepartment: base.department || '',
        sourceForm,
        requestPayload: payload,
      });

      setSubmitResult({
        ok: true,
        msg: `✅ ส่งคำขอสำเร็จ — GA จะรับออเดอร์และแจ้งเมลกลับให้คุณ (อ้างอิง: ${workflowId?.slice(-8) || '-'})`,
      });

      // Optional: auto-reload after 3s
      setTimeout(() => {
        if (window.confirm('ล้างฟอร์มเพื่อสั่งใบใหม่?')) window.location.reload();
      }, 2000);
    } catch (err) {
      console.error('Submit error:', err);
      setSubmitResult({ ok: false, msg: 'ส่งคำขอไม่สำเร็จ: ' + err.message });
    }

    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-xl rounded-2xl overflow-hidden print:shadow-none print:m-0 border border-slate-200">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 p-8 text-white flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-center md:text-left">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">แบบฟอร์มขออาหารและเครื่องดื่มบริษัท</h1>
            <p className="text-blue-100 text-lg opacity-90">Company Food &amp; Beverage Request Form</p>
          </div>
          <div className="flex gap-2 print:hidden">
            <button onClick={resetForm} className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors border border-white/20">
              <Trash2 size={18} /> ล้างข้อมูล
            </button>
            <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-white/90 hover:bg-white text-blue-900 rounded-lg transition-colors font-semibold shadow">
              <Printer size={18} /> พิมพ์ / PDF
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors font-semibold shadow-lg disabled:opacity-60"
            >
              <Send size={18} />
              {submitting ? 'กำลังส่ง...' : 'ส่งคำขอ (Submit)'}
            </button>
          </div>
        </div>

        {/* Result banner */}
        {submitResult && (
          <div className={`p-4 border-b ${submitResult.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            <div className="flex items-start gap-3 max-w-5xl mx-auto">
              <div className="font-black text-xs uppercase tracking-widest">
                {submitResult.ok ? '✓' : '✗'}
              </div>
              <div className="flex-1 text-sm font-semibold">{submitResult.msg}</div>
              <button onClick={() => setSubmitResult(null)} className="text-slate-400 hover:text-slate-900"><X size={16} /></button>
            </div>
          </div>
        )}

        <div className="p-8 space-y-10">

          {/* Section 1: Requester */}
          <section className="space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <ClipboardCheck className="text-blue-600" size={24} />
              <h2 className="text-xl font-bold text-slate-800">1. ผู้ขอ / Requester</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อ-นามสกุล (Name-Surname)</label>
                <input type="text" name="requesterName" value={formData.requesterName} onChange={handleInputChange} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">รหัสพนักงาน (Employee ID)</label>
                <input type="text" name="employeeId" value={formData.employeeId} onChange={handleInputChange} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none uppercase font-mono" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">แผนก (Department)</label>
                <input type="text" name="department" value={formData.department} onChange={handleInputChange} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            </div>
          </section>

          {/* Section 2: Date & Time */}
          <section className="space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <MapPin className="text-blue-600" size={24} />
              <h2 className="text-xl font-bold text-slate-800">2. วัน-เวลา / Date &amp; Time</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">วันที่ (Date)</label>
                <input type="date" name="date" value={formData.date} onChange={handleInputChange} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">เวลา (Time)</label>
                <input type="time" name="time" value={formData.time} onChange={handleInputChange} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            </div>
          </section>

          {/* Section 3: Location */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <MapPin className="text-blue-600" size={24} />
              <h2 className="text-xl font-bold text-slate-800">3. สถานที่จัด / Location</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {LOCATIONS.map((loc) => (
                <label key={loc} className="flex items-center gap-2 p-3 border border-slate-100 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                  <input type="radio" name="location" value={loc} checked={formData.location === loc} onChange={handleInputChange} className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-slate-700">{loc}</span>
                </label>
              ))}
            </div>
          </section>

          {/* Section 4: Purpose */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <ClipboardCheck className="text-blue-600" size={24} />
              <h2 className="text-xl font-bold text-slate-800">4. วัตถุประสงค์ / Purpose</h2>
            </div>
            <div className="flex flex-wrap gap-4 items-center">
              {PURPOSES.map((p) => (
                <label key={p} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="purpose" value={p} checked={formData.purpose === p} onChange={handleInputChange} className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-slate-700">{p}</span>
                </label>
              ))}
              {formData.purpose === 'อื่นๆ (Others)' && (
                <input type="text" name="purposeOther" value={formData.purposeOther} onChange={handleInputChange} placeholder="โปรดระบุ / Please specify" className="p-2 border-b border-slate-300 focus:border-blue-500 outline-none flex-1 min-w-[200px]" />
              )}
            </div>
          </section>

          {/* Section 5: Food Menu */}
          <section className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <Utensils className="text-orange-500" size={24} />
                <h2 className="text-xl font-bold text-slate-800">5. ประเภทอาหาร / Food Menu</h2>
              </div>
              <div className="text-sm text-slate-500 italic">ข้ามไปข้อ 6 หากไม่มีการสั่งอาหาร / Skip to #6 if no food order</div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="p-4 text-sm font-semibold text-slate-600">เมนู (Menu)</th>
                    <th className="p-4 text-sm font-semibold text-slate-600">เนื้อสัตว์ (Protein)</th>
                    <th className="p-4 text-sm font-semibold text-slate-600 w-24">จำนวน (Qty)</th>
                    <th className="p-4 text-sm font-semibold text-slate-600 w-32">ราคา (Price)</th>
                    <th className="p-4 text-sm font-semibold text-slate-600 w-32">รวม (Total)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {formData.foodItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="p-4 text-sm font-medium text-slate-700 align-top pt-5">
                        <div className="text-[11px] text-slate-400 font-normal">{item.category}</div>
                        {item.menu}
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-x-6 gap-y-2 max-w-xs">
                          {item.options.length === 0 ? (
                            <span className="text-xs text-slate-400 italic">—</span>
                          ) : item.options.map((option) => (
                            <label key={option} className="flex items-center gap-2 cursor-pointer group whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={item.proteins.includes(option)}
                                onChange={() => toggleProtein(idx, option)}
                                className="hidden"
                              />
                              {item.proteins.includes(option) ? (
                                <CheckSquare size={18} className="text-blue-600" />
                              ) : (
                                <Square size={18} className="text-slate-300 group-hover:text-blue-400" />
                              )}
                              <span className={`text-sm ${item.proteins.includes(option) ? 'text-blue-700 font-bold' : 'text-slate-600'}`}>{option}</span>
                            </label>
                          ))}
                        </div>
                      </td>
                      <td className="p-4 align-top pt-4">
                        <input type="number" min="0" value={item.qty} onChange={(e) => handleItemChange(idx, 'qty', e.target.value)} className="w-full p-1 border border-slate-200 rounded text-center" />
                      </td>
                      <td className="p-4 align-top pt-4">
                        <input type="number" min="0" value={item.price} onChange={(e) => handleItemChange(idx, 'price', e.target.value)} className="w-full p-1 border border-slate-200 rounded text-center" />
                      </td>
                      <td className="p-4 text-right font-semibold text-slate-700 align-top pt-5">{(item.qty * item.price).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col md:flex-row justify-between items-start gap-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="space-y-4 w-full md:w-1/2">
                <h3 className="font-bold text-slate-800">5.5 สั่งร้านภายนอก / External Catering</h3>
                <div className="space-y-2">
                  <input type="text" placeholder="ชื่อร้าน (Restaurant Name)" value={formData.externalCatering.name} onChange={(e) => setFormData(p => ({ ...p, externalCatering: { ...p.externalCatering, name: e.target.value } }))} className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                  <textarea placeholder="รายละเอียดเมนู (Menu Details)" value={formData.externalCatering.details} onChange={(e) => setFormData(p => ({ ...p, externalCatering: { ...p.externalCatering, details: e.target.value } }))} className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 h-20" />
                </div>
              </div>
              <div className="w-full md:w-auto text-right">
                <div className="text-slate-500 text-sm mb-1 uppercase tracking-wider font-bold">รวมราคาอาหาร / Total Food Cost</div>
                <div className="text-3xl font-bold text-blue-700">{totalFoodCost.toLocaleString()} <span className="text-lg">บาท (THB)</span></div>
              </div>
            </div>
          </section>

          {/* Section 6: Beverages */}
          <section className="space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <Coffee className="text-amber-700" size={24} />
              <h2 className="text-xl font-bold text-slate-800">6. ประเภทเครื่องดื่ม / Beverages</h2>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="p-4 text-sm font-semibold text-slate-600">เมนู (Menu)</th>
                    <th className="p-4 text-sm font-semibold text-slate-600">ประเภท (Type)</th>
                    <th className="p-4 text-sm font-semibold text-slate-600 w-24">จำนวน (Qty)</th>
                    <th className="p-4 text-sm font-semibold text-slate-600 w-32">ราคา (Price)</th>
                    <th className="p-4 text-sm font-semibold text-slate-600 w-32">รวม (Total)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {formData.beverages.map((item, idx) => {
                    // Color-code each row by beverage category
                    const cat = item.menu.startsWith('กาแฟ')
                      ? { row: 'bg-amber-50/40 hover:bg-amber-100/60',   border: 'border-l-4 border-amber-500',   text: 'text-amber-900',   badge: 'bg-amber-100 text-amber-800 border-amber-300' }
                      : item.menu.startsWith('ชา')
                      ? { row: 'bg-emerald-50/40 hover:bg-emerald-100/60', border: 'border-l-4 border-emerald-500', text: 'text-emerald-900', badge: 'bg-emerald-100 text-emerald-800 border-emerald-300' }
                      : { row: 'bg-rose-50/40 hover:bg-rose-100/60',     border: 'border-l-4 border-rose-500',    text: 'text-rose-900',    badge: 'bg-rose-100 text-rose-800 border-rose-300' };
                    return (
                      <tr key={idx} className={`${cat.row} transition-colors`}>
                        <td className={`p-4 text-xs font-semibold ${cat.border}`}>
                          <span className={`inline-block px-2 py-1 rounded-md border ${cat.badge}`}>{item.menu}</span>
                        </td>
                        <td className={`p-4 text-sm font-medium ${cat.text}`}>{item.type}</td>
                        <td className="p-4">
                          <input type="number" min="0" value={item.qty} onChange={(e) => handleItemChange(idx, 'qty', e.target.value, 'bev')} className="w-full p-1 border border-slate-200 rounded text-center bg-white" />
                        </td>
                        <td className="p-4">
                          <input type="number" min="0" value={item.price} onChange={(e) => handleItemChange(idx, 'price', e.target.value, 'bev')} className="w-full p-1 border border-slate-200 rounded text-center bg-white" />
                        </td>
                        <td className={`p-4 text-right font-semibold ${cat.text}`}>{(item.qty * item.price).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-blue-50/50">
                    <td colSpan="4" className="p-4 text-right font-bold text-blue-800">รวมราคาเครื่องดื่ม / Total Beverage Cost</td>
                    <td className="p-4 text-right font-bold text-blue-800">{totalBevCost.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Grand Total */}
          <div className="p-6 bg-blue-700 text-white rounded-2xl flex flex-col md:flex-row justify-between items-center gap-4 shadow-lg shadow-blue-200">
            <div className="text-lg md:text-xl font-bold flex items-center gap-2">
              <Calculator size={28} /> สรุปยอดรวมทั้งสิ้น / Grand Total
            </div>
            <div className="text-4xl font-extrabold">{grandTotal.toLocaleString()} <span className="text-xl font-normal">บาท (THB)</span></div>
          </div>

          {/* Note */}
          <section className="space-y-3">
            <label className="block text-sm font-semibold text-slate-700">หมายเหตุเพิ่มเติม / Additional Note</label>
            <textarea
              name="note"
              value={formData.note}
              onChange={handleInputChange}
              className="w-full p-3 border border-slate-300 rounded-xl h-24 outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="เช่น งดผัก, เผ็ดน้อย, ห่อแยก... / e.g. no vegetables, less spicy..."
            />
          </section>

          {/* Section 7: Requester Signature */}
          <div className="pt-6 border-t border-slate-200">
            <div className="p-6 border border-slate-200 rounded-2xl bg-white space-y-4 max-w-xl">
              <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-2">
                <ClipboardCheck size={20} className="text-emerald-500" /> ผู้ขอ / Requester
              </h3>
              <SignaturePad
                savedImage={formData.requesterSign}
                onSave={(dataUrl) => setFormData(p => ({ ...p, requesterSign: dataUrl }))}
                label="วาดลายเซ็นผู้ขอที่นี่ / Draw requester's signature here"
              />
            </div>
          </div>

          {/* Mobile submit bar */}
          <div className="md:hidden print:hidden flex gap-2">
            <button onClick={resetForm} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold border border-slate-200">
              <Trash2 size={18} /> ล้าง
            </button>
            <button onClick={handlePrint} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-100 hover:bg-blue-200 text-blue-900 rounded-xl font-semibold">
              <Printer size={18} /> พิมพ์
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-[2] flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black shadow-lg disabled:opacity-60"
            >
              <Send size={18} />
              {submitting ? 'กำลังส่ง...' : 'ส่งคำขอ'}
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="bg-slate-50 p-6 border-t border-slate-200 text-center text-slate-500 text-xs">
          เอกสารนี้สร้างขึ้นโดยระบบ Company Food &amp; Beverage Request System — กรุณาตรวจสอบความถูกต้องก่อนส่ง
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { background: white !important; }
          .bg-slate-50 { background: white !important; }
          .shadow-xl { box-shadow: none !important; }
          .rounded-2xl { border-radius: 0 !important; }
          input, textarea { border-bottom: 1px solid #ccc !important; border-top: 0; border-left: 0; border-right: 0; border-radius: 0; }
          button { display: none !important; }
          .print\\:hidden { display: none !important; }
        }
      `}} />
    </div>
  );
};

export default CompanyOrderForm;
