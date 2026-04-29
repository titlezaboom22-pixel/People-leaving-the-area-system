import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, updateDoc, doc, Timestamp, query, orderBy } from 'firebase/firestore';
import { db, firebaseReady, appId } from './firebase';
import { Truck, X, Plus, Upload, Save, FileText, Phone, Calendar, MapPin, DollarSign, Building2, User, Image as ImageIcon, AlertCircle, Trash2 } from 'lucide-react';

/**
 * 🚐 Inline version — แสดงรายการรถเช่าโดยตรงในหน้า (ไม่มี modal)
 * ใช้เป็น sub-tab ใน GA View
 */
export function ExternalVehicleRentalInline() {
  const [rentals, setRentals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const blank = {
    plate: '', vehicleType: '', brand: '', model: '', color: '', seats: '', mileage: '',
    providerCompany: '', providerPhone: '', providerContact: '',
    driverName: '', driverPhone: '', driverLicenseNo: '', driverLicenseExpiry: '', driverLicensePhoto: '',
    rentalPrice: '', rentalUnit: 'วัน', includesFuel: false, tollFee: '', accommodationFee: '', conditions: '',
    useDate: '', timeStart: '', timeEnd: '', destination: '', returnLocation: '', purpose: '', passengerCount: '',
    quotationFile: '', vehiclePhoto: '', companyDocs: '',
    notes: '',
  };
  const [form, setForm] = useState(blank);
  const update = (field, value) => setForm(p => ({ ...p, [field]: value }));

  const loadRentals = async () => {
    if (!firebaseReady || !db) return;
    setLoading(true);
    try {
      const ref = collection(db, 'artifacts', appId, 'public', 'data', 'external_vehicle_rentals');
      const snap = await getDocs(ref);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (b.useDate || '').localeCompare(a.useDate || ''));
      setRentals(docs);
    } catch (e) { console.warn(e); }
    setLoading(false);
  };

  useEffect(() => { loadRentals(); }, []);

  const handleFile = (field) => (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update(field, reader.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!form.plate.trim()) { alert('กรุณากรอกทะเบียนรถ'); return; }
    if (!form.providerCompany.trim()) { alert('กรุณากรอกชื่อบริษัทผู้ให้เช่า'); return; }
    if (!form.driverName.trim()) { alert('กรุณากรอกชื่อคนขับ'); return; }
    if (!form.useDate) { alert('กรุณาเลือกวันที่ใช้งาน'); return; }
    try {
      const data = {
        ...form,
        rentalPrice: Number(form.rentalPrice) || 0,
        seats: Number(form.seats) || 0,
        passengerCount: Number(form.passengerCount) || 0,
        tollFee: Number(form.tollFee) || 0,
        accommodationFee: Number(form.accommodationFee) || 0,
        updatedAt: new Date().toISOString(),
      };
      if (editingId) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'external_vehicle_rentals', editingId), data);
        alert('✓ อัปเดตข้อมูลสำเร็จ');
      } else {
        data.createdAt = new Date().toISOString();
        data.firestoreCreatedAt = Timestamp.now();
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'external_vehicle_rentals'), data);
        alert('✓ บันทึกข้อมูลรถเช่าสำเร็จ');
      }
      setForm(blank);
      setEditingId(null);
      setShowForm(false);
      loadRentals();
    } catch (e) {
      alert('❌ บันทึกล้มเหลว: ' + e.message);
    }
  };

  const handleEdit = (r) => {
    setForm({ ...blank, ...r });
    setEditingId(r.id);
    setShowForm(true);
  };

  const fmtDate = (d) => {
    if (!d) return '-';
    try { return new Date(d).toLocaleDateString('th-TH', { dateStyle: 'medium' }); } catch { return d; }
  };
  const fmt = (n) => Number(n || 0).toLocaleString();

  // Form components
  const Field = ({ label, children, required, hint }) => (
    <div>
      <label className="text-[11px] font-bold text-slate-700 mb-1 block">
        {label} {required && <span className="text-red-500">*</span>}
        {hint && <span className="text-[10px] font-normal text-slate-400 ml-2">{hint}</span>}
      </label>
      {children}
    </div>
  );
  const Input = (props) => (
    <input {...props} className={`w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 ${props.className || ''}`} />
  );
  const Section = ({ icon, title, color, children }) => (
    <div className={`rounded-2xl border-2 p-4 mb-4 ${color}`}>
      <h3 className="font-black text-sm flex items-center gap-2 mb-3"><span>{icon}</span>{title}</h3>
      {children}
    </div>
  );

  return (
    <>
      {/* Stats + Add button */}
      <div className="bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 text-white rounded-2xl shadow-lg p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-black text-base flex items-center gap-2">
            <Truck size={20} /> ยานพาหนะเช่าภายนอก
          </h3>
          <button
            onClick={() => { setForm(blank); setEditingId(null); setShowForm(true); }}
            className="px-4 py-2 rounded-xl bg-white text-violet-700 font-bold text-sm hover:bg-violet-50 active:scale-95 transition flex items-center gap-1.5 shadow"
          >
            <Plus size={16} /> เพิ่มรถเช่าใหม่
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white/15 rounded-xl p-3">
            <p className="text-[10px] text-violet-100 uppercase font-bold">📊 ทั้งหมด</p>
            <p className="text-2xl font-black">{rentals.length}</p>
          </div>
          <div className="bg-white/15 rounded-xl p-3">
            <p className="text-[10px] text-violet-100 uppercase font-bold">📅 เดือนนี้</p>
            <p className="text-2xl font-black">{rentals.filter(r => (r.useDate || '').startsWith(new Date().toISOString().slice(0, 7))).length}</p>
          </div>
          <div className="bg-white/15 rounded-xl p-3 col-span-2">
            <p className="text-[10px] text-violet-100 uppercase font-bold">💰 ค่าใช้จ่ายทั้งหมด</p>
            <p className="text-2xl font-black">฿{rentals.reduce((s, r) => s + Number(r.rentalPrice || 0) + Number(r.tollFee || 0) + Number(r.accommodationFee || 0), 0).toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-center text-slate-400 py-12">⏳ กำลังโหลด...</p>
      ) : rentals.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
          <Truck size={48} className="text-slate-200 mx-auto mb-4" />
          <p className="text-slate-400 text-sm">ยังไม่มีบันทึกรถเช่าภายนอก</p>
          <p className="text-slate-300 text-xs mt-1">กดปุ่ม "เพิ่มรถเช่าใหม่" เพื่อบันทึกครั้งแรก</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rentals.map(r => (
            <div key={r.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition">
              <div className="bg-gradient-to-br from-violet-50 to-purple-50 px-4 py-3 border-b border-violet-100 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-violet-600 font-bold">📅 {fmtDate(r.useDate)} · {r.timeStart}-{r.timeEnd}</p>
                  <p className="font-bold text-slate-900 text-sm mt-0.5">🚐 {r.brand} {r.model}</p>
                </div>
                <span className="text-xs font-mono font-black text-violet-700 bg-white px-2 py-1 rounded border border-violet-200">{r.plate}</span>
              </div>
              <div className="p-4">
                <div className="text-[12px] text-slate-700 space-y-1.5">
                  <div className="flex items-center gap-2"><Building2 size={12} className="text-violet-600" /> <strong>{r.providerCompany}</strong> {r.providerPhone && <span className="text-slate-500 ml-1">📞 {r.providerPhone}</span>}</div>
                  <div className="flex items-center gap-2"><User size={12} className="text-emerald-600" /> {r.driverName} {r.driverPhone && <span className="text-slate-500 ml-1">📞 {r.driverPhone}</span>}</div>
                  {r.destination && <div className="flex items-start gap-2"><MapPin size={12} className="text-rose-600 mt-0.5 flex-shrink-0" /> <span>{r.destination}</span></div>}
                  {r.purpose && <div className="text-slate-600">🎯 {r.purpose}</div>}
                </div>
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100">
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold">ราคา</p>
                    <p className="text-base font-black text-slate-900 font-mono">฿{fmt(r.rentalPrice)}<span className="text-[10px] text-slate-400">/{r.rentalUnit}</span></p>
                  </div>
                  <button onClick={() => handleEdit(r)} className="px-3 py-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-bold border border-violet-200">
                    ดู / แก้ไข
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* === FORM MODAL === */}
      {showForm && (
        <div className="fixed inset-0 z-[125] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { if (!confirm('ยกเลิก? ข้อมูลที่กรอกจะหาย')) return; setShowForm(false); }}>
          <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-br from-violet-600 to-purple-700 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black flex items-center gap-2"><Truck size={20} /> {editingId ? 'แก้ไขข้อมูลรถเช่า' : 'เพิ่มรถเช่าใหม่'}</h3>
                <p className="text-xs text-violet-100 mt-0.5">กรอกรายละเอียดรถยนต์ที่เช่าจากบริษัทภายนอก</p>
              </div>
              <button onClick={() => setShowForm(false)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 transition">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
              <Section icon="🚐" title="ข้อมูลรถ" color="bg-blue-50 border-blue-200">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Field label="ทะเบียนรถ" required><Input placeholder="เช่น กข-1234" value={form.plate} onChange={e => update('plate', e.target.value)} /></Field>
                  <Field label="ประเภทรถ">
                    <select value={form.vehicleType} onChange={e => update('vehicleType', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
                      <option value="">เลือก...</option>
                      <option>รถตู้</option><option>รถบัส</option><option>รถเก๋ง</option><option>รถกระบะ</option><option>SUV</option><option>MPV</option><option>อื่นๆ</option>
                    </select>
                  </Field>
                  <Field label="จำนวนที่นั่ง"><Input type="number" placeholder="12" value={form.seats} onChange={e => update('seats', e.target.value)} /></Field>
                  <Field label="ยี่ห้อ"><Input placeholder="TOYOTA" value={form.brand} onChange={e => update('brand', e.target.value)} /></Field>
                  <Field label="รุ่น"><Input placeholder="HIACE" value={form.model} onChange={e => update('model', e.target.value)} /></Field>
                  <Field label="สีรถ"><Input placeholder="ขาว" value={form.color} onChange={e => update('color', e.target.value)} /></Field>
                  <Field label="เลขไมล์ (ถ้ามี)" hint="กม."><Input type="number" value={form.mileage} onChange={e => update('mileage', e.target.value)} /></Field>
                </div>
              </Section>

              <Section icon="🏢" title="ข้อมูลผู้ให้บริการ" color="bg-violet-50 border-violet-200">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="ชื่อบริษัท / ผู้ให้เช่า" required><Input placeholder="บริษัท ABC ทรานสปอร์ต" value={form.providerCompany} onChange={e => update('providerCompany', e.target.value)} /></Field>
                  <Field label="เบอร์โทรบริษัท"><Input placeholder="02-xxx-xxxx" value={form.providerPhone} onChange={e => update('providerPhone', e.target.value)} /></Field>
                  <Field label="ผู้ประสานงาน"><Input placeholder="คุณสมชาย" value={form.providerContact} onChange={e => update('providerContact', e.target.value)} /></Field>
                </div>
              </Section>

              <Section icon="👨‍✈️" title="ข้อมูลคนขับ" color="bg-emerald-50 border-emerald-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="ชื่อ-นามสกุลคนขับ" required><Input placeholder="นายสมชาย ขับเก่ง" value={form.driverName} onChange={e => update('driverName', e.target.value)} /></Field>
                  <Field label="เบอร์โทรศัพท์"><Input placeholder="08x-xxx-xxxx" value={form.driverPhone} onChange={e => update('driverPhone', e.target.value)} /></Field>
                  <Field label="เลขที่ใบขับขี่"><Input placeholder="10003456789" value={form.driverLicenseNo} onChange={e => update('driverLicenseNo', e.target.value)} /></Field>
                  <Field label="วันหมดอายุใบขับขี่"><Input type="date" value={form.driverLicenseExpiry} onChange={e => update('driverLicenseExpiry', e.target.value)} /></Field>
                  <Field label="📷 รูปใบขับขี่ (แนบไฟล์)">
                    <input type="file" accept="image/*" onChange={handleFile('driverLicensePhoto')} className="w-full text-xs" />
                    {form.driverLicensePhoto && (
                      <div className="mt-2 relative inline-block">
                        <img src={form.driverLicensePhoto} alt="" className="w-32 h-20 object-cover rounded-lg border-2 border-emerald-300" />
                        <button onClick={() => update('driverLicensePhoto', '')} className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px]">×</button>
                      </div>
                    )}
                  </Field>
                </div>
              </Section>

              <Section icon="💰" title="ข้อมูลราคา" color="bg-amber-50 border-amber-200">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="ราคาเช่า" required hint="บาท"><Input type="number" placeholder="3500" value={form.rentalPrice} onChange={e => update('rentalPrice', e.target.value)} /></Field>
                  <Field label="หน่วย">
                    <select value={form.rentalUnit} onChange={e => update('rentalUnit', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
                      <option value="วัน">บาท / วัน</option><option value="เที่ยว">บาท / เที่ยว</option>
                      <option value="ชั่วโมง">บาท / ชั่วโมง</option><option value="เหมา">บาท (เหมา)</option>
                    </select>
                  </Field>
                  <Field label="รวมค่าน้ำมัน?">
                    <div className="flex gap-2 mt-1">
                      <button type="button" onClick={() => update('includesFuel', true)} className={`flex-1 py-2 rounded-lg text-sm font-bold border ${form.includesFuel ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-600 border-slate-200'}`}>✓ รวม</button>
                      <button type="button" onClick={() => update('includesFuel', false)} className={`flex-1 py-2 rounded-lg text-sm font-bold border ${!form.includesFuel ? 'bg-red-500 text-white border-red-500' : 'bg-white text-slate-600 border-slate-200'}`}>✗ ไม่รวม</button>
                    </div>
                  </Field>
                  <Field label="ค่าทางด่วน" hint="บาท"><Input type="number" value={form.tollFee} onChange={e => update('tollFee', e.target.value)} /></Field>
                  <Field label="ค่าที่พัก (ถ้ามี)" hint="บาท"><Input type="number" value={form.accommodationFee} onChange={e => update('accommodationFee', e.target.value)} /></Field>
                </div>
                <div className="mt-3">
                  <Field label="เงื่อนไขเพิ่มเติม">
                    <textarea rows={2} placeholder="เช่น ครอบคลุมประกัน / ค่าล่วงเวลาเพิ่ม" value={form.conditions} onChange={e => update('conditions', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none" />
                  </Field>
                </div>
              </Section>

              <Section icon="📅" title="ข้อมูลการใช้งาน" color="bg-rose-50 border-rose-200">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="วันที่ใช้งาน" required><Input type="date" value={form.useDate} onChange={e => update('useDate', e.target.value)} /></Field>
                  <Field label="เวลาเริ่ม"><Input type="time" value={form.timeStart} onChange={e => update('timeStart', e.target.value)} /></Field>
                  <Field label="เวลาสิ้นสุด"><Input type="time" value={form.timeEnd} onChange={e => update('timeEnd', e.target.value)} /></Field>
                  <Field label="สถานที่ไป-กลับ"><Input placeholder="TBKK → สนามบิน → กลับ" value={form.destination} onChange={e => update('destination', e.target.value)} /></Field>
                  <Field label="สถานที่กลับ (ถ้าต่างกัน)"><Input value={form.returnLocation} onChange={e => update('returnLocation', e.target.value)} /></Field>
                  <Field label="จำนวนผู้โดยสาร" hint="คน"><Input type="number" value={form.passengerCount} onChange={e => update('passengerCount', e.target.value)} /></Field>
                </div>
                <div className="mt-3">
                  <Field label="วัตถุประสงค์"><Input placeholder="เช่น รับ-ส่งพนักงาน / ออก Outing / รับลูกค้า" value={form.purpose} onChange={e => update('purpose', e.target.value)} /></Field>
                </div>
              </Section>

              <Section icon="📎" title="เอกสารแนบ" color="bg-slate-50 border-slate-200">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="📄 ใบเสนอราคา (Quotation)">
                    <input type="file" accept="image/*,application/pdf" onChange={handleFile('quotationFile')} className="w-full text-xs" />
                    {form.quotationFile && form.quotationFile.startsWith('data:image') && <img src={form.quotationFile} alt="" className="w-32 h-20 object-cover rounded-lg mt-2 border" />}
                    {form.quotationFile && !form.quotationFile.startsWith('data:image') && <p className="text-[10px] text-emerald-600 mt-2">✓ แนบไฟล์แล้ว</p>}
                  </Field>
                  <Field label="🚐 รูปรถ">
                    <input type="file" accept="image/*" onChange={handleFile('vehiclePhoto')} className="w-full text-xs" />
                    {form.vehiclePhoto && <img src={form.vehiclePhoto} alt="" className="w-32 h-20 object-cover rounded-lg mt-2 border" />}
                  </Field>
                  <Field label="🏢 เอกสารบริษัท (ถ้ามี)">
                    <input type="file" accept="image/*,application/pdf" onChange={handleFile('companyDocs')} className="w-full text-xs" />
                    {form.companyDocs && <p className="text-[10px] text-emerald-600 mt-2">✓ แนบไฟล์แล้ว</p>}
                  </Field>
                </div>
                <div className="mt-3">
                  <Field label="📝 หมายเหตุ"><textarea rows={2} value={form.notes} onChange={e => update('notes', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none" /></Field>
                </div>
              </Section>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-between gap-2">
              <p className="text-[11px] text-slate-400">* = ฟิลด์จำเป็น</p>
              <div className="flex gap-2">
                <button onClick={() => setShowForm(false)} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-bold">ยกเลิก</button>
                <button onClick={handleSave} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white text-sm font-black shadow-md flex items-center gap-2 hover:from-violet-700 hover:to-purple-700">
                  <Save size={16} /> {editingId ? 'อัปเดต' : 'บันทึก'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * 🚐 ยานพาหนะเช่าภายนอก — Modal version (with button trigger)
 *
 * Props:
 *   buttonClassName  - custom class
 *   buttonLabel      - custom label
 */
export default function ExternalVehicleRental({ buttonClassName, buttonLabel = 'ยานพาหนะเช่าภายนอก' }) {
  const [showList, setShowList] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [rentals, setRentals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const blank = {
    // 🚐 ข้อมูลรถ
    plate: '', vehicleType: '', brand: '', model: '', color: '', seats: '', mileage: '',
    // 🏢 ผู้ให้บริการ
    providerCompany: '', providerPhone: '', providerContact: '',
    // 👨‍✈️ คนขับ
    driverName: '', driverPhone: '', driverLicenseNo: '', driverLicenseExpiry: '', driverLicensePhoto: '',
    // 💰 ราคา
    rentalPrice: '', rentalUnit: 'วัน', includesFuel: false, tollFee: '', accommodationFee: '', conditions: '',
    // 📅 การใช้งาน
    useDate: '', timeStart: '', timeEnd: '', destination: '', returnLocation: '', purpose: '', passengerCount: '',
    // 📎 เอกสาร
    quotationFile: '', vehiclePhoto: '', companyDocs: '',
    // ผู้บันทึก
    notes: '',
  };
  const [form, setForm] = useState(blank);

  const update = (field, value) => setForm(p => ({ ...p, [field]: value }));

  const loadRentals = async () => {
    if (!firebaseReady || !db) return;
    setLoading(true);
    try {
      const ref = collection(db, 'artifacts', appId, 'public', 'data', 'external_vehicle_rentals');
      const snap = await getDocs(ref);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (b.useDate || '').localeCompare(a.useDate || ''));
      setRentals(docs);
    } catch (e) {
      console.warn('Load rentals error:', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (showList) loadRentals();
  }, [showList]);

  const handleFile = (field) => (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update(field, reader.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!form.plate.trim()) { alert('กรุณากรอกทะเบียนรถ'); return; }
    if (!form.providerCompany.trim()) { alert('กรุณากรอกชื่อบริษัทผู้ให้เช่า'); return; }
    if (!form.driverName.trim()) { alert('กรุณากรอกชื่อคนขับ'); return; }
    if (!form.useDate) { alert('กรุณาเลือกวันที่ใช้งาน'); return; }

    try {
      const data = {
        ...form,
        rentalPrice: Number(form.rentalPrice) || 0,
        seats: Number(form.seats) || 0,
        passengerCount: Number(form.passengerCount) || 0,
        tollFee: Number(form.tollFee) || 0,
        accommodationFee: Number(form.accommodationFee) || 0,
        updatedAt: new Date().toISOString(),
      };
      if (editingId) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'external_vehicle_rentals', editingId), data);
        alert('✓ อัปเดตข้อมูลสำเร็จ');
      } else {
        data.createdAt = new Date().toISOString();
        data.firestoreCreatedAt = Timestamp.now();
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'external_vehicle_rentals'), data);
        alert('✓ บันทึกข้อมูลรถเช่าสำเร็จ');
      }
      setForm(blank);
      setEditingId(null);
      setShowForm(false);
      loadRentals();
    } catch (e) {
      alert('❌ บันทึกล้มเหลว: ' + e.message);
    }
  };

  const handleEdit = (r) => {
    setForm({ ...blank, ...r });
    setEditingId(r.id);
    setShowList(false);
    setShowForm(true);
  };

  const fmtDate = (d) => {
    if (!d) return '-';
    try {
      return new Date(d).toLocaleDateString('th-TH', { dateStyle: 'medium' });
    } catch { return d; }
  };
  const fmt = (n) => Number(n || 0).toLocaleString();

  // ---- Field components ----
  const Field = ({ label, children, required, hint }) => (
    <div>
      <label className="text-[11px] font-bold text-slate-700 mb-1 block">
        {label} {required && <span className="text-red-500">*</span>}
        {hint && <span className="text-[10px] font-normal text-slate-400 ml-2">{hint}</span>}
      </label>
      {children}
    </div>
  );
  const Input = (props) => (
    <input
      {...props}
      className={`w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 ${props.className || ''}`}
    />
  );
  const Section = ({ icon, title, color, children }) => (
    <div className={`rounded-2xl border-2 p-4 mb-4 ${color}`}>
      <h3 className="font-black text-sm flex items-center gap-2 mb-3">
        <span>{icon}</span>{title}
      </h3>
      {children}
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setShowList(true)}
        className={buttonClassName || "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-bold text-sm shadow-md shadow-violet-600/20 active:scale-95 transition"}
      >
        <Truck size={16} /> {buttonLabel}
      </button>

      {/* === LIST MODAL === */}
      {showList && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowList(false)}>
          <div className="w-full max-w-5xl bg-white rounded-3xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-br from-violet-600 to-purple-700 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black flex items-center gap-2"><Truck size={20} /> ยานพาหนะเช่าภายนอก</h3>
                <p className="text-xs text-violet-100 mt-0.5">บันทึกการเช่ารถจากบริษัทภายนอก ({rentals.length} รายการ)</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setForm(blank); setEditingId(null); setShowList(false); setShowForm(true); }}
                  className="px-4 py-2 rounded-xl bg-white text-violet-700 font-bold text-sm hover:bg-violet-50 active:scale-95 transition flex items-center gap-1.5"
                >
                  <Plus size={16} /> เพิ่มรถเช่าใหม่
                </button>
                <button onClick={() => setShowList(false)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 transition">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
              {loading ? (
                <p className="text-center text-slate-400 py-12">⏳ กำลังโหลด...</p>
              ) : rentals.length === 0 ? (
                <div className="text-center py-16">
                  <Truck size={48} className="text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-400 text-sm">ยังไม่มีบันทึกรถเช่าภายนอก</p>
                  <p className="text-slate-300 text-xs mt-1">กดปุ่ม "เพิ่มรถเช่าใหม่" เพื่อบันทึกครั้งแรก</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {rentals.map(r => (
                    <div key={r.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition">
                      <div className="bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-slate-500 font-bold">📅 {fmtDate(r.useDate)} · {r.timeStart}-{r.timeEnd}</p>
                          <p className="font-bold text-slate-900 text-sm mt-0.5">🚐 {r.brand} {r.model}</p>
                        </div>
                        <span className="text-xs font-mono font-black text-slate-700 bg-white px-2 py-1 rounded border border-slate-200">{r.plate}</span>
                      </div>
                      <div className="p-4">
                        <div className="text-[12px] text-slate-700 space-y-1.5">
                          <div className="flex items-center gap-2"><Building2 size={12} className="text-violet-600" /> <strong>{r.providerCompany}</strong> {r.providerPhone && <span className="text-slate-500 ml-1">📞 {r.providerPhone}</span>}</div>
                          <div className="flex items-center gap-2"><User size={12} className="text-emerald-600" /> {r.driverName} {r.driverPhone && <span className="text-slate-500 ml-1">📞 {r.driverPhone}</span>}</div>
                          {r.destination && <div className="flex items-start gap-2"><MapPin size={12} className="text-rose-600 mt-0.5 flex-shrink-0" /> <span>{r.destination}</span></div>}
                          {r.purpose && <div className="text-slate-600">🎯 {r.purpose}</div>}
                        </div>
                        <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100">
                          <div>
                            <p className="text-[10px] text-slate-400 font-bold">ราคา</p>
                            <p className="text-base font-black text-slate-900 font-mono">฿{fmt(r.rentalPrice)}<span className="text-[10px] text-slate-400">/{r.rentalUnit}</span></p>
                          </div>
                          <button
                            onClick={() => handleEdit(r)}
                            className="px-3 py-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-bold border border-violet-200"
                          >
                            ดู / แก้ไข
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* === FORM MODAL === */}
      {showForm && (
        <div className="fixed inset-0 z-[125] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { if (!confirm('ยกเลิก? ข้อมูลที่กรอกจะหาย')) return; setShowForm(false); }}>
          <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-br from-violet-600 to-purple-700 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black flex items-center gap-2"><Truck size={20} /> {editingId ? 'แก้ไขข้อมูลรถเช่า' : 'เพิ่มรถเช่าใหม่'}</h3>
                <p className="text-xs text-violet-100 mt-0.5">กรอกรายละเอียดรถยนต์ที่เช่าจากบริษัทภายนอก</p>
              </div>
              <button onClick={() => setShowForm(false)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 transition">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50">

              {/* 🚐 ข้อมูลรถ */}
              <Section icon="🚐" title="ข้อมูลรถ" color="bg-blue-50 border-blue-200">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Field label="ทะเบียนรถ" required>
                    <Input placeholder="เช่น กข-1234" value={form.plate} onChange={e => update('plate', e.target.value)} />
                  </Field>
                  <Field label="ประเภทรถ">
                    <select value={form.vehicleType} onChange={e => update('vehicleType', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
                      <option value="">เลือก...</option>
                      <option value="รถตู้">รถตู้</option>
                      <option value="รถบัส">รถบัส</option>
                      <option value="รถเก๋ง">รถเก๋ง</option>
                      <option value="รถกระบะ">รถกระบะ</option>
                      <option value="SUV">SUV</option>
                      <option value="MPV">MPV</option>
                      <option value="อื่นๆ">อื่นๆ</option>
                    </select>
                  </Field>
                  <Field label="จำนวนที่นั่ง">
                    <Input type="number" placeholder="12" value={form.seats} onChange={e => update('seats', e.target.value)} />
                  </Field>
                  <Field label="ยี่ห้อ">
                    <Input placeholder="เช่น TOYOTA" value={form.brand} onChange={e => update('brand', e.target.value)} />
                  </Field>
                  <Field label="รุ่น">
                    <Input placeholder="เช่น HIACE" value={form.model} onChange={e => update('model', e.target.value)} />
                  </Field>
                  <Field label="สีรถ">
                    <Input placeholder="เช่น ขาว" value={form.color} onChange={e => update('color', e.target.value)} />
                  </Field>
                  <Field label="เลขไมล์ (ถ้ามี)" hint="กม.">
                    <Input type="number" placeholder="123456" value={form.mileage} onChange={e => update('mileage', e.target.value)} />
                  </Field>
                </div>
              </Section>

              {/* 🏢 ผู้ให้บริการ */}
              <Section icon="🏢" title="ข้อมูลผู้ให้บริการ" color="bg-violet-50 border-violet-200">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="ชื่อบริษัท / ผู้ให้เช่า" required>
                    <Input placeholder="บริษัท ABC ทรานสปอร์ต" value={form.providerCompany} onChange={e => update('providerCompany', e.target.value)} />
                  </Field>
                  <Field label="เบอร์โทรบริษัท">
                    <Input placeholder="02-xxx-xxxx" value={form.providerPhone} onChange={e => update('providerPhone', e.target.value)} />
                  </Field>
                  <Field label="ผู้ประสานงาน">
                    <Input placeholder="คุณสมชาย" value={form.providerContact} onChange={e => update('providerContact', e.target.value)} />
                  </Field>
                </div>
              </Section>

              {/* 👨‍✈️ คนขับ */}
              <Section icon="👨‍✈️" title="ข้อมูลคนขับ" color="bg-emerald-50 border-emerald-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="ชื่อ-นามสกุลคนขับ" required>
                    <Input placeholder="นายสมชาย ขับเก่ง" value={form.driverName} onChange={e => update('driverName', e.target.value)} />
                  </Field>
                  <Field label="เบอร์โทรศัพท์">
                    <Input placeholder="08x-xxx-xxxx" value={form.driverPhone} onChange={e => update('driverPhone', e.target.value)} />
                  </Field>
                  <Field label="เลขที่ใบขับขี่">
                    <Input placeholder="10003456789" value={form.driverLicenseNo} onChange={e => update('driverLicenseNo', e.target.value)} />
                  </Field>
                  <Field label="วันหมดอายุใบขับขี่">
                    <Input type="date" value={form.driverLicenseExpiry} onChange={e => update('driverLicenseExpiry', e.target.value)} />
                  </Field>
                  <Field label="📷 รูปใบขับขี่ (แนบไฟล์)">
                    <input type="file" accept="image/*" onChange={handleFile('driverLicensePhoto')} className="w-full text-xs" />
                    {form.driverLicensePhoto && (
                      <div className="mt-2 relative inline-block">
                        <img src={form.driverLicensePhoto} alt="license" className="w-32 h-20 object-cover rounded-lg border-2 border-emerald-300" />
                        <button onClick={() => update('driverLicensePhoto', '')} className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px]">×</button>
                      </div>
                    )}
                  </Field>
                </div>
              </Section>

              {/* 💰 ราคา */}
              <Section icon="💰" title="ข้อมูลราคา" color="bg-amber-50 border-amber-200">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="ราคาเช่า" required hint="บาท">
                    <Input type="number" placeholder="3500" value={form.rentalPrice} onChange={e => update('rentalPrice', e.target.value)} />
                  </Field>
                  <Field label="หน่วย">
                    <select value={form.rentalUnit} onChange={e => update('rentalUnit', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
                      <option value="วัน">บาท / วัน</option>
                      <option value="เที่ยว">บาท / เที่ยว</option>
                      <option value="ชั่วโมง">บาท / ชั่วโมง</option>
                      <option value="เหมา">บาท (เหมา)</option>
                    </select>
                  </Field>
                  <Field label="รวมค่าน้ำมัน?">
                    <div className="flex gap-2 mt-1">
                      <button type="button" onClick={() => update('includesFuel', true)} className={`flex-1 py-2 rounded-lg text-sm font-bold border ${form.includesFuel ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-600 border-slate-200'}`}>✓ รวม</button>
                      <button type="button" onClick={() => update('includesFuel', false)} className={`flex-1 py-2 rounded-lg text-sm font-bold border ${!form.includesFuel ? 'bg-red-500 text-white border-red-500' : 'bg-white text-slate-600 border-slate-200'}`}>✗ ไม่รวม</button>
                    </div>
                  </Field>
                  <Field label="ค่าทางด่วน" hint="บาท">
                    <Input type="number" placeholder="0" value={form.tollFee} onChange={e => update('tollFee', e.target.value)} />
                  </Field>
                  <Field label="ค่าที่พัก (ถ้ามี)" hint="บาท">
                    <Input type="number" placeholder="0" value={form.accommodationFee} onChange={e => update('accommodationFee', e.target.value)} />
                  </Field>
                </div>
                <div className="mt-3">
                  <Field label="เงื่อนไขเพิ่มเติม">
                    <textarea
                      rows={2}
                      placeholder="เช่น ครอบคลุมประกัน / ค่าล่วงเวลาเพิ่ม"
                      value={form.conditions}
                      onChange={e => update('conditions', e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none"
                    />
                  </Field>
                </div>
              </Section>

              {/* 📅 การใช้งาน */}
              <Section icon="📅" title="ข้อมูลการใช้งาน" color="bg-rose-50 border-rose-200">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="วันที่ใช้งาน" required>
                    <Input type="date" value={form.useDate} onChange={e => update('useDate', e.target.value)} />
                  </Field>
                  <Field label="เวลาเริ่ม">
                    <Input type="time" value={form.timeStart} onChange={e => update('timeStart', e.target.value)} />
                  </Field>
                  <Field label="เวลาสิ้นสุด">
                    <Input type="time" value={form.timeEnd} onChange={e => update('timeEnd', e.target.value)} />
                  </Field>
                  <Field label="สถานที่ไป-กลับ">
                    <Input placeholder="เช่น TBKK → สนามบิน → กลับ" value={form.destination} onChange={e => update('destination', e.target.value)} />
                  </Field>
                  <Field label="สถานที่กลับ (ถ้าต่างกัน)">
                    <Input placeholder="ระบุถ้าไม่ใช่ที่เดิม" value={form.returnLocation} onChange={e => update('returnLocation', e.target.value)} />
                  </Field>
                  <Field label="จำนวนผู้โดยสาร" hint="คน">
                    <Input type="number" placeholder="10" value={form.passengerCount} onChange={e => update('passengerCount', e.target.value)} />
                  </Field>
                </div>
                <div className="mt-3">
                  <Field label="วัตถุประสงค์">
                    <Input placeholder="เช่น รับ-ส่งพนักงาน / ออกงาน Outing / รับลูกค้าจากสนามบิน" value={form.purpose} onChange={e => update('purpose', e.target.value)} />
                  </Field>
                </div>
              </Section>

              {/* 📎 เอกสาร */}
              <Section icon="📎" title="เอกสารแนบ" color="bg-slate-50 border-slate-200">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="📄 ใบเสนอราคา (Quotation)">
                    <input type="file" accept="image/*,application/pdf" onChange={handleFile('quotationFile')} className="w-full text-xs" />
                    {form.quotationFile && form.quotationFile.startsWith('data:image') && (
                      <img src={form.quotationFile} alt="quote" className="w-32 h-20 object-cover rounded-lg mt-2 border" />
                    )}
                    {form.quotationFile && !form.quotationFile.startsWith('data:image') && (
                      <p className="text-[10px] text-emerald-600 mt-2">✓ แนบไฟล์แล้ว</p>
                    )}
                  </Field>
                  <Field label="🚐 รูปรถ">
                    <input type="file" accept="image/*" onChange={handleFile('vehiclePhoto')} className="w-full text-xs" />
                    {form.vehiclePhoto && <img src={form.vehiclePhoto} alt="vehicle" className="w-32 h-20 object-cover rounded-lg mt-2 border" />}
                  </Field>
                  <Field label="🏢 เอกสารบริษัท (ถ้ามี)">
                    <input type="file" accept="image/*,application/pdf" onChange={handleFile('companyDocs')} className="w-full text-xs" />
                    {form.companyDocs && <p className="text-[10px] text-emerald-600 mt-2">✓ แนบไฟล์แล้ว</p>}
                  </Field>
                </div>
                <div className="mt-3">
                  <Field label="📝 หมายเหตุ">
                    <textarea
                      rows={2}
                      placeholder="ข้อสังเกต / สิ่งที่ต้องระวัง"
                      value={form.notes}
                      onChange={e => update('notes', e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none"
                    />
                  </Field>
                </div>
              </Section>

            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-between gap-2">
              <p className="text-[11px] text-slate-400">* = ฟิลด์จำเป็น</p>
              <div className="flex gap-2">
                <button onClick={() => setShowForm(false)} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-bold">
                  ยกเลิก
                </button>
                <button onClick={handleSave} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white text-sm font-black shadow-md flex items-center gap-2 hover:from-violet-700 hover:to-purple-700">
                  <Save size={16} /> {editingId ? 'อัปเดต' : 'บันทึก'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
