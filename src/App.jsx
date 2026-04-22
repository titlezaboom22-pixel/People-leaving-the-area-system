import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Users, 
  ShieldCheck, 
  UserPlus, 
  QrCode, 
  Search, 
  LogOut, 
  CheckCircle2, 
  Clock, 
  Navigation,
  ArrowRightLeft,
  CalendarDays,
  Car,
  User,
  Calendar,
  BellRing,
  Inbox,
  ClipboardList,
  Share2,
  Copy,
  ExternalLink,
  X,
  Smartphone,
  Building2,
  ChevronRight,
  Contact2,
  LayoutDashboard,
  KeyRound,
  Lock,
  AlertCircle,
  Utensils,
  Coffee,
  Truck,
  Package,
  Edit,
  Trash2,
  Settings,
  Database,
  Save,
  Eye,
  Camera,
  FileText,
  Menu,
  Plus,
  MapPin,
  LogIn,
  ChevronDown,
  Shield,
  History,
  FileSearch,
  RotateCcw,
  ToggleLeft,
  ToggleRight,
  ChevronLeft,
  Wrench,
  Mail,
  Send,
  Server,
  ClipboardCheck
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  getDoc,
  getDocs,
  setDoc,
  Timestamp
} from 'firebase/firestore';
import {
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged
} from 'firebase/auth';
import { app, auth, db, firebaseReady, appId } from './firebase';
import { DEPARTMENTS, STATUS } from './constants';
import SecurityGate from './SecurityGate';
import GAView from './GAView';
import RobotNotifier from './RobotNotifier';
import VehicleTimeAlert from './VehicleTimeAlert';
import {
  getPendingNotificationsByDepartment,
  getWorkflowSummariesForRequester,
  approveNotification,
} from './approvalNotifications';
import { authenticateUser } from './authService';
import { logAction, ACTIONS } from './auditLog';
import { sendInviteEmail } from './emailService';
import { notifyWorkflowReturned } from './notifyEmail';
import ApprovePage from './ApprovePage';
import SecurityAlertsPanel from './SecurityAlertsPanel';
import { checkPublicFormRate } from './emailHelper';
import {
  createHoneypotState,
  detectBotSubmission,
  checkLocalRateLimit,
  recordLocalSubmit,
  formatResetTime,
  HONEYPOT_STYLE,
} from './botDetection';
import { sanitize, hasScriptInjection } from './sanitize';

const getTodayStr = () => new Date().toISOString().split('T')[0];

function getAvatarStorageKey(staffId) {
  return `employeeAvatar:${(staffId || '').toString().trim().toUpperCase()}`;
}

function colorFromString(input) {
  const s = (input || '').toString();
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue} 75% 45%)`;
}

function EmployeeAvatar({ staffId, size = 36, canEdit = false }) {
  const [avatar, setAvatar] = useState(null);

  useEffect(() => {
    if (!staffId) return;
    try {
      const v = localStorage.getItem(getAvatarStorageKey(staffId));
      setAvatar(v || null);
    } catch {
      setAvatar(null);
    }
  }, [staffId]);

  const initials = (staffId || '').toString().trim().toUpperCase().slice(0, 2) || 'ID';
  const bg = colorFromString(staffId || 'ID');

  const onPickFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result?.toString() || '';
      if (!dataUrl) return;
      try {
        localStorage.setItem(getAvatarStorageKey(staffId), dataUrl);
      } catch {}
      setAvatar(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {avatar ? (
        <img
          src={avatar}
          alt={`avatar-${staffId}`}
          className="rounded-full object-cover border border-slate-200 shadow-sm"
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className="rounded-full text-white font-black flex items-center justify-center border border-white shadow-sm"
          style={{ width: size, height: size, background: bg }}
          title={staffId}
        >
          <span className="text-[12px] tracking-widest">{initials}</span>
        </div>
      )}

      {canEdit && (
        <label
          className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white border border-slate-200 shadow flex items-center justify-center cursor-pointer hover:bg-slate-50 transition print:hidden"
          title="อัปโหลดรูปพนักงาน"
        >
          <Camera size={14} className="text-slate-500" />
          <input type="file" accept="image/*" className="hidden" onChange={onPickFile} />
        </label>
      )}
    </div>
  );
}

// --- Session persistence helpers ---
function saveSession(identity, r) {
  try { sessionStorage.setItem('soc_login', JSON.stringify({ identity, role: r, ts: Date.now() })); } catch {}
}
function loadSession() {
  try {
    const raw = sessionStorage.getItem('soc_login');
    if (!raw) return null;
    const s = JSON.parse(raw);
    // หมดอายุ 30 นาที
    if (Date.now() - s.ts > 30 * 60 * 1000) { sessionStorage.removeItem('soc_login'); return null; }
    return s;
  } catch { return null; }
}
function clearSession() {
  try { sessionStorage.removeItem('soc_login'); sessionStorage.removeItem('soc_session'); } catch {}
}

export default function App() {
  const saved = loadSession();
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(saved?.role || null);
  const [hostIdentity, setHostIdentity] = useState(saved?.identity || null);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  // การยืนยันตัวตน (ตามกฎ Rule 3) with timeout
  useEffect(() => {
    // Timeout mechanism - ถ้าเกิน 3 วินาทีให้ข้ามไปหน้า login
    const timeoutId = setTimeout(() => {
      if (loading) {
        console.warn('Firebase initialization timeout. Proceeding to login.');
        setLoading(false);
      }
    }, 3000);

    if (!firebaseReady) {
      // ถ้า Firebase ไม่พร้อม ให้ข้ามไปหน้า login เลย
      setLoading(false);
      return () => clearTimeout(timeoutId);
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
        setLoading(false);
      }
    };
    
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      clearTimeout(timeoutId);
      // ถ้ายังไม่มี user หลังจาก auth state changed ให้ set loading เป็น false
      if (!u) {
        setTimeout(() => setLoading(false), 500);
      }
    });
    
    return () => {
      unsubscribe();
      clearTimeout(timeoutId);
    };
  }, []);

  // การดึงข้อมูลแบบ Real-time (ตามกฎ Rule 1)
  useEffect(() => {
    if (!user || !firebaseReady) {
      setLoading(false);
      return;
    } 

    try {
      const appointmentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'appointments');
      
      const unsubscribe = onSnapshot(appointmentsRef, (snapshot) => {
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAppointments(docs);
        setLoading(false);
      }, (error) => {
        console.error("Firestore Error:", error);
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (error) {
      console.error("Firestore setup error:", error);
      setLoading(false);
    }
  }, [user]);

  const handleLogout = () => {
    clearSession();
    setRole(null);
    setHostIdentity(null);
  };

  // Auto Logout เมื่อไม่ใช้งาน 30 นาที
  useEffect(() => {
    if (!role) return;
    const TIMEOUT = 30 * 60 * 1000; // 30 นาที
    let timer;

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        alert('หมดเวลาใช้งาน กรุณา Login ใหม่');
        handleLogout();
      }, TIMEOUT);
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [role]);

  // Auto-redirect to guest mode or approve mode
  const urlParams = new URLSearchParams(window.location.search);
  const approveId = urlParams.get('approve');

  useEffect(() => {
    if (urlParams.get('mode') === 'guest' && !role) {
      setRole('GUEST');
    }
  }, []);

  // ถ้าเปิดจากลิงก์อนุมัติ → แสดงหน้าเซ็นเลย ไม่ต้อง login
  if (approveId) {
    return <ApprovePage workflowId={approveId} />;
  }

  if (loading && !role) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center font-sans text-left">
        <div className="animate-pulse flex flex-col items-center gap-4 text-center">
          <ShieldCheck className="w-16 h-16 text-blue-600" />
          <p className="tracking-widest uppercase text-[10px] font-black text-slate-400">กำลังเตรียมระบบความปลอดภัย...</p>
        </div>
      </div>
    );
  }

  if (!role) {
    return <LoginScreen onLoginSuccess={(identity, r) => {
      setHostIdentity(identity);
      setRole(r);
      saveSession(identity, r);
    }} />;
  }

  // SecurityGate มี navbar ของตัวเอง ไม่ต้องแสดง navbar เดิม
  if (role === 'SECURITY') {
    return <SecurityGate appointments={appointments} user={user} onLogout={handleLogout} />;
  }

  // GA มีหน้าจัดรถของตัวเอง
  if (role === 'GA') {
    return <GAView user={user} onLogout={handleLogout} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-blue-100 text-left">
      <nav className="border-b border-slate-200 bg-white/90 backdrop-blur-md sticky top-0 z-50 shadow-sm text-left">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between font-sans">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg shadow-md">
              <ShieldCheck className="text-white w-6 h-6" />
            </div>
            <h1 className="font-bold text-lg text-slate-900 uppercase tracking-tighter">SOC Visitor <span className="text-blue-600 font-black">PRO</span></h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-3">
              {(role === 'HOST' || role === 'EMPLOYEE') && hostIdentity?.staffId && (
                <EmployeeAvatar staffId={hostIdentity.staffId} size={34} canEdit />
              )}
              {role === 'ADMIN' && (
                <EmployeeAvatar staffId={'ADMIN'} size={34} canEdit />
              )}
              <div className="text-right">
              <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">สถานะระบบ</p>
              <p className="text-sm font-bold text-blue-600">
                {role === 'HOST'
                  ? `หัวหน้าแผนก: #${hostIdentity.staffId}`
                  : role === 'EMPLOYEE'
                  ? `พนักงาน: #${hostIdentity.staffId}`
                  : role === 'ADMIN'
                  ? 'ผู้ดูแลระบบ'
                  : 'หน้าลงทะเบียนแขก'}
              </p>
            </div>
            </div>
            <button onClick={handleLogout} className="p-2.5 hover:bg-red-50 rounded-xl transition-all text-slate-400 hover:text-red-600 border border-slate-100 hover:border-red-100 font-sans">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-4 md:p-8 animate-in fade-in duration-700">
        {role === 'HOST' && <HostView appointments={appointments} user={user} hostIdentity={hostIdentity} role="HOST" />}
        {role === 'EMPLOYEE' && <HostView appointments={appointments} user={user} hostIdentity={hostIdentity} role="EMPLOYEE" />}
        {role === 'GUEST' && <GuestView user={user} />}
        {role === 'ADMIN' && <AdminView appointments={appointments} user={user} />}
      </main>
      <RobotNotifier role={role} hostIdentity={hostIdentity} />
      <VehicleTimeAlert userRole={role} requesterId={hostIdentity?.staffId} />
    </div>
  );
}

// --- Login Screen ---
function LoginScreen({ onLoginSuccess }) {
  const [staffId, setStaffId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    const id = staffId.trim().toUpperCase();
    if (!id) { setError('กรุณาระบุรหัสพนักงาน'); return; }
    if (!password) { setError('กรุณากรอกรหัสผ่าน'); return; }

    setIsLoading(true);
    setError('');

    try {
      const userData = await authenticateUser(id, password);
      const role = userData.role;
      const identity = role === 'SECURITY' ? null : {
        staffId: userData.staffId,
        name: userData.displayName || userData.staffId || '',
        department: userData.department,
        roleType: userData.roleType,
      };
      logAction(ACTIONS.LOGIN, { staffId: id, role });
      onLoginSuccess(identity, role);
    } catch (err) {
      logAction(ACTIONS.LOGIN_FAILED, { staffId: id, reason: err.message });
      setError(err.message || 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-50 via-slate-50 to-slate-100 font-sans text-left overflow-x-hidden">
      <div className="max-w-md w-full animate-in zoom-in-95 duration-500 font-sans">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-blue-200">
            <ShieldCheck size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">SOC Systems</h1>
          <p className="text-slate-400 text-sm mt-1 font-medium">ระบบความปลอดภัยและจัดการผู้ติดต่อ</p>
          <div className="flex items-center justify-center gap-3 mt-3">
            <span className="text-[10px] text-green-600 font-bold flex items-center gap-1"><ShieldCheck size={12} /> SSL Encrypted</span>
            <span className="text-[10px] text-blue-600 font-bold flex items-center gap-1"><Lock size={12} /> Secured by Google</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-6 md:p-10 rounded-2xl md:rounded-[3rem] shadow-2xl relative overflow-hidden text-left font-sans">
          <form onSubmit={handleLogin} className="space-y-6 relative z-10 text-left">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-2 font-sans">ระบุรหัสประจำตัว (ID)</label>
              <div className="relative">
                <KeyRound className="absolute left-5 top-5 text-slate-300" size={20} />
                <input
                  autoFocus required
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-5 pl-14 pr-6 text-slate-900 focus:ring-4 focus:ring-blue-100 focus:border-blue-600 outline-none transition-all shadow-inner font-mono text-xl uppercase placeholder:text-slate-300"
                  placeholder="ID พนักงาน / รปภ."
                  value={staffId}
                  onChange={e => { setStaffId(e.target.value); setError(''); }}
                />
              </div>
            </div>

            <div className="animate-in slide-in-from-top-4 duration-300">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-2 font-sans">รหัสผ่าน</label>
              <div className="relative">
                <Lock className="absolute left-5 top-5 text-slate-300" size={20} />
                <input
                  type="password"
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-5 pl-14 pr-6 text-slate-900 focus:ring-4 focus:ring-blue-100 focus:border-blue-600 outline-none transition-all shadow-inner font-sans text-base placeholder:text-slate-300"
                  placeholder="กรอกรหัสผ่าน"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                />
              </div>
            </div>

            {error && <p className="text-red-500 text-xs font-bold text-center font-sans">{error}</p>}

            <button type="submit" disabled={isLoading} className="w-full bg-gradient-to-r from-blue-600 to-indigo-700 text-white py-5 rounded-[1.5rem] font-black text-lg hover:shadow-xl hover:shadow-blue-200 transition-all active:scale-95 flex items-center justify-center gap-3 mt-4 font-sans disabled:opacity-50">
              <Lock size={18} /> {isLoading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าใช้งานระบบ'}
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-slate-100 text-center relative z-10 font-sans">
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-4">สำหรับบุคคลภายนอก</p>
            <button onClick={() => onLoginSuccess(null, 'GUEST')} className="w-full bg-slate-50 hover:bg-slate-100 text-slate-600 py-4 rounded-2xl font-black text-sm border border-slate-200 transition-all flex items-center justify-center gap-2 active:scale-95 min-h-[44px]">
              <UserPlus size={16} /> ลงทะเบียนผู้มาติดต่อ (Guest)
            </button>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 text-center relative z-10">
            <p className="text-[9px] text-slate-300 leading-relaxed">
              ข้อมูลเข้ารหัส SSL 256-bit | Powered by Firebase (Google Cloud)<br/>
              TBK Group - ระบบจัดการความปลอดภัยและผู้ติดต่อ v2.0
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Host View (มุมมองหัวหน้าแผนก) ---
function HostView({ appointments, user, hostIdentity, role = 'HOST' }) {
  const [showForm, setShowForm] = useState(false);
  const [selectedInvite, setSelectedInvite] = useState(null);
  const [inviteEmailData, setInviteEmailData] = useState(null);
  const [serviceMessage, setServiceMessage] = useState('');
  const [approvalNotifications, setApprovalNotifications] = useState([]);
  const [expandedFormTypes, setExpandedFormTypes] = useState({});
  const [myWorkflowSummaries, setMyWorkflowSummaries] = useState([]);
  const [signModalItem, setSignModalItem] = useState(null);
  const [docModalItem, setDocModalItem] = useState(null);
  const [docModalPrevSteps, setDocModalPrevSteps] = useState([]);
  const [recheckNote, setRecheckNote] = useState('');
  const [recheckSending, setRecheckSending] = useState(false);
  const [showRecheckInput, setShowRecheckInput] = useState(false);
  const [signatureTrackingDoc, setSignatureTrackingDoc] = useState(null);
  const [signatureTrackingSteps, setSignatureTrackingSteps] = useState([]);
  const [signDataUrl, setSignDataUrl] = useState('');
  const [showInviteQR, setShowInviteQR] = useState(false);
  const [showMyQR, setShowMyQR] = useState(false);
  const [exitApprovalAppt, setExitApprovalAppt] = useState(null);
  const [showVisitorQueue, setShowVisitorQueue] = useState(true);
  const [mySignature, setMySignature] = useState(''); // ลายเซ็นสำเร็จรูปของหัวหน้า
  const [myStatus, setMyStatus] = useState('available'); // available | busy | away
  const [savingStatus, setSavingStatus] = useState(false);
  const [showSignSetup, setShowSignSetup] = useState(false);
  const [signSetupDataUrl, setSignSetupDataUrl] = useState('');
  const signSetupCanvasRef = useRef(null);
  const signSetupDrawingRef = useRef(false);
  const [exitSignDataUrl, setExitSignDataUrl] = useState('');
  const exitSignCanvasRef = useRef(null);
  const exitSignDrawingRef = useRef(false);
  const signCanvasRef = useRef(null);
  const signDrawingRef = useRef(false);
  const signUploadInputRef = useRef(null);
  const canSeeApprovalNotifications = hostIdentity?.roleType !== 'EMPLOYEE';

  // --- Vehicle Calendar ---
  const [showVehicleCalendar, setShowVehicleCalendar] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [bookingWorkflowSteps, setBookingWorkflowSteps] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [vehicleBookings, setVehicleBookings] = useState([]);
  const [calendarWeekOffset, setCalendarWeekOffset] = useState(0);
  const [formData, setFormData] = useState({ 
    name: '', additionalNames: [], company: '', count: 1, department: hostIdentity.department, vehicleType: 'รถยนต์', licensePlate: '', purpose: '', 
    appointmentDate: getTodayStr()
  });

  useEffect(() => {
    const load = async () => {
      setApprovalNotifications(await getPendingNotificationsByDepartment(hostIdentity.department));
      if (hostIdentity?.roleType === 'EMPLOYEE') {
        setMyWorkflowSummaries(await getWorkflowSummariesForRequester(hostIdentity.staffId));
      }
      // โหลดลายเซ็นสำเร็จรูป
      if (firebaseReady && db && hostIdentity?.staffId) {
        try {
          const { getDoc, doc: fsDoc } = await import('firebase/firestore');
          const snap = await fsDoc(db, 'artifacts', appId, 'public', 'data', 'users', hostIdentity.staffId);
          const d = (await getDoc(snap)).data();
          if (d?.signatureDataUrl) setMySignature(d.signatureDataUrl);
          if (d?.status) setMyStatus(d.status);
        } catch {}
      }
    };
    load();
    const timer = setInterval(load, 5000);
    window.addEventListener('focus', load);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', load);
    };
  }, [hostIdentity.department, hostIdentity.roleType, hostIdentity.staffId]);

  // --- Load vehicles ---
  useEffect(() => {
    if (!firebaseReady || !db) return;
    try {
      const vehiclesRef = collection(db, 'artifacts', appId, 'public', 'data', 'vehicles');
      const unsubscribe = onSnapshot(vehiclesRef, (snapshot) => {
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
        setVehicles(docs);
      }, (error) => {
        console.error('Vehicles load error:', error);
      });
      return () => unsubscribe();
    } catch (error) {
      console.error('Vehicles setup error:', error);
    }
  }, [firebaseReady]);

  // --- Load vehicle bookings for current week ---
  useEffect(() => {
    if (!firebaseReady || !db) return;
    try {
      const bookingsRef = collection(db, 'artifacts', appId, 'public', 'data', 'vehicle_bookings');
      const unsubscribe = onSnapshot(bookingsRef, (snapshot) => {
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setVehicleBookings(docs);
      }, (error) => {
        console.error('Vehicle bookings load error:', error);
      });
      return () => unsubscribe();
    } catch (error) {
      console.error('Vehicle bookings setup error:', error);
    }
  }, [firebaseReady]);

  // --- Calendar helper functions ---
  const getWeekDays = (offset) => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + (offset * 7));
    const days = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const weekDays = getWeekDays(calendarWeekOffset);
  const weekTitle = (() => {
    const fmt = (d) => `${d.getDate()}/${d.getMonth() + 1}`;
    return `${fmt(weekDays[0])} - ${fmt(weekDays[4])}/${weekDays[4].getFullYear()}`;
  })();

  const getVehicleIcon = (type) => {
    switch (type) {
      case 'รถกระบะ': return '\u{1F6FB}';
      case 'รถตู้': return '\u{1F690}';
      case 'SUV': return '\u{1F699}';
      case 'MPV': return '\u{1F699}';
      case 'รถยนต์ไฟฟ้า': return '\u26A1';
      default: return '\u{1F697}';
    }
  };

  const getBookingForCell = (vehicleId, dateStr) => {
    return vehicleBookings.find(b => b.vehicleId === vehicleId && b.date === dateStr);
  };

  const formatDateStr = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const dayNames = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.'];

  const myAppointmentsAll = appointments.filter(a => {
    const targetId = a.hostStaffId?.toString().trim().toUpperCase();
    const myId = hostIdentity.staffId?.toString().trim().toUpperCase();
    return targetId === myId || (a.department === hostIdentity.department);
  });
  // แสดงใน queue เฉพาะที่ยังไม่เข้า (ไม่ใช่ inside/approved_out)
  const myAppointments = myAppointmentsAll.filter(a => a.status !== STATUS.INSIDE && a.status !== STATUS.APPROVED_OUT && a.status !== 'completed');
  // ON-SITE = inside → แสดงใน "เอกสารรอเซ็น" แทน

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!firebaseReady) {
      alert('Firebase ไม่พร้อมใช้งาน กรุณาตั้งค่า Firebase Configuration');
      return;
    }
    if (!user) return;
    const refCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const newAppt = { ...formData, hostStaffId: hostIdentity.staffId, refCode, status: STATUS.PENDING, createdAt: Timestamp.now() };
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'appointments'), newAppt);

      // ถ้ามี email → ส่ง email อัตโนมัติ (SMTP) หรือ fallback mailto
      const visitorEmail = formData.visitorEmail?.trim();
      if (visitorEmail) {
        const publicUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PUBLIC_URL) || window.location.origin;
        const guestLink = `${publicUrl}/index.html?mode=guest`;
        try {
          const result = await sendInviteEmail({
            to: visitorEmail,
            visitorName: formData.name,
            date: formData.appointmentDate,
            staffId: hostIdentity.staffId,
            department: hostIdentity.department,
            refCode,
            guestLink,
          });
          if (result.sent) {
            alert(`✅ ส่ง email นัดหมายให้ ${visitorEmail} เรียบร้อย!`);
          }
        } catch (err) {
          console.error('Send invite email error:', err);
        }
      }

      setShowForm(false);
      setFormData({ name: '', additionalNames: [], company: '', count: 1, department: hostIdentity.department, vehicleType: 'รถยนต์', licensePlate: '', purpose: '', visitorEmail: '', appointmentDate: getTodayStr() });
    } catch (error) {
      console.error('Error creating appointment:', error);
      alert('เกิดข้อผิดพลาดในการสร้างนัดหมาย: ' + error.message);
    }
  };

  const handleServiceClick = (serviceName) => {
    setServiceMessage(`ระบบบันทึกคำขอ "${serviceName}" เรียบร้อยแล้ว (ฟีเจอร์นี้กำลังพัฒนาเพื่อเชื่อมต่อระบบงานส่วนหน้า)`);
    setTimeout(() => setServiceMessage(''), 4000);
  };

  const beginSign = (e) => {
    const canvas = signCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = ((clientX - rect.left) * canvas.width) / rect.width;
    const y = ((clientY - rect.top) * canvas.height) / rect.height;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    signDrawingRef.current = true;
  };

  const drawSign = (e) => {
    if (!signDrawingRef.current) return;
    const canvas = signCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = ((clientX - rect.left) * canvas.width) / rect.width;
    const y = ((clientY - rect.top) * canvas.height) / rect.height;
    const ctx = canvas.getContext('2d');
    ctx.lineTo(x, y);
    ctx.stroke();
    setSignDataUrl(canvas.toDataURL('image/png'));
  };

  const endSign = () => {
    if (!signDrawingRef.current) return;
    signDrawingRef.current = false;
    const canvas = signCanvasRef.current;
    if (canvas) setSignDataUrl(canvas.toDataURL('image/png'));
  };

  const clearSign = () => {
    const canvas = signCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignDataUrl('');
  };

  const handleUploadSign = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result?.toString?.() || '';
      if (!dataUrl) return;
      const canvas = signCanvasRef.current;
      const ctx = canvas?.getContext?.('2d');
      if (!canvas || !ctx) return;

      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const ratio = Math.min(canvas.width / img.width, canvas.height / img.height);
        const w = img.width * ratio;
        const h = img.height * ratio;
        const x = (canvas.width - w) / 2;
        const y = (canvas.height - h) / 2;
        ctx.drawImage(img, x, y, w, h);
        setSignDataUrl(canvas.toDataURL('image/png'));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const openSignModal = (item) => {
    setSignModalItem(item);
    // ถ้ามีลายเซ็นสำเร็จรูป โหลดเลย
    setSignDataUrl(mySignature || '');
    setTimeout(() => { if (!mySignature) clearSign(); }, 0);
  };

  const viewDocumentSignatures = async (workflowItem) => {
    try {
      const q = query(
        collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows'),
        where('chainId', '==', workflowItem.chainId)
      );
      const snap = await getDocs(q);
      const steps = snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
      steps.sort((a, b) => (a.step || 1) - (b.step || 1));
      setSignatureTrackingDoc(workflowItem);
      setSignatureTrackingSteps(steps);
    } catch (err) {
      console.error('Error loading signature tracking:', err);
      alert('ไม่สามารถโหลดข้อมูลลายเซ็นได้: ' + err.message);
    }
  };

  const confirmSignApprove = async () => {
    if (!signModalItem) return;
    if (!signDataUrl && !mySignature) {
      alert('กรุณาลงลายเซ็นก่อนอนุมัติ หรือตั้งลายเซ็นสำเร็จรูปที่ปุ่ม "ตั้งลายเซ็น"');
      return;
    }
    // รายการรวม (เครื่องดื่ม+อาหาร) → อนุมัติทั้งสอง workflow ที่ถูกรวมไว้
    const idsToApprove = signModalItem._mergedIds || [signModalItem.id];
    for (const id of idsToApprove) {
      await approveNotification(id, {
        approvedBy: hostIdentity?.staffId || '-',
        approvedSign: signDataUrl,
      });
    }
    setApprovalNotifications(await getPendingNotificationsByDepartment(hostIdentity.department));
    setSignModalItem(null);
    setSignDataUrl('');
  };

  return (
    <div className="space-y-8 text-left font-sans">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm text-left font-sans">
        <div className="text-left font-sans">
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
             <LayoutDashboard className="text-blue-600" /> แผงควบคุมแผนก
          </h2>
          <div className="flex items-center gap-4 mt-2">
             <span className="bg-blue-50 text-blue-600 py-1 px-3 rounded-lg border border-blue-100 text-[10px] font-black uppercase tracking-widest">ID: {hostIdentity.staffId}</span>
             <span className="bg-slate-50 text-slate-600 py-1 px-3 rounded-lg border border-slate-200 text-[10px] font-black uppercase tracking-widest">{hostIdentity.department}</span>
          </div>
          {hostIdentity?.roleType === 'HEAD' && (
            <div className="flex items-center gap-1.5 mt-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 mr-1">สถานะ:</span>
              {[
                { key: 'available', dot: '🟢', label: 'อยู่ประจำโต๊ะ', ring: 'ring-emerald-500 bg-emerald-50 text-emerald-700 border-emerald-300' },
                { key: 'busy', dot: '🟡', label: 'ไม่ว่าง', ring: 'ring-amber-500 bg-amber-50 text-amber-700 border-amber-300' },
                { key: 'away', dot: '🔴', label: 'ไม่อยู่', ring: 'ring-red-500 bg-red-50 text-red-700 border-red-300' },
              ].map((s) => (
                <button
                  key={s.key}
                  disabled={savingStatus}
                  onClick={async () => {
                    if (!firebaseReady || !db || !hostIdentity?.staffId) return;
                    setSavingStatus(true);
                    try {
                      const { updateDoc, doc: fsDoc } = await import('firebase/firestore');
                      await updateDoc(fsDoc(db, 'artifacts', appId, 'public', 'data', 'users', hostIdentity.staffId), { status: s.key });
                      setMyStatus(s.key);
                    } catch (e) { console.warn('update status failed:', e); }
                    finally { setSavingStatus(false); }
                  }}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition ${myStatus === s.key ? `ring-2 ${s.ring}` : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                >
                  {s.dot} {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-3 flex-wrap">
          <button onClick={() => setShowMyQR(true)} className="bg-slate-700 hover:bg-slate-900 text-white px-5 py-4 rounded-2xl font-black transition flex items-center gap-2 active:scale-95 font-sans">
            <QrCode size={20} /> QR ของฉัน
          </button>
          <button onClick={() => { setShowSignSetup(true); setSignSetupDataUrl(mySignature || ''); }} className={`${mySignature ? 'bg-emerald-700 hover:bg-emerald-900' : 'bg-amber-500 hover:bg-amber-600'} text-white px-5 py-4 rounded-2xl font-black transition flex items-center gap-2 active:scale-95 font-sans`}>
            <Edit size={20} /> {mySignature ? 'ลายเซ็น ✓' : 'ตั้งลายเซ็น'}
          </button>
          <button onClick={() => setShowInviteQR(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-4 rounded-2xl font-black transition flex items-center gap-2 shadow-lg shadow-emerald-100 active:scale-95 font-sans">
            <QrCode size={20} /> ส่งลิงก์ผู้มาติดต่อ
          </button>
          <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-2xl font-black transition flex items-center gap-2 shadow-lg shadow-blue-100 active:scale-95 font-sans">
            <UserPlus size={20} /> นัดหมายใหม่
          </button>
        </div>
      </div>

      {canSeeApprovalNotifications && <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div>
            <h3 className="text-sm font-bold text-slate-800">เอกสารรอเซ็น</h3>
          </div>
          <span className="text-[11px] font-black px-3 py-1 rounded-full bg-amber-100 text-amber-700">
            {approvalNotifications.length} รายการ
          </span>
        </div>
        {approvalNotifications.length === 0 ? (
          <p className="text-sm text-slate-400 italic">ไม่มีเอกสารรอเซ็นในแผนกของคุณ</p>
        ) : (
          <div className="space-y-5">
            {(() => {
              const formTypeMap = {
                VEHICLE_BOOKING: { label: 'ใบขอใช้รถ', icon: '🚗', color: 'blue' },
                OUTING_REQUEST: { label: 'พนักงานขอออกนอกสถานที่', icon: '🚶', color: 'red' },
                GOODS_IN_OUT: { label: 'นำของเข้า/ออก', icon: '📦', color: 'orange' },
                VISITOR: { label: 'ผู้มาติดต่อ (อนุมัติเข้า)', icon: '👤', color: 'purple' },
                DRINK_ORDER: { label: 'สั่งเครื่องดื่ม', icon: '☕', color: 'emerald' },
                FOOD_ORDER: { label: 'สั่งอาหาร', icon: '🍚', color: 'amber' },
                DRINK_FOOD_ORDER: { label: 'สั่งเครื่องดื่ม+อาหาร', icon: '☕🍚', color: 'purple' },
                EQUIPMENT_REQUEST: { label: 'เบิกอุปกรณ์', icon: '🔧', color: 'slate' },
              };
              // รวมเครื่องดื่ม+อาหาร จากคนเดียวกัน (createAt ห่างกันไม่เกิน 10 นาที) ให้เป็นใบเดียว
              const mergedList = (() => {
                const drinks = approvalNotifications.filter(n => n.sourceForm === 'DRINK_ORDER');
                const foods = approvalNotifications.filter(n => n.sourceForm === 'FOOD_ORDER');
                const usedDrink = new Set();
                const usedFood = new Set();
                const merges = [];
                drinks.forEach(d => {
                  const match = foods.find(f => !usedFood.has(f.id) && (f.requesterId || '') === (d.requesterId || '') &&
                    Math.abs(new Date(f.createdAt) - new Date(d.createdAt)) <= 10 * 60 * 1000);
                  if (match) {
                    usedDrink.add(d.id);
                    usedFood.add(match.id);
                    merges.push({
                      ...d,
                      id: `merged-${d.id}-${match.id}`,
                      sourceForm: 'DRINK_FOOD_ORDER',
                      topic: 'เอกสารสั่งเครื่องดื่มและอาหาร รอเซ็นอนุมัติ',
                      _mergedIds: [d.id, match.id],
                      _mergedDocIds: [d._docId, match._docId].filter(Boolean),
                      requestPayload: {
                        ...(d.requestPayload || {}),
                        drinkRows: (d.requestPayload || {}).rows || [],
                        drinkNote: (d.requestPayload || {}).note || '',
                        foodRows: (match.requestPayload || {}).rows || [],
                        foodNote: (match.requestPayload || {}).note || '',
                        ordererSign: (d.requestPayload || {}).ordererSign || (match.requestPayload || {}).ordererSign || '',
                      },
                    });
                  }
                });
                const remaining = approvalNotifications.filter(n =>
                  !(n.sourceForm === 'DRINK_ORDER' && usedDrink.has(n.id)) &&
                  !(n.sourceForm === 'FOOD_ORDER' && usedFood.has(n.id))
                );
                return [...merges, ...remaining];
              })();

              const grouped = {};
              mergedList.forEach(n => {
                const key = n.sourceForm || 'OTHER';
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(n);
              });
              const colorMap = { blue: 'border-blue-200 bg-blue-50', red: 'border-red-200 bg-red-50', orange: 'border-orange-200 bg-orange-50', purple: 'border-purple-200 bg-purple-50', emerald: 'border-emerald-200 bg-emerald-50', amber: 'border-amber-200 bg-amber-50', slate: 'border-slate-200 bg-slate-50' };
              const headerColor = { blue: 'text-blue-700 bg-blue-100', red: 'text-red-700 bg-red-100', orange: 'text-orange-700 bg-orange-100', purple: 'text-purple-700 bg-purple-100', emerald: 'text-emerald-700 bg-emerald-100', amber: 'text-amber-700 bg-amber-100', slate: 'text-slate-700 bg-slate-100' };

              // ผู้มาติดต่อที่อยู่ใน (status=inside) รอเซ็นอนุมัติออก
              const visitorsInside = myAppointmentsAll.filter(a => a.status === STATUS.INSIDE);

              const sections = [];

              // กลุ่มผู้มาติดต่อรอออก (แยกต่างหาก)
              if (visitorsInside.length > 0) {
                const isExpV = expandedFormTypes['VISITOR_EXIT'];
                const showV = isExpV ? visitorsInside : visitorsInside.slice(0, 2);
                sections.push(
                  <div key="VISITOR_EXIT" className="border rounded-2xl overflow-hidden border-orange-200 bg-orange-50">
                    <div className="px-4 py-2 flex items-center justify-between cursor-pointer select-none text-orange-700 bg-orange-100"
                      onClick={() => setExpandedFormTypes(prev => ({ ...prev, VISITOR_EXIT: !prev['VISITOR_EXIT'] }))}>
                      <h4 className="font-black text-[13px] flex items-center gap-2">
                        🏃 ผู้มาติดต่อรอออก (เซ็นอนุมัติ)
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/60">{visitorsInside.length}</span>
                      </h4>
                      <span className="text-xs">{isExpV ? '▲' : '▼'}</span>
                    </div>
                    <div className="divide-y divide-white/50">
                      {showV.map(appt => (
                        <div key={appt.id} className="px-3 py-2 flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-bold text-slate-800 truncate">{appt.name || '-'}</p>
                            <p className="text-[10px] text-slate-400 truncate">{appt.company || '-'} · {appt.purpose || '-'}</p>
                          </div>
                          <button
                            onClick={() => { setExitApprovalAppt(appt); setExitSignDataUrl(''); }}
                            className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-orange-500 text-white hover:bg-orange-600 shrink-0">
                            อนุมัติออก
                          </button>
                        </div>
                      ))}
                      {visitorsInside.length > 2 && !isExpV && (
                        <button onClick={() => setExpandedFormTypes(prev => ({ ...prev, VISITOR_EXIT: true }))}
                          className="w-full py-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-700 hover:bg-white/50 text-center">
                          ดูเพิ่ม +{visitorsInside.length - 2} รายการ
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              // กลุ่มปกติจาก approval_workflows
              Object.entries(grouped).forEach(([formType, items]) => {
                const meta = formTypeMap[formType] || { label: formType, icon: '📄', color: 'slate' };
                const isExpanded = expandedFormTypes[formType];
                const showItems = isExpanded ? items : items.slice(0, 2);
                sections.push(
                  <div key={formType} className={`border rounded-2xl overflow-hidden ${colorMap[meta.color] || 'border-slate-200 bg-slate-50'}`}>
                    <div className={`px-4 py-2 flex items-center justify-between cursor-pointer select-none ${headerColor[meta.color] || 'text-slate-700 bg-slate-100'}`}
                      onClick={() => setExpandedFormTypes(prev => ({ ...prev, [formType]: !prev[formType] }))}>
                      <h4 className="font-black text-[13px] flex items-center gap-2">
                        <span>{meta.icon}</span> {meta.label}
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/60">{items.length}</span>
                      </h4>
                      <span className="text-xs">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                    <div className="divide-y divide-white/50">
                      {showItems.map((n) => (
                        <div key={n.id} className="px-3 py-2 flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 shrink-0">{n.stepLabel || `ขั้น ${n.step || 1}`}</span>
                              <p className="text-[13px] font-bold text-slate-800 truncate">{n.requesterName || '-'}</p>
                            </div>
                            <p className="text-[10px] text-slate-400 truncate">{n.requesterId || '-'} · {new Date(n.createdAt).toLocaleDateString('th-TH')}</p>
                          </div>
                          <div className="shrink-0 flex items-center gap-1">
                            <button type="button"
                              onClick={async () => {
                                setDocModalPrevSteps([]);
                                setDocModalItem(n);
                                if (n.chainId && firebaseReady && db) {
                                  try {
                                    const collRef = collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows');
                                    const q2 = query(collRef, where('chainId', '==', n.chainId));
                                    const snap2 = await getDocs(q2);
                                    const prev = snap2.docs.map(d => d.data()).filter(s => s.status === 'approved' && (s.step || 1) < (n.step || 1)).sort((a, b) => (a.step || 1) - (b.step || 1));
                                    setDocModalPrevSteps(prev);
                                  } catch (e) { console.warn('Load prev steps error:', e); }
                                }
                              }}
                              className="text-[10px] font-bold px-2 py-1 rounded-lg border border-slate-200 bg-white/60 hover:bg-white text-slate-600">
                              ดู
                            </button>
                            <button type="button" onClick={() => openSignModal(n)}
                              className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
                              อนุมัติ
                            </button>
                          </div>
                        </div>
                      ))}
                      {items.length > 2 && !isExpanded && (
                        <button onClick={() => setExpandedFormTypes(prev => ({ ...prev, [formType]: true }))}
                          className="w-full py-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-700 hover:bg-white/50 text-center">
                          ดูเพิ่ม +{items.length - 2} รายการ
                        </button>
                      )}
                    </div>
                  </div>
                );
              });
              return sections;
            })()}
          </div>
        )}
      </div>}

      {!canSeeApprovalNotifications && (
        <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-600">เอกสารที่ฉันส่ง</h3>
            <span className="text-[11px] font-black px-3 py-1 rounded-full bg-blue-100 text-blue-700">
              {myWorkflowSummaries.length} รายการ
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mb-3">
            ลำดับการอนุมัติ: <span className="font-bold text-slate-700">หัวหน้าแผนกผู้ส่ง</span> →{' '}
            <span className="font-bold text-slate-700">หัวหน้าแผนก HR</span> →{' '}
            <span className="font-bold text-slate-700">ร้านค้า/จัดซื้อ</span>
          </p>
          {myWorkflowSummaries.length === 0 ? (
            <p className="text-sm text-slate-400 italic">ยังไม่มีเอกสารที่คุณส่งในระบบ</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {myWorkflowSummaries.slice(0, 30).map((w) => (
                <div key={w.chainId} className="border border-slate-200 bg-slate-50 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-slate-800">{w.steps[0]?.topic}</p>
                    <div className="flex items-center gap-2">
                      {w.steps[0]?.chainId && (
                        <button
                          type="button"
                          onClick={() => viewDocumentSignatures(w.steps[0])}
                          className="text-[9px] font-black px-2 py-1 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
                        >
                          ดูลายเซ็น
                        </button>
                      )}
                      <span
                        className={`text-[10px] font-black px-2.5 py-1 rounded-full ${
                          w.isReturned
                            ? 'bg-red-100 text-red-700'
                            : w.isDone
                              ? 'bg-emerald-100 text-emerald-700'
                              : w.pending
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {w.statusLabel}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    ฟอร์ม: {w.steps[0]?.sourceForm || '-'} · ส่งเมื่อ{' '}
                    {new Date(w.steps[0]?.createdAt).toLocaleString('th-TH')}
                  </p>
                  {w.isReturned && w.returnNote && (
                    <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
                      <span className="text-red-500 font-black text-sm mt-0.5">⚠️</span>
                      <div>
                        <p className="text-[11px] font-black text-red-700">หัวหน้าส่งกลับให้แก้ไข:</p>
                        <p className="text-[11px] text-red-600 mt-0.5">{w.returnNote}</p>
                      </div>
                    </div>
                  )}
                  {/* แสดงผลจัดรถจาก GA */}
                  {w.isDone && w.steps[0]?.sourceForm === 'VEHICLE_BOOKING' && (() => {
                    const gaStep = w.steps.find(s => s.targetType === 'GA' && s.status === 'approved');
                    if (!gaStep) return null;
                    if (gaStep.vehicleResult === 'no_vehicle') {
                      return (
                        <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                          <p className="text-[11px] font-black text-red-700">🚗 ผลจัดรถ:</p>
                          <p className="text-sm text-red-600 font-bold mt-1">ไม่มีรถให้ใช้งาน ท่านสามารถเอารถของคุณไปใช้</p>
                        </div>
                      );
                    }
                    if (gaStep.vehicleResult === 'assigned' && gaStep.assignedVehicle) {
                      const v = gaStep.assignedVehicle;
                      const d = gaStep.assignedDriver;
                      return (
                        <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                          <p className="text-[11px] font-black text-emerald-700">🚗 ผลจัดรถ:</p>
                          <div className="text-sm mt-1 space-y-0.5">
                            <p><span className="font-bold">รถ:</span> {v.brand} <span className="font-bold">ทะเบียน:</span> {v.plate}</p>
                            {d && <p><span className="font-bold">คนขับ:</span> {d.name} <span className="font-bold">เบอร์โทร:</span> {d.phone}</p>}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {w.steps.map((s) => (
                      <span
                        key={s.id}
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-md border ${
                          s.status === 'returned'
                            ? 'bg-red-50 border-red-200 text-red-700'
                            : s.status === 'approved'
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                              : s.status === 'pending'
                                ? 'bg-amber-50 border-amber-200 text-amber-900'
                                : 'bg-slate-100 border-slate-200 text-slate-600'
                        }`}
                      >
                        {s.stepLabel || `ขั้น ${s.step || '?'}`}{' '}
                        {s.status === 'approved' ? '✓' : s.status === 'pending' ? '…' : s.status === 'returned' ? '↩' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {signModalItem && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white rounded-3xl border border-slate-200 p-6">
            <h3 className="text-lg font-black text-slate-900">ลงลายเซ็นอนุมัติเอกสาร</h3>
                <p className="text-sm text-slate-500 mt-1">
                  {signModalItem.stepLabel ? `${signModalItem.stepLabel} · ` : ''}
                  {signModalItem.topic} · ผู้ขอ {signModalItem.requesterName || '-'} ({signModalItem.requesterId || '-'})
                </p>
            <div className="mt-4 border border-slate-200 rounded-2xl p-3 bg-slate-50">
              {mySignature && !signDataUrl.startsWith('data:image') ? null : mySignature ? (
                /* แสดงลายเซ็นสำเร็จรูป */
                <div className="text-center">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-2">ลายเซ็นของคุณ ({hostIdentity?.name || hostIdentity?.staffId})</p>
                  <div className="bg-white border border-slate-200 rounded-xl p-3 inline-block">
                    <img src={signDataUrl || mySignature} alt="signature" className="h-16 object-contain mx-auto" />
                  </div>
                  <button type="button" onClick={() => { setSignDataUrl(''); setTimeout(() => clearSign(), 0); }} className="block mt-2 text-[11px] text-slate-400 hover:text-blue-600 mx-auto">วาดลายเซ็นใหม่แทน</button>
                </div>
              ) : (
                /* ยังไม่มีลายเซ็นสำเร็จรูป — วาดเอง */
                <>
                  <canvas
                    ref={signCanvasRef}
                    width={860} height={220}
                    onMouseDown={beginSign} onMouseMove={drawSign} onMouseUp={endSign} onMouseLeave={endSign}
                    onTouchStart={(e) => { beginSign(e); e.preventDefault(); }}
                    onTouchMove={(e) => { drawSign(e); e.preventDefault(); }}
                    onTouchEnd={endSign}
                    className="w-full h-40 bg-white rounded-xl border border-dashed border-slate-300 touch-none"
                  />
                  <input ref={signUploadInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadSign} />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] text-amber-600 font-bold">⚠️ ยังไม่มีลายเซ็นสำเร็จรูป — <button onClick={() => setShowSignSetup(true)} className="underline">ตั้งลายเซ็น</button></p>
                    <button type="button" onClick={() => signUploadInputRef.current?.click()} className="shrink-0 text-[11px] font-black px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50">อัปโหลดรูปเซ็น</button>
                  </div>
                </>
              )}
              <p className="text-[11px] text-slate-400 mt-2">ผู้อนุมัติ: {hostIdentity?.name || hostIdentity?.staffId}</p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setSignModalItem(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 text-sm font-bold">ยกเลิก</button>
              <button type="button" onClick={confirmSignApprove} className="px-6 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-sm font-black">✓ ยืนยันอนุมัติ</button>
            </div>
          </div>
        </div>
      )}

      {docModalItem && (
        <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            {/* Gradient Header */}
            <div className="relative px-6 py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white">
              <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_20%_20%,white_0,transparent_40%)]" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="min-w-0 flex items-start gap-3">
                  <div className="shrink-0 w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center ring-1 ring-white/30">
                    <ClipboardCheck className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-black truncate">ใบเอกสารสำหรับอนุมัติ</h3>
                    <p className="text-[12px] text-blue-100 mt-0.5 flex flex-wrap gap-x-1.5 gap-y-0.5 items-center">
                      {docModalItem.stepLabel ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 ring-1 ring-white/30 text-[11px] font-bold">
                          {docModalItem.stepLabel}
                        </span>
                      ) : null}
                      <span className="opacity-90">{docModalItem.topic}</span>
                      <span className="opacity-60">·</span>
                      <span className="font-bold">ผู้ขอ {docModalItem.requesterName || '-'}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setDocModalItem(null); setShowRecheckInput(false); setRecheckNote(''); }}
                  className="shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-xl bg-white/15 hover:bg-white/25 text-white transition ring-1 ring-white/30"
                  aria-label="ปิด"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pt-5 pb-4 bg-slate-50/60">

            {(() => {
              const rp = docModalItem.requestPayload || {};
              const DocRow = ({ label, value, label2, value2 }) => (
                <div className="flex text-[13px] border-b border-slate-300 py-1">
                  <span className="font-bold min-w-[100px] shrink-0">{label}:</span><span className="flex-1">{value || '-'}</span>
                  {label2 && <><span className="font-bold min-w-[80px] shrink-0 ml-3">{label2}:</span><span className="flex-1">{value2 || '-'}</span></>}
                </div>
              );
              const DocCheck = ({ checked, label }) => (
                <span className="text-[12px] flex items-center gap-1"><span className={`w-3.5 h-3.5 border border-black inline-flex items-center justify-center text-[9px] ${checked ? 'bg-black text-white' : ''}`}>{checked ? '✓' : ''}</span>{label}</span>
              );
              switch (docModalItem.sourceForm) {
                case 'GOODS_IN_OUT':
                  return (
                    <div className="mt-3 border-2 border-black overflow-hidden">
                      <div className="text-center py-2 border-b-2 border-black bg-slate-50">
                        <h4 className="font-black text-base">ใบนำของเข้า-ออกบริษัท</h4>
                        <p className="text-[11px] text-slate-500">(Goods In/Out Form) - {rp.direction === 'IN' ? 'นำเข้า' : 'นำออก'}</p>
                      </div>
                      <div className="p-3 text-[13px] space-y-0.5">
                        <DocRow label="ประเภท" value={rp.direction === 'IN' ? 'นำของเข้า' : 'นำของออก'} label2="ประตู" value2={rp.gate} />
                        <DocRow label="เลขที่เอกสาร" value={rp.docNo} label2="เลขซีล" value2={rp.sealNo} />
                        <DocRow label="ผู้นำของ" value={rp.carrierName} label2="รหัส" value2={rp.staffId} />
                        <DocRow label="แผนก" value={rp.dept} label2="ทะเบียนรถ" value2={rp.vehiclePlate} />
                      </div>
                      <table className="w-full border-collapse text-[12px]">
                        <thead><tr className="bg-slate-100"><th className="border border-black p-1.5 w-10">ลำดับ</th><th className="border border-black p-1.5">รายการ</th><th className="border border-black p-1.5 w-16">จำนวน</th><th className="border border-black p-1.5 w-14">หน่วย</th></tr></thead>
                        <tbody>{(rp.lines || []).filter(l => l.description).map((l, i) => (
                          <tr key={i}><td className="border border-black text-center p-1">{i+1}</td><td className="border border-black p-1">{l.description}</td><td className="border border-black text-center p-1">{l.qty || '-'}</td><td className="border border-black text-center p-1">{l.unit || '-'}</td></tr>
                        ))}{(rp.lines || []).filter(l => l.description).length === 0 && <tr><td colSpan={4} className="border border-black text-center p-2 text-slate-400">ไม่มีรายการ</td></tr>}</tbody>
                      </table>
                      <div className="p-2 border-t border-black">
                        <p className="font-bold text-[11px] mb-1">รูปชิ้นงาน</p>
                        {(rp.lines || []).some(l => (l.photos || []).length > 0) ? (
                          <div className="flex flex-wrap gap-1">{(rp.lines || []).flatMap((l, li) => (l.photos || []).map((src, pi) => (
                            <img key={`${li}-${pi}`} src={src} alt="" className="w-16 h-16 object-cover border border-slate-300 rounded cursor-pointer hover:opacity-80" onClick={() => window.open(src, '_blank')} />
                          )))}</div>
                        ) : (
                          <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-orange-500 font-black text-sm">⚠️</span>
                                <span className="text-orange-700 text-[12px] font-bold">ไม่มีรูปสินค้าแนบมา — พนักงานไม่ได้ถ่ายรูปก่อนส่ง</span>
                              </div>
                              {!showRecheckInput && (
                                <button
                                  type="button"
                                  onClick={() => setShowRecheckInput(true)}
                                  className="shrink-0 px-2 py-1 bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-black rounded-lg"
                                >
                                  🔄 รีเช็ค
                                </button>
                              )}
                            </div>
                            {showRecheckInput && (
                              <div className="space-y-2 pt-1 border-t border-orange-200">
                                <p className="text-orange-800 text-[11px] font-bold">ระบุหมายเหตุ / สิ่งที่ให้แก้ไข:</p>
                                <textarea
                                  rows={3}
                                  value={recheckNote}
                                  onChange={e => setRecheckNote(e.target.value)}
                                  placeholder="เช่น กรุณาถ่ายรูปสินค้าก่อนนำออก แล้วส่งใหม่อีกครั้ง"
                                  className="w-full text-[12px] border border-orange-300 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
                                />
                                <div className="flex gap-2 justify-end">
                                  <button
                                    type="button"
                                    onClick={() => { setShowRecheckInput(false); setRecheckNote(''); }}
                                    className="px-3 py-1 text-[11px] font-bold rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50"
                                  >
                                    ยกเลิก
                                  </button>
                                  <button
                                    type="button"
                                    disabled={recheckSending}
                                    onClick={async () => {
                                      if (!recheckNote.trim()) { alert('กรุณาระบุหมายเหตุ'); return; }
                                      setRecheckSending(true);
                                      try {
                                        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'approval_workflows', docModalItem.id);
                                        const returnNoteTrim = recheckNote.trim();
                                        const returnedByUser = hostIdentity?.staffId || '';
                                        await updateDoc(docRef, {
                                          status: 'returned',
                                          returnNote: returnNoteTrim,
                                          returnedBy: returnedByUser,
                                          returnedAt: new Date().toISOString(),
                                        });
                                        // fire-and-forget email to requester
                                        try { notifyWorkflowReturned(docModalItem, { returnNote: returnNoteTrim, returnedBy: returnedByUser }); } catch {}
                                        setDocModalItem(null);
                                        setShowRecheckInput(false);
                                        setRecheckNote('');
                                        alert('✅ ส่งกลับให้พนักงานแก้ไขแล้ว');
                                      } catch (err) {
                                        alert('เกิดข้อผิดพลาด: ' + err.message);
                                      } finally {
                                        setRecheckSending(false);
                                      }
                                    }}
                                    className="px-3 py-1 text-[11px] font-black rounded-lg bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50"
                                  >
                                    {recheckSending ? 'กำลังส่ง...' : '📤 ส่งรีเช็ค'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="p-2 border-t border-black flex gap-4 text-[12px]">
                        <div><span className="font-bold">หมายเหตุ:</span> {rp.note || '-'}</div>
                      </div>
                      {rp.carrierSign && <div className="p-2 border-t border-black"><span className="font-bold text-[11px]">ลายเซ็นผู้นำของ:</span><img src={rp.carrierSign} alt="" className="h-10 object-contain mt-1" /></div>}
                    </div>
                  );
                case 'FOOD_ORDER':
                case 'DRINK_ORDER':
                  return (
                    <div className="mt-3 border-2 border-black overflow-hidden">
                      <div className="text-center py-2 border-b-2 border-black bg-slate-50">
                        <h4 className="font-black text-base">{docModalItem.sourceForm === 'DRINK_ORDER' ? 'แบบการสั่งเครื่องดื่มเพื่อลูกค้า' : 'แบบการสั่งอาหารเพื่อรับรองลูกค้า'}</h4>
                        <p className="text-[11px] text-slate-500">({docModalItem.sourceForm === 'DRINK_ORDER' ? 'Beverage Request' : 'Food Request'})</p>
                      </div>
                      <div className="p-3 text-[13px] space-y-0.5">
                        <DocRow label="ชื่อผู้รับรอง" value={rp.responsiblePerson} />
                        <DocRow label="รหัสพนักงาน" value={rp.employeeId} label2="ฝ่าย" value2={rp.department || rp.dept} />
                        <DocRow label="วันที่สั่ง" value={rp.orderDate} label2="เวลา" value2={rp.orderTime} />
                      </div>
                      <table className="w-full border-collapse text-[12px]">
                        <thead><tr className="bg-slate-100"><th className="border border-black p-1.5 w-10">ลำดับ</th><th className="border border-black p-1.5">รายละเอียด</th><th className="border border-black p-1.5 w-16">จำนวน</th><th className="border border-black p-1.5">เงื่อนไข</th></tr></thead>
                        <tbody>{[0,1,2,3].map(idx => { const row = (rp.rows || [])[idx] || {}; return (
                          <tr key={idx}><td className="border border-black text-center p-1">{idx+1}</td><td className="border border-black p-1">{row.details || ''}</td><td className="border border-black text-center p-1">{row.count || ''}</td><td className="border border-black p-1">{row.condition || ''}</td></tr>
                        );})}</tbody>
                      </table>
                      <div className="p-2 border-t border-black text-[12px]"><span className="font-bold">หมายเหตุ:</span> {rp.note || '-'}</div>
                      {rp.ordererSign && <div className="p-2 border-t border-black"><span className="font-bold text-[11px]">ลายเซ็นผู้สั่ง:</span><img src={rp.ordererSign} alt="" className="h-10 object-contain mt-1" /></div>}
                    </div>
                  );
                case 'DRINK_FOOD_ORDER': {
                  const InfoCell = ({ label, value }) => (
                    <div className="bg-white rounded-lg border border-slate-200 px-3 py-2">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</div>
                      <div className="text-[13px] font-bold text-slate-800 mt-0.5 truncate">{value || '-'}</div>
                    </div>
                  );
                  const renderRows = (rows, theme) => {
                    const accent = theme === 'drink'
                      ? { head: 'bg-emerald-600 text-white', row: 'hover:bg-emerald-50/60', num: 'bg-emerald-100 text-emerald-700', badge: 'bg-emerald-50 text-emerald-800 border-emerald-200' }
                      : { head: 'bg-amber-600 text-white',   row: 'hover:bg-amber-50/60',   num: 'bg-amber-100 text-amber-700',   badge: 'bg-amber-50 text-amber-800 border-amber-200' };
                    if (!rows || rows.length === 0) {
                      return (
                        <div className="px-4 py-6 text-center text-[12px] text-slate-400 bg-white border border-slate-200 rounded-lg">— ไม่มีรายการ —</div>
                      );
                    }
                    return (
                      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                        <table className="w-full border-collapse text-[12px]">
                          <thead>
                            <tr className={`${accent.head} text-[11px]`}>
                              <th className="p-2 w-12 font-black">#</th>
                              <th className="p-2 text-left font-black">รายละเอียด</th>
                              <th className="p-2 w-16 font-black">จำนวน</th>
                              <th className="p-2 text-left font-black">เงื่อนไข</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row, idx) => (
                              <tr key={idx} className={`border-t border-slate-100 ${accent.row}`}>
                                <td className="p-2 text-center">
                                  <span className={`inline-flex w-6 h-6 items-center justify-center rounded-full text-[11px] font-black ${accent.num}`}>{idx + 1}</span>
                                </td>
                                <td className="p-2 font-medium text-slate-800">{row.details || '-'}</td>
                                <td className="p-2 text-center font-bold text-slate-800">{row.count || '-'}</td>
                                <td className="p-2">
                                  {row.condition
                                    ? <span className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-bold ${accent.badge}`}>{row.condition}</span>
                                    : <span className="text-slate-300">-</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  };
                  return (
                    <div className="mt-3 rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-sm">
                      {/* Title bar */}
                      <div className="px-5 py-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-amber-600 text-white text-center">
                        <h4 className="font-black text-base tracking-wide flex items-center justify-center gap-2">
                          <Coffee className="w-4 h-4" /> แบบการสั่งเครื่องดื่มและอาหารเพื่อรับรองลูกค้า <Utensils className="w-4 h-4" />
                        </h4>
                        <p className="text-[11px] text-white/80 mt-0.5">(Beverage &amp; Food Request)</p>
                      </div>

                      {/* Requester info grid */}
                      <div className="px-4 pt-4 pb-3 bg-slate-50/60 grid grid-cols-2 md:grid-cols-3 gap-2">
                        <div className="col-span-2 md:col-span-1">
                          <InfoCell label="ชื่อผู้รับรอง" value={rp.responsiblePerson} />
                        </div>
                        <InfoCell label="รหัสพนักงาน" value={rp.employeeId} />
                        <InfoCell label="ฝ่าย / แผนก" value={rp.department || rp.dept} />
                        <InfoCell label="วันที่สั่ง" value={rp.orderDate} />
                        <InfoCell label="เวลา" value={rp.orderTime} />
                      </div>

                      {/* Beverages section */}
                      <div className="px-4 pt-3 pb-4 bg-white">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[12px] font-black border border-emerald-200">
                            <Coffee className="w-3.5 h-3.5" /> เครื่องดื่ม
                          </span>
                          <span className="text-[11px] text-slate-400">Beverages · {(rp.drinkRows || []).length} รายการ</span>
                        </div>
                        {renderRows(rp.drinkRows, 'drink')}
                        {rp.drinkNote && (
                          <div className="mt-2 px-3 py-2 bg-emerald-50 border-l-4 border-emerald-400 rounded-r-md text-[12px] text-emerald-900">
                            <span className="font-black">หมายเหตุเครื่องดื่ม:</span> {rp.drinkNote}
                          </div>
                        )}
                      </div>

                      {/* Food section */}
                      <div className="px-4 pt-2 pb-4 bg-white border-t border-slate-100">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-[12px] font-black border border-amber-200">
                            <Utensils className="w-3.5 h-3.5" /> อาหาร
                          </span>
                          <span className="text-[11px] text-slate-400">Food · {(rp.foodRows || []).length} รายการ</span>
                        </div>
                        {renderRows(rp.foodRows, 'food')}
                        {rp.foodNote && (
                          <div className="mt-2 px-3 py-2 bg-amber-50 border-l-4 border-amber-400 rounded-r-md text-[12px] text-amber-900">
                            <span className="font-black">หมายเหตุอาหาร:</span> {rp.foodNote}
                          </div>
                        )}
                      </div>

                      {/* Requester signature */}
                      {rp.ordererSign && (
                        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-[12px] text-slate-600">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            <span className="font-bold">ลายเซ็นผู้สั่ง</span>
                          </div>
                          <div className="flex-1 flex justify-end">
                            <div className="px-3 py-1 bg-white border border-slate-200 rounded-lg">
                              <img src={rp.ordererSign} alt="" className="h-10 object-contain" />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }
                case 'VEHICLE_BOOKING': {
                  const vRoutes = Array.isArray(rp.routes) && rp.routes.length > 0
                    ? rp.routes
                    : (rp.destination ? [{ origin: '-', destination: rp.destination }] : []);
                  const vPassengers = Array.isArray(rp.passengers) ? rp.passengers : [];
                  const vPurposeCode = (rp.purpose || '').toString().trim().slice(0, 3);
                  const vPurposeDetail = (rp.purpose || '').toString().includes(':')
                    ? (rp.purpose || '').split(':').slice(1).join(':').trim()
                    : '';
                  const vDrivingOpt = rp.drivingOption || (rp.driveSelf ? '6.1' : (rp.needDriver ? '6.2' : ''));
                  const vPurposeOpts = [
                    { code: '5.1', label: 'ติดต่องานบริษัท' },
                    { code: '5.2', label: 'ไปต่างจังหวัด' },
                    { code: '5.3', label: 'รับ-ส่งลูกค้า' },
                    { code: '5.4', label: 'บริเวณในโรงงาน' },
                    { code: '5.5', label: 'อื่นๆ' },
                  ];
                  const Badge = ({ n, title }) => (
                    <div className="flex items-center gap-2 mb-2 mt-3 pt-2 border-t border-slate-100 first:mt-0 first:pt-0 first:border-0">
                      <span className="w-6 h-6 rounded-full bg-indigo-600 text-white inline-flex items-center justify-center font-black text-xs">{n}</span>
                      <span className="font-black text-sm text-slate-800">{title}</span>
                    </div>
                  );
                  const VC = ({ label, value }) => (
                    <div>
                      <div className="text-[10px] font-bold text-slate-500 uppercase mb-0.5">{label}</div>
                      <div className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-[13px]">{value || '-'}</div>
                    </div>
                  );
                  return (
                    <div className="mt-3 border-2 border-indigo-200 rounded-xl overflow-hidden bg-white">
                      <div className="text-center py-2 border-b-2 border-indigo-200 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white">
                        <h4 className="font-black text-base">ใบขออนุญาตใช้รถ/จองรถ เพื่อปฏิบัติงาน</h4>
                        <p className="text-[11px] text-indigo-100">(Vehicle Request Form)</p>
                      </div>
                      <div className="p-3">
                        {/* 1. ผู้ขอ */}
                        <Badge n={1} title="ผู้ขอใช้รถ" />
                        <div className="grid grid-cols-3 gap-2">
                          <VC label="ชื่อ-นามสกุล" value={rp.name} />
                          <VC label="รหัสพนักงาน" value={rp.requesterId} />
                          <VC label="แผนก" value={rp.department} />
                        </div>

                        {/* 2. ผู้ร่วมเดินทาง */}
                        <Badge n={2} title={`ผู้ร่วมเดินทาง (${vPassengers.length} คน)`} />
                        {vPassengers.length === 0 ? (
                          <div className="text-[11px] text-slate-400 text-center py-1">— ไม่มีผู้ร่วมเดินทาง —</div>
                        ) : (
                          <table className="w-full border-collapse text-[12px]">
                            <thead>
                              <tr className="bg-indigo-50 text-indigo-800">
                                <th className="border border-indigo-100 p-1 w-8">#</th>
                                <th className="border border-indigo-100 p-1">ชื่อ-นามสกุล</th>
                                <th className="border border-indigo-100 p-1 w-24">รหัส</th>
                                <th className="border border-indigo-100 p-1 w-24">แผนก</th>
                              </tr>
                            </thead>
                            <tbody>
                              {vPassengers.map((p, i) => (
                                <tr key={i}>
                                  <td className="border border-indigo-100 text-center p-1">{i + 1}</td>
                                  <td className="border border-indigo-100 p-1">{p.name || '-'}</td>
                                  <td className="border border-indigo-100 text-center p-1 font-mono">{p.empId || '-'}</td>
                                  <td className="border border-indigo-100 p-1">{p.dept || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}

                        {/* 3. วัน-เวลา */}
                        <Badge n={3} title="วันและเวลา" />
                        <div className="grid grid-cols-3 gap-2">
                          <VC label="วันที่ขอใช้รถ" value={rp.date} />
                          <VC label="เวลาออก" value={rp.timeStart ? `${rp.timeStart} น.` : ''} />
                          <VC label="เวลากลับ" value={rp.timeEnd ? `${rp.timeEnd} น.` : ''} />
                        </div>

                        {/* 4. เส้นทาง */}
                        <Badge n={4} title="เส้นทาง" />
                        {vRoutes.length === 0 ? (
                          <div className="text-[11px] text-slate-400 text-center py-1">— ไม่ระบุ —</div>
                        ) : vRoutes.map((r, i) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md mb-1 text-[12px]">
                            <span className="text-green-600">🟢 {r.origin || '-'}</span>
                            <span className="text-indigo-500 font-black">→</span>
                            <span className="text-red-600">🔴 {r.destination || '-'}</span>
                          </div>
                        ))}

                        {/* 5. วัตถุประสงค์ */}
                        <Badge n={5} title="วัตถุประสงค์การใช้รถ" />
                        <div className="flex flex-wrap gap-1.5">
                          {vPurposeOpts.map((o) => {
                            const on = vPurposeCode === o.code;
                            return (
                              <span key={o.code} className={`px-2.5 py-1 border rounded-md text-[11px] ${on ? 'bg-indigo-600 text-white border-indigo-600 font-bold' : 'bg-white text-slate-700 border-slate-200'}`}>
                                <b>{o.code}</b> {o.label}
                              </span>
                            );
                          })}
                        </div>
                        {vPurposeDetail && (
                          <div className="mt-2 p-2 bg-indigo-50 border-l-2 border-indigo-400 rounded-r text-[12px]">
                            <b>รายละเอียด:</b> {vPurposeDetail}
                          </div>
                        )}

                        {/* 6. การขับรถ */}
                        <Badge n={6} title="การขับรถ" />
                        <div className="flex flex-wrap gap-1.5">
                          <span className={`px-2.5 py-1 border rounded-md text-[11px] ${vDrivingOpt === '6.1' ? 'bg-indigo-600 text-white border-indigo-600 font-bold' : 'bg-white text-slate-700 border-slate-200'}`}>🚗 <b>6.1</b> ต้องการขับเอง</span>
                          <span className={`px-2.5 py-1 border rounded-md text-[11px] ${vDrivingOpt === '6.2' ? 'bg-indigo-600 text-white border-indigo-600 font-bold' : 'bg-white text-slate-700 border-slate-200'}`}>👤 <b>6.2</b> ต้องการใช้พนักงานขับรถให้</span>
                        </div>

                        {rp.approvedCarNo && (
                          <div className="mt-3 p-2 bg-emerald-50 border border-emerald-200 rounded-md">
                            <p className="text-[11px] font-black text-emerald-800 mb-1">✓ รถที่อนุมัติแล้ว</p>
                            <div className="grid grid-cols-2 gap-2">
                              <VC label="ทะเบียนรถ" value={rp.approvedCarNo} />
                              {rp.driver && <VC label="พนักงานขับรถ" value={rp.driver} />}
                            </div>
                          </div>
                        )}
                      </div>

                      {rp.requesterSign && (
                        <div className="border-t border-slate-200 p-2 text-center bg-slate-50">
                          <div className="h-10 flex items-center justify-center"><img src={rp.requesterSign} alt="" className="h-8 object-contain" /></div>
                          <p className="text-[10px] font-bold text-slate-600 pt-1">ผู้ขออนุญาต</p>
                        </div>
                      )}
                    </div>
                  );
                }
                case 'OUTING_REQUEST':
                  return (
                    <div className="mt-3 border-2 border-black overflow-hidden">
                      <div className="text-center py-2 border-b-2 border-black bg-slate-50">
                        <h4 className="font-black text-base">ใบขออนุญาตออกนอกสถานที่</h4>
                        <p className="text-[11px] text-slate-500">(Onsite Permit Form)</p>
                      </div>
                      <div className="p-3 text-[13px] space-y-0.5">
                        <DocRow label="ประเภท" value={rp.type === 'company' ? 'กิจบริษัท' : rp.type === 'personal' ? 'กิจส่วนตัว' : rp.type} label2="วันที่" value2={rp.date} />
                        <DocRow label="จำนวนคน" value={rp.totalCount} label2="ผู้อนุมัติ" value2={rp.managerName} />
                      </div>
                      <table className="w-full border-collapse text-[12px]">
                        <thead><tr className="bg-slate-100"><th className="border border-black p-1.5 w-10">ลำดับ</th><th className="border border-black p-1.5">ชื่อ-นามสกุล</th><th className="border border-black p-1.5">สถานที่ไป</th><th className="border border-black p-1.5 w-16">เวลาไป</th><th className="border border-black p-1.5 w-16">เวลากลับ</th></tr></thead>
                        <tbody>{(rp.rows || []).filter(r => r.name).map((r, i) => (
                          <tr key={i}><td className="border border-black text-center p-1">{i+1}</td><td className="border border-black p-1">{r.name}</td><td className="border border-black p-1">{r.destination || '-'}</td><td className="border border-black text-center p-1">{r.timeOut || '-'}</td><td className="border border-black text-center p-1">{r.timeIn || '-'}</td></tr>
                        ))}{(rp.rows || []).filter(r => r.name).length === 0 && <tr><td colSpan={5} className="border border-black text-center p-2 text-slate-400">ไม่มีรายชื่อ</td></tr>}</tbody>
                      </table>
                      <div className="p-2 border-t border-black text-[12px]"><span className="font-bold">หมายเหตุ:</span> {rp.note || '-'}</div>
                      {(rp.requesterSign || rp.managerSign) && (
                        <div className="flex divide-x divide-black border-t border-black">
                          {rp.requesterSign && (
                            <div className="flex-1 text-center p-2">
                              <div className="h-10 flex items-center justify-center"><img src={rp.requesterSign} alt="" className="h-8 object-contain" /></div>
                              <p className="text-[10px] font-bold border-t border-black pt-1">ผู้ขออนุญาต</p>
                            </div>
                          )}
                          {rp.managerSign && (
                            <div className="flex-1 text-center p-2">
                              <div className="h-10 flex items-center justify-center"><img src={rp.managerSign} alt="" className="h-8 object-contain" /></div>
                              <p className="text-[10px] font-bold border-t border-black pt-1">หน.แผนก</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                default:
                  return (
                    <div className="mt-3 border-2 border-black overflow-hidden">
                      <div className="text-center py-2 border-b-2 border-black bg-slate-50">
                        <h4 className="font-black text-base">{docModalItem.topic || 'เอกสาร'}</h4>
                      </div>
                      <div className="p-3 text-[13px] space-y-0.5">
                        <DocRow label="ผู้ขอ" value={docModalItem.requesterName} label2="รหัส" value2={docModalItem.requesterId} />
                        <DocRow label="แผนก" value={docModalItem.requesterDepartment} />
                        {rp.destination && <DocRow label="ปลายทาง" value={rp.destination} />}
                        {rp.note && <DocRow label="หมายเหตุ" value={rp.note} />}
                      </div>
                    </div>
                  );
              }
            })()}

            {/* ลายเซ็นขั้นตอนก่อนหน้า — แบบการ์ดสวยงาม */}
            {docModalPrevSteps.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-[12px] font-black border border-blue-200">
                    <CheckCircle2 className="w-3.5 h-3.5" /> ลายเซ็นขั้นตอนก่อนหน้า
                  </span>
                  <span className="text-[11px] text-slate-400">{docModalPrevSteps.filter(s => s.approvedSign || s.approvedBy).length} ขั้นตอน</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {docModalPrevSteps.filter(s => s.approvedSign || s.approvedBy).map((s, i) => (
                    <div key={i} className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                      <div className="h-16 flex items-center justify-center bg-slate-50 border-b border-slate-100">
                        {s.approvedSign
                          ? <img src={s.approvedSign} alt="" className="h-12 object-contain" />
                          : <div className="text-slate-300 text-[10px]">— ไม่มีลายเซ็น —</div>}
                      </div>
                      <div className="p-2 text-center">
                        <p className="text-[12px] font-black text-slate-800 truncate">{s.approvedBy || '-'}</p>
                        <p className="text-[10px] text-blue-600 font-bold">{s.stepLabel || `ขั้น ${s.step}`}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            </div>{/* /scroll body */}

            {/* Sticky Footer */}
            <div className="px-6 py-3 border-t border-slate-200 bg-white flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setDocModalItem(null); setShowRecheckInput(false); setRecheckNote(''); }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-bold transition"
              >
                ปิด
              </button>
              <button
                type="button"
                onClick={() => {
                  setDocModalItem(null);
                  setShowRecheckInput(false);
                  setRecheckNote('');
                  openSignModal(docModalItem);
                }}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 text-sm font-black shadow-md shadow-blue-600/20 flex items-center gap-2 transition"
              >
                <CheckCircle2 className="w-4 h-4" /> เซ็นอนุมัติเอกสารนี้
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Signature Tracking Modal */}
      {signatureTrackingDoc && (
        <div className="fixed inset-0 z-[130] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { setSignatureTrackingDoc(null); setSignatureTrackingSteps([]); }}>
          <div className="w-full max-w-3xl bg-white rounded-3xl border border-slate-200 p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="min-w-0">
                <h3 className="text-lg font-black text-slate-900">ติดตามลายเซ็นเอกสาร</h3>
                <p className="text-sm text-slate-500 mt-1">
                  ฟอร์ม: <span className="font-bold text-blue-700">{signatureTrackingDoc.sourceForm || '-'}</span>
                  {signatureTrackingDoc.topic ? ` · ${signatureTrackingDoc.topic}` : ''}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  ผู้ขอ: {signatureTrackingDoc.requesterName || '-'} ({signatureTrackingDoc.requesterId || '-'})
                  {signatureTrackingDoc.createdAt ? ` · ${new Date(signatureTrackingDoc.createdAt).toLocaleString('th-TH')}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setSignatureTrackingDoc(null); setSignatureTrackingSteps([]); }}
                className="shrink-0 text-slate-400 hover:text-slate-900 transition p-2 rounded-xl border border-slate-200 hover:bg-slate-50"
              >
                <X size={20} />
              </button>
            </div>

            {/* Timeline */}
            {(() => {
              const sourceForm = signatureTrackingDoc.sourceForm || '';
              const isVehicle = sourceForm === 'VEHICLE_BOOKING';
              const hasSecurityStep = ['OUTING_REQUEST', 'GOODS_IN_OUT', 'VISITOR'].includes(sourceForm);
              const stepDefs = [
                { step: 0, label: 'Prepare (พนักงาน)' },
                { step: 1, label: 'Check (หัวหน้าแผนก)' },
                { step: 2, label: isVehicle ? 'GA จัดรถ' : 'Approve (ผจก./HR/EEE)' },
              ];
              if (hasSecurityStep) {
                stepDefs.push({ step: 3, label: 'รปภ. รับทราบ' });
              }

              const getStepData = (stepNum) => signatureTrackingSteps.find(s => (s.step || 1) === stepNum);

              return (
                <div>
                  {/* Desktop: horizontal */}
                  <div className="hidden md:block mt-6 overflow-x-auto pb-4">
                  <div className="flex items-start gap-3 px-2 w-max">
                    {stepDefs.map((def, idx) => {
                      const stepData = def.step === 0 ? null : getStepData(def.step);
                      const isFirst = def.step === 0;

                      return (
                        <React.Fragment key={def.step}>
                          {idx > 0 && (
                            <div className="flex items-center pt-8 shrink-0">
                              <div style={{ width: 40, height: 2, background: '#cbd5e1' }}></div>
                              <span className="text-slate-300 text-lg mx-1">&rarr;</span>
                              <div style={{ width: 40, height: 2, background: '#cbd5e1' }}></div>
                            </div>
                          )}
                          {isFirst ? (
                            <div className="shrink-0" style={{ textAlign: 'center', padding: 16, background: '#eff6ff', border: '2px solid #93c5fd', borderRadius: 16, minWidth: 130 }}>
                              <div style={{ fontSize: 24, marginBottom: 4 }}>📝</div>
                              <div style={{ fontWeight: 900, fontSize: 12, color: '#1e40af' }}>{signatureTrackingDoc.requesterName || '-'}</div>
                              <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>{signatureTrackingDoc.requesterId || '-'}</div>
                              <div style={{ fontSize: 10, color: '#666' }}>{signatureTrackingDoc.createdAt ? new Date(signatureTrackingDoc.createdAt).toLocaleDateString('th-TH') : '-'}</div>
                              <div style={{ marginTop: 4, fontSize: 11, fontWeight: 900, color: '#2563eb' }}>ผู้จัดทำ</div>
                              <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>{def.label}</div>
                            </div>
                          ) : stepData && stepData.status === 'approved' ? (
                            <div className="shrink-0" style={{ textAlign: 'center', padding: 16, background: '#f0fdf4', border: '2px solid #86efac', borderRadius: 16, minWidth: 130 }}>
                              {stepData.approvedSign && (
                                <img src={stepData.approvedSign} alt="signature" style={{ width: 100, height: 40, objectFit: 'contain', margin: '0 auto 8px' }} />
                              )}
                              <div style={{ fontWeight: 900, fontSize: 12 }}>{stepData.approvedBy || '-'}</div>
                              <div style={{ fontSize: 10, color: '#666' }}>{stepData.approvedDate || (stepData.acknowledgedAt ? stepData.acknowledgedAt.split('T')[0] : '-')}</div>
                              <div style={{ marginTop: 4, fontSize: 11, fontWeight: 900, color: '#16a34a' }}>&#10003; อนุมัติแล้ว</div>
                              <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>{def.label}</div>
                            </div>
                          ) : stepData && stepData.status === 'pending' ? (
                            <div className="shrink-0" style={{ textAlign: 'center', padding: 16, background: '#fefce8', border: '2px solid #fde047', borderRadius: 16, minWidth: 130 }}>
                              <div style={{ fontSize: 24, marginBottom: 4 }}>&#9203;</div>
                              <div style={{ fontWeight: 900, fontSize: 12, color: '#a16207' }}>รอเซ็น</div>
                              <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>{stepData.targetDept || '-'}</div>
                              <div style={{ marginTop: 4, fontSize: 11, fontWeight: 900, color: '#ca8a04' }}>รอดำเนินการ</div>
                              <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>{def.label}</div>
                            </div>
                          ) : (
                            <div className="shrink-0" style={{ textAlign: 'center', padding: 16, background: '#f8fafc', border: '2px solid #e2e8f0', borderRadius: 16, minWidth: 130 }}>
                              <div style={{ fontSize: 24, marginBottom: 4, opacity: 0.3 }}>&#11036;</div>
                              <div style={{ fontWeight: 900, fontSize: 12, color: '#94a3b8' }}>ยังไม่ถึงขั้นนี้</div>
                              <div style={{ marginTop: 4, fontSize: 11, fontWeight: 900, color: '#cbd5e1' }}>รอคิว</div>
                              <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>{def.label}</div>
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                  </div>

                  {/* Mobile: vertical */}
                  <div className="flex md:hidden flex-col items-center gap-2 mt-6">
                    {stepDefs.map((def, idx) => {
                      const stepData = def.step === 0 ? null : getStepData(def.step);
                      const isFirst = def.step === 0;

                      return (
                        <React.Fragment key={def.step}>
                          {idx > 0 && (
                            <div className="flex flex-col items-center">
                              <div style={{ width: 2, height: 20, background: '#cbd5e1' }}></div>
                              <span className="text-slate-300 text-sm">&darr;</span>
                              <div style={{ width: 2, height: 20, background: '#cbd5e1' }}></div>
                            </div>
                          )}
                          {isFirst ? (
                            <div style={{ textAlign: 'center', padding: 14, background: '#eff6ff', border: '2px solid #93c5fd', borderRadius: 16, width: '100%', maxWidth: 280 }}>
                              <div style={{ fontWeight: 900, fontSize: 12, color: '#1e40af' }}>{signatureTrackingDoc.requesterName || '-'}</div>
                              <div style={{ fontSize: 10, color: '#666' }}>{signatureTrackingDoc.requesterId || '-'}</div>
                              <div style={{ marginTop: 4, fontSize: 11, fontWeight: 900, color: '#2563eb' }}>ผู้จัดทำ</div>
                              <div style={{ fontSize: 9, color: '#94a3b8' }}>{def.label}</div>
                            </div>
                          ) : stepData && stepData.status === 'approved' ? (
                            <div style={{ textAlign: 'center', padding: 14, background: '#f0fdf4', border: '2px solid #86efac', borderRadius: 16, width: '100%', maxWidth: 280 }}>
                              {stepData.approvedSign && (
                                <img src={stepData.approvedSign} alt="signature" style={{ width: 80, height: 32, objectFit: 'contain', margin: '0 auto 6px' }} />
                              )}
                              <div style={{ fontWeight: 900, fontSize: 12 }}>{stepData.approvedBy || '-'}</div>
                              <div style={{ fontSize: 10, color: '#666' }}>{stepData.approvedDate || (stepData.acknowledgedAt ? stepData.acknowledgedAt.split('T')[0] : '-')}</div>
                              <div style={{ marginTop: 4, fontSize: 11, fontWeight: 900, color: '#16a34a' }}>&#10003; อนุมัติแล้ว</div>
                              <div style={{ fontSize: 9, color: '#94a3b8' }}>{def.label}</div>
                            </div>
                          ) : stepData && stepData.status === 'pending' ? (
                            <div style={{ textAlign: 'center', padding: 14, background: '#fefce8', border: '2px solid #fde047', borderRadius: 16, width: '100%', maxWidth: 280 }}>
                              <div style={{ fontSize: 20, marginBottom: 2 }}>&#9203;</div>
                              <div style={{ fontWeight: 900, fontSize: 12, color: '#a16207' }}>รอเซ็น</div>
                              <div style={{ marginTop: 4, fontSize: 11, fontWeight: 900, color: '#ca8a04' }}>รอดำเนินการ</div>
                              <div style={{ fontSize: 9, color: '#94a3b8' }}>{def.label}</div>
                            </div>
                          ) : (
                            <div style={{ textAlign: 'center', padding: 14, background: '#f8fafc', border: '2px solid #e2e8f0', borderRadius: 16, width: '100%', maxWidth: 280 }}>
                              <div style={{ fontWeight: 900, fontSize: 12, color: '#94a3b8' }}>ยังไม่ถึงขั้นนี้</div>
                              <div style={{ marginTop: 4, fontSize: 11, fontWeight: 900, color: '#cbd5e1' }}>รอคิว</div>
                              <div style={{ fontSize: 9, color: '#94a3b8' }}>{def.label}</div>
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setDocModalItem(signatureTrackingDoc); setSignatureTrackingDoc(null); setSignatureTrackingSteps([]); }}
                className="px-6 py-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-sm font-bold flex items-center gap-2 shadow"
              >
                <FileText size={16} /> ดูเอกสาร
              </button>
              <button
                type="button"
                onClick={() => { setSignatureTrackingDoc(null); setSignatureTrackingSteps([]); }}
                className="px-6 py-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-bold"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ส่วนบริการเพิ่มเติมที่อัปเดตใหม่ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 font-sans text-left">
        <ServiceButton 
          icon={<Car className="text-blue-600" />} 
          label="ใบขออนุญาตใช้รถ" 
          onClick={() => window.open(`/vehicle.html?name=${encodeURIComponent(hostIdentity?.name || '')}&staffId=${encodeURIComponent(hostIdentity?.staffId || '')}&dept=${encodeURIComponent(hostIdentity?.department || '')}`, '_blank')}
        />
        <ServiceButton
          icon={<><Utensils className="text-orange-600 inline" /><Coffee className="text-emerald-600 inline ml-1" /></>}
          label="สั่งอาหาร / เครื่องดื่ม"
          onClick={() => window.open(`/drink.html?name=${encodeURIComponent(hostIdentity?.name || '')}&staffId=${encodeURIComponent(hostIdentity?.staffId || '')}&dept=${encodeURIComponent(hostIdentity?.department || '')}`, '_blank')}
        />
        <ServiceButton
          icon={<ExternalLink className="text-red-600" />}
          label="ขอออกข้างนอก"
          onClick={() => window.open(`/outing.html?name=${encodeURIComponent(hostIdentity?.name || '')}&staffId=${encodeURIComponent(hostIdentity?.staffId || '')}&dept=${encodeURIComponent(hostIdentity?.department || '')}`, '_blank')}
        />
        <ServiceButton
          icon={<Package className="text-purple-600" />}
          label="เบิกอุปกรณ์ในสำนักงาน"
          onClick={() => window.open(`/equipment.html?name=${encodeURIComponent(hostIdentity?.name || '')}&staffId=${encodeURIComponent(hostIdentity?.staffId || '')}&dept=${encodeURIComponent(hostIdentity?.department || '')}`, '_blank')}
        />
        <ServiceButton
          icon={<Truck className="text-amber-600" />}
          label="นำของเข้า / ของออก"
          onClick={() => window.open(`/goods.html?name=${encodeURIComponent(hostIdentity?.name || '')}&staffId=${encodeURIComponent(hostIdentity?.staffId || '')}&dept=${encodeURIComponent(hostIdentity?.department || '')}`, '_blank')}
        />
      </div>

      {serviceMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-700 text-sm font-bold flex items-center gap-3 animate-in fade-in slide-in-from-top-2 text-left">
           <CheckCircle2 size={20} /> {serviceMessage}
        </div>
      )}

      {/* --- Vehicle Booking Calendar (เฉพาะ HOST เท่านั้น) --- */}
      {role === 'HOST' && <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm text-left font-sans">
        <div className="p-6 md:p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center cursor-pointer" onClick={() => setShowVehicleCalendar(prev => !prev)}>
          <h3 className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-500 font-sans flex items-center gap-2">
            <Car size={16} className="text-blue-600" /> ตารางจองรถ ({vehicles.length} คัน)
          </h3>
          <span className={`text-slate-400 transition-transform ${showVehicleCalendar ? 'rotate-180' : ''}`}>&#9660;</span>
        </div>
        {showVehicleCalendar && (
          <div className="p-4 md:p-6">
            {/* Week Navigation */}
            <div className="flex items-center justify-center gap-4 mb-4">
              <button
                onClick={() => setCalendarWeekOffset(prev => prev - 1)}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition active:scale-95"
              >
                <ChevronLeft size={18} className="text-slate-600" />
              </button>
              <span className="font-black text-sm text-slate-700 min-w-[160px] text-center">{weekTitle}</span>
              <button
                onClick={() => setCalendarWeekOffset(prev => prev + 1)}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition active:scale-95"
              >
                <ChevronRight size={18} className="text-slate-600" />
              </button>
              {calendarWeekOffset !== 0 && (
                <button
                  onClick={() => setCalendarWeekOffset(0)}
                  className="px-3 py-1 rounded-lg bg-blue-100 text-blue-700 text-xs font-bold hover:bg-blue-200 transition"
                >
                  สัปดาห์นี้
                </button>
              )}
            </div>

            {/* Calendar Grid - Card Style */}
            <div className="space-y-2">
              {/* Day Headers */}
              <div className="grid gap-1" style={{ gridTemplateColumns: '180px repeat(5, 1fr)' }}>
                <div></div>
                {weekDays.map((d, i) => {
                  const isToday = formatDateStr(d) === getTodayStr();
                  return (
                    <div key={i} className={`text-center py-2 rounded-xl ${isToday ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-slate-100 text-slate-500'}`}>
                      <div className="text-[13px] font-black">{dayNames[i]}</div>
                      <div className={`text-[11px] ${isToday ? 'text-blue-200' : 'text-slate-400'}`}>{d.getDate()}/{d.getMonth() + 1}</div>
                    </div>
                  );
                })}
              </div>

              {vehicles.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">ยังไม่มีข้อมูลรถ</div>
              ) : vehicles.map((v, vIdx) => (
                <div key={v.id} className={`grid gap-1 items-center ${vIdx % 2 === 0 ? '' : ''}`} style={{ gridTemplateColumns: '180px repeat(5, 1fr)' }}>
                  {/* Vehicle Info */}
                  <div className="flex items-center gap-2.5 px-3 py-2 bg-white rounded-xl border border-slate-100">
                    <div className="text-xl">{getVehicleIcon(v.type)}</div>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-800 text-[11px] truncate">{v.brand}</div>
                      <div className="text-[10px] text-blue-600 font-mono font-bold">{(!v.plate || v.plate === 'รอใส่ทะเบียน') ? v.brand : v.plate}</div>
                    </div>
                  </div>
                  {/* Day Cells */}
                  {weekDays.map((d, i) => {
                    const dateStr = formatDateStr(d);
                    const booking = getBookingForCell(v.id, dateStr);
                    const isToday = dateStr === getTodayStr();
                    const isMaintenance = v.status === 'maintenance';
                    const isUnavailable = v.status === 'unavailable';

                    if (isMaintenance || isUnavailable) {
                      return (
                        <div key={i} className="bg-amber-50 border border-amber-200 rounded-xl px-2 py-2 text-center h-full flex flex-col items-center justify-center">
                          <span className="text-sm">🔧</span>
                          <span className="text-[8px] text-amber-600 font-bold">{isMaintenance ? 'ซ่อม' : 'ปิด'}</span>
                        </div>
                      );
                    }

                    if (booking) {
                      return (
                        <div key={i} className="bg-slate-100 border border-slate-300 rounded-xl px-2 py-2 text-center h-full flex flex-col items-center justify-center cursor-pointer hover:bg-slate-200 transition"
                          title={`${booking.bookedByName || booking.bookedBy} - ${booking.destination || ''}`}
                          onClick={async () => {
                            setSelectedBooking(booking);
                            try {
                              const wfRef = collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows');
                              const q2 = query(wfRef, where('sourceForm', '==', 'VEHICLE_BOOKING'), where('requesterId', '==', (booking.bookedBy || '').toUpperCase()));
                              const snap2 = await getDocs(q2);
                              const steps = snap2.docs.map(d => d.data()).filter(s => s.requestPayload?.date === booking.date).sort((a, b) => (a.step || 1) - (b.step || 1));
                              setBookingWorkflowSteps(steps);
                            } catch { setBookingWorkflowSteps([]); }
                          }}
                        >
                          <span className="text-[10px] text-slate-500 font-bold">จอง</span>
                        </div>
                      );
                    }

                    return (
                      <button
                        key={i}
                        onClick={() => {
                          const url = `/vehicle.html?date=${dateStr}&vehicleId=${v.id}&plate=${encodeURIComponent(v.plate)}&brand=${encodeURIComponent(v.brand)}&name=${encodeURIComponent(hostIdentity?.name || '')}&staffId=${encodeURIComponent(hostIdentity?.staffId || '')}&dept=${encodeURIComponent(hostIdentity?.department || '')}`;
                          window.open(url, '_blank');
                        }}
                        className={`rounded-xl px-2 py-2 text-center h-full flex flex-col items-center justify-center transition-all cursor-pointer active:scale-95 ${isToday ? 'bg-emerald-100 border-2 border-emerald-400 hover:bg-emerald-200' : 'bg-slate-50 border border-slate-200 hover:bg-emerald-50 hover:border-emerald-300'}`}
                      >
                        <span className={`text-[10px] font-bold ${isToday ? 'text-emerald-700' : 'text-slate-400'}`}>จอง</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-4 justify-center text-[10px]">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-slate-50 border border-slate-200"></div><span className="text-slate-400">ว่าง</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-emerald-100 border-2 border-emerald-400"></div><span className="text-slate-400">ว่าง (วันนี้)</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-blue-600"></div><span className="text-slate-400">จองแล้ว</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-amber-50 border border-amber-200"></div><span className="text-slate-400">ซ่อม</span></div>
            </div>
          </div>
        )}

        {/* Booking Detail Modal */}
        {selectedBooking && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={() => setSelectedBooking(null)}>
            <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="p-6 border-b bg-blue-600 text-white">
                <div className="flex justify-between items-center">
                  <h3 className="font-black text-lg flex items-center gap-2">🚗 รายละเอียดการจองรถ</h3>
                  <button onClick={() => setSelectedBooking(null)} className="p-1 hover:bg-white/20 rounded-lg">✕</button>
                </div>
              </div>
              <div className="p-4 md:p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">ผู้จอง</p>
                    <p className="font-bold text-slate-800">{selectedBooking.bookedByName || selectedBooking.bookedBy || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">แผนก</p>
                    <p className="font-bold text-slate-800">{selectedBooking.department || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">ทะเบียนรถ</p>
                    <p className="font-bold text-blue-600 font-mono">{selectedBooking.plate || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">วันที่</p>
                    <p className="font-bold text-slate-800">{selectedBooking.date || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">เวลา</p>
                    <p className="font-bold text-slate-800">{selectedBooking.timeStart || '-'} - {selectedBooking.timeEnd || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">ปลายทาง</p>
                    <p className="font-bold text-slate-800">{selectedBooking.destination || '-'}</p>
                  </div>
                </div>
                {selectedBooking.status && (
                  <div className="pt-3 border-t">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${selectedBooking.status === 'booked' ? 'bg-blue-100 text-blue-700' : selectedBooking.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                      {selectedBooking.status === 'booked' ? '🔵 จองอยู่' : selectedBooking.status === 'completed' ? '✅ เสร็จแล้ว' : selectedBooking.status}
                    </span>
                  </div>
                )}

                {/* สถานะลายเซ็น */}
                <div className="pt-4 border-t">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-3">สถานะลายเซ็นอนุมัติ</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {/* Prepare */}
                    <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-3 text-center">
                      <p className="text-[9px] font-bold text-blue-400 uppercase">Prepare</p>
                      <p className="text-xs font-bold text-blue-700 mt-1">{selectedBooking.bookedByName || selectedBooking.bookedBy || '-'}</p>
                      <p className="text-[9px] text-blue-500 mt-0.5">✅ ส่งแล้ว</p>
                    </div>
                    {/* Check - หัวหน้า */}
                    {(() => {
                      const checkStep = bookingWorkflowSteps.find(s => s.step === 1);
                      return (
                        <div className={`border-2 rounded-xl p-3 text-center ${checkStep?.status === 'approved' ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                          <p className="text-[9px] font-bold text-slate-400 uppercase">Check</p>
                          {checkStep?.approvedSign && <img src={checkStep.approvedSign} className="w-16 h-8 object-contain mx-auto mt-1" />}
                          <p className="text-xs font-bold mt-1">{checkStep?.approvedBy || 'หัวหน้าแผนก'}</p>
                          <p className="text-[9px] mt-0.5">{checkStep?.status === 'approved' ? `✅ ${checkStep.approvedDate || ''}` : '⏳ รอเซ็น'}</p>
                        </div>
                      );
                    })()}
                    {/* Approve - HR/EEE */}
                    {(() => {
                      const approveStep = bookingWorkflowSteps.find(s => s.step === 2);
                      return (
                        <div className={`border-2 rounded-xl p-3 text-center ${approveStep?.status === 'approved' ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
                          <p className="text-[9px] font-bold text-slate-400 uppercase">Approve</p>
                          {approveStep?.approvedSign && <img src={approveStep.approvedSign} className="w-16 h-8 object-contain mx-auto mt-1" />}
                          <p className="text-xs font-bold mt-1">{approveStep?.approvedBy || 'ผจก./HR'}</p>
                          <p className="text-[9px] mt-0.5">{approveStep?.status === 'approved' ? `✅ ${approveStep.approvedDate || ''}` : approveStep ? '⏳ รอเซ็น' : '⬜ ยังไม่ถึง'}</p>
                        </div>
                      );
                    })()}
                  </div>
                  {/* รปภ. */}
                  {(() => {
                    const secStep = bookingWorkflowSteps.find(s => s.step === 3);
                    return (
                      <div className={`mt-2 border-2 rounded-xl p-3 text-center ${secStep?.status === 'approved' ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">รปภ. รับทราบ</p>
                        <p className="text-xs font-bold mt-1">{secStep?.approvedBy || 'เจ้าหน้าที่ รปภ.'}</p>
                        <p className="text-[9px] mt-0.5">{secStep?.status === 'approved' ? `✅ ${secStep.approvedDate || ''}` : secStep ? '⏳ รอรับทราบ' : '⬜ ยังไม่ถึง'}</p>
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div className="p-4 bg-slate-50 border-t space-y-2">
                <button onClick={() => setSelectedBooking(null)} className="w-full py-3 bg-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-300 transition">ปิด</button>
              </div>
            </div>
          </div>
        )}
      </div>}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-slate-200 p-6 md:p-10 rounded-2xl md:rounded-[3rem] space-y-4 animate-in slide-in-from-top-8 shadow-2xl font-sans text-left">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <InputField label="ชื่อแขกหลัก" value={formData.name} onChange={v => setFormData({...formData, name: v})} required />
            <InputField label="วันที่นัดพบ" type="date" value={formData.appointmentDate} onChange={v => setFormData({...formData, appointmentDate: v})} required />
            <InputField label="จำนวนคน" type="number" min="1" value={formData.count} onChange={v => {
               const count = parseInt(v) || 1;
               const newNames = [...formData.additionalNames];
               if (count > 1) { while (newNames.length < count - 1) newNames.push(''); while (newNames.length > count - 1) newNames.pop(); } else newNames.length = 0;
               setFormData({...formData, count, additionalNames: newNames});
            }} />
            {formData.additionalNames.map((name, idx) => (
              <InputField key={idx} label={`ชื่อผู้ติดตามคนที่ ${idx + 2}`} placeholder="ระบุชื่อจริง" value={name} onChange={v => {
                const newNames = [...formData.additionalNames]; newNames[idx] = v; setFormData({...formData, additionalNames: newNames});
              }} required />
            ))}
            <InputField label="ชื่อบริษัท / หน่วยงาน" value={formData.company} onChange={v => setFormData({...formData, company: v})} />
            <InputField label="Email ผู้นัดหมาย" type="email" placeholder="email@example.com" value={formData.visitorEmail || ''} onChange={v => setFormData({...formData, visitorEmail: v})} />
            <SelectField label="ยานพาหนะ" options={['รถยนต์', 'รถจักรยานยนต์', 'รถบรรทุก', 'ไม่มีรถ']} value={formData.vehicleType} onChange={v => setFormData({...formData, vehicleType: v})} />
            <InputField label="ทะเบียนรถ" placeholder="กข 1234" value={formData.licensePlate} onChange={v => setFormData({...formData, licensePlate: v})} />
            <InputField label="วัตถุประสงค์การเข้าพบ" value={formData.purpose} onChange={v => setFormData({...formData, purpose: v})} />
          </div>
          <div className="flex justify-end gap-3 mt-8">
             <button type="button" onClick={() => setShowForm(false)} className="px-6 py-4 text-slate-400 font-bold hover:text-slate-900 transition">ยกเลิก</button>
             <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-10 py-4 rounded-2xl font-black shadow-lg active:scale-95">ยืนยันนัดหมาย</button>
          </div>
        </form>
      )}

      {false && (
      <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm text-left font-sans">
        <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center cursor-pointer" onClick={() => setShowVisitorQueue(prev => !prev)}>
           <h3 className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-500 font-sans">Active Visitor Queue ({myAppointments.length})</h3>
           <span className={`text-slate-400 transition-transform ${showVisitorQueue ? 'rotate-180' : ''}`}>▼</span>
        </div>
        {showVisitorQueue && <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-sans">
            <thead>
              <tr className="text-slate-400 text-[10px] uppercase tracking-[0.2em] border-b border-slate-100">
                <th className="px-10 py-6 font-black">ข้อมูลผู้ติดต่อ</th>
                <th className="px-10 py-6 font-black text-center">รหัสอ้างอิง</th>
                <th className="px-10 py-6 font-black text-center">สถานะ</th>
                <th className="px-10 py-6 font-black text-right">ดำเนินการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 font-sans text-left">
              {myAppointments.map((appt) => (
                <tr key={appt.id} className="hover:bg-slate-50 group transition-colors font-sans">
                  <td className="px-10 py-6">
                    <p className="font-black text-slate-900 text-lg">{appt.name} {appt.count > 1 ? `(+${appt.count - 1})` : ''}</p>
                    <div className="flex items-center gap-4 mt-1 font-sans text-left">
                       <span className="text-[10px] text-slate-400 flex items-center gap-1.5 font-bold font-sans text-left"><Calendar size={12} /> {appt.appointmentDate}</span>
                       <span className="text-[10px] text-blue-600 flex items-center gap-1.5 font-bold font-sans text-left"><Building2 size={12} /> {appt.department}</span>
                    </div>
                  </td>
                  <td className="px-10 py-6 text-center font-sans text-center">
                    <span className="bg-slate-100 text-slate-600 font-mono font-black py-2 px-4 rounded-xl border border-slate-200 tracking-wider text-sm font-sans text-center">
                      {appt.refCode}
                    </span>
                  </td>
                  <td className="px-10 py-6 text-center font-sans text-center"><StatusBadge status={appt.status} /></td>
                  <td className="px-10 py-6 text-right font-sans text-right">
                    <div className="flex justify-end gap-3 font-sans">
                      <button
                        onClick={async () => {
                          try {
                            const q2 = query(
                              collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows'),
                              where('sourceForm', '==', 'VISITOR'),
                              where('requesterName', '==', appt.name)
                            );
                            const snap2 = await getDocs(q2);
                            if (snap2.empty) {
                              alert('ไม่พบข้อมูลเอกสารอนุมัติสำหรับนัดหมายนี้');
                              return;
                            }
                            const firstDoc = snap2.docs[0].data();
                            if (firstDoc.chainId) {
                              viewDocumentSignatures({ ...firstDoc, _docId: snap2.docs[0].id });
                            } else {
                              alert('ไม่พบ chainId สำหรับเอกสารนี้');
                            }
                          } catch (err) {
                            console.error('Error querying visitor workflow:', err);
                          }
                        }}
                        className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-200 hover:border-emerald-600 transition-all shadow-sm active:scale-90 font-sans"
                        title="ดูลายเซ็น"
                      >
                        <FileSearch size={18} />
                      </button>
                      {appt.status === STATUS.PENDING && (
                        <button onClick={() => setSelectedInvite(appt)} className="p-3 bg-white text-blue-600 rounded-2xl border border-slate-200 hover:border-blue-600 transition-all shadow-sm active:scale-90 font-sans">
                          <Share2 size={18} />
                        </button>
                      )}
                      {appt.status === STATUS.INSIDE && role === 'HOST' && (
                        <button onClick={() => {
                          setExitApprovalAppt(appt);
                          setExitSignDataUrl('');
                        }} className="bg-orange-50 text-orange-600 border border-orange-200 px-6 py-3 rounded-2xl text-xs font-black hover:bg-orange-600 hover:text-white transition shadow-sm active:scale-95 font-sans">อนุญาตให้ออก (เซ็น)</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
      </div>
      )}
      {selectedInvite && (
        <InviteModal selectedInvite={selectedInvite} onClose={() => setSelectedInvite(null)} />
      )}

      {/* Modal เซ็นอนุมัติให้ผู้มาติดต่อออก */}
      {exitApprovalAppt && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 border-b bg-orange-50">
              <h3 className="text-lg font-black text-orange-700">อนุมัติให้ผู้มาติดต่อออก</h3>
              <p className="text-sm text-orange-600 mt-1">{exitApprovalAppt.name || '-'} ({exitApprovalAppt.company || '-'})</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-4 bg-slate-50 rounded-xl text-sm space-y-1">
                <p><span className="font-bold">ชื่อ:</span> {exitApprovalAppt.name || '-'}</p>
                <p><span className="font-bold">บริษัท:</span> {exitApprovalAppt.company || '-'}</p>
                <p><span className="font-bold">แผนก:</span> {exitApprovalAppt.department}</p>
                <p><span className="font-bold">วัตถุประสงค์:</span> {exitApprovalAppt.purpose || '-'}</p>
              </div>
              {mySignature ? (
                <div className="border-2 border-emerald-200 rounded-xl p-3 bg-emerald-50 text-center">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-2">ลายเซ็นของคุณ</p>
                  <img src={mySignature} alt="signature" className="h-16 mx-auto object-contain" />
                  <p className="text-[10px] text-emerald-500 mt-1">{hostIdentity?.name || hostIdentity?.staffId}</p>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 font-bold text-center">
                  ⚠️ ยังไม่มีลายเซ็น — <button onClick={() => setShowSignSetup(true)} className="underline">ตั้งลายเซ็นก่อน</button>
                </div>
              )}
            </div>
            <div className="p-6 bg-slate-50 border-t flex gap-3">
              <button
                onClick={async () => {
                  if (!firebaseReady || !user) return;
                  try {
                    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'appointments', exitApprovalAppt.id);
                    await updateDoc(docRef, {
                      status: STATUS.APPROVED_OUT,
                      headApprovalSign: mySignature || `APPROVED:${hostIdentity?.staffId}`,
                      headApprovalBy: hostIdentity?.staffId || '-',
                      headApprovalAt: new Date().toISOString(),
                    });
                    setExitApprovalAppt(null);
                    setExitSignDataUrl('');
                  } catch (err) {
                    console.error('Exit approval error:', err);
                    alert('เกิดข้อผิดพลาด: ' + err.message);
                  }
                }}
                className="flex-1 bg-orange-600 text-white py-3 rounded-xl font-bold hover:bg-orange-700"
              >
                เซ็นอนุมัติให้ออก
              </button>
              <button onClick={() => { setExitApprovalAppt(null); setExitSignDataUrl(''); }} className="flex-1 bg-white border border-slate-200 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-100">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}

      {/* Email QR Invite Modal */}
      {inviteEmailData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in font-sans">
          <div className="bg-white rounded-2xl md:rounded-[3rem] max-w-sm md:max-w-md w-full shadow-2xl p-6 md:p-8 mx-4">
            <h3 className="text-xl font-black text-center mb-2">ส่งลิงก์ให้ผู้มาติดต่อ</h3>
            <p className="text-xs text-slate-400 text-center mb-6">คัดลอก QR แล้ววางใน Outlook</p>

            <div className="bg-slate-50 rounded-2xl p-4 mb-4 text-center">
              <QRCodeSVG id="invite-qr-email" value={inviteEmailData.guestLink} size={200} level="M" includeMargin />
              <p className="text-[10px] text-slate-400 mt-2">สแกนเพื่อลงทะเบียน</p>
            </div>

            <div className="bg-blue-50 rounded-xl p-3 mb-4 text-xs space-y-1">
              <p><span className="font-bold">ผู้มา:</span> {inviteEmailData.name}</p>
              <p><span className="font-bold">วันที่:</span> {inviteEmailData.date}</p>
              <p><span className="font-bold">พบ:</span> {inviteEmailData.staffId} ({inviteEmailData.department})</p>
              <p><span className="font-bold">รหัส:</span> {inviteEmailData.refCode}</p>
            </div>

            <div className="space-y-3">
              <button
                onClick={async () => {
                  try {
                    const svg = document.getElementById('invite-qr-email');
                    const canvas = document.createElement('canvas');
                    canvas.width = 250; canvas.height = 250;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(0, 0, 250, 250);
                    const img = new Image();
                    const svgData = new XMLSerializer().serializeToString(svg);
                    img.onload = async () => {
                      ctx.drawImage(img, 25, 25, 200, 200);
                      canvas.toBlob(async (blob) => {
                        try {
                          await navigator.clipboard.write([
                            new ClipboardItem({ 'image/png': blob })
                          ]);
                          alert('คัดลอก QR Code แล้ว! กด Ctrl+V ใน Outlook เพื่อวาง');
                          const d = inviteEmailData;
                          const subject = encodeURIComponent(`[SOC] นัดหมายเข้าพบ ${d.date} - รหัส ${d.refCode}`);
                          const body = encodeURIComponent(
                            `สวัสดีครับ คุณ${d.name}\n\nคุณมีนัดหมายเข้าพบที่ TBKK\nวันที่: ${d.date}\nพบ: ${d.staffId} (${d.department})\n\n[วาง QR Code ที่คัดลอกไว้ตรงนี้ - กด Ctrl+V]\n\nหรือกดลิงก์ลงทะเบียน:\n${d.guestLink}\n\n--\nSOC Systems`
                          );
                          window.open(`mailto:${d.email}?subject=${subject}&body=${body}`, '_self');
                        } catch { alert('คัดลอกไม่สำเร็จ ลองใช้ลิงก์แทน'); }
                      }, 'image/png');
                    };
                    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
                  } catch { alert('เกิดข้อผิดพลาด'); }
                }}
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-sm hover:bg-blue-700 active:scale-95 transition"
              >
                📋 คัดลอก QR + เปิด Outlook
              </button>

              <button
                onClick={() => {
                  const d = inviteEmailData;
                  const subject = encodeURIComponent(`[SOC] นัดหมายเข้าพบ ${d.date} - รหัส ${d.refCode}`);
                  const body = encodeURIComponent(
                    `สวัสดีครับ คุณ${d.name}\n\nคุณมีนัดหมายเข้าพบที่ TBKK\nวันที่: ${d.date}\nพบ: ${d.staffId} (${d.department})\n\nกดลิงก์เพื่อลงทะเบียน:\n${d.guestLink}\n\nรหัสอ้างอิง: ${d.refCode}\n\n--\nSOC Systems`
                  );
                  window.open(`mailto:${d.email}?subject=${subject}&body=${body}`, '_self');
                }}
                className="w-full bg-slate-100 text-slate-700 py-4 rounded-2xl font-bold text-sm hover:bg-slate-200 active:scale-95 transition"
              >
                📧 ส่งลิงก์อย่างเดียว (ไม่มี QR)
              </button>

              <button onClick={() => setInviteEmailData(null)} className="w-full py-3 text-slate-400 text-xs font-bold hover:text-slate-900 transition">
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Signature Setup Modal */}
      {showSignSetup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 font-sans">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 border-b bg-slate-50">
              <h3 className="text-lg font-black text-slate-800">ลายเซ็นสำเร็จรูปของคุณ</h3>
              <p className="text-xs text-slate-400 mt-1">วาดลายเซ็นครั้งเดียว — ระบบจะใช้ทุกครั้งที่อนุมัติ</p>
            </div>
            <div className="p-6 space-y-4">
              <canvas
                ref={signSetupCanvasRef}
                width={400} height={140}
                className="border-2 border-slate-300 rounded-2xl w-full h-[140px] cursor-crosshair bg-white"
                style={{ touchAction: 'none' }}
                onMouseDown={(e) => { signSetupDrawingRef.current = true; const r = e.currentTarget.getBoundingClientRect(); const ctx = e.currentTarget.getContext('2d'); ctx.beginPath(); ctx.moveTo(e.clientX-r.left, e.clientY-r.top); }}
                onMouseMove={(e) => { if (!signSetupDrawingRef.current) return; const r = e.currentTarget.getBoundingClientRect(); const ctx = e.currentTarget.getContext('2d'); ctx.strokeStyle='#1e293b'; ctx.lineWidth=2.5; ctx.lineCap='round'; ctx.lineTo(e.clientX-r.left, e.clientY-r.top); ctx.stroke(); }}
                onMouseUp={() => { signSetupDrawingRef.current = false; setSignSetupDataUrl(signSetupCanvasRef.current?.toDataURL() || ''); }}
                onMouseLeave={() => { signSetupDrawingRef.current = false; if (signSetupCanvasRef.current) setSignSetupDataUrl(signSetupCanvasRef.current.toDataURL()); }}
                onTouchStart={(e) => { signSetupDrawingRef.current = true; const r = e.currentTarget.getBoundingClientRect(); const t = e.touches[0]; const ctx = e.currentTarget.getContext('2d'); ctx.beginPath(); ctx.moveTo(t.clientX-r.left, t.clientY-r.top); }}
                onTouchMove={(e) => { e.preventDefault(); if (!signSetupDrawingRef.current) return; const r = e.currentTarget.getBoundingClientRect(); const t = e.touches[0]; const ctx = e.currentTarget.getContext('2d'); ctx.strokeStyle='#1e293b'; ctx.lineWidth=2.5; ctx.lineCap='round'; ctx.lineTo(t.clientX-r.left, t.clientY-r.top); ctx.stroke(); }}
                onTouchEnd={() => { signSetupDrawingRef.current = false; setSignSetupDataUrl(signSetupCanvasRef.current?.toDataURL() || ''); }}
              />
              <button onClick={() => { const c = signSetupCanvasRef.current; if (c) c.getContext('2d').clearRect(0,0,c.width,c.height); setSignSetupDataUrl(''); }} className="text-xs text-slate-400 hover:text-red-500">ล้างและวาดใหม่</button>
            </div>
            <div className="p-6 border-t bg-slate-50 flex gap-3">
              <button
                onClick={async () => {
                  if (!signSetupDataUrl || !firebaseReady || !db) return;
                  try {
                    const { updateDoc, doc: fsDoc } = await import('firebase/firestore');
                    await updateDoc(fsDoc(db, 'artifacts', appId, 'public', 'data', 'users', hostIdentity.staffId), { signatureDataUrl: signSetupDataUrl });
                    setMySignature(signSetupDataUrl);
                    setShowSignSetup(false);
                  } catch (err) { alert('บันทึกไม่สำเร็จ: ' + err.message); }
                }}
                disabled={!signSetupDataUrl}
                className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-40"
              >บันทึกลายเซ็น</button>
              <button onClick={() => setShowSignSetup(false)} className="flex-1 bg-white border border-slate-200 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-50">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}

      {/* Invite QR Modal */}
      {/* My Employee QR Modal */}
      {showMyQR && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-6 z-[100] animate-in fade-in font-sans" onClick={() => setShowMyQR(false)}>
          <div className="bg-white rounded-[3rem] max-w-sm w-full overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-8 text-center">
              <button onClick={() => setShowMyQR(false)} className="absolute top-6 right-6 text-slate-300 hover:text-slate-900 transition"><X size={24} /></button>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">QR Code พนักงาน</p>
              <h3 className="text-xl font-black text-slate-900 mb-1">{hostIdentity.name || hostIdentity.staffId}</h3>
              <p className="text-xs text-slate-400 mb-6">{hostIdentity.staffId} · {hostIdentity.department}</p>
              <div className="flex justify-center mb-6">
                <div className="p-4 bg-white border-2 border-slate-200 rounded-2xl inline-block">
                  <QRCodeSVG
                    value={`${(import.meta.env.VITE_PUBLIC_URL || window.location.origin).replace(/\/$/, '')}/employee.html?id=${hostIdentity.staffId}`}
                    size={200}
                    level="M"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500 font-semibold mb-1">รปภ. สแกน QR → เปิดหน้าบันทึกอัตโนมัติ</p>
              <p className="text-[10px] text-slate-400">หรือแสดงให้ รปภ. สแกนด้วยปุ่ม 📷 ในหน้าพนักงานเข้า-ออก</p>
            </div>
          </div>
        </div>
      )}

      {showInviteQR && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 z-[100] animate-in fade-in font-sans">
          <div className="bg-white border border-slate-200 rounded-[3rem] max-w-md w-full overflow-hidden shadow-2xl">
            <div className="p-8 border-b border-slate-100 relative">
              <button onClick={() => setShowInviteQR(false)} className="absolute top-6 right-6 text-slate-300 hover:text-slate-900 transition">
                <X size={28} />
              </button>
              <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <Share2 size={22} className="text-emerald-500" /> ส่งลิงก์ให้ผู้มาติดต่อ
              </h3>
              <p className="text-slate-400 text-xs mt-1">ให้ผู้มาติดต่อสแกน QR หรือเปิดลิงก์เพื่อลงทะเบียน</p>
            </div>
            <div className="p-8 flex flex-col items-center space-y-6">
              {(() => {
                const publicUrl = import.meta.env.VITE_PUBLIC_URL || window.location.origin;
                const isLocal = !import.meta.env.VITE_PUBLIC_URL && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
                const guestUrl = `${publicUrl}/index.html?mode=guest`;
                return (
                  <>
                    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-inner">
                      <QRCodeSVG value={guestUrl} size={200} level="M" includeMargin />
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 w-full">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">URL สำหรับผู้มาติดต่อ</p>
                      <p className="text-xs text-blue-600 font-mono break-all">{guestUrl}</p>
                    </div>
                    {isLocal && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 w-full">
                        <p className="text-[10px] text-amber-700 font-bold">มือถือไม่สามารถเข้า localhost ได้ กรุณาเปิดเว็บด้วย IP ของเครื่อง เช่น http://172.21.66.75:5173 แล้วสร้าง QR ใหม่</p>
                      </div>
                    )}
                    <p className="text-xs text-slate-400 text-center">ผู้มาติดต่อสแกน QR นี้เพื่อกรอกข้อมูลลงทะเบียน</p>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(guestUrl).then(() => {
                          alert('คัดลอกลิงก์สำเร็จ! ส่งให้ผู้มาติดต่อผ่าน LINE/Email ได้เลย');
                        }).catch(() => {
                          window.prompt('คัดลอกลิงก์นี้ส่งให้ผู้มาติดต่อ:', guestUrl);
                        });
                      }}
                      className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-black text-sm hover:bg-emerald-600 transition active:scale-95 flex items-center justify-center gap-2"
                    >
                      <Copy size={18} /> คัดลอกลิงก์
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- ปุ่มบริการสำหรับหัวหน้า ---
function ServiceButton({ icon, label, onClick }) {
  return (
    <button onClick={onClick} className="flex items-center gap-4 bg-white border border-slate-200 p-6 rounded-[1.8rem] hover:border-blue-600 hover:shadow-lg transition-all active:scale-95 text-left font-sans group font-sans">
      <div className="p-4 bg-slate-50 rounded-2xl group-hover:scale-110 transition-transform font-sans">
        {icon}
      </div>
      <p className="font-black text-slate-700 uppercase tracking-widest text-[10px] font-sans">{label}</p>
    </button>
  );
}

// --- Invite Modal ---
function InviteModal({ selectedInvite, onClose }) {
   return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 z-[100] animate-in fade-in font-sans text-left">
      <div className="bg-white border border-slate-200 rounded-2xl md:rounded-[3rem] max-w-lg w-full overflow-hidden shadow-2xl text-left mx-4 md:mx-0">
        <div className="p-6 md:p-10 border-b border-slate-100 relative text-left">
           <button onClick={onClose} className="absolute top-8 right-8 text-slate-300 hover:text-slate-900 transition font-sans">
              <X size={28} />
           </button>
           <h3 className="text-3xl font-black text-slate-900 tracking-widest uppercase text-left font-sans">รหัสผ่านประตู</h3>
           <p className="text-slate-400 text-sm mt-1 font-medium italic text-left font-sans">กรุณาบันทึกข้อมูลเพื่อใช้สแกนเข้าพื้นที่</p>
        </div>
        <div className="p-6 md:p-10 space-y-6 md:space-y-8 font-sans text-left">
           <div className="bg-slate-50 p-4 md:p-8 rounded-2xl md:rounded-[2.5rem] border border-slate-100 flex flex-col items-center justify-center relative">
              <div className="mb-4 text-center font-sans">
                 <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.4em] mb-1 font-sans">Gate Pass Authorization</p>
                 <p className="text-3xl font-black text-slate-900 uppercase tracking-tighter text-center font-sans">SOC SYSTEM</p>
              </div>
              <div className="bg-white p-6 rounded-[2rem] shadow-md mb-6 text-black border border-slate-100 text-center font-sans">
                 <QrCode size={140} />
              </div>
              <div className="text-center space-y-1 font-sans text-center">
                 <p className="text-xs text-slate-400 font-bold uppercase tracking-widest font-sans">ผู้ติดต่อ: <span className="text-slate-900 font-sans">{selectedInvite.name}</span></p>
                 <p className="text-3xl md:text-5xl font-mono font-black text-blue-600 mt-4 tracking-[0.1em] md:tracking-[0.15em] font-sans break-all">{selectedInvite.refCode}</p>
              </div>
              <div className="mt-8 p-5 bg-blue-600 rounded-[1.8rem] flex items-start gap-4 w-full text-left text-white shadow-xl shadow-blue-100 font-sans text-left">
                 <Smartphone className="w-7 h-7 shrink-0 font-sans" />
                 <p className="text-[12px] font-bold leading-relaxed text-left font-sans">กรุณาบันทึกรหัส <span className="underline decoration-2 underline-offset-4 font-black font-sans">{selectedInvite.refCode}</span> เพื่อแสดงต่อ รปภ. เมื่อมาถึงจุดตรวจครับ</p>
              </div>
           </div>
           <button onClick={() => {
                const msg = `สวัสดีครับ คุณ ${selectedInvite.name}\n\nรหัสผ่าน SOC ของคุณคือ: ${selectedInvite.refCode}\nเข้าพบวันที่: ${selectedInvite.appointmentDate}`;
                navigator.clipboard.writeText(msg);
                alert("คัดลอกข้อความสำเร็จ!");
           }} className="w-full bg-slate-900 text-white py-5 rounded-3xl font-black uppercase tracking-widest text-xs active:scale-95 transition-all font-sans">คัดลอกข้อความส่ง LINE</button>
        </div>
      </div>
    </div>
   );
}

// --- Security View (หน้าจอ รปภ.) ---
function SecurityView({ appointments, user }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [detailType, setDetailType] = useState(null); // 'visitor' | 'material' | 'employee'

  const [materials] = useState([
    { id: 1, item: 'โน้ตบุ๊ก Dell Latitude', type: 'OUT', person: 'พรชัย ใจดี', department: 'IT', time: '20/05/2024, 10:00:00', note: 'นำไปซ่อมที่ศูนย์บริการพระราม 9', refNo: 'MAT-2024001' },
    { id: 2, item: 'สายไฟ 5 ม้วน (500 เมตร)', type: 'IN', person: 'Global Supply Co.', department: 'Store', time: '20/05/2024, 10:30:25', note: 'รับเข้าสต็อกโครงการ A', refNo: 'PO-99812' },
  ]);
  const [employees] = useState([
    { id: 1, name: 'มานะ ขยันกิจ', empId: 'EMP001', reason: 'พบลูกค้าหน้างาน', timeOut: '12:00:00', timeIn: null, status: 'OUT', destination: 'นิคมอุตสาหกรรมอมตะ' },
  ]);
  const [newVisitor, setNewVisitor] = useState({ name: '', company: '', plate: '', purpose: '', note: '', contactPhone: '' });

  const visitors = useMemo(() => {
    return (appointments || []).map((a) => ({
      id: a.id,
      name: a.name || '-',
      company: a.company || 'บุคคลทั่วไป',
      plate: a.licensePlate || '',
      purpose: a.purpose || '-',
      entryTime: a.checkInTime ? new Date(a.checkInTime).toLocaleString('th-TH') : '-',
      exitTime: a.checkOutTime ? new Date(a.checkOutTime).toLocaleString('th-TH') : null,
      status: a.status === STATUS.COMPLETED ? 'OUT' : 'IN',
      note: '',
      contactPhone: '',
      _raw: a,
    }));
  }, [appointments]);

  const getCurrentTime = () => new Date().toLocaleString('th-TH');
  const handleVisitorEntry = (e) => {
    e.preventDefault();
    alert('ระบบตัวอย่างนี้ใช้สำหรับหน้า รปภ. เท่านั้น (ข้อมูลจริงให้เพิ่มจากหน้าหัวหน้า)');
    setShowEntryForm(false);
    setNewVisitor({ name: '', company: '', plate: '', purpose: '', note: '', contactPhone: '' });
  };

  const handleVisitorExit = async (id) => {
    const target = visitors.find((v) => v.id === id)?._raw;
    if (!target || !firebaseReady) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'appointments', target.id);
      await updateDoc(docRef, { status: STATUS.COMPLETED, checkOutTime: new Date().toISOString() });
      if (selectedItem?.id === id) setSelectedItem(null);
    } catch (err) {
      alert('บันทึกออกไม่สำเร็จ: ' + (err.message || err));
    }
  };

  const stats = useMemo(() => ({
    inside: visitors.filter((v) => v.status === 'IN').length,
    empOut: employees.filter((e) => e.status === 'OUT').length,
    materialToday: materials.length,
  }), [visitors, employees, materials]);

  const Badge = ({ status }) => {
    const colors = status === 'IN' || status === 'OUT_PENDING'
      ? 'bg-green-100 text-green-800 border-green-200'
      : 'bg-slate-100 text-slate-600 border-slate-200';
    let label = status === 'IN' ? 'อยู่ข้างใน' : 'ออกแล้ว';
    if (detailType === 'employee') label = status === 'OUT' ? 'อยู่นอกพื้นที่' : 'กลับมาแล้ว';
    return <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colors}`}>{label}</span>;
  };

  const navItems = [
    { id: 'dashboard', label: 'แดชบอร์ด', icon: LayoutDashboard },
    { id: 'visitors', label: 'ผู้มาติดต่อ', icon: UserPlus },
    { id: 'materials', label: 'ของเข้า-ออก', icon: Package },
    { id: 'employees', label: 'พนักงานออกนอก', icon: Users },
  ];

  const filteredVisitors = visitors.filter((v) =>
    (v.name || '').includes(searchTerm) || (v.company || '').includes(searchTerm) || ((v.plate || '').includes(searchTerm))
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-slate-200 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-lg shadow-lg shadow-blue-200">
              <ShieldCheck className="text-white w-6 h-6" />
            </div>
            <h1 className="font-bold text-xl tracking-tight hidden sm:block">SecurityGate</h1>
          </div>
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === item.id ? 'bg-blue-600 text-white shadow-md shadow-blue-100' : 'text-slate-600 hover:bg-slate-100 hover:text-blue-600'}`}
              >
                <item.icon size={18} />
                {item.label}
              </button>
            ))}
          </div>
          <button className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </nav>
      <main className="pt-24 pb-12 px-4 md:px-8 max-w-7xl mx-auto w-full">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">{navItems.find((n) => n.id === activeTab)?.label}</h2>
            <p className="text-slate-500 text-sm mt-0.5">ยินดีต้อนรับ, กำลังตรวจสอบพื้นที่ • {getCurrentTime()}</p>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type="text" placeholder="ค้นหาข้อมูล..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-all" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </div>

        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm"><h3 className="text-slate-500 text-xs font-bold uppercase tracking-widest">ผู้มาติดต่ออยู่ข้างใน</h3><p className="text-4xl font-black mt-2 text-slate-800">{stats.inside} <span className="text-sm font-normal text-slate-400">ราย</span></p></div>
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm"><h3 className="text-slate-500 text-xs font-bold uppercase tracking-widest">พนักงานออกไปข้างนอก</h3><p className="text-4xl font-black mt-2 text-slate-800">{stats.empOut} <span className="text-sm font-normal text-slate-400">คน</span></p></div>
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm"><h3 className="text-slate-500 text-xs font-bold uppercase tracking-widest">พัสดุ เข้า-ออกวันนี้</h3><p className="text-4xl font-black mt-2 text-slate-800">{stats.materialToday} <span className="text-sm font-normal text-slate-400">รายการ</span></p></div>
          </div>
        )}

        {activeTab === 'visitors' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
              <h3 className="font-bold text-slate-800 text-lg">รายชื่อผู้มาติดต่อทั้งหมด</h3>
              <button onClick={() => setShowEntryForm(!showEntryForm)} className="bg-blue-600 text-white px-6 py-2.5 rounded-2xl text-sm font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all flex items-center gap-2"><Plus size={18} /> ลงทะเบียนใหม่</button>
            </div>
            {showEntryForm && (
              <form onSubmit={handleVisitorEntry} className="p-6 border-b border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                <input required type="text" className="w-full p-3 border border-slate-200 rounded-2xl" placeholder="ชื่อ-นามสกุล" value={newVisitor.name} onChange={(e) => setNewVisitor({ ...newVisitor, name: e.target.value })} />
                <input required type="text" className="w-full p-3 border border-slate-200 rounded-2xl" placeholder="บริษัท/สังกัด" value={newVisitor.company} onChange={(e) => setNewVisitor({ ...newVisitor, company: e.target.value })} />
                <input type="text" className="w-full p-3 border border-slate-200 rounded-2xl" placeholder="เบอร์โทรศัพท์" value={newVisitor.contactPhone} onChange={(e) => setNewVisitor({ ...newVisitor, contactPhone: e.target.value })} />
                <input type="text" className="w-full p-3 border border-slate-200 rounded-2xl" placeholder="ทะเบียนรถ" value={newVisitor.plate} onChange={(e) => setNewVisitor({ ...newVisitor, plate: e.target.value })} />
                <button type="submit" className="md:col-span-2 bg-slate-900 text-white py-3 rounded-2xl font-bold"><LogIn size={18} className="inline mr-2" />บันทึกเข้าพื้นที่</button>
              </form>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead><tr className="bg-slate-50/50 text-slate-500 text-xs uppercase tracking-widest border-b border-slate-100"><th className="p-5 font-bold">ผู้มาติดต่อ</th><th className="p-5 font-bold">บริษัท/ทะเบียน</th><th className="p-5 font-bold">บันทึกเวลา</th><th className="p-5 font-bold">สถานะ</th><th className="p-5 font-bold text-center">จัดการ</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredVisitors.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50 transition-colors group cursor-pointer">
                      <td className="p-5"><div className="font-bold text-slate-800">{v.name}</div><div className="text-[10px] font-bold text-slate-400 uppercase">{v.purpose}</div></td>
                      <td className="p-5"><div className="text-sm font-semibold text-slate-700">{v.company}</div><div className="text-xs text-slate-400">{v.plate || '-'}</div></td>
                      <td className="p-5"><div className="text-[11px] text-green-600 font-bold mb-1">{v.entryTime}</div>{v.exitTime && <div className="text-[11px] text-slate-400">{v.exitTime}</div>}</td>
                      <td className="p-5"><Badge status={v.status} /></td>
                      <td className="p-5 text-center"><div className="flex items-center justify-center gap-2"><button onClick={() => { setSelectedItem(v); setDetailType('visitor'); }} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all" title="ดูข้อมูล"><Eye size={20} /></button>{v.status === 'IN' && <button onClick={() => handleVisitorExit(v.id)} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-600 transition-all shadow-sm">ออก</button>}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'materials' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100"><h3 className="font-bold text-slate-800 text-lg">ประวัติสิ่งของเข้า-ออก</h3></div>
            <div className="p-6 space-y-2">{materials.map((m) => <div key={m.id} className="border rounded-xl p-3"><p className="font-bold">{m.item}</p><p className="text-xs text-slate-500">{m.person} • {m.department} • {m.time}</p></div>)}</div>
          </div>
        )}

        {activeTab === 'employees' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100"><h3 className="font-bold text-slate-800 text-lg">บันทึกพนักงานออกพื้นที่</h3></div>
            <div className="p-6 space-y-2">{employees.map((e) => <div key={e.id} className="border rounded-xl p-3"><p className="font-bold">{e.name} ({e.empId})</p><p className="text-xs text-slate-500"><MapPin size={12} className="inline mr-1" />{e.destination || '-'} • ออก {e.timeOut} • เข้า {e.timeIn || '-'}</p></div>)}</div>
          </div>
        )}
      </main>

      {selectedItem && detailType === 'visitor' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-6 border-b flex justify-between items-center bg-slate-50">
              <h3 className="text-xl font-bold flex items-center gap-2 text-slate-800"><FileText className="text-blue-600" size={24} /> รายละเอียดข้อมูล</h3>
              <button onClick={() => { setSelectedItem(null); setDetailType(null); }} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400 hover:text-slate-600 border border-transparent hover:border-slate-200"><X size={20} /></button>
            </div>
            <div className="p-8 space-y-3">
              <p className="text-2xl font-black text-slate-900">{selectedItem.name}</p>
              <p className="text-sm text-slate-600">บริษัท: {selectedItem.company}</p>
              <p className="text-sm text-slate-600">ทะเบียนรถ: {selectedItem.plate || '-'}</p>
              <p className="text-sm text-slate-600">วัตถุประสงค์: {selectedItem.purpose || '-'}</p>
              <p className="text-sm text-slate-600">เวลาเข้า: {selectedItem.entryTime || '-'}</p>
              <p className="text-sm text-slate-600">เวลาออก: {selectedItem.exitTime || 'ยังไม่ออกจากพื้นที่'}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
if (false) {
  const [activeTab, setActiveTab] = useState('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [checkInTarget, setCheckInTarget] = useState(null);
  const [cardNo, setCardNo] = useState('');
  const [detailModal, setDetailModal] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [scannedResult, setScannedResult] = useState(null);
  const [approvedDocs, setApprovedDocs] = useState([]);
  const scannerRef = useRef(null);
  const scannerInstanceRef = useRef(null);

  // โหลดเอกสารที่ส่งมาถึง รปภ. (ขั้นตอนสุดท้าย)
  useEffect(() => {
    if (!firebaseReady || !db) return;
    const collRef = collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows');
    const q = query(collRef, where('department', '==', 'SECURITY'));
    const unsub = onSnapshot(q, (snap) => {
      setApprovedDocs(snap.docs.map(d => ({ _docId: d.id, ...d.data() })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))));
    }, (err) => {
      console.warn('SecurityView onSnapshot error:', err);
      setApprovedDocs([]);
    });
    return () => unsub();
  }, []);

  const startScanner = async () => {
    setShowScanner(true);
    setScannedResult(null);
    // Wait for DOM to render the scanner container
    setTimeout(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        const scanner = new Html5Qrcode('qr-reader');
        scannerInstanceRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            // QR scanned successfully
            try {
              const data = JSON.parse(decodedText);
              const found = (appointments || []).find(
                (a) => a.refCode === data.ref && a.status === STATUS.PENDING
              );
              setScannedResult({
                qrData: data,
                appointment: found || null,
              });
            } catch {
              // Try as plain refCode
              const found = (appointments || []).find(
                (a) => a.refCode === decodedText.trim().toUpperCase() && a.status === STATUS.PENDING
              );
              setScannedResult({
                qrData: { ref: decodedText },
                appointment: found || null,
              });
            }
            scanner.stop().catch(() => {});
            scannerInstanceRef.current = null;
          },
          () => {} // ignore scan errors
        );
      } catch (err) {
        console.error('Scanner error:', err);
        alert('ไม่สามารถเปิดกล้องได้: ' + (err.message || err));
        setShowScanner(false);
      }
    }, 300);
  };

  const stopScanner = () => {
    if (scannerInstanceRef.current) {
      scannerInstanceRef.current.stop().catch(() => {});
      scannerInstanceRef.current = null;
    }
    setShowScanner(false);
    setScannedResult(null);
  };

  const pendingDocsCount = approvedDocs.filter(d => d.status === 'pending').length;

  const tabs = [
    { id: 'today', label: 'นัดหมายวันนี้', icon: <BellRing size={18} /> },
    { id: 'future', label: 'นัดหมายล่วงหน้า', icon: <CalendarDays size={18} /> },
    { id: 'onsite', label: 'เข้าโรงงานแล้ว', icon: <Users size={18} /> },
    { id: 'docs', label: `เอกสารอนุมัติ${pendingDocsCount > 0 ? ` (${pendingDocsCount})` : ''}`, icon: <FileText size={18} /> },
  ];

  const q = searchQuery.trim().toUpperCase();
  const filtered = (appointments || []).filter((a) => {
    if (!q) return true;
    return (
      (a.refCode || '').toString().toUpperCase().includes(q) ||
      (a.name || '').toString().toUpperCase().includes(q) ||
      (a.hostStaffId || '').toString().toUpperCase().includes(q)
    );
  });

  const today = getTodayStr();

  // Tab 1: นัดหมายวันนี้ (PENDING) — รวมคนเดียวกันเป็น 1 แถว
  const todayPendingRaw = filtered.filter(
    (a) => a.appointmentDate === today && a.status === STATUS.PENDING
  );
  const todayPendingGrouped = (() => {
    const groups = new Map();
    for (const a of todayPendingRaw) {
      const key = (a.name || '').trim().toLowerCase();
      if (!groups.has(key)) {
        groups.set(key, { ...a, _appointments: [a] });
      } else {
        groups.get(key)._appointments.push(a);
      }
    }
    return Array.from(groups.values());
  })();
  const todayPendingList = todayPendingGrouped;

  // Tab 2: นัดหมายล่วงหน้า (วันที่ > วันนี้, ยังไม่เสร็จ)
  const futureList = filtered.filter(
    (a) => a.appointmentDate > today && a.status !== STATUS.COMPLETED
  );

  // Tab 3: เข้าโรงงานแล้ว - รอหัวหน้าอนุมัติ
  const onsiteWaitingList = filtered.filter((a) => a.status === STATUS.INSIDE);

  // Tab 3: หัวหน้าอนุมัติแล้ว - พร้อมออก
  const onsiteApprovedList = filtered.filter((a) => a.status === STATUS.APPROVED_OUT);

  const todayPendingCount = todayPendingList.length;
  const futureCount = futureList.length;
  const onsiteCount = onsiteWaitingList.length + onsiteApprovedList.length;

  const handleCheckIn = async () => {
    if (!checkInTarget || !cardNo.trim()) {
      alert('กรุณาระบุหมายเลขบัตร');
      return;
    }
    if (!firebaseReady) { alert('Firebase ไม่พร้อมใช้งาน'); return; }
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'appointments', checkInTarget.id);
      await updateDoc(docRef, {
        status: STATUS.INSIDE,
        cardNo: cardNo.trim(),
        checkInTime: new Date().toISOString(),
      });
      setCheckInTarget(null);
      setCardNo('');
    } catch (error) {
      console.error('Check-in error:', error);
      alert('เกิดข้อผิดพลาด: ' + error.message);
    }
  };

  const handleCheckOut = async (appt) => {
    if (!confirm(`ยืนยันส่ง "${appt.name}" ออกจากพื้นที่?`)) return;
    if (!firebaseReady) { alert('Firebase ไม่พร้อมใช้งาน'); return; }
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'appointments', appt.id);
      await updateDoc(docRef, {
        status: STATUS.COMPLETED,
        checkOutTime: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Check-out error:', error);
      alert('เกิดข้อผิดพลาด: ' + error.message);
    }
  };

  const handleApproveLeave = async (appt) => {
    if (!confirm(`อนุญาตให้ "${appt.name}" ออกนอกบริษัท?`)) return;
    if (!firebaseReady) { alert('Firebase ไม่พร้อมใช้งาน'); return; }
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'appointments', appt.id);
      await updateDoc(docRef, {
        status: STATUS.COMPLETED,
        approvedOutTime: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Approve leave error:', error);
      alert('เกิดข้อผิดพลาด: ' + error.message);
    }
  };

  const openAppointmentDetail = (appt) => setDetailModal({ type: 'appointment', item: appt });
  const openDocDetail = (docItem) => setDetailModal({ type: 'doc', item: docItem });

  const VisitorCard = ({ appt, type }) => {
    const bgColor = { pending: 'bg-slate-50', onsite: 'bg-blue-50', approved_out: 'bg-green-50', future: 'bg-slate-50' }[type] || 'bg-slate-50';
    const avatarColor = { pending: 'bg-emerald-500', onsite: 'bg-blue-500', approved_out: 'bg-green-500', future: 'bg-indigo-400' }[type] || 'bg-slate-400';

    return (
      <div className={`flex items-center justify-between p-4 ${bgColor} rounded-2xl border border-slate-100 hover:shadow-md transition-all`}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm ${avatarColor}`}>
            {(appt.name || '?')[0]}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-slate-800 text-sm truncate">
              {appt.name || 'ไม่ระบุชื่อ'}
              {appt._appointments?.length > 1 && <span className="ml-2 text-xs font-normal text-blue-500">({appt._appointments.length} นัดหมาย)</span>}
            </p>
            <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
              {appt.company && <span>{appt.company}</span>}
              {appt._appointments?.length > 1
                ? appt._appointments.map((a, i) => <span key={i} className="bg-slate-200 px-1.5 py-0.5 rounded font-mono text-[10px]">{a.refCode}</span>)
                : appt.refCode && <span className="bg-slate-200 px-1.5 py-0.5 rounded font-mono text-[10px]">{appt.refCode}</span>
              }
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              พบ: {appt.hostStaffId || '-'} {appt.count > 1 && `(${appt.count} คน)`}
              {(type === 'onsite' || type === 'approved_out') && appt.cardNo && <span className="ml-2 text-blue-500 font-bold">บัตร #{appt.cardNo}</span>}
            </p>
            {/* เวลาเข้า สำหรับ onsite/approved_out */}
            {(type === 'onsite' || type === 'approved_out') && appt.checkInTime && (
              <p className="text-xs text-slate-400">เข้า: {new Date(appt.checkInTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</p>
            )}
            {/* วันที่นัดหมาย สำหรับ future */}
            {type === 'future' && (
              <p className="text-xs text-indigo-500 font-medium mt-0.5">วันที่: {appt.appointmentDate}</p>
            )}
            {/* สถานะรอหัวหน้า สำหรับ onsite */}
            {type === 'onsite' && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-bold mt-1">
                <Clock size={12} /> รอหัวหน้าอนุมัติ
              </span>
            )}
            {/* หัวหน้าอนุมัติแล้ว สำหรับ approved_out */}
            {type === 'approved_out' && (
              <span className="inline-flex items-center gap-1 text-xs text-green-600 font-bold mt-1">
                <CheckCircle2 size={12} /> หัวหน้าอนุมัติแล้ว
                {appt.approvedOutTime && (
                  <span className="text-slate-400 font-normal ml-1">
                    ({new Date(appt.approvedOutTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })})
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
        <div className="ml-2 shrink-0">
          <button
            onClick={() => openAppointmentDetail(appt)}
            className="mr-2 bg-white text-slate-600 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold hover:bg-slate-100 transition active:scale-95 shadow-sm"
          >
            ดูข้อมูล
          </button>
          {type === 'pending' && (
            <button
              onClick={() => { setCheckInTarget(appt); setCardNo(''); }}
              className="bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-600 transition active:scale-95 shadow-sm"
            >
              รับเข้า
            </button>
          )}
          {type === 'approved_out' && (
            <button
              onClick={() => handleApproveLeave(appt)}
              className="bg-orange-500 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-orange-600 transition active:scale-95 shadow-sm"
            >
              อนุญาตออก
            </button>
          )}
        </div>
      </div>
    );
  };

  const StatusCard = ({ title, icon, color, count, children, footerTitle, footerContent }) => (
    <section className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden flex flex-col h-[520px]">
      <div className="p-6 border-b border-slate-50 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 ${color.bg} rounded-xl flex items-center justify-center ${color.text}`}>
            {icon}
          </div>
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
        </div>
        <span className={`${color.badge} text-white px-3 py-1 rounded-full text-xs font-bold`}>{count}</span>
      </div>

      <div className="flex-grow flex flex-col items-center justify-center p-8 text-center">{children}</div>

      {footerTitle && (
        <div className="p-6 mt-auto">
          <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">{footerTitle}</div>
          <div className="border-2 border-dashed border-slate-100 rounded-2xl p-6 flex items-center justify-center bg-slate-50/30">
            <span className="text-slate-300 text-sm font-medium italic">{footerContent}</span>
          </div>
        </div>
      )}
    </section>
  );

  const renderPageContent = () => {
    switch (activeTab) {
      case 'today':
        return (
          <StatusCard
            title="นัดหมายวันนี้ (รอเข้า)"
            icon={<BellRing size={22} />}
            color={{ bg: 'bg-emerald-50', text: 'text-emerald-500', badge: 'bg-emerald-500' }}
            count={todayPendingCount}
          >
            {todayPendingList.length > 0 ? (
              <div className="w-full space-y-3 overflow-y-auto max-h-[400px] p-1 text-left">
                {todayPendingList.map((appt) => (
                  <VisitorCard key={appt.id} appt={appt} type="pending" />
                ))}
              </div>
            ) : (
              <>
                <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-4 text-slate-200">
                  <BellRing size={48} strokeWidth={1} />
                </div>
                <p className="text-slate-400 text-sm leading-relaxed max-w-[250px]">
                  วันนี้ยังไม่มีนัดหมายที่รอต้อนรับ
                  <br />
                  <span className="opacity-70">(หรือลองค้นหารหัสด้านบน)</span>
                </p>
              </>
            )}
          </StatusCard>
        );

      case 'future': {
        // จัดกลุ่มตามวันที่
        const groupedByDate = {};
        futureList.forEach((a) => {
          const d = a.appointmentDate;
          if (!groupedByDate[d]) groupedByDate[d] = [];
          groupedByDate[d].push(a);
        });
        const sortedDates = Object.keys(groupedByDate).sort();

        return (
          <StatusCard
            title="นัดหมายล่วงหน้า"
            icon={<CalendarDays size={22} />}
            color={{ bg: 'bg-indigo-50', text: 'text-indigo-500', badge: 'bg-indigo-500' }}
            count={futureCount}
          >
            {sortedDates.length > 0 ? (
              <div className="w-full space-y-4 overflow-y-auto max-h-[400px] p-1 text-left">
                {sortedDates.map((date) => (
                  <div key={date}>
                    <div className="flex items-center gap-2 mb-2">
                      <CalendarDays size={14} className="text-indigo-400" />
                      <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">{date}</span>
                      <span className="text-xs text-slate-400">({groupedByDate[date].length} คน)</span>
                    </div>
                    <div className="space-y-2 pl-2">
                      {groupedByDate[date].map((appt) => (
                        <VisitorCard key={appt.id} appt={appt} type="future" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-4 text-slate-200">
                  <CalendarDays size={48} strokeWidth={1} />
                </div>
                <p className="text-slate-400 text-sm leading-relaxed">ยังไม่มีนัดหมายล่วงหน้า</p>
              </>
            )}
          </StatusCard>
        );
      }

      case 'onsite':
        return (
          <>
            {/* รอหัวหน้าอนุมัติ */}
            <StatusCard
              title="รอหัวหน้าอนุมัติ"
              icon={<Clock size={22} />}
              color={{ bg: 'bg-amber-50', text: 'text-amber-500', badge: 'bg-amber-500' }}
              count={onsiteWaitingList.length}
            >
              {onsiteWaitingList.length > 0 ? (
                <div className="w-full space-y-3 overflow-y-auto max-h-[400px] p-1 text-left">
                  {onsiteWaitingList.map((appt) => (
                    <VisitorCard key={appt.id} appt={appt} type="onsite" />
                  ))}
                </div>
              ) : (
                <div className="w-full h-full border-2 border-dashed border-slate-100 rounded-[2rem] flex flex-col items-center justify-center bg-slate-50/20">
                  <div className="w-16 h-16 bg-white shadow-sm rounded-2xl flex items-center justify-center mb-4 text-slate-200 border border-slate-100">
                    <Clock size={32} strokeWidth={1} />
                  </div>
                  <p className="text-slate-300 text-sm font-medium">ไม่มีผู้ติดต่อที่รออนุมัติ</p>
                </div>
              )}
            </StatusCard>

            {/* หัวหน้าอนุมัติแล้ว - พร้อมออก */}
            <StatusCard
              title="หัวหน้าอนุมัติแล้ว - พร้อมออก"
              icon={<CheckCircle2 size={22} />}
              color={{ bg: 'bg-green-50', text: 'text-green-500', badge: 'bg-green-500' }}
              count={onsiteApprovedList.length}
            >
              {onsiteApprovedList.length > 0 ? (
                <div className="w-full space-y-3 overflow-y-auto max-h-[400px] p-1 text-left">
                  {onsiteApprovedList.map((appt) => (
                    <VisitorCard key={appt.id} appt={appt} type="approved_out" />
                  ))}
                </div>
              ) : (
                <div className="w-full h-full border-2 border-dashed border-slate-100 rounded-[2rem] flex flex-col items-center justify-center bg-slate-50/20">
                  <div className="w-16 h-16 bg-white shadow-sm rounded-2xl flex items-center justify-center mb-4 text-slate-200 border border-slate-100">
                    <CheckCircle2 size={32} strokeWidth={1} />
                  </div>
                  <p className="text-slate-300 text-sm font-medium">ไม่มีผู้ติดต่อที่พร้อมออก</p>
                </div>
              )}
            </StatusCard>
          </>
        );

      case 'docs': {
        const pendingDocs = approvedDocs.filter(d => d.status === 'pending');
        const doneDocs = approvedDocs.filter(d => d.status === 'approved').slice(0, 20);

        const handleAcknowledge = async (docItem) => {
          if (!firebaseReady || !db) return;
          try {
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'approval_workflows', docItem._docId);
            await updateDoc(docRef, {
              status: 'approved',
              acknowledgedAt: new Date().toISOString(),
              approvedBy: 'รปภ.',
            });
          } catch (err) {
            alert('เกิดข้อผิดพลาด: ' + err.message);
          }
        };

        const formLabel = (sf) => ({
          VEHICLE_BOOKING: 'ขอใช้รถ',
          OUTING_REQUEST: 'ออกนอกสถานที่',
          GOODS_IN_OUT: 'นำของเข้า/ออก',
          VISITOR: 'ผู้มาติดต่อ',
        }[sf] || sf || '-');

        return (
          <div className="space-y-6 w-full max-w-3xl">
            {/* เอกสารรอรับทราบ */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h3 className="text-sm font-black text-orange-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                <FileText size={18} /> เอกสารรออนุมัติ ({pendingDocs.length})
              </h3>
              {pendingDocs.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">ไม่มีเอกสารรออนุมัติ</p>
              ) : (
                <div className="space-y-3">
                  {pendingDocs.map((d) => {
                    const p = d.requestPayload || {};
                    return (
                      <div key={d._docId} className="bg-orange-50 border border-orange-100 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-slate-800 text-sm">{formLabel(d.sourceForm)}</p>
                            <p className="text-xs text-slate-500 mt-1">
                              ผู้ขอ: {d.requesterName || '-'} ({d.requesterId || '-'}) | แผนก: {d.requesterDepartment || '-'}
                            </p>
                            {p.destination && <p className="text-xs text-slate-500">ปลายทาง: {p.destination}</p>}
                            {p.date && <p className="text-xs text-slate-500">วันที่: {p.date}</p>}
                            {p.timeStart && <p className="text-xs text-slate-500">เวลา: {p.timeStart} - {p.timeEnd || '-'}</p>}
                            {(p.companions || []).length > 0 && (
                              <p className="text-xs text-slate-500">ผู้ร่วมเดินทาง: {p.companions.join(', ')}</p>
                            )}
                            <p className="text-[10px] text-slate-400 mt-1">ส่งเมื่อ: {d.createdAt?.split('T')[0] || '-'}</p>
                          </div>
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={() => openDocDetail(d)}
                              className="bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-100 active:scale-95 transition whitespace-nowrap"
                            >
                              ดูข้อมูล
                            </button>
                            <button
                              onClick={() => handleAcknowledge(d)}
                              className="bg-green-600 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-green-700 active:scale-95 transition whitespace-nowrap"
                            >
                              ✓ รับทราบ
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* เอกสารที่รับทราบแล้ว */}
            {doneDocs.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h3 className="text-sm font-black text-green-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <ShieldCheck size={18} /> รับทราบแล้ว ({doneDocs.length})
                </h3>
                <div className="space-y-2">
                  {doneDocs.map((d) => (
                    <div key={d._docId} className="bg-green-50 border border-green-100 rounded-xl p-3 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-slate-700 text-xs">{formLabel(d.sourceForm)} — {d.requesterName || '-'}</p>
                        <p className="text-[10px] text-slate-400">{d.requesterDepartment || '-'} | {d.acknowledgedAt?.split('T')[0] || '-'}</p>
                      </div>
                      <span className="text-green-600 text-[10px] font-black uppercase bg-green-100 px-2 py-1 rounded-lg">เสร็จสิ้น</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-700">
      <header className="max-w-7xl mx-auto bg-white rounded-3xl shadow-sm border border-slate-100 p-3 mb-6 flex flex-col lg:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 px-4 py-2">
          <div className="bg-emerald-500 p-2 rounded-xl text-white">
            <ShieldCheck size={28} />
          </div>
          <h1 className="text-xl font-black tracking-tight flex items-center">
            SECURITY <span className="text-emerald-500 ml-1">GATE</span>
          </h1>
        </div>

        <div className="flex items-center bg-slate-50 rounded-full p-1 border border-slate-100 overflow-x-auto max-w-full no-scrollbar">
          <div className="flex gap-1 p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-300 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-slate-900 text-white shadow-lg scale-105'
                    : 'text-slate-500 hover:bg-slate-200'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 w-full lg:w-auto">
          <button
            onClick={startScanner}
            className="bg-emerald-500 text-white px-5 py-3 rounded-full text-sm font-bold hover:bg-emerald-600 transition active:scale-95 flex items-center gap-2 shadow-sm whitespace-nowrap"
          >
            <Camera size={18} /> สแกน QR
          </button>
          <div className="relative flex-1 lg:w-64">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400">
              <Search size={18} />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาข้อมูลในระบบ..."
              className="w-full bg-slate-100 border-none rounded-full py-3 pl-12 pr-4 text-sm focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
            />
          </div>
        </div>
      </header>

      <main className={`max-w-7xl mx-auto grid gap-6 transition-all duration-500 ${
        activeTab === 'onsite' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 max-w-3xl'
      }`}>
        {renderPageContent()}
      </main>

      <footer className="max-w-7xl mx-auto mt-12 flex flex-col items-center gap-2">
        <div className="h-px w-24 bg-slate-200 mb-2"></div>
        <p className="text-slate-400 text-xs font-medium uppercase tracking-widest">Security Gate Control Center</p>
        <p className="text-slate-300 text-[10px]">ระบบจัดการความปลอดภัยระดับองค์กร v2.1.0</p>
      </footer>

      {detailModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-[65]">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900">
                {detailModal.type === 'doc' ? 'รายละเอียดเอกสารอนุมัติ' : 'รายละเอียดผู้มาติดต่อ'}
              </h3>
              <button
                onClick={() => setDetailModal(null)}
                className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              {detailModal.type === 'appointment' ? (
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">ชื่อ</p><p className="font-bold">{detailModal.item.name || '-'}</p></div>
                    <div><p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">บริษัท</p><p className="font-bold">{detailModal.item.company || '-'}</p></div>
                    <div><p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">รหัสอ้างอิง</p><p className="font-mono font-bold text-blue-600">{detailModal.item.refCode || '-'}</p></div>
                    <div><p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">พบพนักงาน</p><p className="font-bold">{detailModal.item.hostStaffId || '-'}</p></div>
                    <div><p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">แผนก</p><p className="font-bold">{detailModal.item.department || '-'}</p></div>
                    <div><p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">วันที่นัด</p><p className="font-bold">{detailModal.item.appointmentDate || '-'}</p></div>
                  </div>
                  <div><p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">วัตถุประสงค์</p><p className="font-bold">{detailModal.item.purpose || '-'}</p></div>
                  {(detailModal.item.checkInTime || detailModal.item.checkOutTime || detailModal.item.approvedOutTime) && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">เวลาในระบบ</p>
                      {detailModal.item.checkInTime && <p>เข้า: {new Date(detailModal.item.checkInTime).toLocaleString('th-TH')}</p>}
                      {detailModal.item.approvedOutTime && <p>หัวหน้าอนุมัติ: {new Date(detailModal.item.approvedOutTime).toLocaleString('th-TH')}</p>}
                      {detailModal.item.checkOutTime && <p>ออก: {new Date(detailModal.item.checkOutTime).toLocaleString('th-TH')}</p>}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">ฟอร์ม</p><p className="font-bold">{detailModal.item.sourceForm || '-'}</p></div>
                    <div><p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">สถานะ</p><p className="font-bold">{detailModal.item.status || '-'}</p></div>
                    <div><p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">ผู้ขอ</p><p className="font-bold">{detailModal.item.requesterName || '-'} ({detailModal.item.requesterId || '-'})</p></div>
                    <div><p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">แผนกผู้ขอ</p><p className="font-bold">{detailModal.item.requesterDepartment || '-'}</p></div>
                    <div><p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">ขั้นตอน</p><p className="font-bold">{detailModal.item.stepLabel || '-'}</p></div>
                    <div><p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">ส่งเมื่อ</p><p className="font-bold">{detailModal.item.createdAt ? new Date(detailModal.item.createdAt).toLocaleString('th-TH') : '-'}</p></div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">ข้อมูลเอกสาร</p>
                    <pre className="text-[11px] bg-slate-50 border border-slate-200 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap">
{JSON.stringify(detailModal.item.requestPayload || {}, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {checkInTarget && (
        <CheckInModal
          appt={checkInTarget}
          onClose={() => { setCheckInTarget(null); setCardNo(''); }}
          cardNo={cardNo}
          setCardNo={setCardNo}
          submitFn={handleCheckIn}
        />
      )}

      {/* QR Scanner Modal */}
      {showScanner && !scannedResult && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-6 z-[60] animate-in fade-in font-sans">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 flex justify-between items-center border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><Camera size={20} /> สแกน QR Code</h3>
              <button onClick={stopScanner} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <div id="qr-reader" ref={scannerRef} className="rounded-2xl overflow-hidden"></div>
              <p className="text-center text-xs text-slate-400 mt-4">ส่องกล้องไปที่ QR Code ของผู้มาติดต่อ</p>
            </div>
          </div>
        </div>
      )}

      {/* Scanned Result Modal */}
      {scannedResult && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-6 z-[60] animate-in fade-in font-sans">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 flex justify-between items-center border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-900">ผลการสแกน</h3>
              <button onClick={stopScanner} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {scannedResult.appointment ? (
                <>
                  <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 text-center">
                    <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-2" />
                    <p className="text-emerald-700 font-bold text-sm">พบนัดหมายในระบบ</p>
                  </div>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between p-3 bg-slate-50 rounded-xl">
                      <span className="text-slate-400">ชื่อ</span>
                      <span className="font-bold text-slate-800">{scannedResult.appointment.name}</span>
                    </div>
                    <div className="flex justify-between p-3 bg-slate-50 rounded-xl">
                      <span className="text-slate-400">บริษัท</span>
                      <span className="font-bold text-slate-800">{scannedResult.appointment.company || '-'}</span>
                    </div>
                    <div className="flex justify-between p-3 bg-slate-50 rounded-xl">
                      <span className="text-slate-400">วัตถุประสงค์</span>
                      <span className="font-bold text-slate-800">{scannedResult.appointment.purpose || '-'}</span>
                    </div>
                    <div className="flex justify-between p-3 bg-slate-50 rounded-xl">
                      <span className="text-slate-400">พบพนักงาน</span>
                      <span className="font-bold text-slate-800">{scannedResult.appointment.hostStaffId || '-'}</span>
                    </div>
                    <div className="flex justify-between p-3 bg-slate-50 rounded-xl">
                      <span className="text-slate-400">รหัสอ้างอิง</span>
                      <span className="font-mono font-bold text-blue-600">{scannedResult.appointment.refCode}</span>
                    </div>
                    {scannedResult.appointment.count > 1 && (
                      <div className="flex justify-between p-3 bg-slate-50 rounded-xl">
                        <span className="text-slate-400">จำนวน</span>
                        <span className="font-bold text-slate-800">{scannedResult.appointment.count} คน</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setCheckInTarget(scannedResult.appointment);
                      setCardNo('');
                      setScannedResult(null);
                      setShowScanner(false);
                    }}
                    className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-black text-base hover:bg-emerald-600 transition active:scale-95 flex items-center justify-center gap-2"
                  >
                    <ShieldCheck size={20} /> รับเข้าโรงงาน
                  </button>
                </>
              ) : (
                <>
                  <div className="bg-red-50 p-6 rounded-2xl border border-red-100 text-center">
                    <AlertCircle size={48} className="text-red-400 mx-auto mb-2" />
                    <p className="text-red-600 font-bold text-sm">ไม่พบนัดหมายในระบบ</p>
                    <p className="text-red-400 text-xs mt-1">รหัส: {scannedResult.qrData?.ref || '-'}</p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={startScanner} className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-2xl font-bold text-sm hover:bg-slate-200 transition">
                      สแกนใหม่
                    </button>
                    <button onClick={stopScanner} className="flex-1 bg-slate-900 text-white py-3 rounded-2xl font-bold text-sm hover:bg-black transition">
                      ปิด
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
}

// --- CheckIn Modal ---
function CheckInModal({ appt, onClose, cardNo, setCardNo, submitFn }) {
   return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 z-[60] animate-in fade-in font-sans">
      <div className="bg-white border border-slate-200 p-5 md:p-10 rounded-2xl md:rounded-[3rem] max-w-sm md:max-w-md w-full shadow-2xl border-t-8 border-t-blue-600 font-sans">
        <h3 className="text-xl md:text-3xl font-black text-slate-900 mb-6 text-center tracking-widest uppercase">Admission Process</h3>
        <div className="space-y-4 mb-8">
          <div className="bg-slate-50 p-4 md:p-6 rounded-2xl border border-slate-100">
            <div className="space-y-2 mb-4">
              <p className="text-lg md:text-2xl font-black text-slate-900 border-l-4 border-emerald-500 pl-4">1. {appt.name}</p>
              {appt.additionalNames?.map((n, i) => <p key={i} className="text-sm md:text-lg font-bold text-slate-400 pl-5">{i+2}. {n}</p>)}
            </div>
            <div className="space-y-2 text-[10px] font-black uppercase tracking-widest pt-3 border-t border-slate-200">
              <div className="flex justify-between"><span>Meeting with</span><span className="text-slate-900">ID #{appt.hostStaffId}</span></div>
              <div className="flex justify-between"><span>Department</span><span className="text-blue-600">{appt.department}</span></div>
            </div>
          </div>
          <div className="pt-2 text-center">
            <label className="text-xs text-slate-400 uppercase font-black block mb-3 tracking-widest">Assign SOC Physical Card</label>
            <input
               autoFocus className="w-full bg-slate-100 border border-slate-200 rounded-2xl p-4 md:p-6 text-3xl md:text-5xl font-black text-slate-900 text-center outline-none focus:ring-4 focus:ring-blue-50 transition-all font-mono shadow-inner"
               placeholder="00" value={cardNo} onChange={e => setCardNo(e.target.value.toUpperCase())}
            />
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-4 text-slate-400 font-black uppercase tracking-widest text-xs hover:text-slate-900 transition-colors">ยกเลิก</button>
          <button onClick={submitFn} className="flex-[2] bg-blue-600 text-white rounded-2xl font-black hover:bg-blue-700 shadow-xl shadow-blue-100 active:scale-95 uppercase tracking-widest text-sm py-4 transition-all text-center">Issue Pass</button>
        </div>
      </div>
    </div>
   );
}

// --- Admin View (หน้าจอผู้ดูแลระบบ) ---
function AdminView({ appointments, user }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [editingAppt, setEditingAppt] = useState(null);
  const [editFormData, setEditFormData] = useState(null);
  const [equipmentRequests, setEquipmentRequests] = useState([]);
  const [showEquipmentSection, setShowEquipmentSection] = useState(false);
  const [showStockSection, setShowStockSection] = useState(false);
  const [stockItems, setStockItems] = useState([]);
  const [stockSearch, setStockSearch] = useState('');
  const [stockGroupFilter, setStockGroupFilter] = useState('ALL');

  // --- Feature 1: Admin User Management ---
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ id: '', name: '', department: DEPARTMENTS[0], role: 'EMPLOYEE' });

  // --- Feature 2: Audit Log Viewer ---
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);
  const [auditFilterUser, setAuditFilterUser] = useState('');
  const [auditFilterDateFrom, setAuditFilterDateFrom] = useState('');
  const [auditFilterDateTo, setAuditFilterDateTo] = useState('');

  // --- Feature 3: All Documents Viewer ---
  const [showAllDocs, setShowAllDocs] = useState(false);
  const [allWorkflows, setAllWorkflows] = useState([]);
  const [docTypeFilter, setDocTypeFilter] = useState('ALL');
  const [docStatusFilter, setDocStatusFilter] = useState('ALL');
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);

  // --- Employee Quick Editor ---
  const [empEditorId, setEmpEditorId] = useState('');
  const [empEditorData, setEmpEditorData] = useState(null); // loaded snapshot
  const [empEditorEdit, setEmpEditorEdit] = useState(null); // editable copy
  const [empEditorNewPass, setEmpEditorNewPass] = useState('');
  const [empEditorSaving, setEmpEditorSaving] = useState(false);
  const [empEditorResult, setEmpEditorResult] = useState(null);

  const handleEmpEditorSearch = async () => {
    const id = empEditorId.trim().toUpperCase();
    if (!id) { setEmpEditorResult({ ok: false, msg: 'กรุณาใส่รหัสพนักงาน' }); return; }
    setEmpEditorResult(null);
    setEmpEditorData(null);
    setEmpEditorEdit(null);
    setEmpEditorNewPass('');
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', id);
      const snap = await getDoc(docRef);
      if (!snap.exists()) { setEmpEditorResult({ ok: false, msg: `ไม่พบรหัสพนักงาน "${id}" ในระบบ` }); return; }
      const d = { docId: id, ...snap.data() };
      setEmpEditorData(d);
      setEmpEditorEdit({ name: d.name || '', department: d.department || '', role: d.role || 'EMPLOYEE', active: d.active !== false });
    } catch (err) {
      setEmpEditorResult({ ok: false, msg: 'เกิดข้อผิดพลาด: ' + err.message });
    }
  };

  const handleEmpEditorSave = async () => {
    if (!empEditorData || !empEditorEdit) return;
    setEmpEditorSaving(true);
    setEmpEditorResult(null);
    try {
      const updates = { name: empEditorEdit.name.trim(), department: empEditorEdit.department, role: empEditorEdit.role, active: empEditorEdit.active, updatedAt: Timestamp.now() };
      if (empEditorNewPass) {
        if (empEditorNewPass.length < 6) { setEmpEditorResult({ ok: false, msg: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' }); setEmpEditorSaving(false); return; }
        updates.passwordHash = await hashPassword(empEditorNewPass);
      }
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', empEditorData.docId);
      await updateDoc(docRef, updates);
      setEmpEditorData({ ...empEditorData, ...updates });
      setEmpEditorNewPass('');
      setEmpEditorResult({ ok: true, msg: `บันทึกข้อมูลของ ${empEditorEdit.name || empEditorData.docId} สำเร็จ` + (empEditorNewPass ? ' (รหัสผ่านเปลี่ยนแล้ว)' : '') });
    } catch (err) {
      setEmpEditorResult({ ok: false, msg: 'เกิดข้อผิดพลาด: ' + err.message });
    }
    setEmpEditorSaving(false);
  };

  // --- Feature 4: Vehicle Fleet Management ---
  const [showVehicleSection, setShowVehicleSection] = useState(true);
  const [vehicles, setVehicles] = useState([]);
  const [vehicleBookings, setVehicleBookings] = useState([]);
  const [showAddVehicleModal, setShowAddVehicleModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [newVehicleForm, setNewVehicleForm] = useState({ id: '', plate: '', brand: '', type: 'รถเก๋ง', color: '', seats: 5, status: 'available' });

  // --- Feature 5: Troubleshooting Panel (แก้ไขปัญหาระบบ) ---
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);
  const [tbResult, setTbResult] = useState(null); // { tool, ok, msg }
  const [tbBusy, setTbBusy] = useState(false);
  const [tbUnlockId, setTbUnlockId] = useState('');
  const [tbQuickPassId, setTbQuickPassId] = useState('');
  const [tbQuickPassNew, setTbQuickPassNew] = useState('');
  const [tbCancelChainId, setTbCancelChainId] = useState('');
  const [tbRerouteOld, setTbRerouteOld] = useState('');
  const [tbRerouteNew, setTbRerouteNew] = useState('');
  const [tbDeleteColl, setTbDeleteColl] = useState('appointments');
  const [tbDeleteDocId, setTbDeleteDocId] = useState('');
  const [tbHealth, setTbHealth] = useState(null);
  const [tbHealthLoading, setTbHealthLoading] = useState(false);
  const [tbBackupProgress, setTbBackupProgress] = useState('');

  // --- Feature 6: SMTP Email Settings ---
  const [showSmtpSettings, setShowSmtpSettings] = useState(false);
  const [smtpEdit, setSmtpEdit] = useState({
    host: 'smtp.gmail.com',
    port: '587',
    secure: false,
    user: '',
    pass: '',
    from: '',
    fromName: 'SOC Systems - TBKK Group',
    enabled: false,
  });
  const [smtpLoaded, setSmtpLoaded] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpResult, setSmtpResult] = useState(null); // { ok, msg }
  const [smtpTestBusy, setSmtpTestBusy] = useState(false);
  const [smtpTestEmail, setSmtpTestEmail] = useState('');
  const [smtpServerHealth, setSmtpServerHealth] = useState(null); // { ok, detail }
  const [smtpShowPassword, setSmtpShowPassword] = useState(false);

  // --- Admin Tab Navigation (organize sections into tabs) ---
  const [activeTab, setActiveTab] = useState('overview');

  // Load equipment requests
  useEffect(() => {
    if (!user || !firebaseReady) return;
    try {
      const equipmentRef = collection(db, 'artifacts', appId, 'public', 'data', 'equipment_requests');
      const unsubscribe = onSnapshot(equipmentRef, (snapshot) => {
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setEquipmentRequests(docs);
      }, (error) => {
        console.error("Equipment requests error:", error);
      });
      return () => unsubscribe();
    } catch (error) {
      console.error("Equipment requests setup error:", error);
    }
  }, [user]);

  // Load equipment stock for admin management
  useEffect(() => {
    if (!user || !firebaseReady) return;
    try {
      const stockRef = collection(db, 'artifacts', appId, 'public', 'data', 'equipment_stock');
      const unsubscribe = onSnapshot(stockRef, (snapshot) => {
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
        setStockItems(docs);
      }, (error) => {
        console.error("Equipment stock error:", error);
      });
      return () => unsubscribe();
    } catch (error) {
      console.error("Equipment stock setup error:", error);
    }
  }, [user]);

  // --- Feature 6: Load SMTP settings when panel opened ---
  useEffect(() => {
    if (!user || !firebaseReady || !showSmtpSettings) return;
    let alive = true;
    (async () => {
      try {
        const smtpRef = doc(db, 'artifacts', appId, 'public', 'data', 'smtp_settings', 'default');
        const snap = await getDoc(smtpRef);
        if (!alive) return;
        if (snap.exists()) {
          const data = snap.data();
          setSmtpEdit({
            host: data.host || 'smtp.gmail.com',
            port: String(data.port || '587'),
            secure: !!data.secure,
            user: data.user || '',
            pass: data.pass || '',
            from: data.from || '',
            fromName: data.fromName || 'SOC Systems - TBKK Group',
            enabled: !!data.enabled,
          });
        }
        setSmtpLoaded(true);
      } catch (err) {
        console.error('SMTP load error:', err);
        if (alive) setSmtpLoaded(true);
      }
      // ping email server health
      try {
        const apiUrl = import.meta.env.VITE_EMAIL_API || 'http://localhost:3001';
        const res = await fetch(`${apiUrl}/api/health`, { method: 'GET' });
        if (!alive) return;
        if (res.ok) {
          const j = await res.json().catch(() => ({}));
          setSmtpServerHealth({ ok: true, detail: j });
        } else {
          setSmtpServerHealth({ ok: false, detail: `HTTP ${res.status}` });
        }
      } catch (err) {
        if (alive) setSmtpServerHealth({ ok: false, detail: err.message });
      }
    })();
    return () => { alive = false; };
  }, [user, showSmtpSettings]);

  // --- Hash password utility ---
  async function hashPassword(plain) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // --- Load all users (Feature 1) ---
  useEffect(() => {
    if (!user || !firebaseReady || !showUserManagement) return;
    try {
      const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
      const unsubscribe = onSnapshot(usersRef, (snapshot) => {
        const docs = snapshot.docs.map(d => ({ docId: d.id, ...d.data() }));
        setAllUsers(docs);
      }, (error) => {
        console.error("Users load error:", error);
      });
      return () => unsubscribe();
    } catch (error) {
      console.error("Users setup error:", error);
    }
  }, [user, showUserManagement]);

  // --- Load audit logs (Feature 2) ---
  useEffect(() => {
    if (!user || !firebaseReady || !showAuditLogs) return;
    const loadAuditLogs = async () => {
      setAuditLogsLoading(true);
      try {
        const logsRef = collection(db, 'artifacts', appId, 'public', 'data', 'audit_logs');
        const q = query(logsRef, orderBy('timestamp', 'desc'), limit(100));
        const snapshot = await getDocs(q);
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setAuditLogs(docs);
      } catch (error) {
        console.error("Audit logs error:", error);
      } finally {
        setAuditLogsLoading(false);
      }
    };
    loadAuditLogs();
  }, [user, showAuditLogs]);

  // --- Load all workflows (Feature 3) ---
  useEffect(() => {
    if (!user || !firebaseReady || !showAllDocs) return;
    try {
      const workflowsRef = collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows');
      const unsubscribe = onSnapshot(workflowsRef, (snapshot) => {
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => {
          const ta = a.createdAt?.toDate?.() || new Date(0);
          const tb = b.createdAt?.toDate?.() || new Date(0);
          return tb - ta;
        });
        setAllWorkflows(docs);
      }, (error) => {
        console.error("Workflows load error:", error);
      });
      return () => unsubscribe();
    } catch (error) {
      console.error("Workflows setup error:", error);
    }
  }, [user, showAllDocs]);

  // --- Load vehicles (Feature 4) ---
  useEffect(() => {
    if (!user || !firebaseReady) return;
    try {
      const vehiclesRef = collection(db, 'artifacts', appId, 'public', 'data', 'vehicles');
      const unsubscribe = onSnapshot(vehiclesRef, (snapshot) => {
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
        setVehicles(docs);
      }, (error) => {
        console.error('Admin vehicles load error:', error);
      });
      return () => unsubscribe();
    } catch (error) {
      console.error('Admin vehicles setup error:', error);
    }
  }, [user]);

  // --- Load vehicle bookings (Feature 4) ---
  useEffect(() => {
    if (!user || !firebaseReady || !showVehicleSection) return;
    try {
      const bookingsRef = collection(db, 'artifacts', appId, 'public', 'data', 'vehicle_bookings');
      const unsubscribe = onSnapshot(bookingsRef, (snapshot) => {
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => {
          const da = a.date || '';
          const db2 = b.date || '';
          return db2.localeCompare(da);
        });
        setVehicleBookings(docs);
      }, (error) => {
        console.error('Admin vehicle bookings error:', error);
      });
      return () => unsubscribe();
    } catch (error) {
      console.error('Admin vehicle bookings setup error:', error);
    }
  }, [user, showVehicleSection]);

  // --- Vehicle Management handlers ---
  const vehicleTypeOptions = ['รถกระบะ', 'รถตู้', 'SUV', 'MPV', 'รถยนต์ไฟฟ้า'];
  const vehicleStatusOptions = ['available', 'maintenance', 'unavailable'];
  const vehicleStatusLabel = { available: 'พร้อมใช้', maintenance: 'ซ่อมบำรุง', unavailable: 'ไม่พร้อมใช้' };
  const vehicleStatusColor = { available: 'bg-emerald-100 text-emerald-700 border-emerald-300', maintenance: 'bg-yellow-100 text-yellow-700 border-yellow-300', unavailable: 'bg-red-100 text-red-700 border-red-300' };

  const handleToggleVehicleStatus = async (v) => {
    if (!firebaseReady || !user) return;
    const order = ['available', 'maintenance', 'unavailable'];
    const idx = order.indexOf(v.status || 'available');
    const next = order[(idx + 1) % order.length];
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'vehicles', v.id);
      await updateDoc(docRef, { status: next, updatedAt: Timestamp.now() });
    } catch (error) {
      console.error('Error toggling vehicle status:', error);
      alert('เกิดข้อผิดพลาด: ' + error.message);
    }
  };

  const handleAddVehicle = async () => {
    if (!firebaseReady || !user) return;
    if (!newVehicleForm.plate.trim() || !newVehicleForm.brand.trim()) {
      alert('กรุณากรอกทะเบียนและยี่ห้อ');
      return;
    }
    const vid = newVehicleForm.id.trim() || ('V' + String(vehicles.length + 1).padStart(3, '0'));
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'vehicles', vid);
      await setDoc(docRef, {
        id: vid,
        plate: newVehicleForm.plate.trim(),
        brand: newVehicleForm.brand.trim(),
        type: newVehicleForm.type,
        color: newVehicleForm.color.trim() || '-',
        seats: parseInt(newVehicleForm.seats) || 5,
        status: 'available',
        createdAt: Timestamp.now(),
      });
      alert('เพิ่มรถสำเร็จ');
      setShowAddVehicleModal(false);
      setNewVehicleForm({ id: '', plate: '', brand: '', type: 'รถกระบะ', color: '', seats: 5, status: 'available' });
    } catch (error) {
      console.error('Error adding vehicle:', error);
      alert('เกิดข้อผิดพลาด: ' + error.message);
    }
  };

  const handleUpdateVehicle = async () => {
    if (!firebaseReady || !user || !editingVehicle) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'vehicles', editingVehicle.id);
      await updateDoc(docRef, {
        plate: editingVehicle.plate,
        brand: editingVehicle.brand,
        type: editingVehicle.type,
        color: editingVehicle.color || '-',
        seats: parseInt(editingVehicle.seats) || 5,
        status: editingVehicle.status,
        updatedAt: Timestamp.now(),
      });
      setEditingVehicle(null);
    } catch (error) {
      console.error('Error updating vehicle:', error);
      alert('เกิดข้อผิดพลาด: ' + error.message);
    }
  };

  // --- Troubleshooting Panel handlers ---
  const tbSetResult = (tool, ok, msg) => setTbResult({ tool, ok, msg, at: Date.now() });

  // Tool 1: Unlock account (clear failed login attempts)
  const handleTbUnlock = async () => {
    const id = tbUnlockId.trim().toUpperCase();
    if (!id) { tbSetResult('unlock', false, 'กรุณาใส่รหัสผู้ใช้'); return; }
    setTbBusy(true);
    try {
      const ref = doc(db, 'artifacts', appId, 'public', 'data', 'login_attempts', id);
      await setDoc(ref, { userId: id, attempts: 0, lockedUntil: null, clearedAt: Timestamp.now(), clearedBy: user?.staffId || 'ADMIN' }, { merge: true });
      try { await logAction('ADMIN_UNLOCK', { staffId: user?.staffId, targetId: id }); } catch {}
      tbSetResult('unlock', true, `ปลดล็อคบัญชี ${id} สำเร็จ (เคลียร์การพยายาม login ผิด)`);
      setTbUnlockId('');
    } catch (err) {
      tbSetResult('unlock', false, 'เกิดข้อผิดพลาด: ' + err.message);
    }
    setTbBusy(false);
  };

  // Tool 2: Quick reset password
  const handleTbQuickReset = async () => {
    const id = tbQuickPassId.trim().toUpperCase();
    const newPass = tbQuickPassNew.trim();
    if (!id || !newPass) { tbSetResult('quickpass', false, 'กรุณาใส่รหัสผู้ใช้และรหัสผ่านใหม่'); return; }
    if (newPass.length < 4) { tbSetResult('quickpass', false, 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร'); return; }
    setTbBusy(true);
    try {
      const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', id);
      const snap = await getDoc(userRef);
      if (!snap.exists()) { tbSetResult('quickpass', false, `ไม่พบผู้ใช้ ${id}`); setTbBusy(false); return; }
      const hash = await hashPassword(newPass);
      await updateDoc(userRef, { passwordHash: hash, updatedAt: Timestamp.now() });
      // Also clear lockout
      try {
        const lockRef = doc(db, 'artifacts', appId, 'public', 'data', 'login_attempts', id);
        await setDoc(lockRef, { userId: id, attempts: 0, lockedUntil: null }, { merge: true });
      } catch {}
      try { await logAction('ADMIN_QUICK_RESET_PASSWORD', { staffId: user?.staffId, targetId: id }); } catch {}
      tbSetResult('quickpass', true, `เปลี่ยนรหัสผ่าน ${id} เป็น "${newPass}" สำเร็จ + ปลดล็อคให้แล้ว`);
      setTbQuickPassId('');
      setTbQuickPassNew('');
    } catch (err) {
      tbSetResult('quickpass', false, 'เกิดข้อผิดพลาด: ' + err.message);
    }
    setTbBusy(false);
  };

  // Tool 3: Cancel stuck workflow by chainId
  const handleTbCancelWorkflow = async () => {
    const chainId = tbCancelChainId.trim();
    if (!chainId) { tbSetResult('cancel', false, 'กรุณาใส่ Chain ID'); return; }
    if (!window.confirm(`ยืนยันการยกเลิกเอกสารทั้งหมดที่มี chainId = ${chainId}?`)) return;
    setTbBusy(true);
    try {
      const wfRef = collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows');
      const q1 = query(wfRef, where('chainId', '==', chainId));
      const snap = await getDocs(q1);
      if (snap.empty) { tbSetResult('cancel', false, `ไม่พบเอกสาร chainId = ${chainId}`); setTbBusy(false); return; }
      let n = 0;
      for (const d of snap.docs) {
        await updateDoc(d.ref, { status: 'cancelled', cancelledAt: Timestamp.now(), cancelledBy: user?.staffId || 'ADMIN', cancelReason: 'Admin troubleshoot cancel' });
        n++;
      }
      try { await logAction('ADMIN_CANCEL_WORKFLOW', { staffId: user?.staffId, chainId, count: n }); } catch {}
      tbSetResult('cancel', true, `ยกเลิก ${n} เอกสาร (chainId = ${chainId}) สำเร็จ`);
      setTbCancelChainId('');
    } catch (err) {
      tbSetResult('cancel', false, 'เกิดข้อผิดพลาด: ' + err.message);
    }
    setTbBusy(false);
  };

  // Tool 4: Re-route workflow (change department of pending workflows)
  const handleTbReroute = async () => {
    const oldD = tbRerouteOld.trim();
    const newD = tbRerouteNew.trim();
    if (!oldD || !newD) { tbSetResult('reroute', false, 'กรุณาใส่ทั้งแผนกเดิมและแผนกใหม่'); return; }
    if (!window.confirm(`ย้ายเอกสาร pending จากแผนก "${oldD}" → "${newD}" หรือไม่?`)) return;
    setTbBusy(true);
    try {
      const wfRef = collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows');
      const q1 = query(wfRef, where('status', '==', 'pending'), where('department', '==', oldD));
      const snap = await getDocs(q1);
      if (snap.empty) { tbSetResult('reroute', false, `ไม่พบเอกสาร pending ในแผนก "${oldD}"`); setTbBusy(false); return; }
      let n = 0;
      for (const d of snap.docs) {
        await updateDoc(d.ref, { department: newD, reroutedAt: Timestamp.now(), reroutedBy: user?.staffId || 'ADMIN', reroutedFrom: oldD });
        n++;
      }
      try { await logAction('ADMIN_REROUTE_WORKFLOW', { staffId: user?.staffId, from: oldD, to: newD, count: n }); } catch {}
      tbSetResult('reroute', true, `ย้าย ${n} เอกสารจาก "${oldD}" → "${newD}" สำเร็จ`);
      setTbRerouteOld('');
      setTbRerouteNew('');
    } catch (err) {
      tbSetResult('reroute', false, 'เกิดข้อผิดพลาด: ' + err.message);
    }
    setTbBusy(false);
  };

  // Tool 5: Delete document by id
  const handleTbDelete = async () => {
    const coll = tbDeleteColl;
    const id = tbDeleteDocId.trim();
    if (!coll || !id) { tbSetResult('delete', false, 'กรุณาเลือก collection และใส่ doc id'); return; }
    if (!window.confirm(`ลบเอกสาร ${coll}/${id} ถาวร? (ไม่สามารถกู้คืนได้)`)) return;
    setTbBusy(true);
    try {
      const ref = doc(db, 'artifacts', appId, 'public', 'data', coll, id);
      const snap = await getDoc(ref);
      if (!snap.exists()) { tbSetResult('delete', false, `ไม่พบเอกสาร ${coll}/${id}`); setTbBusy(false); return; }
      await deleteDoc(ref);
      try { await logAction('ADMIN_DELETE_DOC', { staffId: user?.staffId, collection: coll, docId: id }); } catch {}
      tbSetResult('delete', true, `ลบ ${coll}/${id} สำเร็จ`);
      setTbDeleteDocId('');
    } catch (err) {
      tbSetResult('delete', false, 'เกิดข้อผิดพลาด: ' + err.message);
    }
    setTbBusy(false);
  };

  // Tool 6: System Health Dashboard
  const handleTbHealthCheck = async () => {
    setTbHealthLoading(true);
    setTbHealth(null);
    try {
      const base = ['artifacts', appId, 'public', 'data'];
      const now = Date.now();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

      // users
      const usersSnap = await getDocs(collection(db, ...base, 'users'));
      const usersTotal = usersSnap.size;
      let usersActive = 0;
      usersSnap.forEach(d => { if (d.data().active !== false) usersActive++; });

      // workflows
      const wfSnap = await getDocs(collection(db, ...base, 'approval_workflows'));
      let wfPending = 0, wfApproved = 0, wfRejected = 0, wfStuck = 0;
      const byType = {};
      wfSnap.forEach(d => {
        const w = d.data();
        if (w.status === 'pending') wfPending++;
        else if (w.status === 'approved') wfApproved++;
        else if (w.status === 'rejected') wfRejected++;
        byType[w.sourceForm || 'OTHER'] = (byType[w.sourceForm || 'OTHER'] || 0) + 1;
        if (w.status === 'pending') {
          const created = w.createdAt?.toDate?.()?.getTime?.() || 0;
          if (created && (now - created) > sevenDaysMs) wfStuck++;
        }
      });

      // appointments
      const apptSnap = await getDocs(collection(db, ...base, 'appointments'));
      let apptPending = 0, apptInside = 0, apptStuck = 0;
      apptSnap.forEach(d => {
        const a = d.data();
        if (a.status === STATUS.PENDING) apptPending++;
        if (a.status === STATUS.INSIDE) apptInside++;
        const ts = a.createdAt?.toDate?.()?.getTime?.() || 0;
        if (ts && a.status === STATUS.PENDING && (now - ts) > sevenDaysMs) apptStuck++;
      });

      // login_attempts (lockouts)
      let lockouts = 0;
      try {
        const laSnap = await getDocs(collection(db, ...base, 'login_attempts'));
        laSnap.forEach(d => {
          const x = d.data();
          const until = x.lockedUntil?.toDate?.()?.getTime?.() || 0;
          if ((x.attempts || 0) >= 5 || (until && until > now)) lockouts++;
        });
      } catch {}

      // vehicle bookings
      let vbPending = 0, vbTotal = 0;
      try {
        const vbSnap = await getDocs(collection(db, ...base, 'vehicle_bookings'));
        vbTotal = vbSnap.size;
        vbSnap.forEach(d => { if (d.data().status === 'pending') vbPending++; });
      } catch {}

      setTbHealth({
        generatedAt: new Date().toLocaleString('th-TH'),
        users: { total: usersTotal, active: usersActive, inactive: usersTotal - usersActive },
        workflows: { total: wfSnap.size, pending: wfPending, approved: wfApproved, rejected: wfRejected, stuck: wfStuck, byType },
        appointments: { total: apptSnap.size, pending: apptPending, inside: apptInside, stuck: apptStuck },
        lockouts,
        vehicleBookings: { total: vbTotal, pending: vbPending },
      });
    } catch (err) {
      tbSetResult('health', false, 'เกิดข้อผิดพลาด: ' + err.message);
    }
    setTbHealthLoading(false);
  };

  // Tool 7: Backup - export all key collections to JSON
  const handleTbBackup = async () => {
    if (!window.confirm('สร้างไฟล์ backup JSON ของข้อมูลทั้งหมด? (อาจใช้เวลาสักครู่)')) return;
    setTbBusy(true);
    setTbBackupProgress('เริ่มต้น...');
    try {
      const base = ['artifacts', appId, 'public', 'data'];
      const collections = [
        'appointments',
        'approval_workflows',
        'employee_logs',
        'users',
        'equipment_requests',
        'equipment_stock',
        'vehicles',
        'vehicle_bookings',
        'audit_logs',
      ];
      const backup = {
        meta: {
          app: 'TBKK SOC System',
          appId,
          exportedAt: new Date().toISOString(),
          exportedBy: user?.staffId || 'ADMIN',
          version: 1,
        },
        data: {},
      };
      const serialize = (val) => {
        if (val === null || val === undefined) return val;
        if (val && typeof val.toDate === 'function') return { __ts: val.toDate().toISOString() };
        if (Array.isArray(val)) return val.map(serialize);
        if (typeof val === 'object') {
          const out = {};
          for (const k of Object.keys(val)) out[k] = serialize(val[k]);
          return out;
        }
        return val;
      };
      let totalDocs = 0;
      for (const c of collections) {
        setTbBackupProgress(`กำลังดึง ${c}...`);
        try {
          const snap = await getDocs(collection(db, ...base, c));
          backup.data[c] = snap.docs.map(d => ({ _id: d.id, ...serialize(d.data()) }));
          totalDocs += snap.size;
        } catch (err) {
          console.warn(`Backup skip ${c}:`, err.message);
          backup.data[c] = { _error: err.message };
        }
      }
      backup.meta.totalDocs = totalDocs;

      // Trigger download
      setTbBackupProgress('กำลังสร้างไฟล์...');
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tbkk-backup-${ts}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      try { await logAction('ADMIN_BACKUP_EXPORT', { staffId: user?.staffId, totalDocs, collections: collections.length }); } catch {}
      tbSetResult('backup', true, `ดาวน์โหลด backup สำเร็จ (${totalDocs} documents, ${collections.length} collections)`);
      setTbBackupProgress('');
    } catch (err) {
      tbSetResult('backup', false, 'เกิดข้อผิดพลาด: ' + err.message);
      setTbBackupProgress('');
    }
    setTbBusy(false);
  };

  // --- SMTP Settings handlers ---
  const handleSmtpSave = async () => {
    if (!firebaseReady || !user) return;
    const e = smtpEdit;
    // Basic validation
    if (!e.host?.trim()) { setSmtpResult({ ok: false, msg: 'กรุณากรอก SMTP Host' }); return; }
    const portNum = parseInt(e.port, 10);
    if (!portNum || portNum < 1 || portNum > 65535) {
      setSmtpResult({ ok: false, msg: 'กรุณากรอก Port ให้ถูกต้อง (1-65535)' });
      return;
    }
    if (e.enabled && (!e.user?.trim() || !e.pass?.trim())) {
      setSmtpResult({ ok: false, msg: 'ถ้าเปิดใช้งาน ต้องกรอก User + Password' });
      return;
    }
    if (e.from && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.from.trim())) {
      setSmtpResult({ ok: false, msg: 'รูปแบบอีเมล From ไม่ถูกต้อง' });
      return;
    }
    setSmtpSaving(true);
    setSmtpResult(null);
    try {
      const smtpRef = doc(db, 'artifacts', appId, 'public', 'data', 'smtp_settings', 'default');
      await setDoc(smtpRef, {
        host: e.host.trim(),
        port: portNum,
        secure: !!e.secure,
        user: e.user.trim(),
        pass: e.pass, // stored as-is (Firestore rules must restrict)
        from: e.from.trim(),
        fromName: e.fromName.trim() || 'SOC Systems - TBKK Group',
        enabled: !!e.enabled,
        updatedAt: Timestamp.now(),
        updatedBy: user?.staffId || 'ADMIN',
      }, { merge: true });
      try { await logAction('ADMIN_SMTP_UPDATE', { staffId: user?.staffId, host: e.host, port: portNum, enabled: !!e.enabled }); } catch {}

      // Reload config บน email server ทันที (ถ้า server ทำงานอยู่)
      let reloadMsg = '';
      try {
        const apiUrl = import.meta.env.VITE_EMAIL_API || 'http://localhost:3001';
        const r = await fetch(`${apiUrl}/api/config/smtp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            host: e.host.trim(),
            port: portNum,
            secure: !!e.secure,
            user: e.user.trim(),
            pass: e.pass,
            from: e.from.trim(),
            fromName: e.fromName.trim(),
            enabled: !!e.enabled,
          }),
        });
        if (r.ok) {
          const j = await r.json().catch(() => ({}));
          reloadMsg = j.hasSMTP ? ' + โหลดไปยัง email server แล้ว' : ' (SMTP ปิดใช้งาน)';
          // refresh health indicator
          try {
            const hr = await fetch(`${apiUrl}/api/health`);
            if (hr.ok) setSmtpServerHealth({ ok: true, detail: await hr.json().catch(() => ({})) });
          } catch {}
        } else {
          reloadMsg = ' (บันทึก Firestore แล้ว แต่ reload server ไม่สำเร็จ)';
        }
      } catch {
        reloadMsg = ' (บันทึก Firestore แล้ว — email server ออฟไลน์ จะใช้ตอน server รีสตาร์ต)';
      }

      setSmtpResult({ ok: true, msg: 'บันทึกการตั้งค่า SMTP สำเร็จ' + reloadMsg });
    } catch (err) {
      console.error('SMTP save error:', err);
      setSmtpResult({ ok: false, msg: 'บันทึกไม่สำเร็จ: ' + err.message });
    }
    setSmtpSaving(false);
  };

  const handleSmtpTest = async () => {
    const to = (smtpTestEmail || '').trim();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      setSmtpResult({ ok: false, msg: 'กรุณากรอกอีเมลปลายทางให้ถูกต้อง' });
      return;
    }
    setSmtpTestBusy(true);
    setSmtpResult(null);
    try {
      const apiUrl = import.meta.env.VITE_EMAIL_API || 'http://localhost:3001';
      const res = await fetch(`${apiUrl}/api/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject: '[TEST] SMTP ตั้งค่าสำเร็จ — SOC Systems TBKK',
          text: 'นี่คืออีเมลทดสอบจากระบบ SOC Systems\n\nถ้าคุณได้รับอีเมลนี้ แสดงว่า SMTP ทำงานถูกต้องแล้ว\n\n--\nTBKK Group',
          html: '<div style="font-family:Segoe UI,Tahoma,sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc"><h2 style="color:#0f172a;margin:0 0 12px">✅ SMTP ตั้งค่าสำเร็จ</h2><p style="color:#334155;font-size:14px;line-height:1.6">นี่คืออีเมลทดสอบจากระบบ <strong>SOC Systems (TBKK Group)</strong></p><p style="color:#334155;font-size:14px;line-height:1.6">ถ้าคุณได้รับอีเมลนี้ แสดงว่า SMTP ทำงานถูกต้องแล้ว ระบบสามารถส่งอีเมลอัตโนมัติได้</p><hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0"><p style="color:#64748b;font-size:12px">ส่งจาก: ' + (smtpEdit.fromName || 'SOC Systems') + ' &lt;' + (smtpEdit.from || smtpEdit.user || '-') + '&gt;<br>ทดสอบเมื่อ: ' + new Date().toLocaleString('th-TH') + '</p></div>',
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success !== false) {
        setSmtpResult({ ok: true, msg: `ส่งอีเมลทดสอบไปที่ ${to} สำเร็จ (ตรวจกล่องจดหมาย/สแปม)` });
      } else {
        setSmtpResult({ ok: false, msg: 'ส่งไม่สำเร็จ: ' + (json.error || json.message || `HTTP ${res.status}`) });
      }
    } catch (err) {
      setSmtpResult({ ok: false, msg: 'เชื่อมต่อ email server ไม่ได้: ' + err.message + ' — ต้องรัน server (node server/email-server.js) ก่อน' });
    }
    setSmtpTestBusy(false);
  };

  // --- User Management handlers ---
  const handleToggleUserActive = async (u) => {
    if (!firebaseReady || !user) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', u.docId);
      await updateDoc(docRef, { active: !u.active, updatedAt: Timestamp.now() });
    } catch (error) {
      console.error('Error toggling user:', error);
      alert('เกิดข้อผิดพลาด: ' + error.message);
    }
  };

  const handleResetPassword = async (u) => {
    if (!firebaseReady || !user) return;
    const newPass = window.prompt(`ตั้งรหัสผ่านใหม่ให้ ${u.name || u.docId}:`, '');
    if (!newPass) return;
    if (newPass.length < 6) { alert('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return; }
    try {
      const hash = await hashPassword(newPass);
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', u.docId);
      await updateDoc(docRef, { passwordHash: hash, updatedAt: Timestamp.now() });
      alert(`เปลี่ยนรหัสผ่านของ ${u.name || u.docId} สำเร็จ`);
    } catch (error) {
      console.error('Error resetting password:', error);
      alert('เกิดข้อผิดพลาด: ' + error.message);
    }
  };

  const handleAddUser = async () => {
    if (!firebaseReady || !user) return;
    if (!newUserForm.id.trim() || !newUserForm.name.trim()) {
      alert('กรุณากรอก ID และชื่อ');
      return;
    }
    try {
      const hash = await hashPassword('1234');
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', newUserForm.id.trim().toUpperCase());
      await setDoc(docRef, {
        name: newUserForm.name.trim(),
        department: newUserForm.department,
        role: newUserForm.role,
        passwordHash: hash,
        active: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
      alert('เพิ่มผู้ใช้สำเร็จ');
      setShowAddUserModal(false);
      setNewUserForm({ id: '', name: '', department: DEPARTMENTS[0], role: 'EMPLOYEE' });
    } catch (error) {
      console.error('Error adding user:', error);
      alert('เกิดข้อผิดพลาด: ' + error.message);
    }
  };

  // --- Filtered data ---
  const filteredUsers = allUsers.filter(u => {
    if (!userSearch) return true;
    const s = userSearch.toUpperCase();
    return (u.docId || '').toUpperCase().includes(s) || (u.name || '').toUpperCase().includes(s);
  });

  const filteredAuditLogs = auditLogs.filter(log => {
    let match = true;
    if (auditFilterUser) {
      const s = auditFilterUser.toUpperCase();
      match = match && ((log.userId || '').toUpperCase().includes(s) || (log.userName || '').toUpperCase().includes(s));
    }
    if (auditFilterDateFrom) {
      const logDate = log.timestamp?.toDate?.() || new Date(0);
      match = match && logDate >= new Date(auditFilterDateFrom);
    }
    if (auditFilterDateTo) {
      const logDate = log.timestamp?.toDate?.() || new Date(0);
      const endDate = new Date(auditFilterDateTo);
      endDate.setDate(endDate.getDate() + 1);
      match = match && logDate < endDate;
    }
    return match;
  });

  const filteredWorkflows = allWorkflows.filter(w => {
    const matchType = docTypeFilter === 'ALL' || w.type === docTypeFilter;
    const matchStatus = docStatusFilter === 'ALL' || w.status === docStatusFilter;
    return matchType && matchStatus;
  });

  const workflowTypes = ['ALL', 'VEHICLE_BOOKING', 'DRINK_ORDER', 'FOOD_ORDER', 'DRINK_FOOD_ORDER', 'OUTING_REQUEST', 'GOODS_IN_OUT', 'VISITOR', 'EQUIPMENT_REQUEST'];

  const handleToggleStock = async (item) => {
    if (!firebaseReady || !user) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'equipment_stock', item.code);
      await updateDoc(docRef, {
        available: !item.available,
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      console.error('Error toggling stock:', error);
      alert('เกิดข้อผิดพลาด: ' + error.message);
    }
  };

  const stockGroups = ['ALL', 'A', 'B', 'C', 'D', 'E'];
  const filteredStockItems = stockItems.filter(item => {
    const matchesSearch = !stockSearch ||
      item.code.toUpperCase().includes(stockSearch.toUpperCase()) ||
      item.name.includes(stockSearch);
    const matchesGroup = stockGroupFilter === 'ALL' || item.group === stockGroupFilter;
    return matchesSearch && matchesGroup;
  });

  const filteredAppointments = appointments.filter(a => {
    const matchesSearch = !search || 
      a.name.toUpperCase().includes(search.toUpperCase()) ||
      a.refCode.toUpperCase().includes(search.toUpperCase()) ||
      a.hostStaffId?.toUpperCase().includes(search.toUpperCase());
    const matchesStatus = statusFilter === 'ALL' || a.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleEdit = (appt) => {
    setEditingAppt(appt.id);
    const count = appt.count || 1;
    const additionalNames = appt.additionalNames || [];
    // เติม additionalNames ให้ครบตาม count
    while (additionalNames.length < count - 1) {
      additionalNames.push('');
    }
    setEditFormData({
      name: appt.name || '',
      company: appt.company || '',
      department: appt.department || DEPARTMENTS[0],
      hostStaffId: appt.hostStaffId || '',
      appointmentDate: appt.appointmentDate || getTodayStr(),
      purpose: appt.purpose || '',
      vehicleType: appt.vehicleType || 'รถยนต์',
      licensePlate: appt.licensePlate || '',
      count: count,
      additionalNames: additionalNames,
      status: appt.status || STATUS.PENDING,
      cardNo: appt.cardNo || '',
      refCode: appt.refCode || ''
    });
  };

  const handleSave = async () => {
    if (!firebaseReady || !user || !editingAppt) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'appointments', editingAppt);
      const updateData = {
        ...editFormData,
        updatedAt: Timestamp.now(),
        updatedBy: 'ADMIN'
      };
      // ลบ refCode ออกเพราะไม่ควรแก้ไข
      delete updateData.refCode;
      await updateDoc(docRef, updateData);
      setEditingAppt(null);
      setEditFormData(null);
      alert('บันทึกข้อมูลสำเร็จ');
    } catch (error) {
      console.error('Error updating appointment:', error);
      alert('เกิดข้อผิดพลาด: ' + error.message);
    }
  };

  const handleCreateNew = async () => {
    if (!firebaseReady || !user) return;
    const refCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const newAppt = {
      name: '',
      company: '',
      department: DEPARTMENTS[0],
      hostStaffId: '',
      appointmentDate: getTodayStr(),
      purpose: '',
      vehicleType: 'รถยนต์',
      licensePlate: '',
      count: 1,
      additionalNames: [],
      status: STATUS.PENDING,
      refCode,
      createdAt: Timestamp.now(),
      createdBy: 'ADMIN'
    };
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'appointments'), newAppt);
      alert('สร้างนัดหมายใหม่สำเร็จ');
    } catch (error) {
      console.error('Error creating appointment:', error);
      alert('เกิดข้อผิดพลาด: ' + error.message);
    }
  };

  const handleDelete = async (apptId) => {
    if (!firebaseReady || !user) return;
    if (!window.confirm('คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลนี้?')) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'appointments', apptId);
      await deleteDoc(docRef);
      alert('ลบข้อมูลสำเร็จ');
    } catch (error) {
      console.error('Error deleting appointment:', error);
      alert('เกิดข้อผิดพลาด: ' + error.message);
    }
  };

  const handleCancelEdit = () => {
    setEditingAppt(null);
    setEditFormData(null);
  };

  const stats = {
    total: appointments.length,
    pending: appointments.filter(a => a.status === STATUS.PENDING).length,
    inside: appointments.filter(a => a.status === STATUS.INSIDE).length,
    completed: appointments.filter(a => a.status === STATUS.COMPLETED).length
  };

  return (
    <div className="space-y-8 text-left animate-in fade-in duration-500 font-sans">
      {/* Header */}
      <div className="flex flex-col gap-4 bg-white p-4 md:p-8 rounded-[2rem] md:rounded-[2.5rem] border border-slate-200 shadow-sm text-left">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-purple-600 to-indigo-700 rounded-xl shadow-md shrink-0">
            <Settings className="text-white w-6 h-6 md:w-8 md:h-8" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-[10px] md:text-xs text-slate-400 font-black uppercase tracking-widest">
              <span>Admin Dashboard</span>
              <ChevronRight size={12} className="text-slate-300" />
              <span className="text-indigo-600">
                {activeTab === 'overview' && 'ภาพรวม'}
                {activeTab === 'documents' && 'เอกสาร'}
                {activeTab === 'users' && 'ผู้ใช้งาน'}
                {activeTab === 'stock' && 'สต็อก'}
                {activeTab === 'fleet' && 'ยานพาหนะ'}
                {activeTab === 'security' && 'ความปลอดภัย'}
                {activeTab === 'system' && 'ตั้งค่าระบบ'}
              </span>
            </div>
            <h2 className="text-xl md:text-3xl font-black uppercase tracking-tight text-slate-900 font-sans mt-1">
              {activeTab === 'overview' && 'ภาพรวมระบบ'}
              {activeTab === 'documents' && 'จัดการเอกสาร'}
              {activeTab === 'users' && 'จัดการผู้ใช้งาน'}
              {activeTab === 'stock' && 'จัดการสต็อก'}
              {activeTab === 'fleet' && 'จัดการยานพาหนะ'}
              {activeTab === 'security' && 'ความปลอดภัย'}
              {activeTab === 'system' && 'ตั้งค่าระบบ'}
            </h2>
            <p className="text-slate-400 text-xs md:text-sm mt-1">
              {activeTab === 'overview' && 'สรุปสถานะ, นัดหมายผู้มาติดต่อ, และทางลัดสู่ฟอร์มต่างๆ'}
              {activeTab === 'documents' && 'ดูและจัดการเอกสารอนุมัติ, ใบเบิกอุปกรณ์'}
              {activeTab === 'users' && 'แก้ไขข้อมูลพนักงาน, เพิ่มผู้ใช้, ดูประวัติการใช้งาน'}
              {activeTab === 'stock' && 'จัดการสต็อกอุปกรณ์สำนักงาน'}
              {activeTab === 'security' && 'ตรวจสอบการโจมตี สแปม และการเข้าถึงที่ผิดปกติ'}
              {activeTab === 'fleet' && 'จัดการรถบริษัทและการจอง'}
              {activeTab === 'system' && 'ตั้งค่าอีเมล SMTP และเครื่องมือแก้ไขปัญหา'}
            </p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white border border-slate-200 rounded-[2rem] p-2 shadow-sm overflow-x-auto">
        <div className="flex gap-1.5 min-w-max">
          {[
            { id: 'overview',  label: 'ภาพรวม',     icon: LayoutDashboard, bg: 'bg-indigo-600',  text: 'text-indigo-600'  },
            { id: 'documents', label: 'เอกสาร',      icon: FileSearch,      bg: 'bg-emerald-600', text: 'text-emerald-600' },
            { id: 'users',     label: 'ผู้ใช้งาน',    icon: Users,           bg: 'bg-blue-600',    text: 'text-blue-600'    },
            { id: 'stock',     label: 'สต็อก',       icon: Package,         bg: 'bg-amber-600',   text: 'text-amber-600'   },
            { id: 'fleet',     label: 'ยานพาหนะ',    icon: Car,             bg: 'bg-sky-600',     text: 'text-sky-600'     },
            { id: 'security',  label: 'ความปลอดภัย', icon: Shield,          bg: 'bg-red-600',     text: 'text-red-600'     },
            { id: 'system',    label: 'ตั้งค่าระบบ',  icon: Settings,        bg: 'bg-rose-600',    text: 'text-rose-600'    },
          ].map(t => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-2 px-4 md:px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wide whitespace-nowrap transition-all active:scale-95 ${
                  active ? `${t.bg} text-white shadow-md` : `bg-slate-50 hover:bg-slate-100 ${t.text}`
                }`}
              >
                <Icon size={16} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Statistics (Overview only) */}
      {activeTab === 'overview' && (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">ทั้งหมด</p>
              <p className="text-3xl font-black text-slate-900 mt-2">{stats.total}</p>
            </div>
            <Database className="text-blue-600 w-8 h-8" />
          </div>
        </div>
        <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-blue-400 uppercase tracking-widest font-black">รอดำเนินการ</p>
              <p className="text-3xl font-black text-blue-600 mt-2">{stats.pending}</p>
            </div>
            <Clock className="text-blue-600 w-8 h-8" />
          </div>
        </div>
        <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-emerald-400 uppercase tracking-widest font-black">อยู่ในพื้นที่</p>
              <p className="text-3xl font-black text-emerald-600 mt-2">{stats.inside}</p>
            </div>
            <Navigation className="text-emerald-600 w-8 h-8" />
          </div>
        </div>
        <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">เสร็จสิ้น</p>
              <p className="text-3xl font-black text-slate-600 mt-2">{stats.completed}</p>
            </div>
            <CheckCircle2 className="text-slate-600 w-8 h-8" />
          </div>
        </div>
      </div>
      )}

      {/* Employee Quick Editor (Users tab) */}
      {activeTab === 'users' && (
      <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm">
        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-4 flex items-center gap-3">
          <Edit size={24} className="text-amber-600" />
          แก้ไขข้อมูลพนักงาน (Remote)
        </h3>
        <p className="text-xs text-slate-400 mb-4">ค้นหาพนักงานด้วยรหัส เพื่อแก้ไขชื่อ แผนก สิทธิ์ หรือรหัสผ่าน โดยพนักงานไม่ต้องเดินมาหา</p>
        {/* Search row */}
        <div className="flex gap-3 mb-4">
          <input
            className="flex-1 bg-white border border-slate-200 rounded-xl py-3 px-4 text-slate-900 uppercase focus:ring-4 focus:ring-amber-50 focus:border-amber-500 outline-none transition-all placeholder:text-slate-300 font-mono"
            placeholder="รหัสพนักงาน เช่น EMP-EEE-01"
            value={empEditorId}
            onChange={(e) => { setEmpEditorId(e.target.value); setEmpEditorResult(null); }}
            onKeyDown={(e) => e.key === 'Enter' && handleEmpEditorSearch()}
          />
          <button
            onClick={handleEmpEditorSearch}
            className="bg-slate-900 hover:bg-slate-700 text-white px-7 py-3 rounded-xl font-bold transition active:scale-95 flex items-center gap-2"
          ><Search size={16} /> ค้นหา</button>
        </div>

        {/* Result message (error / success) */}
        {empEditorResult && (
          <div className={`mb-4 px-4 py-2 rounded-xl text-sm font-bold ${empEditorResult.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {empEditorResult.msg}
          </div>
        )}

        {/* Editor card */}
        {empEditorData && empEditorEdit && (
          <div className="border border-amber-200 bg-amber-50 rounded-2xl p-6 space-y-4">
            {/* Header: employee ID badge */}
            <div className="flex items-center gap-3 mb-2">
              <span className="bg-amber-500 text-white text-xs font-black px-3 py-1 rounded-lg uppercase tracking-widest">{empEditorData.docId}</span>
              <span className={`text-xs font-bold px-2 py-1 rounded-lg ${empEditorEdit.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                {empEditorEdit.active ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Name */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">ชื่อ-นามสกุล</label>
                <input
                  className="w-full bg-white border border-slate-300 rounded-xl py-2.5 px-4 text-slate-900 focus:ring-4 focus:ring-amber-100 focus:border-amber-500 outline-none transition-all"
                  value={empEditorEdit.name}
                  onChange={(e) => setEmpEditorEdit({ ...empEditorEdit, name: e.target.value })}
                />
              </div>
              {/* Department */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">แผนก</label>
                <select
                  className="w-full bg-white border border-slate-300 rounded-xl py-2.5 px-4 text-slate-900 focus:ring-4 focus:ring-amber-100 focus:border-amber-500 outline-none transition-all"
                  value={empEditorEdit.department}
                  onChange={(e) => setEmpEditorEdit({ ...empEditorEdit, department: e.target.value })}
                >
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              {/* Role */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">สิทธิ์ (Role)</label>
                <select
                  className="w-full bg-white border border-slate-300 rounded-xl py-2.5 px-4 text-slate-900 focus:ring-4 focus:ring-amber-100 focus:border-amber-500 outline-none transition-all"
                  value={empEditorEdit.role}
                  onChange={(e) => setEmpEditorEdit({ ...empEditorEdit, role: e.target.value })}
                >
                  {['EMPLOYEE','HOST','SECURITY','ADMIN'].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {/* Active toggle */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">สถานะบัญชี</label>
                <button
                  onClick={() => setEmpEditorEdit({ ...empEditorEdit, active: !empEditorEdit.active })}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm border transition-all ${empEditorEdit.active ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-100 border-slate-300 text-slate-500 hover:bg-slate-200'}`}
                >
                  {empEditorEdit.active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                  {empEditorEdit.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                </button>
              </div>
            </div>

            {/* New password (optional) */}
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">รหัสผ่านใหม่ <span className="text-slate-400 normal-case font-normal">(เว้นว่างถ้าไม่ต้องการเปลี่ยน)</span></label>
              <input
                type="text"
                className="w-full bg-white border border-slate-300 rounded-xl py-2.5 px-4 text-slate-900 focus:ring-4 focus:ring-amber-100 focus:border-amber-500 outline-none transition-all placeholder:text-slate-300"
                placeholder="ใส่รหัสผ่านใหม่ (อย่างน้อย 4 ตัว)"
                value={empEditorNewPass}
                onChange={(e) => setEmpEditorNewPass(e.target.value)}
              />
            </div>

            {/* Save button */}
            <button
              onClick={handleEmpEditorSave}
              disabled={empEditorSaving}
              className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white py-3 rounded-xl font-black text-sm tracking-widest uppercase transition active:scale-95 flex items-center justify-center gap-2"
            >
              {empEditorSaving ? <><RotateCcw size={16} className="animate-spin" /> กำลังบันทึก...</> : <><Save size={16} /> บันทึกการเปลี่ยนแปลง</>}
            </button>
          </div>
        )}
      </div>
      )}

      {/* Quick Access to Forms (Overview tab) */}
      {activeTab === 'overview' && (
      <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm">
        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-6 flex items-center gap-3">
          <Settings size={24} className="text-purple-600" />
          จัดการฟอร์มต่างๆ
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <button
            onClick={() => window.open('/vehicle.html', '_blank')}
            className="flex flex-col items-center gap-3 bg-white border border-slate-200 p-6 rounded-[1.8rem] hover:border-blue-600 hover:shadow-lg transition-all active:scale-95 group"
          >
            <div className="p-4 bg-slate-50 rounded-2xl group-hover:scale-110 transition-transform">
              <Car className="text-blue-600 w-6 h-6" />
            </div>
            <p className="font-black text-slate-700 uppercase tracking-widest text-[10px] text-center">ใบขออนุญาตใช้รถ</p>
          </button>
          <button
            onClick={() => window.open('/drink.html', '_blank')}
            className="flex flex-col items-center gap-3 bg-white border border-slate-200 p-6 rounded-[1.8rem] hover:border-orange-600 hover:shadow-lg transition-all active:scale-95 group"
          >
            <div className="p-4 bg-slate-50 rounded-2xl group-hover:scale-110 transition-transform flex gap-1">
              <Utensils className="text-orange-600 w-6 h-6" />
              <Coffee className="text-emerald-600 w-6 h-6" />
            </div>
            <p className="font-black text-slate-700 uppercase tracking-widest text-[10px] text-center">สั่งอาหาร / เครื่องดื่ม</p>
          </button>
          <button
            onClick={() => window.open('/outing.html', '_blank')}
            className="flex flex-col items-center gap-3 bg-white border border-slate-200 p-6 rounded-[1.8rem] hover:border-red-600 hover:shadow-lg transition-all active:scale-95 group"
          >
            <div className="p-4 bg-slate-50 rounded-2xl group-hover:scale-110 transition-transform">
              <ExternalLink className="text-red-600 w-6 h-6" />
            </div>
            <p className="font-black text-slate-700 uppercase tracking-widest text-[10px] text-center">ขอออกข้างนอก</p>
          </button>
          <button
            onClick={() => {
              setActiveTab('documents');
              setShowEquipmentSection(true);
            }}
            className="flex flex-col items-center gap-3 bg-white border border-slate-200 p-6 rounded-[1.8rem] hover:border-purple-600 hover:shadow-lg transition-all active:scale-95 group"
          >
            <div className="p-4 bg-slate-50 rounded-2xl group-hover:scale-110 transition-transform">
              <Package className="text-purple-600 w-6 h-6" />
            </div>
            <p className="font-black text-slate-700 uppercase tracking-widest text-[10px] text-center">เบิกอุปกรณ์ในสำนักงาน</p>
            <span className="text-xs text-purple-600 font-bold">({equipmentRequests.length})</span>
          </button>
          <button
            onClick={() => window.open('/goods.html', '_blank')}
            className="flex flex-col items-center gap-3 bg-white border border-slate-200 p-6 rounded-[1.8rem] hover:border-amber-600 hover:shadow-lg transition-all active:scale-95 group"
          >
            <div className="p-4 bg-slate-50 rounded-2xl group-hover:scale-110 transition-transform">
              <Truck className="text-amber-600 w-6 h-6" />
            </div>
            <p className="font-black text-slate-700 uppercase tracking-widest text-[10px] text-center">นำของเข้า / ของออก</p>
          </button>
        </div>
      </div>
      )}

      {/* Equipment Requests Header (Documents tab) */}
      {activeTab === 'documents' && (
      <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setShowEquipmentSection(!showEquipmentSection)}
        >
          <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
            <Package size={24} className="text-purple-600" />
            ฟอร์มเบิกอุปกรณ์
            <span className="text-sm font-bold text-slate-400">({equipmentRequests.length} รายการ)</span>
          </h3>
          <ChevronRight
            size={24}
            className={`text-slate-400 transition-transform duration-200 ${showEquipmentSection ? 'rotate-90' : ''}`}
          />
        </div>
      </div>
      )}

      {/* Equipment Requests Management (Documents tab) */}
      {activeTab === 'documents' && showEquipmentSection && (
        <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
          <div className="p-8 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-500 font-sans">
                จัดการฟอร์มเบิกอุปกรณ์ ({equipmentRequests.length})
              </h3>
              <button
                onClick={() => window.open('/equipment.html', '_blank')}
                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-xl font-black text-xs transition flex items-center gap-2"
              >
                <Package size={16} /> สร้างฟอร์มใหม่
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-sans">
              <thead>
                <tr className="text-slate-400 text-[10px] uppercase tracking-[0.2em] border-b border-slate-100">
                  <th className="px-6 py-4 font-black">วันที่</th>
                  <th className="px-6 py-4 font-black">รหัสพนักงาน</th>
                  <th className="px-6 py-4 font-black">ชื่อ-นามสกุล</th>
                  <th className="px-6 py-4 font-black">รหัสฝ่าย</th>
                  <th className="px-6 py-4 font-black text-right">ดำเนินการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 font-sans text-left">
                {equipmentRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50 group transition-colors font-sans">
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-slate-900">{req.date || '-'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-mono font-bold text-slate-700 uppercase">{req.employeeId || '-'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-slate-900">{req.employeeName || '-'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-slate-600">{req.deptCode || '-'}</span>
                    </td>
                    <td className="px-6 py-4 text-right font-sans text-right">
                      <div className="flex justify-end gap-2 font-sans">
                        <button
                          onClick={() => window.open(`/equipment.html?id=${req.id}`, '_blank')}
                          className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-200 hover:border-blue-600 transition-all shadow-sm active:scale-90 font-sans"
                          title="แก้ไข/พิมพ์"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={async () => {
                            if (!firebaseReady || !user) return;
                            if (!window.confirm('คุณแน่ใจหรือไม่ว่าต้องการลบฟอร์มนี้?')) return;
                            try {
                              const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'equipment_requests', req.id);
                              await deleteDoc(docRef);
                              alert('ลบข้อมูลสำเร็จ');
                            } catch (error) {
                              console.error('Error deleting equipment request:', error);
                              alert('เกิดข้อผิดพลาด: ' + error.message);
                            }
                          }}
                          className="p-2 bg-red-50 text-red-600 rounded-xl border border-red-200 hover:border-red-600 transition-all shadow-sm active:scale-90 font-sans"
                          title="ลบ"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {equipmentRequests.length === 0 && (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-slate-400 font-sans">
                      ยังไม่มีฟอร์มเบิกอุปกรณ์
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stock Management Section (Stock tab) */}
      {activeTab === 'stock' && (
      <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setShowStockSection(!showStockSection)}
        >
          <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
            <Package size={24} className="text-amber-600" />
            จัดการสต็อกอุปกรณ์
            <span className="text-sm font-bold text-slate-400">({stockItems.length} รายการ)</span>
          </h3>
          <ChevronRight
            size={24}
            className={`text-slate-400 transition-transform duration-200 ${showStockSection ? 'rotate-90' : ''}`}
          />
        </div>
      </div>
      )}

      {activeTab === 'stock' && showStockSection && (
        <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
          <div className="p-8 border-b border-slate-100 bg-slate-50/50">
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                <input
                  className="w-full bg-white border border-slate-200 rounded-2xl py-3 pl-12 pr-6 text-slate-900 focus:ring-4 focus:ring-amber-50 focus:border-amber-600 outline-none transition-all shadow-inner placeholder:text-slate-300"
                  placeholder="ค้นหาด้วยรหัสหรือชื่ออุปกรณ์..."
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                {stockGroups.map(g => (
                  <button
                    key={g}
                    onClick={() => setStockGroupFilter(g)}
                    className={`px-4 py-3 rounded-2xl font-black text-xs transition-all ${
                      stockGroupFilter === g
                        ? 'bg-amber-600 text-white shadow-lg'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {g === 'ALL' ? 'ทั้งหมด' : `กลุ่ม ${g}`}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-sans">
              <thead>
                <tr className="text-slate-400 text-[10px] uppercase tracking-[0.2em] border-b border-slate-100">
                  <th className="px-6 py-4 font-black">Code</th>
                  <th className="px-6 py-4 font-black">ชื่ออุปกรณ์</th>
                  <th className="px-6 py-4 font-black text-center">กลุ่ม</th>
                  <th className="px-6 py-4 font-black text-center">สถานะ</th>
                  <th className="px-6 py-4 font-black text-center">เปลี่ยนสถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 font-sans text-left">
                {filteredStockItems.map((item) => (
                  <tr key={item.code} className={`hover:bg-slate-50 group transition-colors font-sans ${!item.available ? 'bg-red-50' : ''}`}>
                    <td className="px-6 py-4">
                      <span className="text-sm font-mono font-black text-slate-700 uppercase">{item.code}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-slate-900">{item.name}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-slate-100 text-slate-600 font-mono font-black py-1 px-3 rounded-lg border border-slate-200 text-xs">
                        {item.group}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {item.available ? (
                        <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 font-black py-1.5 px-4 rounded-xl border border-emerald-200 text-xs">
                          <CheckCircle2 size={14} /> มีของ
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 font-black py-1.5 px-4 rounded-xl border border-red-200 text-xs">
                          <AlertCircle size={14} /> หมด
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => handleToggleStock(item)}
                        className={`px-5 py-2 rounded-xl font-black text-xs transition-all active:scale-95 shadow-sm ${
                          item.available
                            ? 'bg-red-500 hover:bg-red-600 text-white border border-red-600'
                            : 'bg-emerald-500 hover:bg-emerald-600 text-white border border-emerald-600'
                        }`}
                      >
                        {item.available ? 'ตั้งเป็น หมด' : 'ตั้งเป็น มีของ'}
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredStockItems.length === 0 && (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-slate-400 font-sans">
                      {stockItems.length === 0 ? 'ยังไม่มีข้อมูลสต็อก (กรุณารัน seed script ก่อน)' : 'ไม่พบรายการที่ค้นหา'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center text-xs text-slate-400">
            <span>แสดง {filteredStockItems.length} จาก {stockItems.length} รายการ</span>
            <span>
              มีของ: {stockItems.filter(i => i.available).length} | หมด: {stockItems.filter(i => !i.available).length}
            </span>
          </div>
        </div>
      )}

      {/* ===== Feature 1: Admin User Management (Users tab) ===== */}
      {activeTab === 'users' && (
      <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setShowUserManagement(!showUserManagement)}
        >
          <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
            <Users size={24} className="text-blue-600" />
            จัดการ Users
            <span className="text-sm font-bold text-slate-400">({allUsers.length} คน)</span>
          </h3>
          <ChevronRight
            size={24}
            className={`text-slate-400 transition-transform duration-200 ${showUserManagement ? 'rotate-90' : ''}`}
          />
        </div>
      </div>
      )}

      {activeTab === 'users' && showUserManagement && (
        <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
          <div className="p-8 border-b border-slate-100 bg-slate-50/50">
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                <input
                  className="w-full bg-white border border-slate-200 rounded-2xl py-3 pl-12 pr-6 text-slate-900 focus:ring-4 focus:ring-blue-50 focus:border-blue-600 outline-none transition-all shadow-inner placeholder:text-slate-300"
                  placeholder="ค้นหาด้วยชื่อหรือ ID..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
              </div>
              <button
                onClick={() => setShowAddUserModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl font-black text-xs transition flex items-center gap-2 shadow-lg active:scale-95"
              >
                <UserPlus size={16} /> เพิ่มผู้ใช้ใหม่
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-sans">
              <thead>
                <tr className="text-slate-400 text-[10px] uppercase tracking-[0.2em] border-b border-slate-100">
                  <th className="px-6 py-4 font-black">ID</th>
                  <th className="px-6 py-4 font-black">ชื่อ</th>
                  <th className="px-6 py-4 font-black">แผนก</th>
                  <th className="px-6 py-4 font-black text-center">Role</th>
                  <th className="px-6 py-4 font-black text-center">สถานะ</th>
                  <th className="px-6 py-4 font-black text-right">ดำเนินการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 font-sans text-left">
                {filteredUsers.map((u) => (
                  <tr key={u.docId} className={`hover:bg-slate-50 group transition-colors font-sans ${u.active === false ? 'bg-red-50/50' : ''}`}>
                    <td className="px-6 py-4">
                      <span className="text-sm font-mono font-black text-slate-700 uppercase">{u.docId}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-slate-900">{u.name || '-'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-600">{u.department || '-'}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-purple-50 text-purple-700 font-black py-1 px-3 rounded-lg border border-purple-200 text-xs">
                        {u.role || '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {u.active !== false ? (
                        <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 font-black py-1.5 px-4 rounded-xl border border-emerald-200 text-xs">
                          <CheckCircle2 size={14} /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 font-black py-1.5 px-4 rounded-xl border border-red-200 text-xs">
                          <AlertCircle size={14} /> Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleToggleUserActive(u)}
                          className={`p-2 rounded-xl border transition-all shadow-sm active:scale-90 ${
                            u.active !== false
                              ? 'bg-red-50 text-red-600 border-red-200 hover:border-red-600'
                              : 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:border-emerald-600'
                          }`}
                          title={u.active !== false ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}
                        >
                          {u.active !== false ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                        </button>
                        <button
                          onClick={() => handleResetPassword(u)}
                          className="p-2 bg-amber-50 text-amber-600 rounded-xl border border-amber-200 hover:border-amber-600 transition-all shadow-sm active:scale-90"
                          title="เปลี่ยนรหัสผ่าน"
                        >
                          <RotateCcw size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan="6" className="px-6 py-12 text-center text-slate-400 font-sans">
                      {allUsers.length === 0 ? 'ยังไม่มีข้อมูลผู้ใช้' : 'ไม่พบผู้ใช้ที่ค้นหา'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center text-xs text-slate-400">
            <span>แสดง {filteredUsers.length} จาก {allUsers.length} คน</span>
            <span>
              Active: {allUsers.filter(u => u.active !== false).length} | Inactive: {allUsers.filter(u => u.active === false).length}
            </span>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddUserModal(false)}>
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
                <UserPlus size={24} className="text-blue-600" />
                เพิ่มผู้ใช้ใหม่
              </h3>
              <button onClick={() => setShowAddUserModal(false)} className="p-2 hover:bg-slate-100 rounded-xl transition">
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">ID (รหัสพนักงาน)</label>
                <input
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-slate-900 uppercase font-mono focus:ring-4 focus:ring-blue-50 focus:border-blue-600 outline-none transition-all"
                  value={newUserForm.id}
                  onChange={(e) => setNewUserForm({ ...newUserForm, id: e.target.value })}
                  placeholder="เช่น EMP001"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">ชื่อ</label>
                <input
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-slate-900 focus:ring-4 focus:ring-blue-50 focus:border-blue-600 outline-none transition-all"
                  value={newUserForm.name}
                  onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                  placeholder="ชื่อ-นามสกุล"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">แผนก</label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-slate-900 focus:ring-4 focus:ring-blue-50 focus:border-blue-600 outline-none transition-all"
                  value={newUserForm.department}
                  onChange={(e) => setNewUserForm({ ...newUserForm, department: e.target.value })}
                >
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Role</label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-slate-900 focus:ring-4 focus:ring-blue-50 focus:border-blue-600 outline-none transition-all"
                  value={newUserForm.role}
                  onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                >
                  <option value="EMPLOYEE">EMPLOYEE</option>
                  <option value="HOST">HOST</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="SECURITY">SECURITY</option>
                  <option value="GUEST">GUEST</option>
                </select>
              </div>
              <p className="text-xs text-slate-400">* รหัสผ่านเริ่มต้นจะถูกตั้งเป็น "1234"</p>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => setShowAddUserModal(false)}
                  className="px-6 py-3 text-slate-400 font-bold hover:text-slate-900 transition"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleAddUser}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-2xl font-black shadow-lg active:scale-95 flex items-center gap-2"
                >
                  <Save size={18} /> บันทึก
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Feature 2: Audit Log Viewer (Users tab) ===== */}
      {activeTab === 'users' && (
      <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setShowAuditLogs(!showAuditLogs)}
        >
          <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
            <History size={24} className="text-amber-600" />
            ดูประวัติการใช้งาน (Audit Log)
            <span className="text-sm font-bold text-slate-400">({auditLogs.length} รายการ)</span>
          </h3>
          <ChevronRight
            size={24}
            className={`text-slate-400 transition-transform duration-200 ${showAuditLogs ? 'rotate-90' : ''}`}
          />
        </div>
      </div>
      )}

      {activeTab === 'users' && showAuditLogs && (
        <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
          <div className="p-8 border-b border-slate-100 bg-slate-50/50">
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                <input
                  className="w-full bg-white border border-slate-200 rounded-2xl py-3 pl-12 pr-6 text-slate-900 focus:ring-4 focus:ring-amber-50 focus:border-amber-600 outline-none transition-all shadow-inner placeholder:text-slate-300"
                  placeholder="ค้นหาด้วยชื่อผู้ใช้..."
                  value={auditFilterUser}
                  onChange={(e) => setAuditFilterUser(e.target.value)}
                />
              </div>
              <div className="flex gap-2 items-center">
                <label className="text-xs font-black text-slate-400 uppercase">จาก</label>
                <input
                  type="date"
                  className="bg-white border border-slate-200 rounded-2xl py-3 px-4 text-slate-900 text-sm focus:ring-4 focus:ring-amber-50 focus:border-amber-600 outline-none transition-all"
                  value={auditFilterDateFrom}
                  onChange={(e) => setAuditFilterDateFrom(e.target.value)}
                />
                <label className="text-xs font-black text-slate-400 uppercase">ถึง</label>
                <input
                  type="date"
                  className="bg-white border border-slate-200 rounded-2xl py-3 px-4 text-slate-900 text-sm focus:ring-4 focus:ring-amber-50 focus:border-amber-600 outline-none transition-all"
                  value={auditFilterDateTo}
                  onChange={(e) => setAuditFilterDateTo(e.target.value)}
                />
              </div>
            </div>
          </div>
          {auditLogsLoading ? (
            <div className="px-6 py-12 text-center text-slate-400">กำลังโหลด...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-sans">
                <thead>
                  <tr className="text-slate-400 text-[10px] uppercase tracking-[0.2em] border-b border-slate-100">
                    <th className="px-6 py-4 font-black">เวลา</th>
                    <th className="px-6 py-4 font-black">ผู้ใช้</th>
                    <th className="px-6 py-4 font-black">การกระทำ</th>
                    <th className="px-6 py-4 font-black">รายละเอียด</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 font-sans text-left">
                  {filteredAuditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 group transition-colors font-sans">
                      <td className="px-6 py-4">
                        <span className="text-xs font-mono text-slate-500">
                          {log.timestamp?.toDate?.() ? log.timestamp.toDate().toLocaleString('th-TH') : '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-slate-900">{log.userName || log.userId || '-'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="bg-blue-50 text-blue-700 font-black py-1 px-3 rounded-lg border border-blue-200 text-xs">
                          {log.action || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-600 max-w-xs truncate block">{log.details || log.description || '-'}</span>
                      </td>
                    </tr>
                  ))}
                  {filteredAuditLogs.length === 0 && (
                    <tr>
                      <td colSpan="4" className="px-6 py-12 text-center text-slate-400 font-sans">
                        {auditLogs.length === 0 ? 'ยังไม่มีประวัติการใช้งาน' : 'ไม่พบรายการที่ค้นหา'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-400">
            แสดง {filteredAuditLogs.length} จาก {auditLogs.length} รายการ (สูงสุด 100 รายการล่าสุด)
          </div>
        </div>
      )}

      {/* ===== Feature 3: All Documents Viewer (Documents tab) ===== */}
      {activeTab === 'documents' && (
      <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setShowAllDocs(!showAllDocs)}
        >
          <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
            <FileSearch size={24} className="text-emerald-600" />
            ดูเอกสารทั้งหมด
            <span className="text-sm font-bold text-slate-400">({allWorkflows.length} รายการ)</span>
          </h3>
          <ChevronRight
            size={24}
            className={`text-slate-400 transition-transform duration-200 ${showAllDocs ? 'rotate-90' : ''}`}
          />
        </div>
      </div>
      )}

      {activeTab === 'documents' && showAllDocs && (
        <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
          <div className="p-8 border-b border-slate-100 bg-slate-50/50">
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex gap-2 flex-wrap">
                {workflowTypes.map(t => (
                  <button
                    key={t}
                    onClick={() => setDocTypeFilter(t)}
                    className={`px-4 py-2 rounded-2xl font-black text-xs transition-all ${
                      docTypeFilter === t
                        ? 'bg-emerald-600 text-white shadow-lg'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {t === 'ALL' ? 'ทั้งหมด' : t.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                {['ALL', 'pending', 'approved', 'rejected', 'completed'].map(s => (
                  <button
                    key={s}
                    onClick={() => setDocStatusFilter(s)}
                    className={`px-4 py-2 rounded-2xl font-black text-xs transition-all ${
                      docStatusFilter === s
                        ? 'bg-indigo-600 text-white shadow-lg'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {s === 'ALL' ? 'ทุกสถานะ' : s}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-sans">
              <thead>
                <tr className="text-slate-400 text-[10px] uppercase tracking-[0.2em] border-b border-slate-100">
                  <th className="px-6 py-4 font-black">ประเภท</th>
                  <th className="px-6 py-4 font-black">ผู้ขอ</th>
                  <th className="px-6 py-4 font-black">แผนก</th>
                  <th className="px-6 py-4 font-black text-center">สถานะ</th>
                  <th className="px-6 py-4 font-black text-center">วันที่</th>
                  <th className="px-6 py-4 font-black text-right">ดำเนินการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 font-sans text-left">
                {filteredWorkflows.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-50 group transition-colors font-sans">
                    <td className="px-6 py-4">
                      <span className="bg-slate-100 text-slate-700 font-black py-1 px-3 rounded-lg border border-slate-200 text-xs">
                        {(w.type || '-').replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-bold text-slate-900">{w.requesterName || w.requesterId || '-'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-600">{w.department || '-'}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {w.status === 'approved' || w.status === 'completed' ? (
                        <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 font-black py-1.5 px-4 rounded-xl border border-emerald-200 text-xs">
                          <CheckCircle2 size={14} /> {w.status}
                        </span>
                      ) : w.status === 'rejected' ? (
                        <span className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 font-black py-1.5 px-4 rounded-xl border border-red-200 text-xs">
                          <AlertCircle size={14} /> {w.status}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 font-black py-1.5 px-4 rounded-xl border border-amber-200 text-xs">
                          <Clock size={14} /> {w.status || 'pending'}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-xs font-mono text-slate-500">
                        {w.createdAt?.toDate?.() ? w.createdAt.toDate().toLocaleDateString('th-TH') : '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setSelectedWorkflow(w)}
                        className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-200 hover:border-blue-600 transition-all shadow-sm active:scale-90"
                        title="ดูรายละเอียด"
                      >
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredWorkflows.length === 0 && (
                  <tr>
                    <td colSpan="6" className="px-6 py-12 text-center text-slate-400 font-sans">
                      {allWorkflows.length === 0 ? 'ยังไม่มีเอกสาร' : 'ไม่พบเอกสารที่ค้นหา'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-400">
            แสดง {filteredWorkflows.length} จาก {allWorkflows.length} รายการ
          </div>
        </div>
      )}

      {/* Workflow Detail Modal */}
      {selectedWorkflow && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedWorkflow(null)}>
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-2xl shadow-2xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
                <FileText size={24} className="text-emerald-600" />
                รายละเอียดเอกสาร
              </h3>
              <button onClick={() => setSelectedWorkflow(null)} className="p-2 hover:bg-slate-100 rounded-xl transition">
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">ประเภท</p>
                  <p className="text-sm font-bold text-slate-900">{(selectedWorkflow.type || '-').replace(/_/g, ' ')}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">สถานะ</p>
                  <p className="text-sm font-bold text-slate-900">{selectedWorkflow.status || '-'}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">ผู้ขอ</p>
                  <p className="text-sm font-bold text-slate-900">{selectedWorkflow.requesterName || selectedWorkflow.requesterId || '-'}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">แผนก</p>
                  <p className="text-sm font-bold text-slate-900">{selectedWorkflow.department || '-'}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">วันที่สร้าง</p>
                  <p className="text-sm font-bold text-slate-900">
                    {selectedWorkflow.createdAt?.toDate?.() ? selectedWorkflow.createdAt.toDate().toLocaleString('th-TH') : '-'}
                  </p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">ขั้นตอนปัจจุบัน</p>
                  <p className="text-sm font-bold text-slate-900">{selectedWorkflow.currentStep || '-'} / {selectedWorkflow.totalSteps || '-'}</p>
                </div>
              </div>
              {selectedWorkflow.formData && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">ข้อมูลฟอร์ม</p>
                  <div className="space-y-2">
                    {Object.entries(selectedWorkflow.formData).map(([key, value]) => (
                      <div key={key} className="flex gap-2">
                        <span className="text-xs font-black text-slate-500 min-w-[120px]">{key}:</span>
                        <span className="text-xs text-slate-700">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selectedWorkflow.steps && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">ขั้นตอนการอนุมัติ</p>
                  <div className="space-y-2">
                    {selectedWorkflow.steps.map((step, idx) => (
                      <div key={idx} className="flex items-center gap-3 text-xs">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-white ${
                          step.status === 'approved' ? 'bg-emerald-500' : step.status === 'rejected' ? 'bg-red-500' : 'bg-slate-300'
                        }`}>{idx + 1}</span>
                        <span className="font-bold text-slate-700">{step.approverRole || step.approverId || '-'}</span>
                        <span className={`font-black ${
                          step.status === 'approved' ? 'text-emerald-600' : step.status === 'rejected' ? 'text-red-600' : 'text-slate-400'
                        }`}>{step.status || 'pending'}</span>
                        {step.timestamp && (
                          <span className="text-slate-400 font-mono">
                            {step.timestamp?.toDate?.() ? step.timestamp.toDate().toLocaleString('th-TH') : ''}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== Feature 4: Vehicle Fleet Management (Fleet tab) ===== */}
      {activeTab === 'fleet' && (
      <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setShowVehicleSection(!showVehicleSection)}
        >
          <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
            <Car size={24} className="text-blue-600" />
            จัดการรถบริษัท
            <span className="text-sm font-bold text-slate-400">({vehicles.length} คัน)</span>
          </h3>
          <ChevronRight
            size={24}
            className={`text-slate-400 transition-transform duration-200 ${showVehicleSection ? 'rotate-90' : ''}`}
          />
        </div>
      </div>
      )}

      {activeTab === 'fleet' && showVehicleSection && (
        <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
          <div className="p-8 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-500 font-sans">
                รถทั้งหมด ({vehicles.length} คัน)
              </h3>
              <button
                onClick={() => setShowAddVehicleModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl font-black text-xs transition flex items-center gap-2"
              >
                <Plus size={16} /> เพิ่มรถใหม่
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-sans">
              <thead>
                <tr className="text-slate-400 text-[10px] uppercase tracking-[0.2em] border-b border-slate-100">
                  <th className="px-6 py-4 font-black">ID</th>
                  <th className="px-6 py-4 font-black">ทะเบียน</th>
                  <th className="px-6 py-4 font-black">ยี่ห้อ/รุ่น</th>
                  <th className="px-6 py-4 font-black text-center">ประเภท</th>
                  <th className="px-6 py-4 font-black text-center">สี</th>
                  <th className="px-6 py-4 font-black text-center">ที่นั่ง</th>
                  <th className="px-6 py-4 font-black text-center">สถานะ</th>
                  <th className="px-6 py-4 font-black text-right">ดำเนินการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 font-sans text-left">
                {vehicles.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50 group transition-colors font-sans">
                    {editingVehicle && editingVehicle.id === v.id ? (
                      <>
                        <td className="px-6 py-3"><span className="text-xs font-mono font-black text-slate-500">{v.id}</span></td>
                        <td className="px-6 py-3">
                          <input className="border border-slate-200 rounded-lg px-2 py-1 text-sm w-full" value={editingVehicle.plate} onChange={(e) => setEditingVehicle({...editingVehicle, plate: e.target.value})} />
                        </td>
                        <td className="px-6 py-3">
                          <input className="border border-slate-200 rounded-lg px-2 py-1 text-sm w-full" value={editingVehicle.brand} onChange={(e) => setEditingVehicle({...editingVehicle, brand: e.target.value})} />
                        </td>
                        <td className="px-6 py-3 text-center">
                          <select className="border border-slate-200 rounded-lg px-2 py-1 text-sm" value={editingVehicle.type} onChange={(e) => setEditingVehicle({...editingVehicle, type: e.target.value})}>
                            {vehicleTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td className="px-6 py-3 text-center">
                          <input className="border border-slate-200 rounded-lg px-2 py-1 text-sm w-16 text-center" value={editingVehicle.color} onChange={(e) => setEditingVehicle({...editingVehicle, color: e.target.value})} />
                        </td>
                        <td className="px-6 py-3 text-center">
                          <input type="number" className="border border-slate-200 rounded-lg px-2 py-1 text-sm w-16 text-center" value={editingVehicle.seats} onChange={(e) => setEditingVehicle({...editingVehicle, seats: e.target.value})} />
                        </td>
                        <td className="px-6 py-3 text-center">
                          <select className="border border-slate-200 rounded-lg px-2 py-1 text-sm" value={editingVehicle.status} onChange={(e) => setEditingVehicle({...editingVehicle, status: e.target.value})}>
                            {vehicleStatusOptions.map(s => <option key={s} value={s}>{vehicleStatusLabel[s]}</option>)}
                          </select>
                        </td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={handleUpdateVehicle} className="p-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-200 hover:border-emerald-600 transition-all shadow-sm active:scale-90" title="บันทึก">
                              <Save size={18} />
                            </button>
                            <button onClick={() => setEditingVehicle(null)} className="p-2 bg-slate-50 text-slate-400 rounded-xl border border-slate-200 hover:border-slate-400 transition-all shadow-sm active:scale-90" title="ยกเลิก">
                              <X size={18} />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-4"><span className="text-xs font-mono font-black text-slate-500">{v.id}</span></td>
                        <td className="px-6 py-4"><span className="text-sm font-bold text-slate-900">{(!v.plate || v.plate === 'รอใส่ทะเบียน') ? v.brand : v.plate}</span></td>
                        <td className="px-6 py-4"><span className="text-sm font-bold text-slate-700">{v.brand}</span></td>
                        <td className="px-6 py-4 text-center"><span className="text-sm text-slate-600">{v.type}</span></td>
                        <td className="px-6 py-4 text-center"><span className="text-sm text-slate-600">{v.color || '-'}</span></td>
                        <td className="px-6 py-4 text-center"><span className="text-sm text-slate-600">{v.seats}</span></td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => handleToggleVehicleStatus(v)}
                            className={`inline-flex items-center gap-1.5 font-black py-1.5 px-4 rounded-xl border text-xs cursor-pointer transition-all hover:shadow-md active:scale-95 ${vehicleStatusColor[v.status] || 'bg-slate-100 text-slate-600 border-slate-300'}`}
                          >
                            {v.status === 'maintenance' && <Wrench size={14} />}
                            {vehicleStatusLabel[v.status] || v.status}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setEditingVehicle({...v})}
                              className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-200 hover:border-blue-600 transition-all shadow-sm active:scale-90"
                              title="แก้ไข"
                            >
                              <Edit size={18} />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {vehicles.length === 0 && (
                  <tr>
                    <td colSpan="8" className="px-6 py-12 text-center text-slate-400 font-sans">
                      ยังไม่มีข้อมูลรถ - กรุณารัน seed script
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Vehicle Bookings Summary */}
          <div className="p-6 border-t border-slate-100">
              <h4 className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-4">รายการจองรถทั้งหมด ({vehicleBookings.length} รายการ)</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse font-sans text-sm">
                  <thead>
                    <tr className="text-slate-400 text-[10px] uppercase tracking-[0.2em] border-b border-slate-100">
                      <th className="px-4 py-2 font-black">วันที่</th>
                      <th className="px-4 py-2 font-black">ทะเบียน</th>
                      <th className="px-4 py-2 font-black">ผู้จอง</th>
                      <th className="px-4 py-2 font-black">เวลา</th>
                      <th className="px-4 py-2 font-black">ปลายทาง</th>
                      <th className="px-4 py-2 font-black text-center">สถานะ</th>
                      <th className="px-4 py-2 font-black text-center">ดำเนินการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {vehicleBookings.slice(0, 20).map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 font-mono text-xs">{b.date || '-'}</td>
                        <td className="px-4 py-2 font-bold">{b.plate || '-'}</td>
                        <td className="px-4 py-2">{b.bookedByName || b.bookedBy || '-'}</td>
                        <td className="px-4 py-2 text-xs">{b.timeStart || '-'} - {b.timeEnd || '-'}</td>
                        <td className="px-4 py-2">{b.destination || '-'}</td>
                        <td className="px-4 py-2 text-center">
                          <span className={`inline-flex font-black py-1 px-3 rounded-lg border text-xs ${
                            b.status === 'booked' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                            b.status === 'completed' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                            'bg-slate-50 text-slate-600 border-slate-200'
                          }`}>{b.status || '-'}</span>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button
                            onClick={async () => {
                              if (!window.confirm(`ยกเลิกการจอง ${b.plate} วันที่ ${b.date}?`)) return;
                              try {
                                const bookingRef = doc(db, 'artifacts', appId, 'public', 'data', 'vehicle_bookings', b.id);
                                await deleteDoc(bookingRef);
                              } catch (err) {
                                alert('ยกเลิกไม่สำเร็จ: ' + err.message);
                              }
                            }}
                            className="text-[11px] bg-red-50 text-red-600 border border-red-200 px-3 py-1 rounded-lg font-bold hover:bg-red-600 hover:text-white transition"
                          >ยกเลิก</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {vehicleBookings.length === 0 && (
                <p className="text-center text-slate-300 text-sm py-4">ยังไม่มีการจอง</p>
              )}
            </div>
        </div>
      )}

      {/* Add Vehicle Modal */}
      {showAddVehicleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddVehicleModal(false)}>
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
                <Car size={24} className="text-blue-600" /> เพิ่มรถใหม่
              </h3>
              <button onClick={() => setShowAddVehicleModal(false)} className="p-2 hover:bg-slate-100 rounded-xl transition">
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">รหัสรถ (V001, V002...)</label>
                <input className="w-full mt-1 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-600 outline-none" placeholder="อัตโนมัติถ้าไม่กรอก" value={newVehicleForm.id} onChange={(e) => setNewVehicleForm({...newVehicleForm, id: e.target.value})} />
              </div>
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">ทะเบียนรถ *</label>
                <input className="w-full mt-1 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-600 outline-none" placeholder="เช่น ขพ-7100" value={newVehicleForm.plate} onChange={(e) => setNewVehicleForm({...newVehicleForm, plate: e.target.value})} />
              </div>
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">ยี่ห้อ/รุ่น *</label>
                <input className="w-full mt-1 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-600 outline-none" placeholder="เช่น ISUZU D-MAX" value={newVehicleForm.brand} onChange={(e) => setNewVehicleForm({...newVehicleForm, brand: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest">ประเภท</label>
                  <select className="w-full mt-1 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-600 outline-none" value={newVehicleForm.type} onChange={(e) => setNewVehicleForm({...newVehicleForm, type: e.target.value})}>
                    {vehicleTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest">จำนวนที่นั่ง</label>
                  <input type="number" className="w-full mt-1 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-600 outline-none" value={newVehicleForm.seats} onChange={(e) => setNewVehicleForm({...newVehicleForm, seats: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">สี</label>
                <input className="w-full mt-1 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-600 outline-none" placeholder="-" value={newVehicleForm.color} onChange={(e) => setNewVehicleForm({...newVehicleForm, color: e.target.value})} />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button onClick={() => setShowAddVehicleModal(false)} className="px-6 py-3 text-slate-400 font-bold hover:text-slate-900 transition">ยกเลิก</button>
                <button onClick={handleAddVehicle} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-black shadow-lg active:scale-95 transition">เพิ่มรถ</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Security Monitoring Panel (Security tab) ===== */}
      {activeTab === 'security' && (
        <SecurityAlertsPanel />
      )}

      {/* ===== Feature 5: Troubleshooting Panel (System tab) ===== */}
      {activeTab === 'system' && (
      <div className="bg-white border border-slate-200 p-6 md:p-8 rounded-[2.5rem] shadow-sm">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setShowTroubleshoot(!showTroubleshoot)}
        >
          <h3 className="text-base md:text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
            <Wrench size={24} className="text-rose-600" />
            เครื่องมือแก้ไขปัญหา (Troubleshooting)
            <span className="hidden md:inline text-sm font-bold text-slate-400">(7 เครื่องมือ)</span>
          </h3>
          <ChevronRight
            size={24}
            className={`text-slate-400 transition-transform duration-200 ${showTroubleshoot ? 'rotate-90' : ''}`}
          />
        </div>
      </div>
      )}

      {activeTab === 'system' && showTroubleshoot && (
        <div className="bg-white border border-slate-200 rounded-[2.5rem] p-6 md:p-8 shadow-sm space-y-6">
          {tbResult && (
            <div className={`p-4 rounded-2xl border-2 ${tbResult.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
              <div className="flex items-start gap-3">
                <div className="font-black text-xs uppercase tracking-widest">
                  {tbResult.ok ? '✓ สำเร็จ' : '✗ ผิดพลาด'}
                </div>
                <div className="flex-1 text-sm font-semibold">{tbResult.msg}</div>
                <button onClick={() => setTbResult(null)} className="text-slate-400 hover:text-slate-900"><X size={16} /></button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Tool 1: Unlock account */}
            <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/40">
              <div className="flex items-center gap-2 mb-3">
                <KeyRound size={18} className="text-amber-600" />
                <div className="font-black text-slate-900 text-sm">ปลดล็อคบัญชี (Unlock)</div>
              </div>
              <p className="text-xs text-slate-500 mb-3">ใช้เมื่อพนักงานใส่รหัสผิดเกิน 5 ครั้ง แล้วถูกล็อค</p>
              <div className="flex gap-2">
                <input className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm uppercase font-mono focus:ring-2 focus:ring-amber-100 focus:border-amber-500 outline-none" placeholder="เช่น EMP-EEE-01" value={tbUnlockId} onChange={e => setTbUnlockId(e.target.value)} disabled={tbBusy} />
                <button onClick={handleTbUnlock} disabled={tbBusy} className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs px-4 py-2 rounded-xl transition disabled:opacity-50">ปลดล็อค</button>
              </div>
            </div>

            {/* Tool 2: Quick reset password */}
            <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/40">
              <div className="flex items-center gap-2 mb-3">
                <RotateCcw size={18} className="text-blue-600" />
                <div className="font-black text-slate-900 text-sm">เปลี่ยนรหัสผ่านด่วน (Quick Reset)</div>
              </div>
              <p className="text-xs text-slate-500 mb-3">ตั้งรหัสใหม่ + ปลดล็อคบัญชีให้เลย</p>
              <div className="flex flex-col gap-2">
                <input className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm uppercase font-mono focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none" placeholder="รหัสผู้ใช้" value={tbQuickPassId} onChange={e => setTbQuickPassId(e.target.value)} disabled={tbBusy} />
                <div className="flex gap-2">
                  <input className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none" placeholder="รหัสผ่านใหม่ (≥4 ตัว)" value={tbQuickPassNew} onChange={e => setTbQuickPassNew(e.target.value)} disabled={tbBusy} />
                  <button onClick={handleTbQuickReset} disabled={tbBusy} className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition disabled:opacity-50">ตั้งรหัส</button>
                </div>
              </div>
            </div>

            {/* Tool 3: Cancel stuck workflow */}
            <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/40">
              <div className="flex items-center gap-2 mb-3">
                <X size={18} className="text-red-600" />
                <div className="font-black text-slate-900 text-sm">ยกเลิกเอกสารค้าง (Cancel Workflow)</div>
              </div>
              <p className="text-xs text-slate-500 mb-3">ยกเลิกทุก step ที่มี chainId เดียวกัน</p>
              <div className="flex gap-2">
                <input className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-red-100 focus:border-red-500 outline-none" placeholder="chainId..." value={tbCancelChainId} onChange={e => setTbCancelChainId(e.target.value)} disabled={tbBusy} />
                <button onClick={handleTbCancelWorkflow} disabled={tbBusy} className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition disabled:opacity-50">ยกเลิก</button>
              </div>
            </div>

            {/* Tool 4: Re-route workflow */}
            <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/40">
              <div className="flex items-center gap-2 mb-3">
                <ArrowRightLeft size={18} className="text-indigo-600" />
                <div className="font-black text-slate-900 text-sm">เปลี่ยนแผนกเอกสาร (Re-route)</div>
              </div>
              <p className="text-xs text-slate-500 mb-3">ใช้เมื่อหัวหน้าลาออก/ย้ายแผนก — ย้ายของรอทั้งหมดไปแผนกใหม่</p>
              <div className="flex flex-col gap-2">
                <select className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none" value={tbRerouteOld} onChange={e => setTbRerouteOld(e.target.value)} disabled={tbBusy}>
                  <option value="">-- แผนกเดิม --</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <div className="flex gap-2">
                  <select className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none" value={tbRerouteNew} onChange={e => setTbRerouteNew(e.target.value)} disabled={tbBusy}>
                    <option value="">-- แผนกใหม่ --</option>
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <button onClick={handleTbReroute} disabled={tbBusy} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition disabled:opacity-50">ย้าย</button>
                </div>
              </div>
            </div>

            {/* Tool 5: Delete doc */}
            <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/40">
              <div className="flex items-center gap-2 mb-3">
                <Trash2 size={18} className="text-red-700" />
                <div className="font-black text-slate-900 text-sm">ลบเอกสาร (Delete Doc)</div>
              </div>
              <p className="text-xs text-slate-500 mb-3">ลบนัดหมายหรือการจองรถที่ค้าง (ถาวร ไม่กู้คืนได้)</p>
              <div className="flex flex-col gap-2">
                <select className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-red-100 focus:border-red-500 outline-none" value={tbDeleteColl} onChange={e => setTbDeleteColl(e.target.value)} disabled={tbBusy}>
                  <option value="appointments">appointments (นัดหมาย)</option>
                  <option value="vehicle_bookings">vehicle_bookings (จองรถ)</option>
                  <option value="approval_workflows">approval_workflows (เอกสารอนุมัติ)</option>
                  <option value="equipment_requests">equipment_requests (เบิกอุปกรณ์)</option>
                  <option value="employee_logs">employee_logs (บันทึกเข้า-ออก)</option>
                </select>
                <div className="flex gap-2">
                  <input className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-red-100 focus:border-red-500 outline-none" placeholder="document id" value={tbDeleteDocId} onChange={e => setTbDeleteDocId(e.target.value)} disabled={tbBusy} />
                  <button onClick={handleTbDelete} disabled={tbBusy} className="bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-4 py-2 rounded-xl transition disabled:opacity-50">ลบ</button>
                </div>
              </div>
            </div>

            {/* Tool 7: Backup */}
            <div className="border border-emerald-200 bg-emerald-50/30 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Database size={18} className="text-emerald-700" />
                <div className="font-black text-slate-900 text-sm">สำรองข้อมูล (Backup JSON)</div>
              </div>
              <p className="text-xs text-slate-600 mb-3">ดาวน์โหลดข้อมูลทั้งหมด 9 collections เป็น JSON file</p>
              <button onClick={handleTbBackup} disabled={tbBusy} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm py-3 rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2">
                <Save size={16} /> {tbBusy && tbBackupProgress ? tbBackupProgress : 'ดาวน์โหลด Backup (JSON)'}
              </button>
              <p className="text-[10px] text-emerald-700 mt-2 font-semibold">💡 แนะนำ: Backup ทุกสัปดาห์ เก็บใน Google Drive / OneDrive</p>
            </div>
          </div>

          {/* Tool 6: System Health - full width */}
          <div className="border border-slate-200 rounded-2xl p-5 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <LayoutDashboard size={20} className="text-cyan-400" />
                <div className="font-black text-base">System Health Dashboard</div>
              </div>
              <button onClick={handleTbHealthCheck} disabled={tbHealthLoading} className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-xs px-4 py-2 rounded-xl transition disabled:opacity-50">
                {tbHealthLoading ? 'กำลังตรวจ...' : 'ตรวจสภาพระบบ'}
              </button>
            </div>
            {tbHealth ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="bg-slate-700/50 rounded-xl p-3">
                  <div className="text-slate-400">ผู้ใช้ทั้งหมด</div>
                  <div className="text-2xl font-black">{tbHealth.users.total}</div>
                  <div className="text-[10px] text-emerald-400">Active: {tbHealth.users.active} | Inactive: {tbHealth.users.inactive}</div>
                </div>
                <div className="bg-slate-700/50 rounded-xl p-3">
                  <div className="text-slate-400">บัญชีถูกล็อค</div>
                  <div className={`text-2xl font-black ${tbHealth.lockouts > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{tbHealth.lockouts}</div>
                  <div className="text-[10px] text-slate-400">ใช้ Unlock เพื่อปลด</div>
                </div>
                <div className="bg-slate-700/50 rounded-xl p-3">
                  <div className="text-slate-400">Workflows รอ</div>
                  <div className="text-2xl font-black text-yellow-400">{tbHealth.workflows.pending}</div>
                  <div className="text-[10px] text-slate-400">อนุมัติ: {tbHealth.workflows.approved} | ปฏิเสธ: {tbHealth.workflows.rejected}</div>
                </div>
                <div className="bg-slate-700/50 rounded-xl p-3">
                  <div className="text-slate-400">เอกสารค้าง &gt; 7 วัน</div>
                  <div className={`text-2xl font-black ${tbHealth.workflows.stuck > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{tbHealth.workflows.stuck}</div>
                  <div className="text-[10px] text-slate-400">ใช้ Cancel เพื่อล้าง</div>
                </div>
                <div className="bg-slate-700/50 rounded-xl p-3">
                  <div className="text-slate-400">นัดหมายรอเข้า</div>
                  <div className="text-2xl font-black text-blue-400">{tbHealth.appointments.pending}</div>
                  <div className="text-[10px] text-slate-400">อยู่ข้างใน: {tbHealth.appointments.inside} | ค้าง&gt;7วัน: {tbHealth.appointments.stuck}</div>
                </div>
                <div className="bg-slate-700/50 rounded-xl p-3">
                  <div className="text-slate-400">จองรถ (รอ)</div>
                  <div className="text-2xl font-black text-purple-400">{tbHealth.vehicleBookings.pending}</div>
                  <div className="text-[10px] text-slate-400">ทั้งหมด: {tbHealth.vehicleBookings.total}</div>
                </div>
                <div className="col-span-2 bg-slate-700/50 rounded-xl p-3">
                  <div className="text-slate-400 mb-1">ประเภทเอกสาร</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(tbHealth.workflows.byType || {}).map(([t, n]) => (
                      <span key={t} className="bg-slate-600/60 px-2 py-1 rounded-md text-[10px] font-mono">{t}: {n}</span>
                    ))}
                  </div>
                </div>
                <div className="col-span-2 md:col-span-4 text-center text-[10px] text-slate-400 pt-1">
                  ตรวจล่าสุด: {tbHealth.generatedAt}
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-400 text-sm py-6">
                กดปุ่ม "ตรวจสภาพระบบ" เพื่อดูสถานะ
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== Feature 6: SMTP Email Settings (System tab) ===== */}
      {activeTab === 'system' && (
      <div className="bg-white border border-slate-200 p-6 md:p-8 rounded-[2.5rem] shadow-sm">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setShowSmtpSettings(!showSmtpSettings)}
        >
          <h3 className="text-base md:text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
            <Mail size={24} className="text-blue-600" />
            ตั้งค่าส่งอีเมลอัตโนมัติ (SMTP Settings)
            <span className="hidden md:inline text-sm font-bold text-slate-400">(ส่งเมลหัวหน้าอัตโนมัติ)</span>
          </h3>
          <ChevronRight
            size={24}
            className={`text-slate-400 transition-transform duration-200 ${showSmtpSettings ? 'rotate-90' : ''}`}
          />
        </div>
      </div>
      )}

      {activeTab === 'system' && showSmtpSettings && (
        <div className="bg-white border border-slate-200 rounded-[2.5rem] p-6 md:p-8 shadow-sm space-y-6">
          {/* Info banner */}
          <div className="p-4 rounded-2xl border-2 border-blue-200 bg-blue-50/60">
            <div className="flex items-start gap-3">
              <AlertCircle size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-slate-700 space-y-1">
                <div className="font-bold text-blue-900">วิธีใช้งาน</div>
                <div>1. กรอกข้อมูล SMTP (แนะนำ Gmail ใช้ App Password)</div>
                <div>2. กดปุ่ม <b>"บันทึก"</b> — ระบบจะเก็บใน Firestore</div>
                <div>3. กดปุ่ม <b>"ทดสอบส่ง"</b> ใส่อีเมลตัวเองเพื่อตรวจสอบ</div>
                <div>4. ต้องรัน email server: <code className="bg-white px-2 py-0.5 rounded text-xs">node server/email-server.js</code></div>
              </div>
            </div>
          </div>

          {/* Result banner */}
          {smtpResult && (
            <div className={`p-4 rounded-2xl border-2 ${smtpResult.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
              <div className="flex items-start gap-3">
                <div className="font-black text-xs uppercase tracking-widest">
                  {smtpResult.ok ? '✓ สำเร็จ' : '✗ ผิดพลาด'}
                </div>
                <div className="flex-1 text-sm font-semibold break-words">{smtpResult.msg}</div>
                <button onClick={() => setSmtpResult(null)} className="text-slate-400 hover:text-slate-900"><X size={16} /></button>
              </div>
            </div>
          )}

          {/* Server health */}
          <div className={`p-4 rounded-2xl border-2 ${smtpServerHealth?.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className="flex items-center gap-3">
              <Server size={20} className={smtpServerHealth?.ok ? 'text-emerald-600' : 'text-amber-600'} />
              <div className="flex-1">
                <div className="font-black text-sm text-slate-900">
                  Email Server Status: {smtpServerHealth == null ? 'กำลังตรวจ...' : (smtpServerHealth.ok ? '✓ ออนไลน์' : '✗ ออฟไลน์')}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {smtpServerHealth?.ok
                    ? `Port 3001 • ${smtpServerHealth.detail?.hasSMTP ? 'มี SMTP credentials' : 'โหมด Demo (ไม่ส่งจริง)'}`
                    : (smtpServerHealth?.detail || 'ต้องรัน: node server/email-server.js')}
                </div>
              </div>
            </div>
          </div>

          {/* Preset picker */}
          <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/40">
            <div className="font-black text-sm text-slate-900 mb-3 uppercase tracking-widest">Quick Preset</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSmtpEdit(prev => ({ ...prev, host: 'smtp.gmail.com', port: '587', secure: false }))}
                className="px-4 py-2 text-xs font-bold bg-white border-2 border-slate-200 hover:border-blue-500 hover:text-blue-700 rounded-xl transition"
              >
                Gmail (587 STARTTLS)
              </button>
              <button
                type="button"
                onClick={() => setSmtpEdit(prev => ({ ...prev, host: 'smtp.gmail.com', port: '465', secure: true }))}
                className="px-4 py-2 text-xs font-bold bg-white border-2 border-slate-200 hover:border-blue-500 hover:text-blue-700 rounded-xl transition"
              >
                Gmail (465 SSL)
              </button>
              <button
                type="button"
                onClick={() => setSmtpEdit(prev => ({ ...prev, host: 'smtp.office365.com', port: '587', secure: false }))}
                className="px-4 py-2 text-xs font-bold bg-white border-2 border-slate-200 hover:border-blue-500 hover:text-blue-700 rounded-xl transition"
              >
                Office 365 / Outlook
              </button>
              <button
                type="button"
                onClick={() => setSmtpEdit(prev => ({ ...prev, host: 'mail.tbkk.co.th', port: '587', secure: false }))}
                className="px-4 py-2 text-xs font-bold bg-white border-2 border-slate-200 hover:border-blue-500 hover:text-blue-700 rounded-xl transition"
              >
                TBKK Mail
              </button>
            </div>
          </div>

          {/* Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Enable toggle */}
            <div className="md:col-span-2 border border-slate-200 rounded-2xl p-5 bg-gradient-to-br from-blue-50/60 to-indigo-50/40">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-black text-slate-900 text-sm">เปิดใช้งาน SMTP</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {smtpEdit.enabled ? 'ระบบจะส่งเมลอัตโนมัติเมื่อมีคำขออนุมัติ' : 'ระบบจะใช้ mailto:// เปิด Outlook ให้กดส่งเอง (เหมือนเดิม)'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSmtpEdit(prev => ({ ...prev, enabled: !prev.enabled }))}
                  className={`relative inline-flex h-8 w-14 items-center rounded-full transition ${smtpEdit.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${smtpEdit.enabled ? 'translate-x-7' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            {/* Host */}
            <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/40">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest">SMTP Host</label>
              <input
                className="w-full mt-2 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none font-mono"
                placeholder="smtp.gmail.com"
                value={smtpEdit.host}
                onChange={e => setSmtpEdit({ ...smtpEdit, host: e.target.value })}
              />
              <div className="text-xs text-slate-400 mt-1">เช่น smtp.gmail.com, smtp.office365.com</div>
            </div>

            {/* Port + Secure */}
            <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/40">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Port + Security</label>
              <div className="flex gap-2 mt-2">
                <input
                  className="w-24 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none font-mono"
                  placeholder="587"
                  value={smtpEdit.port}
                  onChange={e => setSmtpEdit({ ...smtpEdit, port: e.target.value.replace(/\D/g, '') })}
                />
                <label className="flex-1 flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smtpEdit.secure}
                    onChange={e => setSmtpEdit({ ...smtpEdit, secure: e.target.checked })}
                    className="w-4 h-4"
                  />
                  SSL (secure=true) — ใช้กับ port 465
                </label>
              </div>
              <div className="text-xs text-slate-400 mt-1">587 = STARTTLS (ไม่ติ๊ก) / 465 = SSL (ติ๊ก)</div>
            </div>

            {/* User */}
            <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/40">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest">SMTP User (อีเมลผู้ส่ง)</label>
              <input
                className="w-full mt-2 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none"
                placeholder="noreply@tbkk.co.th"
                value={smtpEdit.user}
                onChange={e => setSmtpEdit({ ...smtpEdit, user: e.target.value })}
                autoComplete="off"
              />
              <div className="text-xs text-slate-400 mt-1">อีเมลที่ใช้ Login SMTP</div>
            </div>

            {/* Pass */}
            <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/40">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center justify-between">
                <span>Password / App Password</span>
                <button
                  type="button"
                  onClick={() => setSmtpShowPassword(!smtpShowPassword)}
                  className="text-xs normal-case text-blue-600 hover:text-blue-800"
                >
                  {smtpShowPassword ? 'ซ่อน' : 'แสดง'}
                </button>
              </label>
              <input
                type={smtpShowPassword ? 'text' : 'password'}
                className="w-full mt-2 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none font-mono"
                placeholder="••••••••••••••••"
                value={smtpEdit.pass}
                onChange={e => setSmtpEdit({ ...smtpEdit, pass: e.target.value })}
                autoComplete="new-password"
              />
              <div className="text-xs text-slate-400 mt-1">
                Gmail: ใช้ <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-blue-600 underline">App Password</a> (16 ตัว)
              </div>
            </div>

            {/* From Email */}
            <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/40">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest">From (อีเมลที่จะแสดง)</label>
              <input
                className="w-full mt-2 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none"
                placeholder="noreply@tbkk.co.th"
                value={smtpEdit.from}
                onChange={e => setSmtpEdit({ ...smtpEdit, from: e.target.value })}
              />
              <div className="text-xs text-slate-400 mt-1">ปกติเหมือนกับ User — บาง SMTP ยอมให้ใส่คนละตัว</div>
            </div>

            {/* From Name */}
            <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/40">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest">From Name (ชื่อผู้ส่ง)</label>
              <input
                className="w-full mt-2 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none"
                placeholder="SOC Systems - TBKK Group"
                value={smtpEdit.fromName}
                onChange={e => setSmtpEdit({ ...smtpEdit, fromName: e.target.value })}
              />
              <div className="text-xs text-slate-400 mt-1">ชื่อที่ผู้รับจะเห็นในอีเมล</div>
            </div>
          </div>

          {/* Save + Test row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <button
              onClick={handleSmtpSave}
              disabled={smtpSaving}
              className="bg-blue-600 hover:bg-blue-700 text-white font-black text-sm px-6 py-4 rounded-2xl shadow-lg active:scale-95 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Save size={18} />
              {smtpSaving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
            </button>

            <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/40">
              <div className="font-black text-xs text-slate-500 uppercase tracking-widest mb-2">ทดสอบส่ง</div>
              <div className="flex gap-2">
                <input
                  type="email"
                  className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500 outline-none"
                  placeholder="กรอกอีเมลปลายทาง"
                  value={smtpTestEmail}
                  onChange={e => setSmtpTestEmail(e.target.value)}
                  disabled={smtpTestBusy}
                />
                <button
                  onClick={handleSmtpTest}
                  disabled={smtpTestBusy || !smtpServerHealth?.ok}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition disabled:opacity-50 flex items-center gap-1"
                  title={smtpServerHealth?.ok ? '' : 'ต้องรัน email server ก่อน'}
                >
                  <Send size={14} />
                  {smtpTestBusy ? 'กำลังส่ง...' : 'ส่ง'}
                </button>
              </div>
              {!smtpServerHealth?.ok && (
                <div className="text-xs text-amber-600 mt-2">⚠ ต้องรัน email server ก่อนถึงจะทดสอบได้</div>
              )}
            </div>
          </div>

          {/* Gmail setup guide */}
          <details className="border border-slate-200 rounded-2xl p-5 bg-slate-50/40">
            <summary className="font-black text-sm text-slate-900 cursor-pointer">📖 วิธีตั้งค่า Gmail (App Password)</summary>
            <div className="mt-3 space-y-2 text-xs text-slate-600">
              <div>1. เปิด Gmail ของผู้ส่ง (เช่น noreply@tbkk.co.th)</div>
              <div>2. ไปที่ <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer" className="text-blue-600 underline">myaccount.google.com/security</a></div>
              <div>3. เปิด <b>2-Step Verification</b> ก่อน (จำเป็น)</div>
              <div>4. ไปที่ <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-blue-600 underline">App Passwords</a></div>
              <div>5. สร้าง App Password ใหม่ — ตั้งชื่อ "TBKK SOC"</div>
              <div>6. Copy 16 ตัวอักษรที่ได้ มาวางในช่อง Password ด้านบน</div>
              <div className="text-amber-700 font-bold">⚠ ห้ามใช้รหัสผ่าน Gmail ปกติ — ต้องเป็น App Password เท่านั้น</div>
            </div>
          </details>
        </div>
      )}

      {/* Filters and Actions (Overview tab) */}
      {activeTab === 'overview' && (
      <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
            <input
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 pl-12 pr-6 text-slate-900 focus:ring-4 focus:ring-blue-50 focus:border-blue-600 outline-none transition-all shadow-inner uppercase font-mono tracking-widest placeholder:text-slate-300"
              placeholder="ค้นหาชื่อ, รหัสผ่าน, หรือรหัสพนักงาน..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <SelectField
            label=""
            options={['ALL', STATUS.PENDING, STATUS.INSIDE, STATUS.APPROVED_OUT, STATUS.COMPLETED]}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          <button
            onClick={handleCreateNew}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-2xl font-black transition flex items-center gap-2 shadow-lg active:scale-95"
          >
            <UserPlus size={18} /> สร้างนัดหมายใหม่
          </button>
        </div>
      </div>
      )}

      {/* Appointments Table (Overview tab) */}
      {activeTab === 'overview' && (
      <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm text-left font-sans">
        <div className="p-8 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-500 font-sans">
            รายการนัดหมายทั้งหมด ({filteredAppointments.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-sans">
            <thead>
              <tr className="text-slate-400 text-[10px] uppercase tracking-[0.2em] border-b border-slate-100">
                <th className="px-6 py-4 font-black">ข้อมูลผู้ติดต่อ</th>
                <th className="px-6 py-4 font-black text-center">รหัสอ้างอิง</th>
                <th className="px-6 py-4 font-black text-center">สถานะ</th>
                <th className="px-6 py-4 font-black text-center">วันที่</th>
                <th className="px-6 py-4 font-black text-right">ดำเนินการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 font-sans text-left">
              {filteredAppointments.map((appt) => (
                <tr key={appt.id} className="hover:bg-slate-50 group transition-colors font-sans">
                  {editingAppt === appt.id ? (
                    <>
                      <td colSpan="5" className="px-6 py-6">
                        <div className="space-y-4 bg-slate-50 p-6 rounded-2xl border border-blue-200">
                          <div className="space-y-4">
                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
                              <p className="text-xs font-black text-blue-600 uppercase tracking-widest mb-2">รหัสอ้างอิง: {editFormData.refCode}</p>
                              {editFormData.cardNo && (
                                <p className="text-xs font-bold text-blue-700">รหัสการ์ด: {editFormData.cardNo}</p>
                              )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <InputField
                                label="ชื่อแขก"
                                value={editFormData.name}
                                onChange={(v) => setEditFormData({...editFormData, name: v})}
                                required
                              />
                              <InputField
                                label="บริษัท"
                                value={editFormData.company}
                                onChange={(v) => setEditFormData({...editFormData, company: v})}
                              />
                              <InputField
                                label="รหัสพนักงาน"
                                value={editFormData.hostStaffId}
                                onChange={(v) => setEditFormData({...editFormData, hostStaffId: v.toUpperCase()})}
                                required
                              />
                              <SelectField
                                label="แผนก"
                                options={DEPARTMENTS}
                                value={editFormData.department}
                                onChange={(v) => setEditFormData({...editFormData, department: v})}
                              />
                              <InputField
                                label="วันที่นัดพบ"
                                type="date"
                                value={editFormData.appointmentDate}
                                onChange={(v) => setEditFormData({...editFormData, appointmentDate: v})}
                                required
                              />
                              <SelectField
                                label="สถานะ"
                                options={[STATUS.PENDING, STATUS.INSIDE, STATUS.APPROVED_OUT, STATUS.COMPLETED]}
                                value={editFormData.status}
                                onChange={(v) => setEditFormData({...editFormData, status: v})}
                              />
                              <InputField
                                label="จำนวนคน"
                                type="number"
                                min="1"
                                value={editFormData.count}
                                onChange={(v) => {
                                  const count = parseInt(v) || 1;
                                  const newNames = [...editFormData.additionalNames];
                                  if (count > 1) {
                                    while (newNames.length < count - 1) newNames.push('');
                                    while (newNames.length > count - 1) newNames.pop();
                                  } else {
                                    newNames.length = 0;
                                  }
                                  setEditFormData({...editFormData, count, additionalNames: newNames});
                                }}
                              />
                              <InputField
                                label="รหัสการ์ด (Card No)"
                                value={editFormData.cardNo}
                                onChange={(v) => setEditFormData({...editFormData, cardNo: v.toUpperCase()})}
                                placeholder="เช่น 01, 02"
                              />
                              <InputField
                                label="วัตถุประสงค์"
                                value={editFormData.purpose}
                                onChange={(v) => setEditFormData({...editFormData, purpose: v})}
                              />
                              <SelectField
                                label="ยานพาหนะ"
                                options={['รถยนต์', 'รถจักรยานยนต์', 'รถบรรทุก', 'ไม่มีรถ']}
                                value={editFormData.vehicleType}
                                onChange={(v) => setEditFormData({...editFormData, vehicleType: v})}
                              />
                              <InputField
                                label="ทะเบียนรถ"
                                value={editFormData.licensePlate}
                                onChange={(v) => setEditFormData({...editFormData, licensePlate: v.toUpperCase()})}
                                placeholder="กข 1234"
                              />
                            </div>
                            {editFormData.additionalNames && editFormData.additionalNames.length > 0 && (
                              <div className="border-t border-slate-200 pt-4">
                                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">รายชื่อผู้ติดตาม</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {editFormData.additionalNames.map((name, idx) => (
                                    <InputField
                                      key={idx}
                                      label={`ผู้ติดตามคนที่ ${idx + 2}`}
                                      value={name}
                                      onChange={(v) => {
                                        const newNames = [...editFormData.additionalNames];
                                        newNames[idx] = v;
                                        setEditFormData({...editFormData, additionalNames: newNames});
                                      }}
                                    />
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="flex justify-end gap-3">
                            <button
                              onClick={handleCancelEdit}
                              className="px-6 py-3 text-slate-400 font-bold hover:text-slate-900 transition"
                            >
                              ยกเลิก
                            </button>
                            <button
                              onClick={handleSave}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-2xl font-black shadow-lg active:scale-95 flex items-center gap-2"
                            >
                              <Save size={18} /> บันทึก
                            </button>
                          </div>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-6 py-4">
                        <p className="font-black text-slate-900 text-lg">{appt.name} {appt.count > 1 ? `(+${appt.count - 1})` : ''}</p>
                        <div className="flex items-center gap-4 mt-1 font-sans text-left">
                          <span className="text-[10px] text-slate-400 flex items-center gap-1.5 font-bold font-sans text-left">
                            <Building2 size={12} /> {appt.department}
                          </span>
                          {appt.company && (
                            <span className="text-[10px] text-slate-400 font-bold font-sans text-left">{appt.company}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center font-sans text-center">
                        <span className="bg-slate-100 text-slate-600 font-mono font-black py-2 px-4 rounded-xl border border-slate-200 tracking-wider text-sm font-sans text-center">
                          {appt.refCode}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center font-sans text-center">
                        <StatusBadge status={appt.status} />
                      </td>
                      <td className="px-6 py-4 text-center font-sans text-center">
                        <span className="text-[10px] text-slate-400 flex items-center gap-1.5 font-bold font-sans text-center">
                          <Calendar size={12} /> {appt.appointmentDate}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-sans text-right">
                        <div className="flex justify-end gap-2 font-sans">
                          <button
                            onClick={() => handleEdit(appt)}
                            className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-200 hover:border-blue-600 transition-all shadow-sm active:scale-90 font-sans"
                            title="แก้ไข"
                          >
                            <Edit size={18} />
                          </button>
                          <button
                            onClick={() => handleDelete(appt.id)}
                            className="p-2 bg-red-50 text-red-600 rounded-xl border border-red-200 hover:border-red-600 transition-all shadow-sm active:scale-90 font-sans"
                            title="ลบ"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {filteredAppointments.length === 0 && (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-slate-400 font-sans">
                    ไม่พบข้อมูล
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
}

// --- Guest View ---
function GuestView({ user }) {
  const [submitted, setSubmitted] = useState(false);
  const [refCode, setRefCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '', additionalNames: [], company: '', hostName: '', hostStaffId: '', department: DEPARTMENTS[0], purpose: '', count: 1, vehicleType: 'รถยนต์', licensePlate: '',
    appointmentDate: getTodayStr()
  });
  // Layer 2: Anti-bot state (honeypot + timing)
  const [antiBot, setAntiBot] = useState(createHoneypotState);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!firebaseReady) {
      alert('Firebase ไม่พร้อมใช้งาน กรุณาตั้งค่า Firebase Configuration');
      return;
    }
    if (!user) return;

    setSubmitting(true);
    try {
      // ========== Layer 2: Bot detection ==========
      const botCheck = detectBotSubmission(antiBot);
      if (botCheck.isBot) {
        console.warn('🚨 Bot submission blocked:', botCheck.reason);
        // หลอก bot ให้คิดว่าสำเร็จ (honeytrap) — แต่ไม่ได้บันทึก
        await new Promise(r => setTimeout(r, 1200));
        setRefCode('BLOCKED');
        setSubmitted(true);
        return;
      }

      // ========== Layer 2: Client-side rate limit ==========
      const localLimit = checkLocalRateLimit('guest-submit', 5);
      if (!localLimit.allowed) {
        alert(`ลงทะเบียนบ่อยเกินไปจากอุปกรณ์นี้ (เกิน ${localLimit.count} ครั้ง/ชั่วโมง)\nกรุณาลองใหม่ ${formatResetTime(localLimit.resetAt)}`);
        return;
      }

      // ========== Layer 2: Server-side IP rate limit ==========
      const ipCheck = await checkPublicFormRate();
      if (!ipCheck.ok) {
        alert(ipCheck.message || 'ระบบปฏิเสธคำขอ — กรุณาลองใหม่ภายหลัง');
        return;
      }

      // ========== Sanitize input (ป้องกัน XSS) ==========
      const sanitizedData = {
        name: sanitize(formData.name).slice(0, 100),
        additionalNames: (formData.additionalNames || []).map(n => sanitize(n).slice(0, 100)),
        company: sanitize(formData.company).slice(0, 120),
        hostName: sanitize(formData.hostName).slice(0, 100),
        hostStaffId: sanitize(formData.hostStaffId.toString().trim().toUpperCase()).slice(0, 30),
        department: formData.department,
        purpose: sanitize(formData.purpose).slice(0, 500),
        count: Math.max(1, Math.min(50, parseInt(formData.count) || 1)),
        vehicleType: formData.vehicleType,
        licensePlate: sanitize(formData.licensePlate).slice(0, 30),
        appointmentDate: formData.appointmentDate,
      };

      // ตรวจซ้ำ: ถ้ามี script injection หลัง sanitize แล้ว
      if (hasScriptInjection(formData.name) || hasScriptInjection(formData.purpose) || hasScriptInjection(formData.company)) {
        console.warn('🚨 Script injection attempt blocked');
        alert('ข้อความที่กรอกมีอักขระต้องห้าม');
        return;
      }

      const newRefCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'appointments'), {
        ...sanitizedData, refCode: newRefCode, status: STATUS.PENDING, createdAt: Timestamp.now(),
      });
      recordLocalSubmit('guest-submit');
      setRefCode(newRefCode);
      setSubmitted(true);
    } catch (error) {
      console.error('Error submitting form:', error);
      alert('เกิดข้อผิดพลาดในการลงทะเบียน: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const qrData = JSON.stringify({
    ref: refCode,
    name: formData.name,
    company: formData.company || '-',
    purpose: formData.purpose,
    date: formData.appointmentDate,
    host: formData.hostStaffId,
    dept: formData.department,
  });

  // ถ้าถูก block จาก bot detection — แสดงหน้า "สำเร็จ" หลอก (ไม่ให้ bot รู้ว่าโดนจับ)
  if (submitted && refCode === 'BLOCKED') return (
    <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-2xl mt-10 font-sans">
      <div className="mb-10 mx-auto w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 border border-slate-100 shadow-sm"><CheckCircle2 size={56} /></div>
      <h2 className="text-2xl font-black text-slate-700 tracking-tight">ลงทะเบียนสำเร็จ</h2>
      <p className="text-slate-400 text-sm mt-4">ข้อมูลถูกบันทึกแล้ว<br/>กรุณาแสดงตัวที่ป้อมตามนัดหมาย</p>
    </div>
  );

  if (submitted) return (
    <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-2xl md:rounded-[4rem] p-6 md:p-12 text-center shadow-2xl mt-4 md:mt-10 animate-in zoom-in-95 font-sans">
      <div className="mb-10 mx-auto w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 border border-emerald-100 shadow-sm text-center font-sans"><CheckCircle2 size={56} /></div>
      <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter text-center font-sans">Registration Success</h2>
      <p className="text-slate-400 text-sm mb-12 font-medium italic text-center leading-relaxed text-center font-sans">รหัสนัดหมายสำหรับวันที่ {formData.appointmentDate}<br/>กรุณาบันทึก QR Code เพื่อแสดงต่อเจ้าหน้าที่ รปภ.</p>

      <div className="bg-white p-4 md:p-8 rounded-2xl md:rounded-[3rem] mb-8 md:mb-12 mx-auto flex flex-col items-center justify-center shadow-inner border border-slate-100 font-sans text-center max-w-xs sm:max-w-sm w-full">
         <QRCodeSVG value={qrData} size={200} level="M" includeMargin className="w-full max-w-[200px] h-auto" />
         <p className="text-[10px] text-slate-400 mt-4 uppercase tracking-widest font-black">Screenshot QR นี้ไว้แสดง รปภ.</p>
      </div>

      <div className="bg-blue-600 p-4 sm:p-6 md:p-10 rounded-2xl md:rounded-[3rem] text-center shadow-xl shadow-blue-100 mb-6 md:mb-10 font-sans overflow-hidden">
        <p className="text-[10px] text-blue-100 uppercase mb-4 font-black tracking-[0.5em] text-center font-sans">Gate Pass Token</p>
        <p className="text-3xl sm:text-5xl md:text-6xl font-mono font-black text-white tracking-[0.1em] md:tracking-[0.2em] mb-8 text-center font-sans break-all">{refCode}</p>
        <div className="p-4 bg-white/10 rounded-2xl flex items-start gap-4 text-left font-sans text-left">
          <Smartphone className="text-white w-6 h-6 shrink-0 mt-1 font-sans text-left" />
          <p className="text-xs text-white font-bold leading-relaxed text-left font-sans text-left text-left">
             นำ QR Code หรือรหัส <span className="font-black underline underline-offset-8 decoration-2 font-sans text-left">{refCode}</span> แสดงต่อ รปภ. ที่หน้าป้อมครับ
          </p>
        </div>
      </div>

      <button onClick={() => setSubmitted(false)} className="text-slate-400 text-[10px] uppercase tracking-[0.4em] font-black hover:text-slate-900 transition-colors text-center font-sans text-center">Register Another</button>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto py-8 text-left font-sans text-left text-left">
      <div className="text-center mb-16 text-center">
        <h2 className="text-4xl md:text-7xl font-black text-slate-900 mb-6 tracking-tighter uppercase text-center font-sans text-center">Gate Pass</h2>
        <p className="text-blue-600 uppercase tracking-[0.5em] text-[10px] font-black text-center font-sans text-center">Digital Entry Registration System</p>
      </div>
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 p-6 md:p-12 lg:p-16 rounded-2xl md:rounded-[4rem] shadow-2xl space-y-8 md:space-y-12 backdrop-blur-sm text-left font-sans">
        {/* Honeypot — ต้องว่างเสมอ (bot มักกรอก) */}
        <input
          type="text"
          name="__contact_phone_extra"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={HONEYPOT_STYLE}
          value={antiBot.honeypot}
          onChange={e => setAntiBot(s => ({ ...s, honeypot: e.target.value }))}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10 text-left font-sans text-left text-left text-left">
           <InputField label="ชื่อ-นามสกุลผู้ติดต่อ" placeholder="ชื่อ-นามสกุลจริง" value={formData.name} onChange={v => setFormData({...formData, name: v})} required />
           <InputField label="วันที่มาติดต่อ" type="date" value={formData.appointmentDate} onChange={v => setFormData({...formData, appointmentDate: v})} required />
           <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 p-6 md:p-10 bg-slate-50 rounded-2xl md:rounded-[3rem] border border-slate-100 shadow-inner text-left font-sans">
              <InputField label="รหัสพนักงานที่ต้องการพบ" placeholder="ตัวอย่าง: 1234" value={formData.hostStaffId} onChange={v => setFormData({...formData, hostStaffId: v})} required />
              <SelectField label="แผนกเป้าหมาย" options={DEPARTMENTS} value={formData.department} onChange={v => setFormData({...formData, department: v})} required />
           </div>
           <InputField label="จำนวนคนทั้งหมด" type="number" min="1" value={formData.count} onChange={v => {
              const count = parseInt(v) || 1;
              const newNames = [...formData.additionalNames];
              if (count > 1) { while (newNames.length < count - 1) newNames.push(''); while (newNames.length > count - 1) newNames.pop(); } else newNames.length = 0;
              setFormData({...formData, count, additionalNames: newNames});
           }} />
           <InputField label="บริษัท / สังกัด" placeholder="ระบุหน่วยงานของคุณ" value={formData.company} onChange={v => setFormData({...formData, company: v})} />
           <SelectField label="ยานพาหนะ" options={['รถยนต์', 'รถจักรยานยนต์', 'รถบรรทุก', 'ไม่มีรถ']} value={formData.vehicleType} onChange={v => setFormData({...formData, vehicleType: v})} />
           <InputField label="เลขทะเบียนรถ" placeholder="กข 1234" value={formData.licensePlate} onChange={v => setFormData({...formData, licensePlate: v})} />
           {formData.additionalNames.map((name, idx) => (
             <InputField key={idx} label={`ชื่อผู้ติดตามคนที่ ${idx + 2}`} value={name} onChange={v => {
               const n = [...formData.additionalNames]; n[idx] = v; setFormData({...formData, additionalNames: n});
             }} required />
           ))}
        </div>
        <InputField label="วัตถุประสงค์การเข้าพื้นที่" placeholder="ระบุรายละเอียด..." value={formData.purpose} onChange={v => setFormData({...formData, purpose: v})} required />
        <button type="submit" disabled={submitting} className="w-full bg-slate-900 text-white py-7 rounded-[2rem] font-black text-xl hover:shadow-2xl hover:bg-black transition-all active:scale-95 uppercase tracking-widest shadow-xl text-left font-sans text-left text-left disabled:opacity-60 disabled:cursor-not-allowed">{submitting ? 'กำลังตรวจสอบ...' : 'Generate Digital Pass'}</button>
      </form>
    </div>
  );
}

// --- ส่วนประกอบ UI ---
function InputField({ label, placeholder, value, onChange, type = "text", required = false, min }) {
  return (
    <div className="animate-in fade-in duration-700 text-left font-sans text-left text-left text-left text-left text-left">
      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4 ml-3 text-left font-sans text-left text-left text-left text-left">{label} {required && "*"}</label>
      <input required={required} type={type} min={min} className="w-full bg-slate-50 border border-slate-200 rounded-3xl p-6 text-slate-900 placeholder:text-slate-300 focus:ring-8 focus:ring-blue-50 focus:border-blue-600 outline-none transition-all shadow-inner font-bold text-lg text-left font-sans text-left text-left text-left" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function SelectField({ label, options, value, onChange }) {
  return (
    <div className="animate-in fade-in duration-700 text-left font-sans text-left text-left text-left text-left text-left text-left">
      {label && <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4 ml-3 text-left font-sans text-left text-left text-left text-left">{label}</label>}
      <div className="relative text-left font-sans text-left text-left text-left text-left">
        <select className="w-full bg-slate-50 border border-slate-200 rounded-3xl p-6 text-slate-900 focus:ring-8 focus:ring-blue-50 focus:border-blue-600 outline-none transition-all shadow-inner font-bold text-lg cursor-pointer appearance-none text-left font-sans text-left text-left text-left text-left" value={value} onChange={e => onChange(e.target.value)}>
          {options.map(opt => <option key={opt} value={opt} className="bg-white text-slate-900 font-sans text-left text-left text-left text-left">{opt}</option>)}
        </select>
        <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 font-sans text-left text-left text-left">
           <ChevronRight size={20} className="rotate-90 font-sans text-left text-left text-left" />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const config = {
    [STATUS.PENDING]: { text: 'Scheduled', color: 'bg-blue-50 text-blue-600 border-blue-100 shadow-sm' },
    [STATUS.INSIDE]: { text: 'On-Site', color: 'bg-emerald-50 text-emerald-600 border-emerald-100 shadow-sm' },
    [STATUS.APPROVED_OUT]: { text: 'Ready to Exit', color: 'bg-orange-50 text-orange-600 border-orange-200 shadow-sm' },
    [STATUS.COMPLETED]: { text: 'Departed', color: 'bg-slate-50 text-slate-400 border-slate-100 opacity-60' },
  };
  const { text, color } = config[status] || config[STATUS.PENDING];
  return <span className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] border ${color} inline-block font-sans text-left text-left text-left`}>{text}</span>;
}
