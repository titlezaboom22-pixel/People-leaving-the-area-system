import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Printer, Trash2, Calculator, Coffee, Utensils, ClipboardCheck, MapPin,
  CheckSquare, Square, Send, X, Eraser, Upload, Plus, Minus, ChevronDown, ArrowLeft,
} from 'lucide-react';
import { createApprovalWorkflowRequest } from './approvalNotifications';
import { wakeupEmailServer } from './notifyEmail';
import { getUserById } from './authService';

// =================== Menu definitions (prices match TBKK canteen / To Be Coffee) ===================

const FOOD_ITEMS = [
  // จานเดียว ฿30 (1 จาน · สั่งทีละอย่าง)
  { category: 'จานเดียว (Single Dish)',   categoryType: 'A', menu: 'กระเพรา',      menuEn: 'Basil Stir Fry',         options: ['หมู', 'ไก่', 'ทะเล', 'เนื้อ'], spicyOptions: ['เผ็ด', 'ไม่เผ็ด'], defaultPrice: 30 },
  { category: 'จานเดียว (Single Dish)',   categoryType: 'A', menu: 'ผัดพริกแกง',   menuEn: 'Chili Paste Stir Fry',   options: ['หมู', 'ไก่', 'ทะเล', 'เนื้อ'], spicyOptions: ['เผ็ด', 'ไม่เผ็ด'], defaultPrice: 30 },
  { category: 'จานเดียว (Single Dish)',   categoryType: 'A', menu: 'ผัดผัก',        menuEn: 'Stir-Fried Vegetables',  options: ['หมู', 'ไก่', 'ทะเล'],          spicyOptions: [],                  defaultPrice: 30 },
  { category: 'จานเดียว (Single Dish)',   categoryType: 'A', menu: 'หมูกระเทียม',  menuEn: 'Garlic Pork',            options: ['หมู'],                          spicyOptions: [],                  defaultPrice: 30 },
];

// เซ็ต (B): ข้าว + 3 อย่าง = ต้ม + ผัด + ทอด ราคา ฿40/เซ็ต
const SET_PRICE = 40;
const SET_DISHES = {
  tom: {
    label: 'ต้ม',  labelEn: 'Soup', icon: '🍲',
    color: 'from-orange-500 to-red-500',
    items: [
      { k: 'ต้มจืดเต้าหู้หมูสับ',  en: 'Tofu & Minced Pork Soup' },
      { k: 'ต้มยำรวมมิตร',          en: 'Mixed Tom Yum' },
      { k: 'ต้มโครงปลาดุก',         en: 'Catfish Bone Soup' },
      { k: 'ต้มผักกาดดอง',          en: 'Pickled Mustard Soup' },
    ],
  },
  pad: {
    label: 'ผัด',  labelEn: 'Stir-Fry', icon: '🥘',
    color: 'from-amber-500 to-yellow-600',
    items: [
      { k: 'ผัดผักรวม',              en: 'Stir-Fried Mixed Vegetables' },
      { k: 'ผัดขิงเครื่องในไก่',      en: 'Stir-Fried Ginger Chicken Offal' },
      { k: 'ผัดเปรี้ยวหวานหมู',       en: 'Sweet & Sour Pork' },
      { k: 'ผัดพริกอ่อน',             en: 'Stir-Fried with Mild Chili' },
    ],
  },
  tod: {
    label: 'ทอด',  labelEn: 'Fried', icon: '🍤',
    color: 'from-yellow-500 to-orange-600',
    items: [
      { k: 'ปีกไก่ทอด',               en: 'Fried Chicken Wings' },
      { k: 'หมูทอดกระเทียม',          en: 'Garlic Fried Pork' },
      { k: 'ไข่เจียวหัวหอม',           en: 'Onion Omelette' },
      { k: 'ปลานิลทอด (ชิ้น)',         en: 'Fried Tilapia (piece)' },
    ],
  },
};

// Spicy level (สีแดง = เผ็ด, เขียว = ไม่เผ็ด)
const SPICY_META = {
  'เผ็ด':    { label: 'เผ็ด',    en: 'Spicy',     color: 'bg-white text-slate-700 border-slate-300 hover:border-red-400 hover:bg-red-50', active: 'bg-gradient-to-br from-red-500 to-rose-600 text-white border-red-500 shadow-md shadow-red-200' },
  'ไม่เผ็ด': { label: 'ไม่เผ็ด', en: 'Not spicy', color: 'bg-white text-slate-700 border-slate-300 hover:border-emerald-400 hover:bg-emerald-50', active: 'bg-gradient-to-br from-emerald-500 to-green-600 text-white border-emerald-500 shadow-md shadow-emerald-200' },
};

// Egg options (สีเหลือง / amber accent)
const EGG_OPTIONS = ['ไข่ดาว', 'ไข่เจียว', 'ไข่ดาวไม่สุก'];
const EGG_META = {
  'ไข่ดาว':         { label: 'ไข่ดาว',         en: 'Fried Egg',     color: 'bg-white text-slate-700 border-slate-300 hover:border-amber-400 hover:bg-amber-50',  active: 'bg-gradient-to-br from-amber-400 to-yellow-500 text-white border-amber-500 shadow-md shadow-amber-200' },
  'ไข่เจียว':        { label: 'ไข่เจียว',       en: 'Omelette',      color: 'bg-white text-slate-700 border-slate-300 hover:border-amber-400 hover:bg-amber-50',  active: 'bg-gradient-to-br from-amber-400 to-yellow-500 text-white border-amber-500 shadow-md shadow-amber-200' },
  'ไข่ดาวไม่สุก':    { label: 'ไข่ดาวไม่สุก',  en: 'Sunny-Side Up', color: 'bg-white text-slate-700 border-slate-300 hover:border-amber-400 hover:bg-amber-50',  active: 'bg-gradient-to-br from-amber-400 to-yellow-500 text-white border-amber-500 shadow-md shadow-amber-200' },
};

// Allergy categories (8 หมวดหลัก พร้อมรายการย่อย)
const ALLERGY_OPTIONS = [
  {
    key: 'ถั่ว', en: 'Nuts', icon: '🥜',
    color: 'from-amber-500 to-orange-600',
    subs: [
      { k: 'ถั่วลิสง',          en: 'Peanuts' },
      { k: 'ถั่วเปลือกแข็ง',    en: 'Tree Nuts (อัลมอนด์, เม็ดมะม่วง)' },
    ],
  },
  {
    key: 'นม', en: 'Dairy', icon: '🥛',
    color: 'from-slate-400 to-slate-600',
    subs: [
      { k: 'นมวัว',  en: 'Cow Milk' },
      { k: 'ชีส',    en: 'Cheese' },
      { k: 'เนย',    en: 'Butter' },
      { k: 'ครีม',   en: 'Cream' },
    ],
  },
  {
    key: 'ไข่', en: 'Egg', icon: '🥚',
    color: 'from-yellow-400 to-amber-500',
    subs: [
      { k: 'ไข่ไก่',          en: 'Chicken Egg' },
      { k: 'ไข่เป็ด',          en: 'Duck Egg' },
      { k: 'ไข่ในเค้ก/ขนม',   en: 'Egg in baked goods' },
    ],
  },
  {
    key: 'แป้ง / กลูเตน', en: 'Wheat / Gluten', icon: '🌾',
    color: 'from-amber-400 to-yellow-600',
    subs: [
      { k: 'ข้าวสาลี',                   en: 'Wheat' },
      { k: 'แป้งสาลี',                   en: 'Wheat Flour' },
      { k: 'เส้น (สปาเก็ตตี้/บะหมี่)',    en: 'Pasta / Noodles' },
      { k: 'ขนมปัง',                      en: 'Bread' },
    ],
  },
  {
    key: 'ปลา', en: 'Fish', icon: '🐟',
    color: 'from-blue-500 to-cyan-600',
    subs: [
      { k: 'ปลา',       en: 'Fish' },
      { k: 'น้ำปลา',    en: 'Fish Sauce' },
      { k: 'ซอสปลา',    en: 'Fish-based Sauce' },
    ],
  },
  {
    key: 'อาหารทะเล', en: 'Shellfish / Seafood', icon: '🦐',
    color: 'from-pink-500 to-rose-600',
    subs: [
      { k: 'กุ้ง',  en: 'Shrimp' },
      { k: 'ปู',    en: 'Crab' },
      { k: 'หอย',   en: 'Shellfish' },
      { k: 'หมึก',  en: 'Squid' },
    ],
  },
  {
    key: 'ถั่วเหลือง', en: 'Soy', icon: '🌱',
    color: 'from-emerald-500 to-green-600',
    subs: [
      { k: 'ซีอิ๊ว',        en: 'Soy Sauce' },
      { k: 'เต้าหู้',         en: 'Tofu' },
      { k: 'ซอสถั่วเหลือง',  en: 'Soybean Sauce' },
    ],
  },
  {
    key: 'งา', en: 'Sesame', icon: '🌿',
    color: 'from-lime-500 to-emerald-600',
    subs: [
      { k: 'งาขาว',     en: 'White Sesame' },
      { k: 'งาดำ',      en: 'Black Sesame' },
      { k: 'น้ำมันงา',   en: 'Sesame Oil' },
    ],
  },
];

// Protein options (แต่ละชนิดมีสีเฉพาะตอน active)
const PROTEIN_META = {
  'หมู':  { label: 'หมู',   en: 'Pork',    color: 'bg-white text-slate-700 border-slate-300 hover:border-pink-400 hover:bg-pink-50',     active: 'bg-gradient-to-br from-pink-500 to-rose-500 text-white border-pink-500 shadow-md shadow-pink-200' },
  'ไก่':  { label: 'ไก่',   en: 'Chicken', color: 'bg-white text-slate-700 border-slate-300 hover:border-amber-400 hover:bg-amber-50',  active: 'bg-gradient-to-br from-amber-500 to-orange-500 text-white border-amber-500 shadow-md shadow-amber-200' },
  'ทะเล': { label: 'ทะเล', en: 'Seafood', color: 'bg-white text-slate-700 border-slate-300 hover:border-cyan-400 hover:bg-cyan-50',    active: 'bg-gradient-to-br from-cyan-500 to-sky-600 text-white border-cyan-500 shadow-md shadow-cyan-200' },
  'เนื้อ': { label: 'เนื้อ', en: 'Beef',    color: 'bg-white text-slate-700 border-slate-300 hover:border-red-400 hover:bg-red-50',     active: 'bg-gradient-to-br from-red-600 to-rose-700 text-white border-red-600 shadow-md shadow-red-200' },
};

// To Be Coffee — ราคาจริงจากร้าน (เก็บเฉพาะ 14 รายการเดิม)
//   priceHot = ฿35 ทุกเมนูที่มีร้อน
//   priceIced = ฿40 หรือ ฿45 ตามชนิด
//   icedOnly = true → ไม่มีตัวเลือกร้อน (โซดา)
const BEVERAGE_ITEMS = [
  // ☕ กาแฟ — 5 รายการ
  { menu: 'กาแฟ (Coffee)', type: 'เอสเปรสโซ (Espresso)',     priceHot: 35, priceIced: 40 },
  { menu: 'กาแฟ (Coffee)', type: 'กาแฟดำ (Americano)',       priceHot: 35, priceIced: 40 },
  { menu: 'กาแฟ (Coffee)', type: 'ลาเต้ (Latte)',            priceHot: 35, priceIced: 45 },
  { menu: 'กาแฟ (Coffee)', type: 'คาปูชิโน่ (Cappuccino)',     priceHot: 35, priceIced: 45 },
  { menu: 'กาแฟ (Coffee)', type: 'มอคค่า (Mocha)',           priceHot: 35, priceIced: 45 },

  // 🍵 ชา — 3 รายการ
  { menu: 'ชา (Tea)', type: 'ชาเขียว (Green Tea)',  priceHot: 35, priceIced: 40 },
  { menu: 'ชา (Tea)', type: 'ชาไทย (Thai Tea)',     priceHot: 35, priceIced: 40 },
  { menu: 'ชา (Tea)', type: 'ชาพีช (Peach Tea)',    priceHot: 35, priceIced: 40 },

  // 🍹 เครื่องดื่มอื่นๆ — Italian Soda เย็นเท่านั้น ฿35 ทั้งหมด
  { menu: 'เครื่องดื่มอื่นๆ (Others)', type: 'เลมอนโซดา (Lemon Soda)',        priceIced: 35, icedOnly: true },
  { menu: 'เครื่องดื่มอื่นๆ (Others)', type: 'แดงโซดา (Red Soda)',           priceIced: 35, icedOnly: true },
  { menu: 'เครื่องดื่มอื่นๆ (Others)', type: 'แดงโซดามะนาว (Red Soda Lime)',  priceIced: 35, icedOnly: true },
  { menu: 'เครื่องดื่มอื่นๆ (Others)', type: 'บลูฮาวายโซดา (Blue Hawaii Soda)', priceIced: 35, icedOnly: true },
  { menu: 'เครื่องดื่มอื่นๆ (Others)', type: 'บลูเบอรี่โซดา (Blueberry Soda)', priceIced: 35, icedOnly: true },
  { menu: 'เครื่องดื่มอื่นๆ (Others)', type: 'พีชโซดา (Peach Soda)',          priceIced: 35, icedOnly: true },
];

// Helper: ราคาจริงเมื่อเลือกร้อน/เย็น + ช็อตเพิ่ม (กาแฟ +฿10)
const SHOT_PRICE = 10;
const getBevPrice = (item, temp, withShot) => {
  if (!item) return 0;
  let base = 0;
  if (temp === 'ร้อน' && item.priceHot) base = item.priceHot;
  else if (temp === 'เย็น' && item.priceIced) base = item.priceIced;
  else base = item.priceIced || item.priceHot || 0;
  return base + (withShot ? SHOT_PRICE : 0);
};
const itemNeedsTemp = (item) => !!(item && item.priceHot && item.priceIced);
const itemIsCoffee = (item) => (item?.menu || '').startsWith('กาแฟ');

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
      email: params.get('email') || '',
      date: new Date().toISOString().split('T')[0],
      time: '',
      location: '',
      purpose: '',
      purposeOther: '',
      orderType: '', // 'A' = จานเดียว, 'B' = เซ็ต
      setOrders: [], // เซ็ต cart: [{ tom, pad, tod, qty, price }]
      bevCategory: '', // 'coffee' | 'tea' | 'others'
      foodItems: FOOD_ITEMS.map(x => ({ ...x, proteins: [], spicy: [], egg: [], hasAllergy: false, allergies: [], allergyOther: '', allergyNames: [], qty: 0, price: x.defaultPrice })),
      beverages: [], // cart-style: [{menu, type, temp, qty, price, defaultPrice}]
      requesterSign: null,
      note: '',
    };
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null); // { ok, msg }
  const [foodModalIdx, setFoodModalIdx] = useState(null); // index ของเมนูที่เปิด modal

  // Draft สำหรับเพิ่มเครื่องดื่มลงรายการ (dropdown flow)
  const [bevDraft, setBevDraft] = useState({ menuIdx: '', temp: '', qty: 1, extraShot: false });
  // setDraft.selections: { 'ต้มจืดเต้าหู้หมูสับ': 2, 'ปีกไก่ทอด': 1, ... }
  // รวมทุกค่าต้อง = 3 (เลือก 3 อย่างจาก 12 เมนู)
  const [setDraft, setSetDraft] = useState({ selections: {}, qty: 1 });

  // Draft input สำหรับชื่อผู้แพ้ (chip input ใน Food modal)
  const [allergyNameDraft, setAllergyNameDraft] = useState('');

  // สถานะการค้นหาพนักงานจากรหัส
  const [lookupStatus, setLookupStatus] = useState('idle'); // 'idle' | 'loading' | 'found' | 'notfound'

  // 📧 ปลุก email server ทันทีที่หน้าโหลด — กัน Render sleep
  useEffect(() => {
    wakeupEmailServer();
  }, []);

  // Auto-lookup พนักงานเมื่อพิมพ์รหัส (debounce 350ms)
  useEffect(() => {
    const id = (formData.employeeId || '').trim().toUpperCase();
    if (!id || id.length < 3) {
      setLookupStatus('idle');
      return;
    }
    setLookupStatus('loading');
    const t = setTimeout(async () => {
      try {
        const user = await getUserById(id);
        if (user) {
          setFormData(p => ({
            ...p,
            requesterName: user.displayName || p.requesterName,
            department: user.department || p.department,
            email: user.email || p.email,
          }));
          setLookupStatus('found');
        } else {
          setLookupStatus('notfound');
        }
      } catch (e) {
        setLookupStatus('notfound');
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.employeeId]);


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
      newFoodItems[itemIndex].allergyNames = [];
    }
    setFormData(prev => ({ ...prev, foodItems: newFoodItems }));
    setAllergyNameDraft('');
  };

  const addAllergyName = (itemIndex, name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    const newFoodItems = [...formData.foodItems];
    const cur = newFoodItems[itemIndex].allergyNames || [];
    if (cur.includes(trimmed)) {
      setAllergyNameDraft('');
      return;
    }
    newFoodItems[itemIndex].allergyNames = [...cur, trimmed];
    setFormData(prev => ({ ...prev, foodItems: newFoodItems }));
    setAllergyNameDraft('');
  };

  const removeAllergyName = (itemIndex, nameIdx) => {
    const newFoodItems = [...formData.foodItems];
    const cur = newFoodItems[itemIndex].allergyNames || [];
    newFoodItems[itemIndex].allergyNames = cur.filter((_, i) => i !== nameIdx);
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
    // icedOnly → lock เย็น, มีร้อน-เย็น → ต้องเลือก
    let temp = bevDraft.temp;
    if (src.icedOnly) temp = 'เย็น';
    else if (itemNeedsTemp(src) && !temp) {
      setSubmitResult({ ok: false, msg: 'กรุณาเลือกอุณหภูมิก่อน / Please select temperature' });
      return;
    } else if (!temp) temp = 'เย็น';

    const withShot = !!bevDraft.extraShot && itemIsCoffee(src);
    const price = getBevPrice(src, temp, withShot);
    const qty = Math.max(1, Number(bevDraft.qty) || 1);
    setFormData(p => ({
      ...p,
      beverages: [
        ...p.beverages,
        {
          menu: src.menu,
          type: src.type,
          temp,
          extraShot: withShot,
          qty,
          price,
          priceHot: src.priceHot || 0,
          priceIced: src.priceIced || 0,
        },
      ],
    }));
    // reset draft
    setBevDraft({ menuIdx: '', temp: '', qty: 1, extraShot: false });
    setSubmitResult(null);
  };

  const removeBevFromCart = (idx) => {
    setFormData(p => ({
      ...p,
      beverages: p.beverages.filter((_, i) => i !== idx),
    }));
  };

  const setDishCategory = (dishKey) => {
    for (const [catKey, cat] of Object.entries(SET_DISHES)) {
      if (cat.items.some((it) => it.k === dishKey)) return catKey;
    }
    return '';
  };

  const setDishTotal = (selections) =>
    Object.values(selections || {}).reduce((a, b) => a + (Number(b) || 0), 0);

  const incSetDish = (dishKey) => {
    setSetDraft((d) => {
      const total = setDishTotal(d.selections);
      if (total >= 3) return d; // เกิน 3 ไม่ได้
      return { ...d, selections: { ...d.selections, [dishKey]: (d.selections[dishKey] || 0) + 1 } };
    });
  };

  const decSetDish = (dishKey) => {
    setSetDraft((d) => {
      const cur = d.selections[dishKey] || 0;
      if (cur <= 0) return d;
      const next = { ...d.selections };
      if (cur === 1) delete next[dishKey];
      else next[dishKey] = cur - 1;
      return { ...d, selections: next };
    });
  };

  const addSetToCart = () => {
    const total = setDishTotal(setDraft.selections);
    if (total !== 3) {
      setSubmitResult({ ok: false, msg: `ต้องเลือกครบ 3 อย่าง (ตอนนี้เลือก ${total}) / Please pick exactly 3 dishes (currently ${total})` });
      return;
    }
    const qty = Math.max(1, Number(setDraft.qty) || 1);
    // สร้าง dishes array จาก selections
    const dishes = Object.entries(setDraft.selections).map(([k, count]) => ({
      k,
      count,
      cat: setDishCategory(k),
    }));
    setFormData(p => ({
      ...p,
      setOrders: [
        ...p.setOrders,
        { dishes, qty, price: SET_PRICE },
      ],
    }));
    setSetDraft({ selections: {}, qty: 1 });
    setSubmitResult(null);
  };

  const removeSetFromCart = (idx) => {
    setFormData(p => ({
      ...p,
      setOrders: p.setOrders.filter((_, i) => i !== idx),
    }));
  };

  const handleItemChange = (index, field, value, type = 'food') => {
    const listName = type === 'food' ? 'foodItems' : 'beverages';
    const newList = [...formData[listName]];
    newList[index][field] = field === 'qty' || field === 'price' ? parseFloat(value) || 0 : value;
    setFormData(prev => ({ ...prev, [listName]: newList }));
  };

  const totalFoodCost = useMemo(
    () =>
      formData.foodItems.reduce((a, it) => a + (it.qty * it.price), 0) +
      formData.setOrders.reduce((a, s) => a + (s.qty * s.price), 0),
    [formData.foodItems, formData.setOrders]
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
    const selectedSets = formData.setOrders || [];
    const selectedBev = formData.beverages.filter(it => it.qty > 0);

    if (selectedFood.length === 0 && selectedBev.length === 0 && selectedSets.length === 0) {
      setSubmitResult({ ok: false, msg: 'กรุณาสั่งอาหารหรือเครื่องดื่มอย่างน้อย 1 รายการ / Please order at least 1 food or drink item' });
      return;
    }

    // ตรวจ: ถ้าสั่งกาแฟ/ชา ต้องเลือกอุณหภูมิ
    const missingTemp = selectedBev.find(it => needsTemp(it.menu) && !it.temp);
    if (missingTemp) {
      setSubmitResult({ ok: false, msg: `กรุณาเลือกอุณหภูมิ (ร้อน/เย็น) ของ "${missingTemp.type}" / Please select temperature` });
      return;
    }

    // ตรวจ: ถ้าเปิดแพ้อาหาร ต้องระบุชื่อผู้แพ้อย่างน้อย 1 ชื่อ
    const missingAllergyName = selectedFood.find(it => it.hasAllergy && (!it.allergyNames || it.allergyNames.length === 0));
    if (missingAllergyName) {
      setSubmitResult({ ok: false, msg: `กรุณาระบุชื่อผู้แพ้อาหารของเมนู "${missingAllergyName.menu}" / Please add at least one allergic person's name` });
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
        const names = it.hasAllergy ? (it.allergyNames || []).filter(Boolean) : [];
        return {
          menu: it.menu,
          category: it.category,
          proteins: it.proteins,
          spicy: it.spicy || [],
          egg: it.egg || [],
          hasAllergy: !!it.hasAllergy,
          allergies: allergens,
          allergyNames: names,
          allergyNote: names.join(', '),  // backward compat
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

      // เซ็ต — แปลงเป็น food row โดยรวมเป็น 1 บรรทัดต่อเซ็ต
      const setRows = selectedSets.map((s, i) => {
        const dishesList = (s.dishes || []).map(d => d.count > 1 ? `${d.k} × ${d.count}` : d.k).join(' + ');
        return {
          menu: `เซ็ต #${i + 1}: ${dishesList}`,
          category: 'เซ็ต (Set Menu)',
          setDishes: s.dishes || [],
          proteins: [],
          spicy: [],
          egg: [],
          hasAllergy: false,
          allergies: [],
          allergyNames: [],
          qty: s.qty,
          unitPrice: s.price,
          lineTotal: s.qty * s.price,
        };
      });

      // รวม food + sets เข้าด้วยกัน
      const allFoodRows = [...foodRows, ...setRows];

      const purposeText = formData.purpose === 'อื่นๆ (Others)'
        ? `อื่นๆ: ${formData.purposeOther || '-'}`
        : formData.purpose;

      // Decide workflow type
      const hasFood = allFoodRows.length > 0;
      const hasDrink = drinkRows.length > 0;

      let sourceForm;
      let topic;
      let payload;

      const base = {
        responsiblePerson: formData.requesterName.trim(),
        employeeId: formData.employeeId.trim().toUpperCase(),
        department: formData.department.trim(),
        email: (formData.email || '').trim(),
        orderDate: formData.date,
        orderTime: formData.time,
        location: formData.location,
        purpose: purposeText,
        ordererSign: null,  // ไม่ใช้ลายเซ็นแล้ว — ใช้ login เป็นการยืนยัน
        note: formData.note || '',
      };

      if (hasFood && hasDrink) {
        sourceForm = 'DRINK_FOOD_ORDER';
        topic = 'เอกสารสั่งเครื่องดื่มและอาหาร - GA รับออเดอร์';
        payload = {
          ...base,
          drinkRows,
          foodRows: allFoodRows,
          drinkTotalAmount: totalBevCost,
          foodTotalAmount: totalFoodCost,
          totalAmount: grandTotal,
        };
      } else if (hasFood) {
        sourceForm = 'FOOD_ORDER';
        topic = 'เอกสารสั่งอาหาร - GA รับออเดอร์';
        payload = {
          ...base,
          rows: allFoodRows,
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-cyan-50/40 py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl shadow-indigo-200/40 rounded-2xl overflow-hidden print:shadow-none print:m-0 border border-slate-200">

        {/* Header — colorful gradient + decorative pattern */}
        <div className="relative bg-gradient-to-br from-indigo-700 via-violet-700 to-fuchsia-700 p-8 text-white flex flex-col md:flex-row justify-between items-center gap-4 overflow-hidden">
          <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, white 0, transparent 40%), radial-gradient(circle at 80% 70%, white 0, transparent 40%)' }} />
          <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-amber-300/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -top-10 -left-10 w-48 h-48 bg-cyan-300/20 rounded-full blur-3xl pointer-events-none" />
          <div className="text-center md:text-left relative">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/15 backdrop-blur border border-white/20 rounded-full text-[10px] font-semibold uppercase tracking-[0.15em] mb-2">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              TBKK Group · Order System
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">แบบฟอร์มขออาหารและเครื่องดื่มบริษัท</h1>
            <p className="text-indigo-100 text-base opacity-95">Company Food &amp; Beverage Request Form</p>
          </div>
          <div className="flex gap-2 print:hidden relative flex-wrap justify-end items-center">
            {/* ปุ่ม Back — frosted glass */}
            <button
              onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.href = '/'; }}
              className="group flex items-center gap-2 pl-3 pr-4 py-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-xl border border-white/25 hover:border-white/50 transition-all active:scale-95 shadow-lg shadow-black/10"
              title="ย้อนกลับ"
            >
              <span className="w-7 h-7 rounded-lg bg-white/15 group-hover:bg-white/25 flex items-center justify-center transition">
                <ArrowLeft size={15} />
              </span>
              <span className="text-sm font-semibold hidden sm:inline">กลับ</span>
            </button>

            {/* ปุ่ม Reset */}
            <button
              onClick={resetForm}
              className="group flex items-center gap-2 pl-3 pr-4 py-2.5 bg-white/10 hover:bg-rose-500/30 backdrop-blur-md rounded-xl border border-white/25 hover:border-rose-300/60 transition-all active:scale-95 shadow-lg shadow-black/10"
              title="ล้างข้อมูลทั้งหมด"
            >
              <span className="w-7 h-7 rounded-lg bg-white/15 group-hover:bg-rose-500/40 flex items-center justify-center transition">
                <Trash2 size={15} />
              </span>
              <span className="text-sm font-semibold hidden sm:inline">ล้าง</span>
            </button>

            {/* ปุ่ม Print */}
            <button
              onClick={handlePrint}
              className="group flex items-center gap-2 pl-3 pr-4 py-2.5 bg-white/95 hover:bg-white text-indigo-700 rounded-xl border border-white/50 transition-all active:scale-95 font-semibold shadow-lg hover:shadow-xl hover:-translate-y-0.5"
              title="พิมพ์เอกสาร"
            >
              <span className="w-7 h-7 rounded-lg bg-indigo-100 group-hover:bg-indigo-200 flex items-center justify-center transition">
                <Printer size={15} className="text-indigo-700" />
              </span>
              <span className="text-sm hidden sm:inline">พิมพ์ / PDF</span>
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

          {/* Section 1: Requester (Blue) — กรอกรหัสพนักงาน → auto-fill ทุกช่อง */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 pb-2 border-b-2 border-gradient relative" style={{ borderImage: 'linear-gradient(to right, #2563eb, transparent) 1' }}>
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-md shadow-blue-200">
                <ClipboardCheck className="text-white" size={20} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-blue-600 font-bold">Section 1</p>
                <h2 className="text-xl font-bold text-slate-800">ผู้ขอ / Requester</h2>
              </div>
            </div>

            {/* 4 ช่องเรียบๆ: ID → Name → Department → Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">รหัสพนักงาน / ID *</label>
                <div className="relative">
                  <input
                    type="text"
                    name="employeeId"
                    value={formData.employeeId}
                    onChange={handleInputChange}
                    placeholder="EMP-EEE-01"
                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none uppercase font-mono text-sm"
                  />
                  {lookupStatus === 'loading' && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                  )}
                  {lookupStatus === 'found' && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-emerald-600 text-sm">✓</span>
                  )}
                  {lookupStatus === 'notfound' && formData.employeeId.trim().length >= 3 && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-600 text-xs">⚠</span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">ชื่อ-นามสกุล / Name *</label>
                <input
                  type="text"
                  name="requesterName"
                  value={formData.requesterName}
                  onChange={handleInputChange}
                  placeholder="—"
                  className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">แผนก / Department *</label>
                <input
                  type="text"
                  name="department"
                  value={formData.department}
                  onChange={handleInputChange}
                  placeholder="—"
                  className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">อีเมล / Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="name@tbkk.co.th"
                  className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm font-mono"
                />
              </div>
            </div>
          </section>

          {/* Section 2: Date & Time (Indigo) */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 pb-2 border-b border-slate-200">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-md shadow-indigo-200">
                <MapPin className="text-white" size={20} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-indigo-600 font-bold">Section 2</p>
                <h2 className="text-xl font-bold text-slate-800">วัน-เวลา / Date &amp; Time</h2>
              </div>
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

          {/* Section 3: Location (Violet) */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 pb-2 border-b border-slate-200">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-md shadow-violet-200">
                <MapPin className="text-white" size={20} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-violet-600 font-bold">Section 3</p>
                <h2 className="text-xl font-bold text-slate-800">สถานที่จัด / Location</h2>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {LOCATIONS.map((loc) => {
                const checked = formData.location === loc;
                return (
                  <label
                    key={loc}
                    className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-all ${
                      checked
                        ? 'border-violet-500 bg-violet-50 shadow-sm shadow-violet-100'
                        : 'border-slate-200 hover:border-violet-300 hover:bg-violet-50/40'
                    }`}
                  >
                    <input type="radio" name="location" value={loc} checked={checked} onChange={handleInputChange} className="w-4 h-4 accent-violet-600" />
                    <span className={`text-sm ${checked ? 'text-violet-900 font-semibold' : 'text-slate-700'}`}>{loc}</span>
                  </label>
                );
              })}
            </div>
          </section>

          {/* Section 4: Purpose (Pink) */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 pb-2 border-b border-slate-200">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-md shadow-pink-200">
                <ClipboardCheck className="text-white" size={20} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-pink-600 font-bold">Section 4</p>
                <h2 className="text-xl font-bold text-slate-800">วัตถุประสงค์ / Purpose</h2>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              {PURPOSES.map((p) => {
                const checked = formData.purpose === p;
                return (
                  <label
                    key={p}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-full border cursor-pointer transition-all ${
                      checked
                        ? 'border-pink-500 bg-gradient-to-r from-pink-50 to-rose-50 text-pink-900 font-semibold shadow-sm'
                        : 'border-slate-200 bg-white hover:border-pink-300'
                    }`}
                  >
                    <input type="radio" name="purpose" value={p} checked={checked} onChange={handleInputChange} className="w-4 h-4 accent-pink-600" />
                    <span className="text-sm">{p}</span>
                  </label>
                );
              })}
              {formData.purpose === 'อื่นๆ (Others)' && (
                <input type="text" name="purposeOther" value={formData.purposeOther} onChange={handleInputChange} placeholder="โปรดระบุ / Please specify" className="p-2 border-b-2 border-pink-300 focus:border-pink-500 outline-none flex-1 min-w-[200px] bg-pink-50/30" />
              )}
            </div>
          </section>

          {/* Section 5: Food Menu (Orange/Amber) */}
          <section className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-md shadow-orange-200">
                  <Utensils className="text-white" size={20} />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-orange-600 font-bold">Section 5</p>
                  <h2 className="text-xl font-bold text-slate-800">ประเภทอาหาร / Food Menu</h2>
                </div>
              </div>
              <div className="text-xs text-orange-700 bg-orange-50 px-3 py-1 rounded-full border border-orange-200 font-medium hidden sm:block">ข้ามไปข้อ 6 ถ้าไม่สั่ง</div>
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
                    <p className="text-[11px] text-slate-500">Set Menu · ราคา ฿40 · เลือก ต้ม + ผัด + ทอด อย่างละ 1 รายการ</p>
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

            {/* === A. จานเดียว (Single Dish) — เดิม === */}
            {formData.orderType === 'A' && (() => {
              const filtered = formData.foodItems
                .map((item, idx) => ({ item, idx }))
                .filter(({ item }) => item.categoryType === 'A');
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

            {/* === B. เซ็ต — ใหม่: เลือก 3 อย่างจาก 12 เมนู (ผสมหมวดได้) === */}
            {formData.orderType === 'B' && (() => {
              const totalSelected = setDishTotal(setDraft.selections);
              const remaining = 3 - totalSelected;
              const isFull = totalSelected >= 3;
              const canAdd = totalSelected === 3;
              return (
              <div className="space-y-4">
                <div className="rounded-2xl p-4 md:p-5 bg-gradient-to-br from-orange-50/60 via-amber-50/40 to-yellow-50/30 border border-orange-200 shadow-sm shadow-orange-100">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-orange-200/70 gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black text-orange-700 uppercase tracking-[0.2em]">Build Your Set</p>
                      <h3 className="text-base font-bold text-orange-900">ประกอบเซ็ตของคุณ — เลือก 3 อย่าง</h3>
                      <p className="text-[10px] text-orange-700/80">ข้าว 1 ที่ + อาหาร 3 อย่าง · ผสม ต้ม/ผัด/ทอด ยังไงก็ได้ · ฿{SET_PRICE}/เซ็ต</p>
                    </div>
                    {/* Counter */}
                    <div className={`px-4 py-2 rounded-xl font-black text-center transition-all ${
                      canAdd
                        ? 'bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-md shadow-emerald-200'
                        : 'bg-white border-2 border-orange-300 text-orange-700'
                    }`}>
                      <p className="text-[10px] uppercase tracking-widest opacity-90">{canAdd ? 'พร้อม!' : 'เลือกแล้ว'}</p>
                      <p className="text-2xl">{totalSelected}<span className="opacity-50 text-base">/3</span></p>
                    </div>
                  </div>

                  {/* 3 หมวด ต้ม/ผัด/ทอด — แต่ละเมนูมี +/- */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {Object.entries(SET_DISHES).map(([catKey, cat]) => {
                      const catTotal = cat.items.reduce((sum, it) => sum + (setDraft.selections[it.k] || 0), 0);
                      return (
                      <div key={catKey} className="bg-white rounded-xl border border-orange-100 overflow-hidden">
                        <div className={`px-3 py-2.5 bg-gradient-to-r ${cat.color} text-white`}>
                          <p className="text-[10px] uppercase tracking-widest font-black opacity-90">{cat.labelEn}</p>
                          <p className="text-base font-black flex items-center gap-2">
                            <span className="text-xl">{cat.icon}</span> {cat.label}
                            {catTotal > 0 && (
                              <span className="ml-auto text-[11px] font-black bg-white text-slate-800 px-2 py-0.5 rounded-full shadow-sm">
                                × {catTotal}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="p-2 space-y-1.5">
                          {cat.items.map((it) => {
                            const count = setDraft.selections[it.k] || 0;
                            const picked = count > 0;
                            return (
                              <div
                                key={it.k}
                                className={`flex items-center gap-2 p-2 rounded-lg transition ${
                                  picked
                                    ? 'bg-orange-50 border border-orange-400 shadow-sm'
                                    : 'bg-white border border-slate-200 hover:border-orange-300'
                                }`}
                              >
                                <div className="flex-1 min-w-0">
                                  <p className={`text-xs leading-tight font-semibold ${picked ? 'text-orange-900' : 'text-slate-800'}`}>{it.k}</p>
                                  <p className="text-[9px] text-slate-500 leading-tight mt-0.5">{it.en}</p>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => decSetDish(it.k)}
                                    disabled={count === 0}
                                    className="w-7 h-7 rounded-md bg-white border border-slate-300 hover:border-orange-500 hover:bg-orange-50 disabled:opacity-30 disabled:cursor-not-allowed text-orange-700 flex items-center justify-center transition"
                                  >
                                    <Minus size={12} />
                                  </button>
                                  <span className={`w-6 text-center font-black text-sm tabular-nums ${count > 0 ? 'text-orange-700' : 'text-slate-400'}`}>{count}</span>
                                  <button
                                    type="button"
                                    onClick={() => incSetDish(it.k)}
                                    disabled={isFull}
                                    className="w-7 h-7 rounded-md bg-gradient-to-br from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed text-white flex items-center justify-center transition"
                                  >
                                    <Plus size={12} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      );
                    })}
                  </div>

                  {/* Quantity + Add */}
                  <div className="mt-4 pt-3 border-t border-orange-200/70 flex flex-col md:flex-row items-stretch md:items-center gap-3">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs font-bold text-orange-800 uppercase tracking-wider">จำนวนเซ็ต:</span>
                      <div className="flex items-center bg-white border border-orange-300 rounded-lg overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setSetDraft((d) => ({ ...d, qty: Math.max(1, (Number(d.qty) || 1) - 1) }))}
                          className="w-9 h-9 hover:bg-orange-50 text-orange-700 flex items-center justify-center transition"
                        ><Minus size={14} /></button>
                        <span className="w-12 text-center font-bold text-lg text-orange-700 tabular-nums">{setDraft.qty}</span>
                        <button
                          type="button"
                          onClick={() => setSetDraft((d) => ({ ...d, qty: (Number(d.qty) || 1) + 1 }))}
                          className="w-9 h-9 bg-gradient-to-br from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white flex items-center justify-center transition"
                        ><Plus size={14} /></button>
                      </div>
                      <span className="text-sm font-bold text-orange-700 ml-2">
                        รวม ฿{(setDraft.qty * SET_PRICE).toLocaleString()}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={addSetToCart}
                      disabled={!canAdd}
                      className="px-5 py-2.5 bg-gradient-to-r from-orange-600 via-amber-600 to-orange-600 hover:from-orange-700 hover:via-amber-700 hover:to-orange-700 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed text-white rounded-lg font-bold text-sm shadow-md shadow-orange-200 active:scale-95 transition flex items-center justify-center gap-2"
                    >
                      <Plus size={16} /> {canAdd ? 'เพิ่มเซ็ตลงรายการ' : `เลือกอีก ${remaining} อย่าง`}
                    </button>
                  </div>
                  {!canAdd && totalSelected > 0 && (
                    <p className="text-[10px] text-orange-700 mt-2 italic">* เลือกอีก {remaining} อย่างเพื่อให้ครบ 3</p>
                  )}
                  {totalSelected === 0 && (
                    <p className="text-[10px] text-orange-700 mt-2 italic">* กดปุ่ม + ที่เมนูที่ต้องการ — ผสม ต้ม/ผัด/ทอด ยังไงก็ได้</p>
                  )}
                </div>

                {/* Set cart */}
                {formData.setOrders.length > 0 && (
                  <div className="border border-orange-200 rounded-xl overflow-hidden">
                    <div className="bg-gradient-to-r from-orange-50 to-amber-50 px-4 py-2.5 border-b border-orange-200 flex items-center justify-between">
                      <p className="text-xs font-black text-orange-700 uppercase tracking-widest">🍱 รายการเซ็ตที่สั่ง / Ordered Sets</p>
                      <span className="text-[10px] font-black text-orange-700">{formData.setOrders.length} เซ็ต</span>
                    </div>
                    <div className="divide-y divide-orange-100">
                      {formData.setOrders.map((s, i) => {
                        const line = s.qty * s.price;
                        const dishes = s.dishes || [];
                        const iconMap = { tom: '🍲', pad: '🥘', tod: '🍤' };
                        return (
                          <div key={i} className="p-3 hover:bg-orange-50/40 transition">
                            <div className="flex items-start gap-3">
                              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 text-white flex items-center justify-center font-black text-sm flex-shrink-0">
                                #{i + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                  {dishes.map((d, di) => (
                                    <span key={di} className="text-xs flex items-center gap-1">
                                      <span>{iconMap[d.cat] || '🍽'}</span>
                                      <span className="font-semibold text-slate-800">{d.k}</span>
                                      {d.count > 1 && <span className="text-[10px] font-bold text-orange-700 bg-orange-100 px-1.5 rounded">×{d.count}</span>}
                                    </span>
                                  ))}
                                </div>
                                <p className="text-[10px] text-slate-500 mt-1">฿{s.price} × {s.qty} เซ็ต</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-sm font-bold text-orange-700">฿{line.toLocaleString()}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeSetFromCart(i)}
                                className="w-8 h-8 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition flex-shrink-0"
                                title="ลบ"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              );
            })()}

            {/* Food Detail Modal (Professional / Business style) */}
            {foodModalIdx !== null && formData.foodItems[foodModalIdx] && (() => {
              const item = formData.foodItems[foodModalIdx];
              const idx = foodModalIdx;
              return (
                <div className="fixed inset-0 z-[120] bg-slate-900/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setFoodModalIdx(null)}>
                  <div className="bg-white rounded-t-xl sm:rounded-lg w-full sm:max-w-lg max-h-[95vh] overflow-hidden flex flex-col shadow-2xl shadow-orange-300/40 border border-orange-200" onClick={(e) => e.stopPropagation()}>
                    {/* Header — orange/amber gradient (food theme) */}
                    <div className="relative bg-gradient-to-br from-orange-600 via-amber-600 to-yellow-600 text-white px-5 py-4 flex items-center justify-between overflow-hidden">
                      <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/20 rounded-full blur-2xl pointer-events-none" />
                      <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-red-300/20 rounded-full blur-2xl pointer-events-none" />
                      <div className="relative">
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-white/20 backdrop-blur border border-white/30 rounded-full text-[9px] font-bold uppercase tracking-[0.15em] mb-1">
                          <Utensils size={10} /> {item.category.replace(/^[^\s]+\s/, '')}
                        </div>
                        <h3 className="text-xl font-bold leading-tight drop-shadow">{item.menu}</h3>
                        <p className="text-xs text-amber-100 font-medium">{item.menuEn}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFoodModalIdx(null)}
                        className="relative w-9 h-9 rounded-lg hover:bg-white/20 text-white flex items-center justify-center transition"
                      >
                        <X size={20} />
                      </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                      {/* Price row */}
                      <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-orange-50 via-amber-50 to-white border border-orange-200">
                        <div className="flex items-center gap-2">
                          <div className="w-1 h-8 bg-gradient-to-b from-orange-500 to-amber-500 rounded-full" />
                          <span className="text-xs text-orange-700 uppercase tracking-wider font-bold">Price</span>
                        </div>
                        <span className="text-2xl font-bold text-orange-700">฿{item.price.toLocaleString()}</span>
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
                              มีผู้แพ้อาหารในจำนวนนี้ / Has a Food Allergy
                            </p>
                            <p className="text-[11px] text-slate-500 normal-case font-normal leading-snug">
                              กรุณาระบุรายการอาหารที่แพ้ และแจ้งทีมครัวเพื่อหลีกเลี่ยงวัตถุดิบดังกล่าว
                              <br />
                              <span className="text-slate-400">Please specify the allergens so the kitchen team can avoid those ingredients.</span>
                            </p>
                          </div>
                          {item.hasAllergy && (
                            <span className="text-[10px] font-bold text-red-700 bg-red-100 border border-red-200 px-2 py-0.5 rounded">ALERT</span>
                          )}
                        </label>

                        {item.hasAllergy && (
                          <div className="p-4 space-y-3 bg-white">
                            {/* ชื่อคนแพ้ — รายชื่อ chip */}
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2">
                                ชื่อผู้แพ้ / Allergic Person's Name <span className="text-red-500">*</span>
                                <span className="text-slate-400 font-normal normal-case ml-1">(เพิ่มได้หลายคน)</span>
                              </label>

                              {/* รายชื่อที่เพิ่มแล้ว */}
                              {(item.allergyNames || []).length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                  {item.allergyNames.map((nm, ni) => (
                                    <span
                                      key={ni}
                                      className="inline-flex items-center gap-1.5 pl-3 pr-1 py-1 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-full text-xs font-semibold shadow-sm shadow-red-200"
                                    >
                                      <span className="w-4 h-4 rounded-full bg-white/25 flex items-center justify-center text-[9px] font-bold">{ni + 1}</span>
                                      <span>{nm}</span>
                                      <button
                                        type="button"
                                        onClick={() => removeAllergyName(idx, ni)}
                                        className="w-5 h-5 rounded-full hover:bg-white/25 flex items-center justify-center transition"
                                        aria-label="ลบ"
                                      >
                                        <X size={12} />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Input + ปุ่มเพิ่ม */}
                              <div className="flex gap-1.5">
                                <input
                                  type="text"
                                  value={allergyNameDraft}
                                  onChange={(e) => setAllergyNameDraft(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ',') {
                                      e.preventDefault();
                                      addAllergyName(idx, allergyNameDraft);
                                    }
                                  }}
                                  placeholder="พิมพ์ชื่อแล้วกด Enter หรือ +"
                                  className="flex-1 px-3 py-2 text-sm border border-red-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none bg-red-50/30"
                                />
                                <button
                                  type="button"
                                  onClick={() => addAllergyName(idx, allergyNameDraft)}
                                  disabled={!allergyNameDraft.trim()}
                                  className="px-3 py-2 bg-gradient-to-br from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-md font-bold transition shadow-sm shadow-red-200 flex items-center gap-1"
                                >
                                  <Plus size={16} />
                                </button>
                              </div>
                              {(item.allergyNames || []).length === 0 && (
                                <p className="text-[10px] text-slate-400 mt-1">เช่น: คุณสมชาย, คุณบุญมี, ตัวฉันเอง</p>
                              )}
                            </div>

                            {/* Allergy categories — 8 หมวดหลัก พร้อมรายการย่อย */}
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2">
                                สิ่งที่แพ้ / Allergens <span className="text-slate-400 font-normal normal-case">(เลือกได้หลายรายการในแต่ละหมวด)</span>
                              </label>
                              <p className="text-[10px] text-slate-500 mb-2 flex items-center gap-1">
                                <span>👆</span> แตะที่ไอคอนเพื่อเลือก — กรอบเขียว = สิ่งที่คุณแพ้
                              </p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {ALLERGY_OPTIONS.map((cat, ci) => {
                                  const isSelected = (item.allergies || []).includes(cat.key);
                                  const pickedSubs = cat.subs.filter((s) => (item.allergies || []).includes(s.k));
                                  return (
                                    <div key={cat.key} className="relative">
                                      <button
                                        type="button"
                                        onClick={() => toggleAllergy(idx, cat.key)}
                                        className={`group w-full p-3 rounded-xl border-2 transition-all text-center active:scale-95 ${
                                          isSelected
                                            ? 'border-emerald-500 bg-gradient-to-br from-emerald-50 to-green-50 shadow-lg shadow-emerald-200 ring-2 ring-emerald-400/30'
                                            : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30 hover:shadow-md'
                                        }`}
                                      >
                                        {/* เครื่องหมายถูก เมื่อเลือก */}
                                        {isSelected && (
                                          <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 text-white flex items-center justify-center shadow-md shadow-emerald-200 ring-2 ring-white">
                                            <CheckSquare size={14} className="fill-current" />
                                          </div>
                                        )}
                                        {/* รูปไอคอน */}
                                        <div className={`mx-auto w-14 h-14 rounded-xl bg-gradient-to-br ${cat.color} flex items-center justify-center text-3xl shadow-md transition-transform ${
                                          isSelected ? 'scale-105' : 'group-hover:scale-110'
                                        }`}>
                                          {cat.icon}
                                        </div>
                                        {/* ชื่อหมวด */}
                                        <p className={`mt-2 text-[12px] font-bold leading-tight ${isSelected ? 'text-emerald-800' : 'text-slate-800'}`}>
                                          <span className="text-slate-400 mr-1">{ci + 1}.</span>
                                          {cat.key}
                                        </p>
                                        <p className={`text-[9px] uppercase tracking-wider ${isSelected ? 'text-emerald-600' : 'text-slate-500'}`}>{cat.en}</p>
                                        {/* รายการย่อย — info text เล็กๆ */}
                                        <p className={`text-[9px] mt-1 leading-tight line-clamp-2 ${isSelected ? 'text-emerald-700' : 'text-slate-400'}`}>
                                          {cat.subs.map(s => s.k).join(' · ')}
                                        </p>
                                      </button>

                                      {/* รายการย่อย (chips) — แสดงเมื่อเลือกหมวดแล้ว สำหรับระบุละเอียด */}
                                      {isSelected && cat.subs.length > 1 && (
                                        <div className="mt-1.5 p-2 bg-white rounded-lg border border-emerald-200">
                                          <p className="text-[9px] text-emerald-700 font-semibold uppercase tracking-wider mb-1.5">
                                            ระบุละเอียด (ไม่บังคับ){pickedSubs.length > 0 && ` · ${pickedSubs.length} รายการ`}
                                          </p>
                                          <div className="flex flex-wrap gap-1">
                                            {cat.subs.map((s) => {
                                              const picked = (item.allergies || []).includes(s.k);
                                              return (
                                                <button
                                                  key={s.k}
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleAllergy(idx, s.k);
                                                  }}
                                                  className={`px-2 py-1 rounded-md text-[10px] font-semibold border transition ${
                                                    picked
                                                      ? 'bg-gradient-to-br from-emerald-500 to-green-600 text-white border-emerald-500 shadow-sm'
                                                      : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50'
                                                  }`}
                                                >
                                                  {s.k}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}
                                    </div>
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

                            {/* Warning box — bilingual notice */}
                            <div className="flex items-start gap-2 p-3 bg-gradient-to-br from-red-50 to-rose-50 border border-red-200 rounded-md">
                              <span className="text-red-600 font-bold text-base flex-shrink-0">⚠️</span>
                              <div className="text-[11px] leading-snug space-y-1.5">
                                <p className="text-red-800">
                                  <span className="font-bold">สำคัญ:</span> สำหรับผู้ที่มีอาการแพ้อาหาร กรุณาระบุรายการอาหารที่แพ้ให้ชัดเจน และแจ้งทีมครัวล่วงหน้า เพื่อให้สามารถจัดเตรียมอาหารและติดฉลากได้อย่างถูกต้อง ปลอดภัย และสามารถตรวจสอบได้
                                </p>
                                <p className="text-red-700/80 italic">
                                  <span className="font-bold not-italic">Important:</span> For individuals with food allergies, please clearly specify the allergens and inform the kitchen team in advance so that meals can be properly prepared and labeled in a safe and traceable manner.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Quantity */}
                      <div>
                        <p className="text-xs font-bold text-orange-700 uppercase tracking-wider mb-2">จำนวน / Quantity</p>
                        <div className="flex items-center justify-between bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50 border border-orange-200 rounded-lg px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => handleItemChange(idx, 'qty', Math.max(0, Number(item.qty) - 1))}
                            disabled={item.qty === 0}
                            className="w-10 h-10 rounded-lg bg-white border border-orange-300 hover:border-orange-500 hover:bg-orange-50 disabled:opacity-30 disabled:cursor-not-allowed text-orange-700 flex items-center justify-center transition shadow-sm"
                          >
                            <Minus size={16} />
                          </button>
                          <span className="text-3xl font-bold text-orange-700 tabular-nums">{item.qty}</span>
                          <button
                            type="button"
                            onClick={() => handleItemChange(idx, 'qty', Number(item.qty) + 1)}
                            className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white flex items-center justify-center transition shadow-md shadow-orange-200"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Footer action — colorful */}
                    <div className="px-5 py-4 border-t border-orange-100 bg-gradient-to-br from-orange-50/60 via-amber-50/40 to-yellow-50/40">
                      <div className="flex items-center justify-between mb-3 px-1">
                        <span className="text-xs text-orange-700 uppercase tracking-wider font-bold">รวม / Subtotal</span>
                        <span className="text-2xl font-bold text-orange-700">฿{((item.qty || 1) * item.price).toLocaleString()}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (item.qty === 0) handleItemChange(idx, 'qty', 1);
                          setFoodModalIdx(null);
                        }}
                        className="w-full bg-gradient-to-r from-orange-600 via-amber-600 to-orange-600 hover:from-orange-700 hover:via-amber-700 hover:to-orange-700 text-white rounded-lg py-3 font-bold text-sm transition shadow-lg shadow-orange-300 flex items-center justify-center gap-2"
                      >
                        <Plus size={16} />
                        {item.qty === 0 ? 'เพิ่มในรายการสั่ง / Add to Order' : 'บันทึก / Confirm'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Food total — orange accent */}
            <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-orange-50 via-amber-50 to-white border border-orange-200 rounded-lg shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-1 h-10 bg-gradient-to-b from-orange-500 to-amber-500 rounded-full" />
                <div>
                  <p className="text-[10px] text-orange-700 uppercase tracking-[0.15em] font-bold">รวมราคาอาหาร</p>
                  <p className="text-[10px] text-slate-500 font-normal">Food Subtotal</p>
                </div>
              </div>
              <div className="text-2xl font-bold text-orange-700 tracking-tight">฿{totalFoodCost.toLocaleString()}</div>
            </div>
          </section>

          {/* Section 6: Beverages (Teal/Cyan) */}
          <section className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-md shadow-teal-200">
                  <Coffee className="text-white" size={20} />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-teal-600 font-bold">Section 6</p>
                  <h2 className="text-xl font-bold text-slate-800">ประเภทเครื่องดื่ม / Beverages</h2>
                </div>
              </div>
              <div className="text-xs text-teal-700 bg-teal-50 px-3 py-1 rounded-full border border-teal-200 font-medium hidden sm:block">ข้ามถ้าไม่สั่ง</div>
            </div>

            {/* Section 6.5 — เลือกประเภทเครื่องดื่ม (highlight ตามสีที่กด) */}
            <div className="border border-slate-200 rounded-md overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5">
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">6.5 ประเภทเครื่องดื่ม <span className="text-red-500">*</span></p>
              </div>
              <div className="divide-y divide-slate-100">
                {[
                  { key: 'coffee', th: 'กาแฟ',           en: 'Coffee · มีตัวเลือกร้อน/เย็น',
                    accent: 'bg-gradient-to-r from-amber-50 via-orange-50 to-white border-l-4 border-l-amber-500',
                    accentText: 'text-amber-800', accentSub: 'text-amber-700', accentRadio: 'accent-amber-600' },
                  { key: 'tea',    th: 'ชา',              en: 'Tea · มีตัวเลือกร้อน/เย็น',
                    accent: 'bg-gradient-to-r from-emerald-50 via-green-50 to-white border-l-4 border-l-emerald-500',
                    accentText: 'text-emerald-800', accentSub: 'text-emerald-700', accentRadio: 'accent-emerald-600' },
                  { key: 'others', th: 'เครื่องดื่มอื่นๆ', en: 'Others · Italian Soda',
                    accent: 'bg-gradient-to-r from-fuchsia-50 via-pink-50 to-white border-l-4 border-l-fuchsia-500',
                    accentText: 'text-fuchsia-800', accentSub: 'text-fuchsia-700', accentRadio: 'accent-fuchsia-600' },
                ].map((opt) => {
                  const checked = formData.bevCategory === opt.key;
                  return (
                    <label
                      key={opt.key}
                      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition ${
                        checked ? opt.accent : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                      }`}
                    >
                      <input
                        type="radio"
                        name="bevCategory"
                        value={opt.key}
                        checked={checked}
                        onChange={(e) => {
                          setFormData(p => ({ ...p, bevCategory: e.target.value }));
                          setBevDraft({ menuIdx: '', temp: '', qty: 1 });
                        }}
                        className={`w-4 h-4 ${checked ? opt.accentRadio : 'accent-slate-900'}`}
                      />
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${checked ? opt.accentText : 'text-slate-700'}`}>{opt.th}</p>
                        <p className={`text-[11px] ${checked ? opt.accentSub : 'text-slate-500'}`}>{opt.en}</p>
                      </div>
                    </label>
                  );
                })}
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
              // Color theme เปลี่ยนตามประเภทที่เลือก
              const themeMap = {
                coffee: {
                  border: 'border-amber-300',
                  bg: 'bg-gradient-to-br from-amber-50/60 via-orange-50/30 to-white',
                  shadow: 'shadow-amber-100',
                  textBold: 'text-amber-800',
                  textSemi: 'text-amber-700',
                  ring: 'focus:ring-amber-500 focus:border-amber-500',
                  inputBorder: 'border-amber-300',
                  priceBg: 'bg-gradient-to-r from-amber-50 via-orange-50 to-white',
                  priceBar: 'bg-gradient-to-b from-amber-500 to-orange-500',
                  qtyBg: 'bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50',
                  qtyBtn: 'border-amber-300 hover:border-amber-500 hover:bg-amber-50 text-amber-700',
                  qtyBtnActive: 'bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-amber-200',
                  addBtn: 'from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 shadow-amber-200',
                  divider: 'border-amber-100',
                },
                tea: {
                  border: 'border-emerald-300',
                  bg: 'bg-gradient-to-br from-emerald-50/60 via-green-50/30 to-white',
                  shadow: 'shadow-emerald-100',
                  textBold: 'text-emerald-800',
                  textSemi: 'text-emerald-700',
                  ring: 'focus:ring-emerald-500 focus:border-emerald-500',
                  inputBorder: 'border-emerald-300',
                  priceBg: 'bg-gradient-to-r from-emerald-50 via-green-50 to-white',
                  priceBar: 'bg-gradient-to-b from-emerald-500 to-green-500',
                  qtyBg: 'bg-gradient-to-r from-emerald-50 via-green-50 to-emerald-50',
                  qtyBtn: 'border-emerald-300 hover:border-emerald-500 hover:bg-emerald-50 text-emerald-700',
                  qtyBtnActive: 'bg-gradient-to-br from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 shadow-emerald-200',
                  addBtn: 'from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 shadow-emerald-200',
                  divider: 'border-emerald-100',
                },
                others: {
                  border: 'border-fuchsia-300',
                  bg: 'bg-gradient-to-br from-fuchsia-50/60 via-pink-50/30 to-white',
                  shadow: 'shadow-fuchsia-100',
                  textBold: 'text-fuchsia-800',
                  textSemi: 'text-fuchsia-700',
                  ring: 'focus:ring-fuchsia-500 focus:border-fuchsia-500',
                  inputBorder: 'border-fuchsia-300',
                  priceBg: 'bg-gradient-to-r from-fuchsia-50 via-pink-50 to-white',
                  priceBar: 'bg-gradient-to-b from-fuchsia-500 to-pink-500',
                  qtyBg: 'bg-gradient-to-r from-fuchsia-50 via-pink-50 to-fuchsia-50',
                  qtyBtn: 'border-fuchsia-300 hover:border-fuchsia-500 hover:bg-fuchsia-50 text-fuchsia-700',
                  qtyBtnActive: 'bg-gradient-to-br from-fuchsia-500 to-pink-600 hover:from-fuchsia-600 hover:to-pink-700 shadow-fuchsia-200',
                  addBtn: 'from-fuchsia-600 to-pink-600 hover:from-fuchsia-700 hover:to-pink-700 shadow-fuchsia-200',
                  divider: 'border-fuchsia-100',
                },
              };
              const theme = themeMap[formData.bevCategory];
              const targetPrefix = catMap[formData.bevCategory];
              const menuOptions = BEVERAGE_ITEMS
                .map((b, i) => ({ ...b, i }))
                .filter((b) => b.menu.startsWith(targetPrefix));
              const draftSrc = bevDraft.menuIdx !== '' ? BEVERAGE_ITEMS[Number(bevDraft.menuIdx)] : null;
              const draftTempRequired = draftSrc && itemNeedsTemp(draftSrc);
              const draftIsCoffee = draftSrc && itemIsCoffee(draftSrc);
              const draftTemp = draftSrc?.icedOnly ? 'เย็น' : bevDraft.temp;
              const draftUnit = draftSrc ? getBevPrice(draftSrc, draftTemp, bevDraft.extraShot && draftIsCoffee) : 0;
              const draftTotal = Math.max(1, Number(bevDraft.qty) || 1) * draftUnit;

              return (
                <div className={`border ${theme.border} rounded-xl p-5 space-y-4 ${theme.bg} shadow-sm ${theme.shadow}`}>
                  {/* Dropdown: เลือกเมนู */}
                  <div>
                    <label className={`block text-[11px] font-bold ${theme.textSemi} uppercase tracking-wider mb-1.5`}>
                      เลือกเมนู / Select Menu <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={bevDraft.menuIdx}
                      onChange={(e) => setBevDraft({ menuIdx: e.target.value, temp: '', qty: 1, extraShot: false })}
                      className={`w-full px-3 py-2.5 text-sm border ${theme.inputBorder} rounded-lg bg-white ${theme.ring} focus:ring-2 outline-none`}
                    >
                      <option value="">— กรุณาเลือกเมนู —</option>
                      {menuOptions.map((b) => {
                        const lbl = b.priceHot && b.priceIced
                          ? `${b.type} · ร้อน ฿${b.priceHot} / เย็น ฿${b.priceIced}`
                          : b.icedOnly
                            ? `${b.type} · เย็นเท่านั้น ฿${b.priceIced}`
                            : `${b.type} · ฿${b.priceHot || b.priceIced}`;
                        return <option key={b.i} value={b.i}>{lbl}</option>;
                      })}
                    </select>
                  </div>

                  {draftSrc && (
                    <>
                      {/* Price */}
                      <div className={`flex items-center justify-between p-3 rounded-lg ${theme.priceBg} border ${theme.border}`}>
                        <div className="flex items-center gap-2">
                          <div className={`w-1 h-7 ${theme.priceBar} rounded-full`} />
                          <span className={`text-[11px] ${theme.textSemi} uppercase tracking-wider font-bold`}>
                            ราคา / Price {draftTemp && <span className="opacity-70">({draftTemp})</span>}
                          </span>
                        </div>
                        <span className={`text-xl font-bold ${theme.textSemi}`}>฿{draftUnit.toLocaleString()}</span>
                      </div>

                      {/* Temperature */}
                      {draftSrc.icedOnly ? (
                        <div className="px-3 py-2 rounded-lg bg-cyan-50 border border-cyan-200 text-[11px] text-cyan-700 font-semibold">
                          🥶 เมนูนี้มี<strong>เย็นเท่านั้น</strong> / Iced only
                        </div>
                      ) : draftTempRequired && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className={`text-[11px] font-bold ${theme.textSemi} uppercase tracking-wider`}>
                              อุณหภูมิ / Temperature <span className="text-red-500">*</span>
                            </p>
                            <span className="text-[10px] text-slate-400">เลือก 1</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            {['ร้อน', 'เย็น'].map((t) => {
                              const picked = bevDraft.temp === t;
                              const isHot = t === 'ร้อน';
                              const tPrice = isHot ? draftSrc.priceHot : draftSrc.priceIced;
                              return (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() => setBevDraft((d) => ({ ...d, temp: d.temp === t ? '' : t }))}
                                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium border transition ${
                                    picked
                                      ? isHot
                                        ? 'bg-gradient-to-br from-red-500 to-orange-600 text-white border-red-500 shadow-md shadow-red-200'
                                        : 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white border-cyan-500 shadow-md shadow-cyan-200'
                                      : isHot
                                        ? 'bg-white text-slate-700 border-slate-300 hover:border-red-400 hover:bg-red-50'
                                        : 'bg-white text-slate-700 border-slate-300 hover:border-cyan-400 hover:bg-cyan-50'
                                  }`}
                                >
                                  <div className="flex flex-col items-start">
                                    <span>{t} <span className="text-[10px] opacity-70 uppercase">{isHot ? 'Hot' : 'Cold'}</span></span>
                                    <span className="text-[10px] opacity-80">฿{tPrice}</span>
                                  </div>
                                  {picked && <span className="ml-1">✓</span>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* +Espresso Shot toggle (เฉพาะกาแฟ) */}
                      {draftIsCoffee && (
                        <label className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer border transition ${
                          bevDraft.extraShot
                            ? 'bg-amber-50 border-amber-400 shadow-sm'
                            : 'bg-white border-slate-200 hover:border-amber-300'
                        }`}>
                          <input
                            type="checkbox"
                            checked={!!bevDraft.extraShot}
                            onChange={(e) => setBevDraft((d) => ({ ...d, extraShot: e.target.checked }))}
                            className="w-4 h-4 accent-amber-600"
                          />
                          <div className="flex-1">
                            <p className={`text-xs font-bold ${bevDraft.extraShot ? 'text-amber-800' : 'text-slate-700'}`}>
                              ☕ เพิ่มช็อต / + Espresso Shot
                            </p>
                            <p className="text-[10px] text-slate-500">เข้มขึ้นอีก 1 ช็อต</p>
                          </div>
                          <span className={`text-sm font-bold ${bevDraft.extraShot ? 'text-amber-700' : 'text-slate-400'}`}>+฿{SHOT_PRICE}</span>
                        </label>
                      )}

                      {/* Quantity */}
                      <div>
                        <p className={`text-[11px] font-bold ${theme.textSemi} uppercase tracking-wider mb-2`}>จำนวน (กี่แก้ว) / Quantity <span className="text-red-500">*</span></p>
                        <div className={`flex items-center justify-between ${theme.qtyBg} border ${theme.border} rounded-lg px-4 py-2.5`}>
                          <button
                            type="button"
                            onClick={() => setBevDraft((d) => ({ ...d, qty: Math.max(1, (Number(d.qty) || 1) - 1) }))}
                            className={`w-10 h-10 rounded-lg bg-white border ${theme.qtyBtn} flex items-center justify-center transition shadow-sm`}
                          >
                            <Minus size={16} />
                          </button>
                          <span className={`text-3xl font-bold ${theme.textSemi} tabular-nums`}>{bevDraft.qty}</span>
                          <button
                            type="button"
                            onClick={() => setBevDraft((d) => ({ ...d, qty: (Number(d.qty) || 1) + 1 }))}
                            className={`w-10 h-10 rounded-lg ${theme.qtyBtnActive} text-white flex items-center justify-center transition shadow-md`}
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      </div>

                      {/* Subtotal + Add button */}
                      <div className={`pt-3 border-t ${theme.divider}`}>
                        <div className="flex items-center justify-between mb-3">
                          <span className={`text-[11px] ${theme.textSemi} uppercase tracking-wider font-bold`}>รวม / Subtotal</span>
                          <span className={`text-2xl font-bold ${theme.textSemi}`}>฿{draftTotal.toLocaleString()}</span>
                        </div>
                        {draftTempRequired && !bevDraft.temp && (
                          <p className="text-[11px] text-red-600 mb-2">* กรุณาเลือกอุณหภูมิก่อน / Please select temperature</p>
                        )}
                        <button
                          type="button"
                          onClick={addBevToCart}
                          disabled={draftTempRequired && !bevDraft.temp}
                          className={`w-full bg-gradient-to-r ${theme.addBtn} disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed text-white rounded-lg py-3 font-semibold text-sm transition flex items-center justify-center gap-2 shadow-md`}
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
                            {b.extraShot && (
                              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-300 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                ☕ +Shot
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500">
                            {en && <span>{en} · </span>}
                            ฿{b.price} × {b.qty}
                            {b.extraShot && <span className="text-amber-700 font-semibold"> (รวม +ช็อต ฿{SHOT_PRICE})</span>}
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

            {/* Beverages total — teal accent */}
            <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-teal-50 via-cyan-50 to-white border border-teal-200 rounded-lg shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-1 h-10 bg-gradient-to-b from-teal-500 to-cyan-500 rounded-full" />
                <div>
                  <p className="text-[10px] text-teal-700 uppercase tracking-[0.15em] font-bold">รวมราคาเครื่องดื่ม</p>
                  <p className="text-[10px] text-slate-500 font-normal">Beverages Subtotal</p>
                </div>
              </div>
              <div className="text-2xl font-bold text-teal-700 tracking-tight">฿{totalBevCost.toLocaleString()}</div>
            </div>
          </section>

          {/* Grand Total — gradient navy → indigo → fuchsia */}
          <div className="relative bg-gradient-to-br from-indigo-900 via-violet-800 to-fuchsia-800 text-white rounded-xl overflow-hidden shadow-2xl shadow-violet-300/40">
            <div className="absolute inset-0 opacity-30 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 70% 50%, rgba(255,255,255,0.3) 0, transparent 50%)' }} />
            <div className="absolute -bottom-8 -right-8 w-40 h-40 bg-amber-300/20 rounded-full blur-3xl pointer-events-none" />
            <div className="relative px-6 py-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur border border-white/20 flex items-center justify-center">
                  <Calculator size={22} className="text-white" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-indigo-200 font-bold">สรุปยอดรวมทั้งสิ้น</p>
                  <p className="text-sm font-medium text-white/90">Grand Total</p>
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl md:text-5xl font-bold tracking-tight">฿{grandTotal.toLocaleString()}</span>
                <span className="text-xs text-indigo-200 uppercase tracking-wider font-semibold">THB</span>
              </div>
            </div>
          </div>

          {/* Note (Amber accent) */}
          <section className="space-y-3 p-5 rounded-xl bg-gradient-to-br from-amber-50/80 to-yellow-50/40 border border-amber-200">
            <label className="block text-sm font-bold text-amber-900 flex items-center gap-2">
              <span className="w-1 h-4 bg-amber-500 rounded-full" />
              หมายเหตุเพิ่มเติม / Additional Note
            </label>
            <textarea
              name="note"
              value={formData.note}
              onChange={handleInputChange}
              className="w-full p-3 border border-amber-200 bg-white rounded-lg h-24 outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition"
              placeholder="เช่น งดผัก, เผ็ดน้อย, ห่อแยก... / e.g. no vegetables, less spicy..."
            />
          </section>

          {/* Section 7: ยืนยันและส่ง (Emerald) */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 pb-2 border-b border-slate-200">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-md shadow-emerald-200">
                <Send className="text-white" size={20} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-600 font-bold">Section 7</p>
                <h2 className="text-xl font-bold text-slate-800">ยืนยันและส่ง / Confirm &amp; Submit</h2>
              </div>
            </div>

            <div className="p-5 border border-emerald-200 rounded-xl bg-gradient-to-br from-emerald-50/50 via-white to-green-50/30 shadow-sm shadow-emerald-100 space-y-4">
              {/* ข้อมูลผู้ขอ — read-only confirmation */}
              <div className="bg-white rounded-lg border border-emerald-100 overflow-hidden">
                <div className="bg-gradient-to-r from-emerald-50 to-green-50 px-4 py-2 border-b border-emerald-100">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-emerald-700 font-bold flex items-center gap-1.5">
                    <ClipboardCheck size={12} /> ข้อมูลผู้ขอ / Requester Information
                  </p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-slate-100">
                  <div className="px-4 py-3 col-span-2 md:col-span-1">
                    <p className="text-[10px] text-emerald-600 uppercase tracking-wider font-bold">รหัสพนักงาน / ID</p>
                    <p className="text-sm font-mono font-bold text-slate-900 mt-0.5 truncate">{formData.employeeId || <span className="text-slate-400 italic font-sans font-normal">— ยังไม่กรอก —</span>}</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">ชื่อ / Name</p>
                    <p className="text-sm font-semibold text-slate-900 mt-0.5 truncate">{formData.requesterName || <span className="text-slate-400 italic">— ยังไม่กรอก —</span>}</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">แผนก / Dept</p>
                    <p className="text-sm font-semibold text-slate-900 mt-0.5 truncate">{formData.department || <span className="text-slate-400 italic">— ยังไม่กรอก —</span>}</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">อีเมล / Email</p>
                    <p className="text-xs font-mono font-medium text-slate-900 mt-0.5 truncate">{formData.email || <span className="text-slate-400 italic font-sans font-normal">— ไม่มี —</span>}</p>
                  </div>
                </div>
              </div>

              {/* ข้อความยืนยัน */}
              <div className="flex items-start gap-2 px-2">
                <span className="text-emerald-600 mt-0.5">✓</span>
                <p className="text-[11px] text-slate-600 leading-snug">
                  ระบบจะใช้ข้อมูล Login ของท่านเป็นการยืนยันคำขอโดยอัตโนมัติ ไม่จำเป็นต้องเซ็นชื่อ
                  <br />
                  <span className="text-slate-500 italic">Your login credentials will be automatically used to verify this request — no signature required.</span>
                </p>
              </div>

              {/* ปุ่มส่ง — เด่นๆ */}
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-gradient-to-r from-emerald-600 via-green-600 to-emerald-600 hover:from-emerald-700 hover:via-green-700 hover:to-emerald-700 text-white rounded-xl font-bold text-base shadow-lg shadow-emerald-200 disabled:opacity-60 disabled:cursor-not-allowed transition active:scale-[0.99]"
              >
                <Send size={20} />
                {submitting ? 'กำลังส่ง... / Submitting...' : 'ยืนยันและส่งคำขอ / Confirm & Submit Request'}
              </button>
              <p className="text-[10px] text-center text-slate-400">
                เมื่อกดส่ง คำขอจะถูกบันทึกและส่งเมลแจ้ง GA ทันที / Once submitted, GA will receive the request via email immediately.
              </p>
            </div>
          </section>

          {/* Mobile submit bar */}
          <div className="md:hidden print:hidden flex gap-2">
            <button
              onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.href = '/'; }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold border border-slate-200"
            >
              <ArrowLeft size={18} /> กลับ
            </button>
            <button onClick={resetForm} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold border border-slate-200">
              <Trash2 size={18} /> ล้าง
            </button>
            <button onClick={handlePrint} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 rounded-xl font-semibold">
              <Printer size={18} /> พิมพ์
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-[2] flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl font-black shadow-lg shadow-emerald-200 disabled:opacity-60"
            >
              <Send size={18} />
              {submitting ? 'กำลังส่ง...' : 'ส่งคำขอ'}
            </button>
          </div>
        </div>

        {/* Footer info — colorful */}
        <div className="bg-gradient-to-r from-indigo-50 via-violet-50 to-fuchsia-50 p-6 border-t border-indigo-100 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
          เอกสารนี้สร้างขึ้นโดยระบบ <span className="font-semibold text-indigo-700">Company Food &amp; Beverage Request System</span> — กรุณาตรวจสอบความถูกต้องก่อนส่ง
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
