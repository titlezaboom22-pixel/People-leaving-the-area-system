import React, { useState, useRef, useEffect } from 'react';
import { Printer, FileText, Eraser, Upload, Coffee, Send, Plus, Minus, Trash2, X, UtensilsCrossed } from 'lucide-react';
import { createApprovalWorkflowRequest } from './approvalNotifications';
import { copyHtmlAndOpenOutlook, buildApproveUrl } from './emailHelper';
import { SPECIAL_EMAILS } from './constants';
import { printDrinkOrder, printFoodOrder, printCombinedOrder } from './printDocument';

function getHeadByDepartment(dept) {
  const key = (dept || '').toString().trim().toUpperCase();
  return { name: `หัวหน้าแผนก ${key || '-'}` };
}

// =================== เมนูเครื่องดื่ม ===================
// ราคาจากร้าน To Be Coffee (TBKK)
const DRINK_MENU = {
  coffee: {
    label: '☕ กาแฟ',
    icon: '☕',
    color: 'amber',
    tempOptions: ['ร้อน', 'เย็น'],
    items: [
      { name: 'กาแฟดำ',     hot: 35, iced: 40 },
      { name: 'แอสเปรสโซ',  hot: 35, iced: 40 },
      { name: 'ลาเต้',       hot: 35, iced: 45 },
      { name: 'คาปูชิโน่',   hot: 35, iced: 45 },
      { name: 'ม็อคคา',      hot: 35, iced: 45 },
    ],
  },
  tea: {
    label: '🍵 ชา',
    icon: '🍵',
    color: 'green',
    tempOptions: ['เย็น'],
    items: [
      { name: 'ชาเขียว', hot: null, iced: 40 },
      { name: 'ชาไทย',   hot: null, iced: 40 },
      { name: 'ชาพีช',   hot: null, iced: 40 },
    ],
  },
  soda: {
    label: '🥤 อิตาเลียนโซดา',
    icon: '🥤',
    color: 'blue',
    tempOptions: ['เย็น'],
    items: [
      { name: 'แดงโซดา',        hot: null, iced: 35 },
      { name: 'แดงมะนาวโซดา',    hot: null, iced: 35 },
      { name: 'บลูฮาวายโซดา',    hot: null, iced: 35 },
      { name: 'บลูเบอรี่โซดา',   hot: null, iced: 35 },
      { name: 'พีชโซดา',         hot: null, iced: 35 },
    ],
  },
};

// Helper: ดึงราคาของรายการเครื่องดื่มตาม temp
const getDrinkPrice = (item) => {
  const cat = DRINK_MENU[item.category];
  if (!cat) return 0;
  const def = cat.items.find(i => i.name === item.name);
  if (!def) return 0;
  const p = item.temp === 'ร้อน' ? def.hot : def.iced;
  return p || 0;
};

// =================== เมนูอาหาร ===================
// เซ็ต = ข้าว 1 อย่าง + กับข้าว 3 อย่าง (ร้านจัดให้) ราคา ฿40 ต่อเซ็ต
// จานเดียว = สั่งทีละจาน ราคา ฿30 ต่อจาน
const FOOD_MENU = {
  set: {
    label: '🍱 เซ็ต ฿40 (ร้านจัดกับข้าว 3 อย่าง)',
    icon: '🍱',
    color: 'orange',
    items: [
      { name: 'กระเพรา',     meatOptions: ['หมู', 'ไก่', 'เนื้อ'], price: 40 },
      { name: 'ผัดพริกแกง',   meatOptions: ['หมู', 'ไก่', 'เนื้อ'], price: 40 },
      { name: 'ผัดผัก',       meatOptions: null, price: 40 },
      { name: 'หมูกระเทียม',  meatOptions: null, price: 40 },
    ],
  },
  single: {
    label: '🍛 จานเดียว ฿30',
    icon: '🍛',
    color: 'red',
    items: [
      { name: 'กระเพรา',     meatOptions: ['หมู', 'ไก่', 'เนื้อ'], price: 30 },
      { name: 'ผัดพริกแกง',   meatOptions: ['หมู', 'ไก่', 'เนื้อ'], price: 30 },
      { name: 'ผัดผัก',       meatOptions: null, price: 30 },
      { name: 'หมูกระเทียม',  meatOptions: null, price: 30 },
    ],
  },
};

// Helper: ดึงราคาอาหาร (null ถ้ายังไม่กำหนด)
const getFoodPrice = (item) => {
  const cat = FOOD_MENU[item.category];
  if (!cat) return null;
  const def = cat.items.find(i => i.name === item.name);
  return def?.price ?? null;
};

const foodCatColors = {
  set:    { bg: 'bg-orange-50', border: 'border-orange-200', active: 'bg-orange-600', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-800', item: 'bg-orange-500 hover:bg-orange-600' },
  single: { bg: 'bg-red-50',    border: 'border-red-200',    active: 'bg-red-600',    text: 'text-red-700',    badge: 'bg-red-100 text-red-800',    item: 'bg-red-500 hover:bg-red-600' },
};

// --- ส่วนประกอบสำหรับวาดและอัปโหลดลายเซ็น ---
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
    if (canvasRef.current) onSave(canvasRef.current.toDataURL('image/png'));
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
      reader.onload = (event) => { onSave(event.target.result); setIsEmpty(false); };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = '#000080';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }, [savedImage]);

  return (
    <div className="flex flex-col items-center group relative w-full h-full">
      <div className="relative w-full h-14 border-b border-black flex items-center justify-center overflow-hidden bg-transparent">
        {savedImage ? (
          <img src={savedImage} alt="signature" className="max-h-full max-w-full object-contain pointer-events-none" />
        ) : (
          <canvas ref={canvasRef} width={250} height={60}
            onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={endDrawing} onMouseOut={endDrawing}
            onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={endDrawing}
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
            <button type="button" onClick={clear} className="p-1 text-red-500 hover:bg-red-50"><Eraser size={12} /></button>
          )}
          <button type="button" onClick={() => fileInputRef.current && fileInputRef.current.click()} className="p-1 text-blue-600 hover:bg-blue-50"><Upload size={12} /></button>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />
        </div>
      </div>
    </div>
  );
};

// --- ตัวแอปหลัก ---
const DrinkOrderFormApp = () => {
  // mode: 'drink' | 'food' | 'both'
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'food') return 'food';
    if (tab === 'both') return 'both';
    return 'drink';
  });

  const [formData, setFormData] = useState({
    responsiblePerson: '',
    employeeId: '',
    department: '',
    orderDate: new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }),
    orderTime: '',
    note: '',
    ordererSign: null,
    deptManagerSign: null,
    generalAdminSign: null,
  });

  // === Drink state ===
  const [orderItems, setOrderItems] = useState([]);
  const [activeCategory, setActiveCategory] = useState('coffee');

  // === Food state (menu-based) ===
  const [foodItems, setFoodItems] = useState([]); // [{id, name, category, meat, qty}]
  const [activeFoodCategory, setActiveFoodCategory] = useState('set');
  const [foodNote, setFoodNote] = useState('');

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

  // === Drink functions ===
  const addItem = (itemName, category) => {
    const cat = DRINK_MENU[category];
    const defaultTemp = cat.tempOptions[cat.tempOptions.length - 1];
    setOrderItems(prev => [...prev, {
      id: Date.now() + Math.random(),
      name: itemName,
      category,
      temp: defaultTemp,
      qty: 1,
    }]);
  };

  const updateItem = (id, field, value) => {
    setOrderItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const removeItem = (id) => {
    setOrderItems(prev => prev.filter(item => item.id !== id));
  };

  const totalDrinkItems = orderItems.reduce((sum, item) => sum + item.qty, 0);
  const totalDrinkAmount = orderItems.reduce((sum, item) => sum + getDrinkPrice(item) * item.qty, 0);

  // === Food functions ===
  const addFoodItem = (itemDef, category) => {
    const defaultMeat = itemDef.meatOptions ? itemDef.meatOptions[0] : null;
    setFoodItems(prev => [...prev, {
      id: Date.now() + Math.random(),
      name: itemDef.name,
      category,
      meat: defaultMeat,
      qty: 1,
    }]);
  };

  const updateFoodItem = (id, field, value) => {
    setFoodItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const removeFoodItem = (id) => {
    setFoodItems(prev => prev.filter(item => item.id !== id));
  };

  const totalFoodItems = foodItems.reduce((sum, item) => sum + item.qty, 0);
  const totalFoodAmount = foodItems.reduce((sum, item) => {
    const p = getFoodPrice(item);
    return sum + (p || 0) * item.qty;
  }, 0);
  const hasFoodWithoutPrice = foodItems.some(item => getFoodPrice(item) == null);

  const handleBack = () => {
    if (window.opener) window.close();
    else window.location.href = '/';
  };

  // === Send Drink ===
  const handleSendDrink = async () => {
    if (orderItems.length === 0) {
      alert('กรุณาเลือกเครื่องดื่มอย่างน้อย 1 รายการ / Please select at least 1 drink');
      return;
    }
    const head = getHeadByDepartment(formData.department);
    const rows = orderItems.map(item => {
      const unitPrice = getDrinkPrice(item);
      return {
        details: `${item.name} (${item.temp})`,
        count: String(item.qty),
        condition: DRINK_MENU[item.category]?.label || '',
        unitPrice,
        lineTotal: unitPrice * item.qty,
      };
    });
    const totalAmount = totalDrinkAmount;

    const payload = {
      form: 'DRINK_ORDER',
      responsiblePerson: formData.responsiblePerson || '',
      employeeId: formData.employeeId || '',
      department: formData.department || '',
      targetHead: head.name,
      orderDate: formData.orderDate || '',
      orderTime: formData.orderTime || '',
      rows,
      totalAmount,
      note: formData.note || '',
      sentAt: new Date().toISOString(),
    };

    let workflowItemId = null;
    try {
      workflowItemId = await createApprovalWorkflowRequest({
        topic: 'เอกสารสั่งเครื่องดื่ม - GA รับออเดอร์',
        requesterId: payload.employeeId || '-',
        requesterName: payload.responsiblePerson || '-',
        requesterDepartment: payload.department || '',
        sourceForm: 'DRINK_ORDER',
        requestPayload: {
          responsiblePerson: payload.responsiblePerson,
          employeeId: payload.employeeId,
          department: payload.department,
          orderDate: payload.orderDate,
          orderTime: payload.orderTime,
          note: payload.note,
          rows,
          totalAmount,
        },
      });
    } catch (err) {
      console.error('Approval workflow error:', err);
    }
    printDrinkOrder(payload);
    const approveUrl = workflowItemId ? buildApproveUrl(workflowItemId) : '';
    const gaEmail = SPECIAL_EMAILS.GA;
    if (gaEmail) {
      await copyHtmlAndOpenOutlook({
        to: gaEmail,
        subject: `[SOC] ออเดอร์เครื่องดื่ม - ${payload.responsiblePerson || '-'}`,
        formType: 'DRINK_ORDER',
        data: payload,
        approveUrl,
        requesterSign: formData.ordererSign,
      });
    } else {
      alert('ส่งเอกสารเรียบร้อย! / Submitted!\nปลายทาง / To: GA');
    }
  };

  // === Send Food ===
  const handleSendFood = async () => {
    if (foodItems.length === 0) {
      alert('กรุณาเลือกรายการอาหารอย่างน้อย 1 รายการ / Please select at least 1 food item');
      return;
    }
    const head = getHeadByDepartment(formData.department);
    // แปลง foodItems → rows format เพื่อ compatibility กับ approval workflow
    const rows = foodItems.map(item => {
      const unitPrice = getFoodPrice(item);
      return {
        details: item.meat ? `${item.name} ${item.meat}` : item.name,
        count: String(item.qty),
        condition: FOOD_MENU[item.category]?.label || '',
        unitPrice,
        lineTotal: unitPrice != null ? unitPrice * item.qty : null,
      };
    });
    const totalAmount = hasFoodWithoutPrice ? null : totalFoodAmount;

    const payload = {
      form: 'FOOD_ORDER',
      responsiblePerson: formData.responsiblePerson || '',
      employeeId: formData.employeeId || '',
      department: formData.department || '',
      targetHead: head.name,
      orderDate: formData.orderDate || '',
      orderTime: formData.orderTime || '',
      rows,
      totalAmount,
      note: foodNote || '',
      sentAt: new Date().toISOString(),
    };

    let workflowItemId = null;
    try {
      workflowItemId = await createApprovalWorkflowRequest({
        topic: 'เอกสารสั่งอาหาร - GA รับออเดอร์',
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
          rows,
          totalAmount,
        },
      });
    } catch (err) {
      console.error('Approval workflow error:', err);
    }
    printFoodOrder(payload);
    const approveUrl = workflowItemId ? buildApproveUrl(workflowItemId) : '';
    const gaEmail = SPECIAL_EMAILS.GA;
    if (gaEmail) {
      await copyHtmlAndOpenOutlook({
        to: gaEmail,
        subject: `[SOC] ออเดอร์อาหาร - ${payload.responsiblePerson || '-'}`,
        formType: 'FOOD_ORDER',
        data: payload,
        approveUrl,
        requesterSign: formData.ordererSign,
      });
    } else {
      alert('ส่งเอกสารเรียบร้อย! / Submitted!\nปลายทาง / To: GA');
    }
  };

  // === Send Both ===
  const handleSendBoth = async () => {
    if (orderItems.length === 0 && foodItems.length === 0) {
      alert('กรุณาเลือกเครื่องดื่มหรืออาหารอย่างน้อย 1 รายการ / Please select at least 1 drink or food item');
      return;
    }
    const head = getHeadByDepartment(formData.department);

    // Build drink payload
    let drinkPayload = null;
    let drinkRows = [];
    if (orderItems.length > 0) {
      drinkRows = orderItems.map(item => {
        const unitPrice = getDrinkPrice(item);
        return {
          details: `${item.name} (${item.temp})`,
          count: String(item.qty),
          condition: DRINK_MENU[item.category]?.label || '',
          unitPrice,
          lineTotal: unitPrice * item.qty,
        };
      });
      drinkPayload = {
        form: 'DRINK_ORDER',
        responsiblePerson: formData.responsiblePerson || '',
        employeeId: formData.employeeId || '',
        department: formData.department || '',
        targetHead: head.name,
        orderDate: formData.orderDate || '',
        orderTime: formData.orderTime || '',
        rows: drinkRows,
        totalAmount: totalDrinkAmount,
        note: formData.note || '',
        sentAt: new Date().toISOString(),
      };
    }

    // Build food payload
    let foodPayload = null;
    let foodRows = [];
    if (foodItems.length > 0) {
      foodRows = foodItems.map(item => {
        const unitPrice = getFoodPrice(item);
        return {
          details: item.meat ? `${item.name} ${item.meat}` : item.name,
          count: String(item.qty),
          condition: FOOD_MENU[item.category]?.label || '',
          unitPrice,
          lineTotal: unitPrice != null ? unitPrice * item.qty : null,
        };
      });
      foodPayload = {
        form: 'FOOD_ORDER',
        responsiblePerson: formData.responsiblePerson || '',
        employeeId: formData.employeeId || '',
        department: formData.department || '',
        targetHead: head.name,
        orderDate: formData.orderDate || '',
        orderTime: formData.orderTime || '',
        rows: foodRows,
        totalAmount: hasFoodWithoutPrice ? null : totalFoodAmount,
        note: foodNote || '',
        sentAt: new Date().toISOString(),
      };
    }

    // Create approval workflow — one combined if both, otherwise single
    let workflowItemId = null;
    let combinedFormType = 'DRINK_ORDER';
    try {
      if (drinkPayload && foodPayload) {
        combinedFormType = 'DRINK_FOOD_ORDER';
        workflowItemId = await createApprovalWorkflowRequest({
          topic: 'เอกสารสั่งเครื่องดื่มและอาหาร - GA รับออเดอร์',
          requesterId: drinkPayload.employeeId || '-',
          requesterName: drinkPayload.responsiblePerson || '-',
          requesterDepartment: drinkPayload.department || '',
          sourceForm: 'DRINK_FOOD_ORDER',
          requestPayload: {
            responsiblePerson: drinkPayload.responsiblePerson,
            employeeId: drinkPayload.employeeId,
            department: drinkPayload.department,
            orderDate: drinkPayload.orderDate,
            orderTime: drinkPayload.orderTime,
            drinkRows,
            drinkNote: drinkPayload.note,
            drinkTotalAmount: drinkPayload.totalAmount,
            foodRows,
            foodNote: foodPayload.note,
            foodTotalAmount: foodPayload.totalAmount,
            ordererSign: formData.ordererSign || '',
          },
        });
      } else if (drinkPayload) {
        combinedFormType = 'DRINK_ORDER';
        workflowItemId = await createApprovalWorkflowRequest({
          topic: 'เอกสารสั่งเครื่องดื่ม - GA รับออเดอร์',
          requesterId: drinkPayload.employeeId || '-',
          requesterName: drinkPayload.responsiblePerson || '-',
          requesterDepartment: drinkPayload.department || '',
          sourceForm: 'DRINK_ORDER',
          requestPayload: {
            responsiblePerson: drinkPayload.responsiblePerson,
            employeeId: drinkPayload.employeeId,
            department: drinkPayload.department,
            orderDate: drinkPayload.orderDate,
            orderTime: drinkPayload.orderTime,
            note: drinkPayload.note,
            rows: drinkRows,
            totalAmount: drinkPayload.totalAmount,
            ordererSign: formData.ordererSign || '',
          },
        });
      } else if (foodPayload) {
        combinedFormType = 'FOOD_ORDER';
        workflowItemId = await createApprovalWorkflowRequest({
          topic: 'เอกสารสั่งอาหาร - GA รับออเดอร์',
          requesterId: foodPayload.employeeId || '-',
          requesterName: foodPayload.responsiblePerson || '-',
          requesterDepartment: foodPayload.department || '',
          sourceForm: 'FOOD_ORDER',
          requestPayload: {
            responsiblePerson: foodPayload.responsiblePerson,
            employeeId: foodPayload.employeeId,
            department: foodPayload.department,
            orderDate: foodPayload.orderDate,
            orderTime: foodPayload.orderTime,
            note: foodPayload.note,
            rows: foodRows,
            totalAmount: foodPayload.totalAmount,
            ordererSign: formData.ordererSign || '',
          },
        });
      }
    } catch (err) { console.error('Combined approval error:', err); }

    // Print combined document (pass signature so ผู้สั่ง box shows it)
    const drinkForPrint = drinkPayload ? { ...drinkPayload, ordererSign: formData.ordererSign || '' } : null;
    const foodForPrint = foodPayload ? { ...foodPayload, ordererSign: formData.ordererSign || '' } : null;
    printCombinedOrder(drinkForPrint, foodForPrint);

    // Build email data — รวม drink + food เข้าเป็น payload เดียว
    const approveUrl = workflowItemId ? buildApproveUrl(workflowItemId) : '';
    const emailData = combinedFormType === 'DRINK_FOOD_ORDER'
      ? {
          responsiblePerson: formData.responsiblePerson,
          employeeId: formData.employeeId,
          department: formData.department,
          orderDate: formData.orderDate,
          orderTime: formData.orderTime,
          drinkRows,
          drinkTotalAmount: drinkPayload?.totalAmount,
          foodRows,
          foodTotalAmount: foodPayload?.totalAmount,
        }
      : (drinkPayload || foodPayload);

    // Decide subject
    const subject = combinedFormType === 'DRINK_FOOD_ORDER'
      ? `[SOC] ออเดอร์เครื่องดื่ม+อาหาร - ${formData.responsiblePerson || '-'}`
      : combinedFormType === 'DRINK_ORDER'
        ? `[SOC] ออเดอร์เครื่องดื่ม - ${formData.responsiblePerson || '-'}`
        : `[SOC] ออเดอร์อาหาร - ${formData.responsiblePerson || '-'}`;

    // Send email → GA โดยตรง (ไม่ผ่านหัวหน้า)
    const gaEmail = SPECIAL_EMAILS.GA;
    if (gaEmail) {
      await copyHtmlAndOpenOutlook({
        to: gaEmail,
        subject,
        formType: combinedFormType,
        data: emailData,
        approveUrl,
        requesterSign: formData.ordererSign,
      });
    } else {
      alert('ส่งเอกสารเรียบร้อย! / Submitted!\nปลายทาง / To: GA');
    }
  };

  const handleSend = () => {
    if (activeTab === 'drink') return handleSendDrink();
    if (activeTab === 'food') return handleSendFood();
    return handleSendBoth();
  };

  const totalAll = totalDrinkItems + totalFoodItems;

  const catColors = {
    coffee: { bg: 'bg-amber-50', border: 'border-amber-200', active: 'bg-amber-600', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800', item: 'bg-amber-500 hover:bg-amber-600' },
    tea: { bg: 'bg-green-50', border: 'border-green-200', active: 'bg-green-600', text: 'text-green-700', badge: 'bg-green-100 text-green-800', item: 'bg-green-500 hover:bg-green-600' },
    soda: { bg: 'bg-blue-50', border: 'border-blue-200', active: 'bg-blue-600', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-800', item: 'bg-blue-500 hover:bg-blue-600' },
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans">
      {/* Top Bar */}
      <div className="max-w-5xl mx-auto mb-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-2xl shadow-lg border border-slate-200 print:hidden">
        <div className="flex items-center gap-3">
          <div className={`${activeTab === 'food' ? 'bg-orange-500' : activeTab === 'both' ? 'bg-purple-500' : 'bg-amber-500'} p-3 rounded-xl text-white shadow-md`}>
            {activeTab === 'food' ? <UtensilsCrossed size={24} /> : activeTab === 'both' ? <><Coffee size={20} /><UtensilsCrossed size={20} /></> : <Coffee size={24} />}
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-800">
              {activeTab === 'drink' ? 'สั่งเครื่องดื่ม' : activeTab === 'food' ? 'สั่งอาหาร' : 'สั่งเครื่องดื่ม + อาหาร'}
            </h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest">
              {activeTab === 'drink' ? 'Beverage Order' : activeTab === 'food' ? 'Food Order' : 'Beverage & Food Order'}
            </p>
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button onClick={handleBack} className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-sm">← กลับ / Back</button>
          <button
            onClick={handleSend}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md"
          >
            <Send size={16} /> ส่ง ({activeTab === 'drink' ? totalDrinkItems : activeTab === 'food' ? totalFoodItems : totalAll})
          </button>
        </div>
      </div>

      {/* Main Tab Toggle — 3 choices */}
      <div className="max-w-5xl mx-auto mb-3 print:hidden">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-1.5 flex gap-1.5">
          <button
            onClick={() => setActiveTab('drink')}
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-sm transition-all ${
              activeTab === 'drink'
                ? 'bg-amber-500 text-white shadow-md'
                : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Coffee size={18} />
            <span className="hidden sm:inline">สั่ง</span>น้ำ
            {totalDrinkItems > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-black ${activeTab === 'drink' ? 'bg-white/30 text-white' : 'bg-amber-100 text-amber-700'}`}>
                {totalDrinkItems}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('food')}
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-sm transition-all ${
              activeTab === 'food'
                ? 'bg-orange-500 text-white shadow-md'
                : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <UtensilsCrossed size={18} />
            <span className="hidden sm:inline">สั่ง</span>ข้าว
            {totalFoodItems > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-black ${activeTab === 'food' ? 'bg-white/30 text-white' : 'bg-orange-100 text-orange-700'}`}>
                {totalFoodItems}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('both')}
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-sm transition-all ${
              activeTab === 'both'
                ? 'bg-purple-500 text-white shadow-md'
                : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Coffee size={16} />+<UtensilsCrossed size={16} />
            <span className="hidden sm:inline">น้ำ</span>กับข้าว
            {totalAll > 0 && activeTab !== 'both' && (
              <span className="px-2 py-0.5 rounded-full text-xs font-black bg-purple-100 text-purple-700">
                {totalAll}
              </span>
            )}
            {totalAll > 0 && activeTab === 'both' && (
              <span className="px-2 py-0.5 rounded-full text-xs font-black bg-white/30 text-white">
                {totalAll}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ============== DRINK TAB (drink only) ============== */}
      {activeTab === 'drink' && (
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-4 print:hidden">
          {/* ฝั่งซ้าย — ข้อมูลผู้สั่ง + รายการ */}
          <div className="lg:col-span-2 space-y-3 order-last lg:order-first">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
              <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">📋 ข้อมูลผู้สั่ง</h3>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">ชื่อผู้รับรอง</label>
                <input type="text" value={formData.responsiblePerson} onChange={e => setFormData({...formData, responsiblePerson: e.target.value})}
                  className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none" placeholder="ชื่อ-นามสกุล / Full name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">รหัสพนักงาน</label>
                  <input type="text" value={formData.employeeId} onChange={e => setFormData({...formData, employeeId: e.target.value})}
                    className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-400 outline-none" placeholder="EMP-XXX" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">แผนก</label>
                  <input type="text" value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})}
                    className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-400 outline-none" placeholder="แผนก / Department" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">วันที่สั่ง</label>
                  <input type="text" value={formData.orderDate} onChange={e => setFormData({...formData, orderDate: e.target.value})}
                    className="w-full p-3 border border-slate-200 rounded-xl text-sm bg-slate-50" readOnly />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">เวลา</label>
                  <input type="time" value={formData.orderTime} onChange={e => setFormData({...formData, orderTime: e.target.value})}
                    className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-400 outline-none" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">หมายเหตุ</label>
                <textarea value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})}
                  className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-400 outline-none resize-none h-16" placeholder="เพิ่มเติม... / Additional notes..." />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">ลายเซ็นผู้สั่ง</label>
                <div className="border border-slate-200 rounded-xl p-2 bg-slate-50 h-20 flex items-center justify-center">
                  <SignaturePad
                    onSave={(img) => setFormData({...formData, ordererSign: img})}
                    savedImage={formData.ordererSign}
                    label="วาดลายเซ็นที่นี่ / Draw signature here"
                  />
                </div>
              </div>
            </div>

            {/* รายการที่สั่ง */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <h3 className="font-black text-slate-800 text-sm flex items-center justify-between mb-3">
                <span>🧾 รายการที่สั่ง</span>
                {orderItems.length > 0 && <span className="bg-amber-500 text-white px-2.5 py-0.5 rounded-full text-xs font-black">{totalDrinkItems} แก้ว</span>}
              </h3>
              {orderItems.length === 0 ? (
                <p className="text-slate-300 text-sm text-center py-6">เลือกเครื่องดื่มจากเมนูด้านขวา →</p>
              ) : (
                <>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {orderItems.map(item => {
                    const c = catColors[item.category];
                    const cat = DRINK_MENU[item.category];
                    const unitPrice = getDrinkPrice(item);
                    const lineTotal = unitPrice * item.qty;
                    return (
                      <div key={item.id} className={`${c.bg} ${c.border} border rounded-xl p-3 flex items-center gap-3`}>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-800 text-sm truncate">{item.name}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className={`${c.badge} text-[10px] font-bold px-2 py-0.5 rounded-full`}>{cat.label}</span>
                            {cat.tempOptions.length > 1 ? (
                              <div className="flex rounded-lg overflow-hidden border border-slate-200 text-[10px]">
                                {cat.tempOptions.map(t => (
                                  <button key={t} onClick={() => updateItem(item.id, 'temp', t)}
                                    className={`px-2 py-0.5 font-bold ${item.temp === t ? (t === 'ร้อน' ? 'bg-red-500 text-white' : 'bg-sky-500 text-white') : 'bg-white text-slate-500'}`}>
                                    {t === 'ร้อน' ? '🔥' : '🧊'} {t}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-bold">🧊 เย็น</span>
                            )}
                            <span className="text-[10px] font-bold text-amber-700 bg-white/70 px-2 py-0.5 rounded-full border border-amber-200">
                              ฿{unitPrice} × {item.qty} = ฿{lineTotal}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={() => updateItem(item.id, 'qty', Math.max(1, item.qty - 1))}
                            className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50">
                            <Minus size={14} />
                          </button>
                          <span className="w-8 text-center font-black text-lg text-slate-800">{item.qty}</span>
                          <button onClick={() => updateItem(item.id, 'qty', item.qty + 1)}
                            className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50">
                            <Plus size={14} />
                          </button>
                        </div>
                        <button onClick={() => removeItem(item.id)}
                          className="w-7 h-7 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center text-red-400 hover:bg-red-100 shrink-0">
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
                {/* Grand total */}
                <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-600">💰 ยอดรวม</span>
                  <span className="text-xl font-black text-amber-600">฿{totalDrinkAmount.toLocaleString()}</span>
                </div>
                </>
              )}
            </div>
          </div>

          {/* ฝั่งขวา — เมนูเครื่องดื่ม */}
          <div className="lg:col-span-3 order-first lg:order-last">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              {/* Category Tabs */}
              <div className="flex border-b border-slate-200">
                {Object.entries(DRINK_MENU).map(([key, cat]) => (
                  <button key={key} onClick={() => setActiveCategory(key)}
                    className={`flex-1 py-3.5 text-sm font-bold transition-all ${activeCategory === key
                      ? `${catColors[key].active} text-white shadow-inner`
                      : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Menu Items */}
              <div className="p-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {DRINK_MENU[activeCategory].items.map(itemDef => {
                    const itemName = itemDef.name;
                    const alreadyOrdered = orderItems.filter(o => o.name === itemName && o.category === activeCategory);
                    const totalQty = alreadyOrdered.reduce((s, o) => s + o.qty, 0);
                    const c = catColors[activeCategory];
                    const cat = DRINK_MENU[activeCategory];
                    const priceLabel = cat.tempOptions.length > 1
                      ? `ร้อน ฿${itemDef.hot} / เย็น ฿${itemDef.iced}`
                      : `฿${itemDef.iced}`;
                    return (
                      <button key={itemName} onClick={() => addItem(itemName, activeCategory)}
                        className={`relative p-4 rounded-2xl border-2 ${c.border} ${c.bg} hover:shadow-md transition-all text-left group active:scale-95`}>
                        <p className="text-3xl mb-2">{cat.icon}</p>
                        <p className={`font-bold text-sm ${c.text}`}>{itemName}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {cat.tempOptions.join(' / ')}
                        </p>
                        <p className={`text-[11px] font-black ${c.text} mt-1`}>
                          💰 {priceLabel}
                        </p>
                        {totalQty > 0 && (
                          <span className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-black shadow-sm">
                            {totalQty}
                          </span>
                        )}
                        <div className={`absolute bottom-2 right-2 w-7 h-7 ${c.item} text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-sm`}>
                          <Plus size={16} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============== FOOD TAB (food only) ============== */}
      {activeTab === 'food' && (
        <div className={`max-w-5xl mx-auto print:hidden ${activeTab === 'both' ? 'mt-4' : ''}`}>
          <div className={`grid grid-cols-1 lg:grid-cols-5 gap-4`}>
            {/* ฝั่งซ้าย — ข้อมูลผู้สั่ง + รายการที่สั่ง */}
            <div className="lg:col-span-2 space-y-3 order-last lg:order-first">
              {/* ข้อมูลผู้สั่ง (แสดงเฉพาะ food-only mode) */}
              {activeTab === 'food' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
                  <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">📋 ข้อมูลผู้สั่ง</h3>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">ชื่อผู้รับรอง</label>
                    <input type="text" value={formData.responsiblePerson} onChange={e => setFormData({...formData, responsiblePerson: e.target.value})}
                      className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none" placeholder="ชื่อ-นามสกุล / Full name" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">รหัสพนักงาน</label>
                      <input type="text" value={formData.employeeId} onChange={e => setFormData({...formData, employeeId: e.target.value})}
                        className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-400 outline-none" placeholder="EMP-XXX" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">แผนก</label>
                      <input type="text" value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})}
                        className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-400 outline-none" placeholder="แผนก / Department" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">วันที่สั่ง</label>
                      <input type="text" value={formData.orderDate} readOnly
                        className="w-full p-3 border border-slate-200 rounded-xl text-sm bg-slate-50" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">เวลา</label>
                      <input type="time" value={formData.orderTime} onChange={e => setFormData({...formData, orderTime: e.target.value})}
                        className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-400 outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">หมายเหตุ</label>
                    <textarea value={foodNote} onChange={e => setFoodNote(e.target.value)}
                      className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-400 outline-none resize-none h-16" placeholder="เช่น อาหารฮาลาล, แพ้อาหาร... / e.g. Halal, allergies..." />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">ลายเซ็นผู้สั่ง</label>
                    <div className="border border-slate-200 rounded-xl p-2 bg-slate-50 h-20 flex items-center justify-center">
                      <SignaturePad
                        onSave={(img) => setFormData({...formData, ordererSign: img})}
                        savedImage={formData.ordererSign}
                        label="วาดลายเซ็นที่นี่ / Draw signature here"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* รายการอาหารที่สั่ง */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                <h3 className="font-black text-slate-800 text-sm flex items-center justify-between mb-3">
                  <span>🧾 รายการอาหารที่สั่ง</span>
                  {foodItems.length > 0 && <span className="bg-orange-500 text-white px-2.5 py-0.5 rounded-full text-xs font-black">{totalFoodItems} จาน</span>}
                </h3>
                {foodItems.length === 0 ? (
                  <p className="text-slate-300 text-sm text-center py-6">เลือกอาหารจากเมนูด้านขวา →</p>
                ) : (
                  <>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {foodItems.map(item => {
                      const fc = foodCatColors[item.category];
                      const cat = FOOD_MENU[item.category];
                      const itemDef = cat?.items.find(i => i.name === item.name);
                      const unitPrice = getFoodPrice(item);
                      const lineTotal = (unitPrice || 0) * item.qty;
                      return (
                        <div key={item.id} className={`${fc.bg} ${fc.border} border rounded-xl p-3 flex items-center gap-3`}>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-slate-800 text-sm truncate">
                              {item.name}{item.meat ? ` ${item.meat}` : ''}
                            </p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className={`${fc.badge} text-[10px] font-bold px-2 py-0.5 rounded-full`}>{cat.label}</span>
                              {itemDef?.meatOptions && (
                                <div className="flex rounded-lg overflow-hidden border border-slate-200 text-[10px]">
                                  {itemDef.meatOptions.map(m => (
                                    <button key={m} onClick={() => updateFoodItem(item.id, 'meat', m)}
                                      className={`px-2 py-0.5 font-bold ${item.meat === m ? 'bg-orange-500 text-white' : 'bg-white text-slate-500'}`}>
                                      {m === 'หมู' ? '🐷' : m === 'ไก่' ? '🐔' : '🐄'} {m}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {unitPrice != null ? (
                                <span className="text-[10px] font-bold text-orange-700 bg-white/70 px-2 py-0.5 rounded-full border border-orange-200">
                                  ฿{unitPrice} × {item.qty} = ฿{lineTotal}
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-slate-400 bg-white/70 px-2 py-0.5 rounded-full border border-slate-200">
                                  💬 รอกำหนดราคา
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button onClick={() => updateFoodItem(item.id, 'qty', Math.max(1, item.qty - 1))}
                              className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50">
                              <Minus size={14} />
                            </button>
                            <span className="w-8 text-center font-black text-lg text-slate-800">{item.qty}</span>
                            <button onClick={() => updateFoodItem(item.id, 'qty', item.qty + 1)}
                              className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50">
                              <Plus size={14} />
                            </button>
                          </div>
                          <button onClick={() => removeFoodItem(item.id)}
                            className="w-7 h-7 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center text-red-400 hover:bg-red-100 shrink-0">
                            <X size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {/* Grand total (ถ้ามีราคาครบ) */}
                  <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-600">💰 ยอดรวม</span>
                    {hasFoodWithoutPrice ? (
                      <span className="text-xs font-bold text-slate-400">GA กำหนดราคาภายหลัง</span>
                    ) : (
                      <span className="text-xl font-black text-orange-600">฿{totalFoodAmount.toLocaleString()}</span>
                    )}
                  </div>
                  </>
                )}

                {/* หมายเหตุ — ใน both mode */}
                {activeTab === 'both' && (
                  <div className="mt-3 pt-3 border-t border-orange-100">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">หมายเหตุอาหาร</label>
                    <textarea value={foodNote} onChange={e => setFoodNote(e.target.value)}
                      className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-300 outline-none resize-none h-16" placeholder="เช่น อาหารฮาลาล, แพ้อาหาร... / e.g. Halal, allergies..." />
                  </div>
                )}
              </div>
            </div>

            {/* ฝั่งขวา — เมนูอาหาร */}
            <div className="lg:col-span-3 order-first lg:order-last">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                {/* Category Tabs */}
                <div className="flex border-b border-slate-200">
                  {Object.entries(FOOD_MENU).map(([key, cat]) => (
                    <button key={key} onClick={() => setActiveFoodCategory(key)}
                      className={`flex-1 py-3.5 text-sm font-bold transition-all ${activeFoodCategory === key
                        ? `${foodCatColors[key].active} text-white shadow-inner`
                        : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Menu Items */}
                <div className="p-4">
                  <div className="grid grid-cols-2 gap-3">
                    {FOOD_MENU[activeFoodCategory].items.map(itemDef => {
                      const alreadyOrdered = foodItems.filter(o => o.name === itemDef.name && o.category === activeFoodCategory);
                      const totalQty = alreadyOrdered.reduce((s, o) => s + o.qty, 0);
                      const fc = foodCatColors[activeFoodCategory];
                      return (
                        <button key={itemDef.name} onClick={() => addFoodItem(itemDef, activeFoodCategory)}
                          className={`relative p-4 rounded-2xl border-2 ${fc.border} ${fc.bg} hover:shadow-md transition-all text-left group active:scale-95`}>
                          <p className="text-3xl mb-2">{FOOD_MENU[activeFoodCategory].icon}</p>
                          <p className={`font-bold text-sm ${fc.text}`}>{itemDef.name}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {itemDef.meatOptions ? `เลือก: ${itemDef.meatOptions.join(' / ')}` : '-'}
                          </p>
                          {itemDef.price != null && (
                            <p className={`text-[11px] font-black ${fc.text} mt-1`}>💰 ฿{itemDef.price}</p>
                          )}
                          {totalQty > 0 && (
                            <span className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-black shadow-sm">
                              {totalQty}
                            </span>
                          )}
                          <div className={`absolute bottom-2 right-2 w-7 h-7 ${fc.item} text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-sm`}>
                            <Plus size={16} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============== BOTH TAB ============== */}
      {activeTab === 'both' && (() => {
        const allOrderedItems = [
          ...orderItems.map(i => ({ ...i, itemType: 'drink' })),
          ...foodItems.map(i => ({ ...i, itemType: 'food' })),
        ];
        const totalAllItems = allOrderedItems.reduce((s, i) => s + i.qty, 0);

        return (
          <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-4 print:hidden">
            {/* ฝั่งซ้าย — ข้อมูลผู้สั่ง + รายการรวม */}
            <div className="lg:col-span-2 space-y-3 order-last lg:order-first">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
                <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">📋 ข้อมูลผู้สั่ง</h3>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">ชื่อผู้รับรอง</label>
                  <input type="text" value={formData.responsiblePerson} onChange={e => setFormData({...formData, responsiblePerson: e.target.value})}
                    className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-400 outline-none" placeholder="ชื่อ-นามสกุล / Full name" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">รหัสพนักงาน</label>
                    <input type="text" value={formData.employeeId} onChange={e => setFormData({...formData, employeeId: e.target.value})}
                      className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-400 outline-none" placeholder="EMP-XXX" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">แผนก</label>
                    <input type="text" value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})}
                      className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-400 outline-none" placeholder="แผนก / Department" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">วันที่สั่ง</label>
                    <input type="text" value={formData.orderDate} readOnly className="w-full p-3 border border-slate-200 rounded-xl text-sm bg-slate-50" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">เวลา</label>
                    <input type="time" value={formData.orderTime} onChange={e => setFormData({...formData, orderTime: e.target.value})}
                      className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-400 outline-none" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">หมายเหตุ</label>
                  <textarea value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})}
                    className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-400 outline-none resize-none h-16" placeholder="เพิ่มเติม... / Additional notes..." />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">ลายเซ็นผู้สั่ง</label>
                  <div className="border border-slate-200 rounded-xl p-2 bg-slate-50 h-20 flex items-center justify-center">
                    <SignaturePad
                      onSave={(img) => setFormData({...formData, ordererSign: img})}
                      savedImage={formData.ordererSign}
                      label="วาดลายเซ็นที่นี่ / Draw signature here"
                    />
                  </div>
                </div>
              </div>

              {/* รายการรวม */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                <h3 className="font-black text-slate-800 text-sm flex items-center justify-between mb-3">
                  <span>🧾 รายการที่สั่ง</span>
                  {totalAllItems > 0 && <span className="bg-purple-500 text-white px-2.5 py-0.5 rounded-full text-xs font-black">{totalAllItems} รายการ</span>}
                </h3>
                {allOrderedItems.length === 0 ? (
                  <p className="text-slate-300 text-sm text-center py-6">เลือกจากเมนูด้านขวา →</p>
                ) : (
                  <>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {allOrderedItems.map(item => {
                      const isDrink = item.itemType === 'drink';
                      const c = isDrink ? catColors[item.category] : foodCatColors[item.category];
                      const catDef = isDrink ? DRINK_MENU[item.category] : FOOD_MENU[item.category];
                      const itemDef = !isDrink ? catDef?.items.find(i => i.name === item.name) : null;
                      const unitPrice = isDrink ? getDrinkPrice(item) : getFoodPrice(item);
                      const lineTotal = unitPrice != null ? unitPrice * item.qty : null;
                      return (
                        <div key={item.id} className={`${c?.bg || 'bg-slate-50'} ${c?.border || 'border-slate-200'} border rounded-xl p-3 flex items-center gap-3`}>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-slate-800 text-sm truncate">
                              {isDrink ? item.name : `${item.name}${item.meat ? ` ${item.meat}` : ''}`}
                            </p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className={`${c?.badge || 'bg-slate-100 text-slate-700'} text-[10px] font-bold px-2 py-0.5 rounded-full`}>{catDef?.label}</span>
                              {isDrink && DRINK_MENU[item.category]?.tempOptions.length > 1 && (
                                <div className="flex rounded-lg overflow-hidden border border-slate-200 text-[10px]">
                                  {DRINK_MENU[item.category].tempOptions.map(t => (
                                    <button key={t} onClick={() => updateItem(item.id, 'temp', t)}
                                      className={`px-2 py-0.5 font-bold ${item.temp === t ? (t === 'ร้อน' ? 'bg-red-500 text-white' : 'bg-sky-500 text-white') : 'bg-white text-slate-500'}`}>
                                      {t === 'ร้อน' ? '🔥' : '🧊'} {t}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {!isDrink && itemDef?.meatOptions && (
                                <div className="flex rounded-lg overflow-hidden border border-slate-200 text-[10px]">
                                  {itemDef.meatOptions.map(m => (
                                    <button key={m} onClick={() => updateFoodItem(item.id, 'meat', m)}
                                      className={`px-2 py-0.5 font-bold ${item.meat === m ? 'bg-orange-500 text-white' : 'bg-white text-slate-500'}`}>
                                      {m === 'หมู' ? '🐷' : m === 'ไก่' ? '🐔' : '🐄'} {m}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {lineTotal != null ? (
                                <span className="text-[10px] font-bold text-purple-700 bg-white/70 px-2 py-0.5 rounded-full border border-purple-200">
                                  ฿{unitPrice} × {item.qty} = ฿{lineTotal}
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-slate-400 bg-white/70 px-2 py-0.5 rounded-full border border-slate-200">
                                  💬 รอกำหนดราคา
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button onClick={() => isDrink ? updateItem(item.id, 'qty', Math.max(1, item.qty - 1)) : updateFoodItem(item.id, 'qty', Math.max(1, item.qty - 1))}
                              className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50"><Minus size={14} /></button>
                            <span className="w-8 text-center font-black text-lg text-slate-800">{item.qty}</span>
                            <button onClick={() => isDrink ? updateItem(item.id, 'qty', item.qty + 1) : updateFoodItem(item.id, 'qty', item.qty + 1)}
                              className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50"><Plus size={14} /></button>
                          </div>
                          <button onClick={() => isDrink ? removeItem(item.id) : removeFoodItem(item.id)}
                            className="w-7 h-7 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center text-red-400 hover:bg-red-100 shrink-0"><X size={14} /></button>
                        </div>
                      );
                    })}
                  </div>
                  {/* Grand total รวม drink + food */}
                  <div className="mt-3 pt-3 border-t border-slate-200 space-y-1">
                    {totalDrinkAmount > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">☕ เครื่องดื่ม</span>
                        <span className="font-bold text-amber-600">฿{totalDrinkAmount.toLocaleString()}</span>
                      </div>
                    )}
                    {totalFoodAmount > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">🍱 อาหาร</span>
                        <span className="font-bold text-orange-600">
                          {hasFoodWithoutPrice ? <span className="text-slate-400 italic">รอกำหนด</span> : `฿${totalFoodAmount.toLocaleString()}`}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                      <span className="text-sm font-bold text-slate-600">💰 ยอดรวม</span>
                      {hasFoodWithoutPrice && totalFoodAmount === 0 ? (
                        <span className="text-xl font-black text-purple-600">฿{totalDrinkAmount.toLocaleString()}<span className="text-xs text-slate-400 ml-1">+ อาหาร</span></span>
                      ) : (
                        <span className="text-xl font-black text-purple-600">฿{(totalDrinkAmount + totalFoodAmount).toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                  </>
                )}
              </div>
            </div>

            {/* ฝั่งขวา — เมนูแยก 2 กล่อง */}
            <div className="lg:col-span-3 order-first lg:order-last space-y-4">
              {/* กล่องเครื่องดื่ม */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="flex border-b border-slate-200">
                  {Object.entries(DRINK_MENU).map(([key, cat]) => (
                    <button key={key} onClick={() => setActiveCategory(key)}
                      className={`flex-1 py-3 text-sm font-bold transition-all ${activeCategory === key
                        ? `${catColors[key].active} text-white shadow-inner`
                        : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
                      {cat.label}
                    </button>
                  ))}
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {DRINK_MENU[activeCategory].items.map(itemDef => {
                      const itemName = itemDef.name;
                      const alreadyOrdered = orderItems.filter(o => o.name === itemName && o.category === activeCategory);
                      const totalQty = alreadyOrdered.reduce((s, o) => s + o.qty, 0);
                      const c = catColors[activeCategory];
                      const cat = DRINK_MENU[activeCategory];
                      const priceLabel = cat.tempOptions.length > 1
                        ? `ร้อน ฿${itemDef.hot} / เย็น ฿${itemDef.iced}`
                        : `฿${itemDef.iced}`;
                      return (
                        <button key={itemName} onClick={() => addItem(itemName, activeCategory)}
                          className={`relative p-4 rounded-2xl border-2 ${c.border} ${c.bg} hover:shadow-md transition-all text-left group active:scale-95`}>
                          <p className="text-3xl mb-2">{cat.icon}</p>
                          <p className={`font-bold text-sm ${c.text}`}>{itemName}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{cat.tempOptions.join(' / ')}</p>
                          <p className={`text-[11px] font-black ${c.text} mt-1`}>💰 {priceLabel}</p>
                          {totalQty > 0 && <span className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-black shadow-sm">{totalQty}</span>}
                          <div className={`absolute bottom-2 right-2 w-7 h-7 ${c.item} text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-sm`}><Plus size={16} /></div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* กล่องอาหาร */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="flex border-b border-slate-200">
                  {Object.entries(FOOD_MENU).map(([key, cat]) => (
                    <button key={key} onClick={() => setActiveFoodCategory(key)}
                      className={`flex-1 py-3 text-sm font-bold transition-all ${activeFoodCategory === key
                        ? `${foodCatColors[key].active} text-white shadow-inner`
                        : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
                      {cat.label}
                    </button>
                  ))}
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-2 gap-3">
                    {FOOD_MENU[activeFoodCategory].items.map(itemDef => {
                      const alreadyOrdered = foodItems.filter(o => o.name === itemDef.name && o.category === activeFoodCategory);
                      const totalQty = alreadyOrdered.reduce((s, o) => s + o.qty, 0);
                      const fc = foodCatColors[activeFoodCategory];
                      return (
                        <button key={itemDef.name} onClick={() => addFoodItem(itemDef, activeFoodCategory)}
                          className={`relative p-4 rounded-2xl border-2 ${fc.border} ${fc.bg} hover:shadow-md transition-all text-left group active:scale-95`}>
                          <p className="text-3xl mb-2">{FOOD_MENU[activeFoodCategory].icon}</p>
                          <p className={`font-bold text-sm ${fc.text}`}>{itemDef.name}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{itemDef.meatOptions ? `เลือก: ${itemDef.meatOptions.join(' / ')}` : '-'}</p>
                          {itemDef.price != null && <p className={`text-[11px] font-black ${fc.text} mt-1`}>💰 ฿{itemDef.price}</p>}
                          {totalQty > 0 && <span className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-black shadow-sm">{totalQty}</span>}
                          <div className={`absolute bottom-2 right-2 w-7 h-7 ${fc.item} text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-sm`}><Plus size={16} /></div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== ฟอร์มพิมพ์เครื่องดื่ม (A4 — ซ่อนจอปกติ แสดงตอนพิมพ์) ===== */}
      <div className="hidden print:block max-w-[850px] mx-auto bg-white p-[50px] min-h-[1050px] text-black leading-relaxed font-serif relative">
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
              <h2 className="text-[16px] font-bold underline underline-offset-4">แบบการสั่งเครื่องดื่มเพื่อลูกค้า / ผู้มาติดต่อ</h2>
              <p className="text-[13px] font-bold italic mt-1">( Beverage request for Customer / Visitor )</p>
            </div>
          </div>
        </div>
        <div className="mt-8 space-y-3 text-[14px]">
          <div className="flex items-end gap-2"><span className="font-bold">ชื่อผู้รับรอง :</span><span className="flex-grow border-b border-black border-dotted px-2">{formData.responsiblePerson || '-'}</span></div>
          <div className="flex gap-4">
            <div className="flex items-end gap-2 flex-1"><span className="font-bold">รหัสพนักงาน :</span><span className="flex-grow border-b border-black border-dotted px-2">{formData.employeeId || '-'}</span></div>
            <div className="flex items-end gap-2 flex-1"><span className="font-bold">ฝ่าย :</span><span className="flex-grow border-b border-black border-dotted px-2">{formData.department || '-'}</span></div>
          </div>
          <div className="flex gap-4">
            <div className="flex items-end gap-2 flex-1"><span className="font-bold">วันที่สั่ง :</span><span className="flex-grow border-b border-black border-dotted px-2">{formData.orderDate}</span></div>
            <div className="flex items-end gap-2 flex-1"><span className="font-bold">เวลา :</span><span className="flex-grow border-b border-black border-dotted px-2">{formData.orderTime || '-'}</span></div>
          </div>
        </div>
        <table className="w-full border-collapse border-2 border-black text-[14px] mt-4">
          <thead><tr>
            <th className="border-2 border-black p-2 w-[40px]">ลำดับ</th>
            <th className="border-2 border-black p-2">เครื่องดื่ม</th>
            <th className="border-2 border-black p-2 w-[60px]">ร้อน/เย็น</th>
            <th className="border-2 border-black p-2 w-[60px]">จำนวน</th>
            <th className="border-2 border-black p-2 w-[120px]">หมวด</th>
          </tr></thead>
          <tbody>
            {orderItems.map((item, i) => (
              <tr key={item.id}>
                <td className="border-2 border-black text-center">{i+1}</td>
                <td className="border-2 border-black px-2 font-bold">{item.name}</td>
                <td className="border-2 border-black text-center">{item.temp}</td>
                <td className="border-2 border-black text-center font-bold">{item.qty}</td>
                <td className="border-2 border-black px-2 text-[12px]">{DRINK_MENU[item.category]?.label}</td>
              </tr>
            ))}
            {orderItems.length === 0 && <tr><td colSpan={5} className="border-2 border-black text-center p-4 text-gray-400">ไม่มีรายการ</td></tr>}
            <tr><td colSpan={3} className="border-2 border-black text-right p-2 font-bold">รวม</td><td className="border-2 border-black text-center font-black text-lg">{totalDrinkItems}</td><td className="border-2 border-black text-center text-[12px]">แก้ว</td></tr>
          </tbody>
        </table>
        {formData.note && <div className="mt-4 text-[14px]"><span className="font-bold">หมายเหตุ:</span> {formData.note}</div>}
        <div className="mt-8 border-2 border-black flex h-[160px]">
          <div className="w-1/2 border-r-2 border-black flex flex-col items-center justify-between p-2">
            <span className="font-bold text-[14px]">ชื่อผู้สั่ง</span>
            {formData.ordererSign && <img src={formData.ordererSign} alt="sign" className="max-h-12 object-contain" />}
            <div className="border-b border-black w-3/4"></div>
          </div>
          <div className="w-1/2 flex flex-col items-center justify-between p-2">
            <span className="font-bold text-[14px]">ผู้จัดการฝ่าย</span>
            {formData.deptManagerSign && <img src={formData.deptManagerSign} alt="sign" className="max-h-12 object-contain" />}
            <div className="border-b border-black w-3/4"></div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700;800&display=swap');
        body { font-family: 'Sarabun', sans-serif; }
        @media print {
          @page { size: A4; margin: 0; }
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
        }
      `}} />
    </div>
  );
};

export default DrinkOrderFormApp;
