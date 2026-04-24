import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Printer, Trash2, Calculator, Coffee, Utensils, ClipboardCheck, MapPin,
  CheckSquare, Square, Send, X, Eraser, Upload, Plus, Minus,
} from 'lucide-react';
import { createApprovalWorkflowRequest } from './approvalNotifications';

// =================== Menu definitions (prices match TBKK canteen / To Be Coffee) ===================

const FOOD_ITEMS = [
  // type = เซ็ต ฿40 (ข้าว + กับข้าว 3 อย่าง · ร้านจัดให้)
  { category: 'เซ็ต (Set Menu)',          categoryType: 'B', menu: 'กระเพรา',      menuEn: 'Basil Stir Fry',         options: ['หมู', 'ไก่', 'ทะเล', 'เนื้อ'], spicyOptions: ['เผ็ด', 'ไม่เผ็ด'], defaultPrice: 40 },
  { category: 'เซ็ต (Set Menu)',          categoryType: 'B', menu: 'ผัดพริกแกง',   menuEn: 'Chili Paste Stir Fry',   options: ['หมู', 'ไก่', 'ทะเล', 'เนื้อ'], spicyOptions: ['เผ็ด', 'ไม่เผ็ด'], defaultPrice: 40 },
  { category: 'เซ็ต (Set Menu)',          categoryType: 'B', menu: 'ผัดผัก',        menuEn: 'Stir-Fried Vegetables',  options: ['หมู', 'ไก่', 'ทะเล'],          spicyOptions: [],                  defaultPrice: 40 },
  { category: 'เซ็ต (Set Menu)',          categoryType: 'B', menu: 'หมูกระเทียม',  menuEn: 'Garlic Pork',            options: ['หมู'],                          spicyOptions: [],                  defaultPrice: 40 },
  // type = จานเดียว ฿30 (1 จาน · สั่งทีละอย่าง)
  { category: 'จานเดียว (Single Dish)',   categoryType: 'A', menu: 'กระเพรา',      menuEn: 'Basil Stir Fry',         options: ['หมู', 'ไก่', 'ทะเล', 'เนื้อ'], spicyOptions: ['เผ็ด', 'ไม่เผ็ด'], defaultPrice: 30 },
  { category: 'จานเดียว (Single Dish)',   categoryType: 'A', menu: 'ผัดพริกแกง',   menuEn: 'Chili Paste Stir Fry',   options: ['หมู', 'ไก่', 'ทะเล', 'เนื้อ'], spicyOptions: ['เผ็ด', 'ไม่เผ็ด'], defaultPrice: 30 },
  { category: 'จานเดียว (Single Dish)',   categoryType: 'A', menu: 'ผัดผัก',        menuEn: 'Stir-Fried Vegetables',  options: ['หมู', 'ไก่', 'ทะเล'],          spicyOptions: [],                  defaultPrice: 30 },
  { category: 'จานเดียว (Single Dish)',   categoryType: 'A', menu: 'หมูกระเทียม',  menuEn: 'Garlic Pork',            options: ['หมู'],                          spicyOptions: [],                  defaultPrice: 30 },
];

// Spicy level (professional)
const SPICY_META = {
  'เผ็ด':    { label: 'เผ็ด',    en: 'Spicy',     color: 'bg-white text-slate-700 border-slate-300 hover:border-slate-500', active: 'bg-slate-800 text-white border-slate-800' },
  'ไม่เผ็ด': { label: 'ไม่เผ็ด', en: 'Not spicy', color: 'bg-white text-slate-700 border-slate-300 hover:border-slate-500', active: 'bg-slate-800 text-white border-slate-800' },
};

// Egg options
const EGG_OPTIONS = ['ไข่ดาว', 'ไข่เจียว', 'ไข่ดาวไม่สุก'];
const EGG_META = {
  'ไข่ดาว':         { label: 'ไข่ดาว',         en: 'Fried Egg',   color: 'bg-white text-slate-700 border-slate-300 hover:border-slate-500', active: 'bg-slate-800 text-white border-slate-800' },
  'ไข่เจียว':        { label: 'ไข่เจียว',       en: 'Omelette',    color: 'bg-white text-slate-700 border-slate-300 hover:border-slate-500', active: 'bg-slate-800 text-white border-slate-800' },
  'ไข่ดาวไม่สุก':    { label: 'ไข่ดาวไม่สุก',  en: 'Sunny-Side Up', color: 'bg-white text-slate-700 border-slate-300 hover:border-slate-500', active: 'bg-slate-800 text-white border-slate-800' },
};

// Allergy options (พบบ่อยในประเทศไทย + อื่นๆ ให้กรอกเอง)
const ALLERGY_OPTIONS = [
  { key: 'ถั่ว',              en: 'Nuts' },
  { key: 'กุ้ง/ปู/หอย',      en: 'Shellfish' },
  { key: 'ปลา',               en: 'Fish' },
  { key: 'ไข่',               en: 'Egg' },
  { key: 'ถั่วเหลือง',        en: 'Soy' },
  { key: 'แป้งสาลี/กลูเตน',   en: 'Wheat / Gluten' },
  { key: 'งา',                 en: 'Sesame' },
  { key: 'ผงชูรส (MSG)',      en: 'MSG' },
  { key: 'ผักชี',             en: 'Cilantro' },
  { key: 'เผ็ด/พริก',         en: 'Chili / Spicy' },
];

// Protein options (professional style — no emojis in pills)
const PROTEIN_META = {
  'หมู':  { label: 'หมู',   en: 'Pork',    color: 'bg-white text-slate-700 border-slate-300 hover:border-slate-500',   active: 'bg-slate-800 text-white border-slate-800' },
  'ไก่':  { label: 'ไก่',   en: 'Chicken', color: 'bg-white text-slate-700 border-slate-300 hover:border-slate-500',   active: 'bg-slate-800 text-white border-slate-800' },
  'ทะเล': { label: 'ทะเล', en: 'Seafood', color: 'bg-white text-slate-700 border-slate-300 hover:border-slate-500',   active: 'bg-slate-800 text-white border-slate-800' },
  'เนื้อ': { label: 'เนื้อ', en: 'Beef',    color: 'bg-white text-slate-700 border-slate-300 hover:border-slate-500',   active: 'bg-slate-800 text-white border-slate-800' },
};

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
      orderType: '', // 'A' = จานเดียว, 'B' = เซ็ต
      bevCategory: '', // 'coffee' | 'tea' | 'others'
      foodItems: FOOD_ITEMS.map(x => ({ ...x, proteins: [], spicy: [], egg: [], hasAllergy: false, allergies: [], allergyOther: '', allergyNote: '', qty: 0, price: x.defaultPrice })),
      beverages: [], // cart-style: [{menu, type, temp, qty, price, defaultPrice}]
      requesterSign: null,
      note: '',
    };
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null); // { ok, msg }
  const [foodModalIdx, setFoodModalIdx] = useState(null); // index ของเมนูที่เปิด modal

  // Draft สำหรับเพิ่มเครื่องดื่มลงรายการ (dropdown flow)
  const [bevDraft, setBevDraft] = useState({ menuIdx: '', temp: '', qty: 1 });

  // helper: กาแฟ/ชา ต้องเลือกอุณหภูมิ, อื่นๆ (โซดา) ไม่ต้อง
  const needsTemp = (menu) => menu?.startsWith('กาแฟ') || menu?.startsWith('ชา');

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

  const toggleSpicy = (itemIndex, level) => {
    const newFoodItems = [...formData.foodItems];
    // spicy เลือกได้ทีละ 1 (radio-like)
    newFoodItems[itemIndex].spicy = newFoodItems[itemIndex].spicy?.[0] === level ? [] : [level];
    setFormData(prev => ({ ...prev, foodItems: newFoodItems }));
  };

  const toggleEgg = (itemIndex, eggType) => {
    const newFoodItems = [...formData.foodItems];
    // egg เลือกได้ทีละ 1 (radio-like) กดซ้ำ = ยกเลิก
    newFoodItems[itemIndex].egg = newFoodItems[itemIndex].egg?.[0] === eggType ? [] : [eggType];
    setFormData(prev => ({ ...prev, foodItems: newFoodItems }));
  };

  const toggleHasAllergy = (itemIndex) => {
    const newFoodItems = [...formData.foodItems];
    const next = !newFoodItems[itemIndex].hasAllergy;
    newFoodItems[itemIndex].hasAllergy = next;
    if (!next) {
      newFoodItems[itemIndex].allergies = [];
      newFoodItems[itemIndex].allergyOther = '';
      newFoodItems[itemIndex].allergyNote = '';
    }
    setFormData(prev => ({ ...prev, foodItems: newFoodItems }));
  };

  const toggleAllergy = (itemIndex, allergy) => {
    const newFoodItems = [...formData.foodItems];
    const current = newFoodItems[itemIndex].allergies || [];
    newFoodItems[itemIndex].allergies = current.includes(allergy)
      ? current.filter(a => a !== allergy)
      : [...current, allergy];
    setFormData(prev => ({ ...prev, foodItems: newFoodItems }));
  };

  const setAllergyField = (itemIndex, field, value) => {
    const newFoodItems = [...formData.foodItems];
    newFoodItems[itemIndex][field] = value;
    setFormData(prev => ({ ...prev, foodItems: newFoodItems }));
  };

  const addBevToCart = () => {
    const mi = bevDraft.menuIdx;
    if (mi === '' || mi === null || mi === undefined) {
      setSubmitResult({ ok: false, msg: 'กรุณาเลือกเมนูก่อน / Please select a menu' });
      return;
    }
    const src = BEVERAGE_ITEMS[Number(mi)];
    if (!src) return;
    if (needsTemp(src.menu) && !bevDraft.temp) {
      setSubmitResult({ ok: false, msg: 'กรุณาเลือกอุณหภูมิก่อน / Please select temperature' });
      return;
    }
    const qty = Math.max(1, Number(bevDraft.qty) || 1);
    setFormData(p => ({
      ...p,
      beverages: [
        ...p.beverages,
        {
          menu: src.menu,
          type: src.type,
          temp: bevDraft.temp || (needsTemp(src.menu) ? 'เย็น' : '-'),
          qty,
          price: src.defaultPrice,
          defaultPrice: src.defaultPrice,
        },
      ],
    }));
    // reset draft
    setBevDraft({ menuIdx: '', temp: '', qty: 1 });
    setSubmitResult(null);
  };

  const removeBevFromCart = (idx) => {
    setFormData(p => ({
      ...p,
      beverages: p.beverages.filter((_, i) => i !== idx),
    }));
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

    if (selectedFood.length === 0 && selectedBev.length === 0) {
      setSubmitResult({ ok: false, msg: 'กรุณาสั่งอาหารหรือเครื่องดื่มอย่างน้อย 1 รายการ / Please order at least 1 food or drink item' });
      return;
    }

    // ตรวจ: ถ้าสั่งกาแฟ/ชา ต้องเลือกอุณหภูมิ
    const missingTemp = selectedBev.find(it => needsTemp(it.menu) && !it.temp);
    if (missingTemp) {
      setSubmitResult({ ok: false, msg: `กรุณาเลือกอุณหภูมิ (ร้อน/เย็น) ของ "${missingTemp.type}" / Please select temperature` });
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
      const foodRows = selectedFood.map(it => {
        const allergens = it.hasAllergy
          ? [...(it.allergies || []), (it.allergyOther || '').trim()].filter(Boolean)
          : [];
        return {
          menu: it.menu,
          category: it.category,
          proteins: it.proteins,
          spicy: it.spicy || [],
          egg: it.egg || [],
          hasAllergy: !!it.hasAllergy,
          allergies: allergens,
          allergyNote: it.hasAllergy ? (it.allergyNote || '').trim() : '',
          qty: it.qty,
          unitPrice: it.price,
          lineTotal: it.qty * it.price,
        };
      });

      const drinkRows = selectedBev.map(it => ({
        name: it.type,
        menu: it.menu,
        category: it.menu, // for compatibility
        temp: it.temp || (needsTemp(it.menu) ? 'เย็น' : '-'),
        qty: it.qty,
        unitPrice: it.price,
        lineTotal: it.qty * it.price,
      }));

      const purposeText = formData.purpose === 'อื่นๆ (Others)'
        ? `อื่นๆ: ${formData.purposeOther || '-'}`
        : formData.purpose;

      // Decide workflow type
      const hasFood = foodRows.length > 0;
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
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <Utensils className="text-orange-500" size={24} />
                <h2 className="text-xl font-bold text-slate-800">5. ประเภทอาหาร / Food Menu</h2>
              </div>
              <div className="text-xs text-slate-500 italic hidden sm:block">ข้ามไปข้อ 6 ถ้าไม่สั่ง</div>
            </div>

            {/* Section 5.5 — เลือก จานเดียว / เซ็ต (professional radio) */}
            <div className="border border-slate-200 rounded-md overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5">
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">5.5 ประเภทการสั่งอาหาร <span className="text-red-500">*</span></p>
              </div>
              <div className="divide-y divide-slate-100">
                <label className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition ${formData.orderType === 'A' ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
                  <input
                    type="radio"
                    name="orderType"
                    value="A"
                    checked={formData.orderType === 'A'}
                    onChange={(e) => setFormData(p => ({ ...p, orderType: e.target.value }))}
                    className="w-4 h-4 accent-slate-900"
                  />
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${formData.orderType === 'A' ? 'text-slate-900' : 'text-slate-700'}`}>A. จานเดียว</p>
                    <p className="text-[11px] text-slate-500">Single Dish · ราคา ฿30 / จาน</p>
                  </div>
                  <span className="text-sm font-bold text-slate-900">฿30</span>
                </label>
                <label className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition ${formData.orderType === 'B' ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
                  <input
                    type="radio"
                    name="orderType"
                    value="B"
                    checked={formData.orderType === 'B'}
                    onChange={(e) => setFormData(p => ({ ...p, orderType: e.target.value }))}
                    className="w-4 h-4 accent-slate-900"
                  />
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${formData.orderType === 'B' ? 'text-slate-900' : 'text-slate-700'}`}>B. เซ็ต</p>
                    <p className="text-[11px] text-slate-500">Set Menu · ราคา ฿40 · ข้าว + กับข้าว 3 อย่าง</p>
                  </div>
                  <span className="text-sm font-bold text-slate-900">฿40</span>
                </label>
              </div>
              {!formData.orderType && (
                <div className="px-4 py-2 bg-amber-50 border-t border-amber-200">
                  <p className="text-[11px] text-amber-800">กรุณาเลือกประเภทก่อนเลือกเมนู</p>
                </div>
              )}
            </div>

            {/* Food categories — professional grid */}
            {formData.orderType && (() => {
              const wantType = formData.orderType;
              const filtered = formData.foodItems
                .map((item, idx) => ({ item, idx }))
                .filter(({ item }) => item.categoryType === wantType);
              if (filtered.length === 0) return null;
              const cat = filtered[0].item.category;
              return (
                <div className="space-y-3">
                  <div className="flex items-baseline justify-between pb-2 border-b border-slate-200">
                    <h3 className="text-sm font-bold text-slate-800">{cat}</h3>
                    <span className="text-[11px] text-slate-500">{filtered.length} รายการ</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                    {filtered.map(({ item, idx }) => {
                      const total = item.qty * item.price;
                      const isActive = item.qty > 0;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setFoodModalIdx(idx)}
                          className={`relative bg-white border rounded-md overflow-hidden transition text-left hover:shadow-sm active:scale-[0.99] ${
                            isActive ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200 hover:border-slate-400'
                          }`}
                        >
                          {isActive && (
                            <div className="absolute top-2 right-2 min-w-[22px] h-[22px] px-1.5 rounded-sm bg-slate-900 text-white font-bold text-[11px] flex items-center justify-center">
                              ×{item.qty}
                            </div>
                          )}
                          {item.hasAllergy && (
                            <div className="absolute top-2 left-2 h-[22px] px-1.5 rounded-sm bg-red-600 text-white font-bold text-[10px] flex items-center gap-0.5 shadow-sm">
                              <span>⚠️</span><span>แพ้</span>
                            </div>
                          )}
                          <div className="p-3.5">
                            <h4 className="font-semibold text-slate-900 text-sm leading-tight">{item.menu}</h4>
                            <p className="text-[10px] text-slate-500 mt-0.5">{item.menuEn}</p>
                            <div className="flex items-baseline justify-between mt-3 pt-2 border-t border-slate-100">
                              <span className="text-base font-bold text-slate-900">฿{item.price}</span>
                              {isActive ? (
                                <span className="text-[11px] font-semibold text-slate-700">รวม ฿{total.toLocaleString()}</span>
                              ) : (
                                <span className="text-[10px] text-slate-400 uppercase tracking-wider">Select</span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Food Detail Modal (Professional / Business style) */}
            {foodModalIdx !== null && formData.foodItems[foodModalIdx] && (() => {
              const item = formData.foodItems[foodModalIdx];
              const idx = foodModalIdx;
              return (
                <div className="fixed inset-0 z-[120] bg-slate-900/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setFoodModalIdx(null)}>
                  <div className="bg-white rounded-t-xl sm:rounded-lg w-full sm:max-w-lg max-h-[95vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200" onClick={(e) => e.stopPropagation()}>
                    {/* Header — clean navy bar */}
                    <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.15em] text-slate-400 font-semibold">{item.category.replace(/^[^\s]+\s/, '')}</p>
                        <h3 className="text-lg font-bold leading-tight">{item.menu}</h3>
                        <p className="text-xs text-slate-400">{item.menuEn}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFoodModalIdx(null)}
                        className="w-8 h-8 rounded-md hover:bg-white/10 text-white flex items-center justify-center transition"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                      {/* Price row */}
                      <div className="flex items-baseline justify-between pb-3 border-b border-slate-200">
                        <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Price</span>
                        <span className="text-2xl font-bold text-slate-900">฿{item.price.toLocaleString()}</span>
                      </div>

                      {/* Proteins */}
                      {item.options.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">เนื้อสัตว์ / Protein <span className="text-red-500">*</span></p>
                            <span className="text-[10px] text-slate-400">เลือกได้หลายรายการ</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            {item.options.map((opt) => {
                              const meta = PROTEIN_META[opt] || {};
                              const picked = item.proteins.includes(opt);
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => toggleProtein(idx, opt)}
                                  className={`flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium border transition ${
                                    picked ? meta.active : meta.color
                                  }`}
                                >
                                  <span>{meta.label}</span>
                                  <span className="text-[10px] opacity-60 uppercase">{meta.en}</span>
                                  {picked && <span className="ml-1">✓</span>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Spicy level */}
                      {item.spicyOptions && item.spicyOptions.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">ระดับเผ็ด / Spice Level</p>
                            <span className="text-[10px] text-slate-400">เลือก 1</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            {item.spicyOptions.map((lvl) => {
                              const meta = SPICY_META[lvl] || {};
                              const picked = item.spicy?.[0] === lvl;
                              return (
                                <button
                                  key={lvl}
                                  type="button"
                                  onClick={() => toggleSpicy(idx, lvl)}
                                  className={`flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium border transition ${
                                    picked ? meta.active : meta.color
                                  }`}
                                >
                                  <span>{meta.label}</span>
                                  <span className="text-[10px] opacity-60 uppercase">{meta.en}</span>
                                  {picked && <span className="ml-1">✓</span>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Egg — ซ่อนสำหรับเมนูผัดผัก และหมูกระเทียม */}
                      {item.menu !== 'ผัดผัก' && item.menu !== 'หมูกระเทียม' && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">ไข่ / Egg <span className="text-slate-400 font-normal normal-case">(ไม่บังคับ)</span></p>
                            <span className="text-[10px] text-slate-400">เลือก 1 หรือไม่เลือก</span>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            {EGG_OPTIONS.map((egg) => {
                              const meta = EGG_META[egg] || {};
                              const picked = item.egg?.[0] === egg;
                              return (
                                <button
                                  key={egg}
                                  type="button"
                                  onClick={() => toggleEgg(idx, egg)}
                                  className={`flex flex-col items-center gap-0.5 px-2 py-2 rounded-md text-xs font-medium border transition ${
                                    picked ? meta.active : meta.color
                                  }`}
                                >
                                  <span className="font-bold">{meta.label}</span>
                                  <span className="text-[9px] opacity-60">{meta.en}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Allergy — โปรเฟสชั่นแนล + เลือกได้หลายรายการ + อื่นๆ */}
                      <div className="border border-slate-200 rounded-md overflow-hidden">
                        <label className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition ${item.hasAllergy ? 'bg-red-50 border-b border-red-200' : 'bg-slate-50 hover:bg-slate-100'}`}>
                          <input
                            type="checkbox"
                            checked={!!item.hasAllergy}
                            onChange={() => toggleHasAllergy(idx)}
                            className="w-4 h-4 accent-red-600"
                          />
                          <div className="flex-1">
                            <p className={`text-xs font-bold uppercase tracking-wider ${item.hasAllergy ? 'text-red-700' : 'text-slate-700'}`}>
                              มีคนแพ้อาหารในจำนวนนี้ / Has Food Allergy
                            </p>
                            <p className="text-[11px] text-slate-500 normal-case font-normal">เลือกเพื่อแจ้งครัวให้เลี่ยงวัตถุดิบ · Inform kitchen to avoid specific ingredients</p>
                          </div>
                          {item.hasAllergy && (
                            <span className="text-[10px] font-bold text-red-700 bg-red-100 border border-red-200 px-2 py-0.5 rounded">ALERT</span>
                          )}
                        </label>

                        {item.hasAllergy && (
                          <div className="p-4 space-y-3 bg-white">
                            {/* ชื่อคนแพ้ */}
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                                ชื่อผู้แพ้ / Allergic Person's Name <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={item.allergyNote || ''}
                                onChange={(e) => setAllergyField(idx, 'allergyNote', e.target.value)}
                                placeholder="เช่น คุณสมชาย, พนักงาน 2 คน, ตัวฉันเอง"
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                              />
                            </div>

                            {/* Allergy chips */}
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2">
                                สิ่งที่แพ้ / Allergens <span className="text-slate-400 font-normal normal-case">(เลือกได้หลายรายการ)</span>
                              </label>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                {ALLERGY_OPTIONS.map((a) => {
                                  const picked = (item.allergies || []).includes(a.key);
                                  return (
                                    <button
                                      key={a.key}
                                      type="button"
                                      onClick={() => toggleAllergy(idx, a.key)}
                                      className={`flex flex-col items-start px-2.5 py-2 rounded-md text-xs font-medium border transition text-left ${
                                        picked
                                          ? 'bg-red-600 text-white border-red-600'
                                          : 'bg-white text-slate-700 border-slate-300 hover:border-red-400 hover:bg-red-50'
                                      }`}
                                    >
                                      <span className="font-bold leading-tight">{a.key}</span>
                                      <span className={`text-[9px] leading-tight ${picked ? 'opacity-80' : 'opacity-60'}`}>{a.en}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* อื่นๆ */}
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                                อื่นๆ / Other Allergens <span className="text-slate-400 font-normal normal-case">(ถ้ามี)</span>
                              </label>
                              <input
                                type="text"
                                value={item.allergyOther || ''}
                                onChange={(e) => setAllergyField(idx, 'allergyOther', e.target.value)}
                                placeholder="เช่น อาหารทะเลทุกชนิด, วัตถุกันเสีย"
                                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                              />
                            </div>

                            {/* Warning box */}
                            <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-md">
                              <span className="text-red-600 font-bold text-sm">⚠️</span>
                              <p className="text-[11px] text-red-800 leading-snug">
                                <span className="font-bold">สำคัญ:</span> ครัวจะเตรียมอาหารปลอดภัย + ติดสติกเกอร์ชื่อกล่อง กรุณาจับคู่กล่องให้ถูกคนตอนรับของ
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Quantity */}
                      <div>
                        <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">จำนวน / Quantity</p>
                        <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-md px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => handleItemChange(idx, 'qty', Math.max(0, Number(item.qty) - 1))}
                            disabled={item.qty === 0}
                            className="w-9 h-9 rounded-md bg-white border border-slate-300 hover:border-slate-500 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 flex items-center justify-center transition"
                          >
                            <Minus size={16} />
                          </button>
                          <span className="text-2xl font-bold text-slate-900">{item.qty}</span>
                          <button
                            type="button"
                            onClick={() => handleItemChange(idx, 'qty', Number(item.qty) + 1)}
                            className="w-9 h-9 rounded-md bg-slate-900 hover:bg-slate-700 text-white flex items-center justify-center transition"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Footer action — professional */}
                    <div className="px-5 py-4 border-t border-slate-200 bg-slate-50">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">รวม / Subtotal</span>
                        <span className="text-xl font-bold text-slate-900">฿{((item.qty || 1) * item.price).toLocaleString()}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (item.qty === 0) handleItemChange(idx, 'qty', 1);
                          setFoodModalIdx(null);
                        }}
                        className="w-full bg-slate-900 hover:bg-slate-700 text-white rounded-md py-3 font-semibold text-sm transition"
                      >
                        {item.qty === 0 ? 'เพิ่มในรายการสั่ง / Add to Order' : 'บันทึก / Confirm'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Food total — professional */}
            <div className="flex items-center justify-between px-5 py-4 bg-slate-50 border border-slate-200 rounded-md">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-[0.15em] font-semibold">รวมราคาอาหาร</p>
                <p className="text-[10px] text-slate-400 font-normal">Food Subtotal</p>
              </div>
              <div className="text-2xl font-bold text-slate-900 tracking-tight">฿{totalFoodCost.toLocaleString()}</div>
            </div>
          </section>

          {/* Section 6: Beverages — professional card + modal (เหมือน Section 5) */}
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <Coffee className="text-slate-700" size={22} />
                <h2 className="text-xl font-bold text-slate-800">6. ประเภทเครื่องดื่ม / Beverages</h2>
              </div>
              <div className="text-xs text-slate-500 italic hidden sm:block">ข้ามถ้าไม่สั่งเครื่องดื่ม</div>
            </div>

            {/* Section 6.5 — เลือกประเภทเครื่องดื่ม (professional radio) */}
            <div className="border border-slate-200 rounded-md overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5">
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">6.5 ประเภทเครื่องดื่ม <span className="text-red-500">*</span></p>
              </div>
              <div className="divide-y divide-slate-100">
                {[
                  { key: 'coffee', th: 'กาแฟ',           en: 'Coffee · มีตัวเลือกร้อน/เย็น',       range: '฿40 – ฿45' },
                  { key: 'tea',    th: 'ชา',              en: 'Tea · มีตัวเลือกร้อน/เย็น',          range: '฿40' },
                  { key: 'others', th: 'เครื่องดื่มอื่นๆ', en: 'Others · โซดา / เลมอน / ผลไม้',     range: '฿35' },
                ].map((opt) => (
                  <label
                    key={opt.key}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition ${formData.bevCategory === opt.key ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
                  >
                    <input
                      type="radio"
                      name="bevCategory"
                      value={opt.key}
                      checked={formData.bevCategory === opt.key}
                      onChange={(e) => {
                        setFormData(p => ({ ...p, bevCategory: e.target.value }));
                        setBevDraft({ menuIdx: '', temp: '', qty: 1 });
                      }}
                      className="w-4 h-4 accent-slate-900"
                    />
                    <div className="flex-1">
                      <p className={`text-sm font-semibold ${formData.bevCategory === opt.key ? 'text-slate-900' : 'text-slate-700'}`}>{opt.th}</p>
                      <p className="text-[11px] text-slate-500">{opt.en}</p>
                    </div>
                    <span className="text-sm font-bold text-slate-900">{opt.range}</span>
                  </label>
                ))}
              </div>
              {!formData.bevCategory && (
                <div className="px-4 py-2 bg-amber-50 border-t border-amber-200">
                  <p className="text-[11px] text-amber-800">กรุณาเลือกประเภทเครื่องดื่มก่อน</p>
                </div>
              )}
            </div>

            {/* Dropdown + inline form — เลือกเมนูหลัง 6.5 เลือกประเภทแล้ว */}
            {formData.bevCategory && (() => {
              const catMap = { coffee: 'กาแฟ', tea: 'ชา', others: 'เครื่องดื่มอื่นๆ' };
              const targetPrefix = catMap[formData.bevCategory];
              const menuOptions = BEVERAGE_ITEMS
                .map((b, i) => ({ ...b, i }))
                .filter((b) => b.menu.startsWith(targetPrefix));
              const draftSrc = bevDraft.menuIdx !== '' ? BEVERAGE_ITEMS[Number(bevDraft.menuIdx)] : null;
              const draftTempRequired = draftSrc && needsTemp(draftSrc.menu);
              const draftTotal = draftSrc ? (Math.max(1, Number(bevDraft.qty) || 1) * draftSrc.defaultPrice) : 0;

              return (
                <div className="border border-slate-200 rounded-md p-4 space-y-4 bg-white">
                  {/* Dropdown: เลือกเมนู */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      เลือกเมนู / Select Menu <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={bevDraft.menuIdx}
                      onChange={(e) => setBevDraft({ menuIdx: e.target.value, temp: '', qty: 1 })}
                      className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-md bg-white focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none"
                    >
                      <option value="">— กรุณาเลือกเมนู —</option>
                      {menuOptions.map((b) => (
                        <option key={b.i} value={b.i}>
                          {b.type} · ฿{b.defaultPrice}
                        </option>
                      ))}
                    </select>
                  </div>

                  {draftSrc && (
                    <>
                      {/* Price */}
                      <div className="flex items-baseline justify-between pb-3 border-b border-slate-200">
                        <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">ราคา / Price</span>
                        <span className="text-xl font-bold text-slate-900">฿{draftSrc.defaultPrice.toLocaleString()}</span>
                      </div>

                      {/* Temperature (กาแฟ/ชา) */}
                      {draftTempRequired && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                              อุณหภูมิ / Temperature <span className="text-red-500">*</span>
                            </p>
                            <span className="text-[10px] text-slate-400">เลือก 1</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            {['ร้อน', 'เย็น'].map((t) => {
                              const picked = bevDraft.temp === t;
                              return (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() => setBevDraft((d) => ({ ...d, temp: d.temp === t ? '' : t }))}
                                  className={`flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium border transition ${
                                    picked
                                      ? 'bg-slate-800 text-white border-slate-800'
                                      : 'bg-white text-slate-700 border-slate-300 hover:border-slate-500'
                                  }`}
                                >
                                  <span>{t}</span>
                                  <span className="text-[10px] opacity-60 uppercase">{t === 'ร้อน' ? 'Hot' : 'Cold'}</span>
                                  {picked && <span className="ml-1">✓</span>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Quantity */}
                      <div>
                        <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2">จำนวน (กี่แก้ว) / Quantity <span className="text-red-500">*</span></p>
                        <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-md px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => setBevDraft((d) => ({ ...d, qty: Math.max(1, (Number(d.qty) || 1) - 1) }))}
                            className="w-9 h-9 rounded-md bg-white border border-slate-300 hover:border-slate-500 text-slate-700 flex items-center justify-center transition"
                          >
                            <Minus size={16} />
                          </button>
                          <span className="text-2xl font-bold text-slate-900">{bevDraft.qty}</span>
                          <button
                            type="button"
                            onClick={() => setBevDraft((d) => ({ ...d, qty: (Number(d.qty) || 1) + 1 }))}
                            className="w-9 h-9 rounded-md bg-slate-900 hover:bg-slate-700 text-white flex items-center justify-center transition"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      </div>

                      {/* Subtotal + Add button */}
                      <div className="pt-2 border-t border-slate-200">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">รวม / Subtotal</span>
                          <span className="text-xl font-bold text-slate-900">฿{draftTotal.toLocaleString()}</span>
                        </div>
                        {draftTempRequired && !bevDraft.temp && (
                          <p className="text-[11px] text-red-600 mb-2">* กรุณาเลือกอุณหภูมิก่อน / Please select temperature</p>
                        )}
                        <button
                          type="button"
                          onClick={addBevToCart}
                          disabled={draftTempRequired && !bevDraft.temp}
                          className="w-full bg-slate-900 hover:bg-slate-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-md py-3 font-semibold text-sm transition flex items-center justify-center gap-2"
                        >
                          <Plus size={16} /> เพิ่มลงรายการ / Add to Order
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            {/* รายการเครื่องดื่มที่สั่ง (Cart) */}
            {formData.beverages.length > 0 && (
              <div className="border border-slate-200 rounded-md overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    รายการเครื่องดื่มที่สั่ง / Ordered Beverages
                  </p>
                  <span className="text-[10px] text-slate-500 font-semibold">{formData.beverages.length} รายการ</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {formData.beverages.map((b, i) => {
                    const m = b.type.match(/^(.+?)\s*\((.+?)\)\s*$/);
                    const th = m ? m[1] : b.type;
                    const en = m ? m[2] : '';
                    const line = b.qty * b.price;
                    return (
                      <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-slate-900">{th}</p>
                            {b.temp && b.temp !== '-' && (
                              <span className="text-[10px] font-bold text-slate-700 bg-slate-100 border border-slate-300 px-1.5 py-0.5 rounded">
                                {b.temp}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500">
                            {en && <span>{en} · </span>}
                            ฿{b.price} × {b.qty}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-slate-900">฿{line.toLocaleString()}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeBevFromCart(i)}
                          className="w-8 h-8 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition"
                          title="ลบ / Remove"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Beverages total — professional */}
            <div className="flex items-center justify-between px-5 py-4 bg-slate-50 border border-slate-200 rounded-md">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-[0.15em] font-semibold">รวมราคาเครื่องดื่ม</p>
                <p className="text-[10px] text-slate-400 font-normal">Beverages Subtotal</p>
              </div>
              <div className="text-2xl font-bold text-slate-900 tracking-tight">฿{totalBevCost.toLocaleString()}</div>
            </div>
          </section>

          {/* Grand Total — professional */}
          <div className="bg-slate-900 text-white rounded-md overflow-hidden">
            <div className="px-6 py-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <div className="flex items-center gap-3">
                <Calculator size={22} className="text-slate-400" />
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-semibold">สรุปยอดรวมทั้งสิ้น</p>
                  <p className="text-sm font-medium text-slate-300">Grand Total</p>
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl md:text-4xl font-bold tracking-tight">฿{grandTotal.toLocaleString()}</span>
                <span className="text-xs text-slate-400 uppercase tracking-wider">THB</span>
              </div>
            </div>
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
