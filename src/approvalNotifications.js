import {
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db, firebaseReady, appId } from './firebase';
import {
  DEPARTMENTS,
  HR_DEPARTMENT,
  SHOP_DEPARTMENT,
  SECURITY_DEPARTMENT,
  STEP_LABEL,
  DEPT_ALIAS,
  WORKFLOW_ROUTES,
  normalizeDepartment,
  resolveQueueDepartment,
} from './constants';
import {
  notifyRequestCreated,
  notifyStepApproved,
  notifyWorkflowCompleted,
} from './notifyEmail';

// Re-export for backward compatibility
export { DEPARTMENTS as NOTIFY_DEPARTMENTS, HR_DEPARTMENT, SHOP_DEPARTMENT, resolveQueueDepartment };

// --- localStorage keys (offline fallback) ---
const STORAGE_KEY = 'approval_notifications_v2';
const SESSION_KEY = 'approval_notifications_session_v2';
const MEMORY_KEY = '__approval_notifications_memory_v2';

function normalizeId(value) {
  return (value || '').toString().trim().toUpperCase();
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// --- Firestore helpers ---
function getCollRef() {
  return collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows');
}

// --- localStorage fallback ---
function readAllLocal() {
  let items = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    items = raw ? JSON.parse(raw) : [];
  } catch {}
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (parsed.length > items.length) items = parsed;
  } catch {}
  try {
    const mem = window[MEMORY_KEY];
    if (Array.isArray(mem) && mem.length > items.length) items = mem;
  } catch {}
  const map = new Map();
  for (const item of items) {
    if (item && item.id && !map.has(item.id)) map.set(item.id, item);
  }
  return Array.from(map.values());
}

function writeAllLocal(items) {
  const safeItems = Array.isArray(items) ? items.slice(0, 2000) : [];
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(safeItems)); } catch {}
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(safeItems)); } catch {}
  try { window[MEMORY_KEY] = safeItems; } catch {}
}

function copyWorkflowBase(n) {
  return {
    topic: n.topic,
    sourceForm: n.sourceForm,
    requesterId: n.requesterId,
    requesterName: n.requesterName,
    requestPayload: n.requestPayload,
    chainId: n.chainId || n.id,
    createdAt: n.createdAt,
  };
}

function getRouteForStep(sourceForm, nextStep) {
  const route = WORKFLOW_ROUTES[sourceForm];
  if (!route) {
    // Default: HR → Shop
    return {
      department: nextStep === 2 ? HR_DEPARTMENT : SHOP_DEPARTMENT,
      stepLabel: nextStep === 2 ? 'หัวหน้าแผนก HR' : 'ร้านค้า / จัดซื้อ',
    };
  }
  if (nextStep === 2) {
    return {
      department: route.step2 === 'HR' ? HR_DEPARTMENT : route.step2,
      stepLabel: route.step2Label || STEP_LABEL[2],
      targetType: route.step2, // COFFEE_SHOP, OT_FOOD_SHOP, HR
    };
  }
  if (nextStep === 3 && route.steps >= 3) {
    return {
      department: route.step3 === 'SECURITY' ? SECURITY_DEPARTMENT : (route.step3 || SHOP_DEPARTMENT),
      stepLabel: route.step3Label || STEP_LABEL[3],
      targetType: route.step3, // SECURITY
    };
  }
  return { department: SHOP_DEPARTMENT, stepLabel: STEP_LABEL[nextStep] };
}

function getMaxSteps(sourceForm) {
  const route = WORKFLOW_ROUTES[sourceForm];
  return route ? route.steps : 3;
}

function buildNextStep(prev, nextStep) {
  const now = new Date().toISOString();
  const routeInfo = getRouteForStep(prev.sourceForm, nextStep);
  return {
    id: newId(),
    ...copyWorkflowBase(prev),
    sourceForm: prev.sourceForm,
    step: nextStep,
    stepLabel: routeInfo.stepLabel,
    department: routeInfo.department,
    targetType: routeInfo.targetType || null,
    requesterDepartment: prev.requesterDepartment,
    status: 'pending',
    createdAt: prev.createdAt,
    forwardedAt: now,
    acknowledgedAt: null,
    approvedBy: null,
    approvedSign: null,
  };
}

// --- Public API ---

export async function createApprovalWorkflowRequest({
  topic,
  requesterId = '-',
  requesterName = '-',
  sourceForm = '-',
  requestPayload = null,
  requesterDepartment = '',
  targetUserId = null,
  targetUserEmail = null,
  targetUserName = null,
}) {
  const now = new Date().toISOString();
  const chainId = `wf-${newId()}`;
  const queueDept = resolveQueueDepartment(requesterDepartment);
  const isHrRequester = normalizeDepartment(queueDept) === normalizeDepartment(HR_DEPARTMENT);

  // สั่งเครื่องดื่ม/อาหาร → ส่งให้ GA โดยตรง ไม่ผ่านหัวหน้า
  const route = WORKFLOW_ROUTES[sourceForm];
  const isDirectToGA = route && route.targetType === 'GA' && route.steps === 1;

  let step;
  let department;
  let stepLabel;
  let targetType = null;

  if (isDirectToGA) {
    step = 1;
    department = 'GA';
    stepLabel = route.step1Label || 'GA รับออเดอร์';
    targetType = 'GA';
  } else {
    step = isHrRequester ? 2 : 1;
    department = isHrRequester ? HR_DEPARTMENT : queueDept;
    stepLabel = STEP_LABEL[step];
  }

  const item = {
    id: newId(),
    chainId,
    step,
    stepLabel,
    topic,
    sourceForm,
    requesterId,
    requesterName,
    requesterDepartment: queueDept,
    department,
    targetType,
    targetUserId: targetUserId || null,
    targetUserEmail: targetUserEmail || null,
    targetUserName: targetUserName || null,
    totalSteps: getMaxSteps(sourceForm),
    requestPayload,
    status: 'pending',
    createdAt: now,
    acknowledgedAt: null,
    approvedBy: null,
    approvedSign: null,
  };

  // Try Firestore first, fallback to localStorage
  if (firebaseReady && db) {
    try {
      await addDoc(getCollRef(), {
        ...item,
        firestoreCreatedAt: Timestamp.now(),
      });
      // Also save locally as cache
      const all = readAllLocal();
      writeAllLocal([item, ...all]);
      // fire-and-forget email notification
      try { notifyRequestCreated(item); } catch {}
      return item.id;
    } catch (err) {
      console.warn('Firestore write failed, using localStorage fallback:', err);
    }
  }

  const all = readAllLocal();
  writeAllLocal([item, ...all]);
  try { notifyRequestCreated(item); } catch {}
  return item.id;
}

export async function getPendingNotificationsByDepartment(department) {
  const target = normalizeDepartment(department);

  if (firebaseReady && db) {
    try {
      const q = query(
        getCollRef(),
        where('status', '==', 'pending'),
      );
      const snap = await getDocs(q);
      return snap.docs
        .map((d) => ({ ...d.data(), _docId: d.id }))
        .filter((x) => normalizeDepartment(x.department) === target)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    } catch (err) {
      console.warn('Firestore read failed, using localStorage fallback:', err);
    }
  }

  return readAllLocal()
    .filter((x) => normalizeDepartment(x.department) === target && x.status === 'pending')
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function getWorkflowSummariesForRequester(requesterId) {
  const target = normalizeId(requesterId);
  if (!target) return [];

  let items;

  if (firebaseReady && db) {
    try {
      const q = query(
        getCollRef(),
        where('requesterId', '==', target),
      );
      const snap = await getDocs(q);
      items = snap.docs
        .map((d) => ({ ...d.data(), _docId: d.id }))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    } catch (err) {
      console.warn('Firestore read failed, using localStorage fallback:', err);
      items = null;
    }
  }

  if (!items) {
    items = readAllLocal()
      .filter((x) => normalizeId(x.requesterId) === target)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  const byChain = new Map();
  for (const it of items) {
    const cid = it.chainId || it.id;
    if (!byChain.has(cid)) byChain.set(cid, []);
    byChain.get(cid).push(it);
  }

  return Array.from(byChain.entries())
    .map(([chainId, steps]) => {
      const sorted = steps.sort((a, b) => (a.step || 1) - (b.step || 1));
      const returned = sorted.find((s) => s.status === 'returned');
      const pending = sorted.find((s) => s.status === 'pending');
      const last = sorted[sorted.length - 1];
      const lastStep = last?.step || 1;
      const sourceForm = sorted[0]?.sourceForm;
      const route = WORKFLOW_ROUTES[sourceForm];
      const maxSteps = route?.steps || 3;

      let label = 'กำลังดำเนินการ';
      const isGaDirect = last?.targetType === 'GA' || pending?.targetType === 'GA';
      const isVehicleBooking = sourceForm === 'VEHICLE_BOOKING';
      if (returned) {
        label = '⚠️ ถูกส่งกลับให้แก้ไข';
      } else if (pending) {
        if (isVehicleBooking && pending.targetType === 'GA') {
          label = 'รอ GA จัดรถ';
        } else if (isVehicleBooking && pending.step === 1) {
          label = 'รอหัวหน้าแผนกเซ็น';
        } else if (isGaDirect) {
          label = 'รอ GA รับออเดอร์';
        } else {
          label =
            pending.step === 1
              ? 'รอหัวหน้าแผนกผู้ส่งเซ็น'
              : pending.step === 2
                ? 'รอหัวหน้าแผนก HR เซ็น'
                : pending.step === 3
                  ? 'รอร้านค้า/จัดซื้อรับเอกสาร'
                  : 'รออนุมัติ';
        }
      } else if (isVehicleBooking && lastStep >= maxSteps && last?.status === 'approved') {
        // VEHICLE_BOOKING: step 2 = GA → เสร็จสมบูรณ์
        if (last.vehicleResult === 'no_vehicle') {
          label = '✅ GA แจ้ง: ไม่มีรถให้ใช้งาน';
        } else if (last.vehicleResult === 'assigned') {
          label = '✅ GA จัดรถให้แล้ว';
        } else {
          label = '✅ อนุมัติครบแล้ว';
        }
      } else if (isGaDirect && last?.status === 'approved') {
        label = '✅ GA รับออเดอร์แล้ว';
      } else if (lastStep >= maxSteps && last?.status === 'approved') {
        label = '✅ ครบกระบวนการแล้ว';
      } else if (last?.status === 'approved') {
        label = 'อนุมัติแล้ว (กำลังส่งต่อ)';
      }

      return {
        chainId,
        steps: sorted,
        pending,
        returned,
        returnNote: returned?.returnNote || null,
        statusLabel: label,
        isDone: !pending && !returned && lastStep >= maxSteps && last?.status === 'approved',
        isReturned: !!returned,
      };
    })
    .sort((a, b) => String(b.steps[0]?.createdAt).localeCompare(String(a.steps[0]?.createdAt)));
}

export async function approveNotification(notificationId, { approvedBy = '-', approvedSign = null } = {}) {
  const approvedAt = new Date().toISOString();

  if (firebaseReady && db) {
    try {
      // Find the document by custom id field
      const q = query(getCollRef(), where('id', '==', notificationId));
      const snap = await getDocs(q);
      if (snap.empty) {
        console.warn('Notification not found in Firestore:', notificationId);
        // Fall through to localStorage
      } else {
        const docSnap = snap.docs[0];
        const n = docSnap.data();
        const step = n.step || 1;

        await updateDoc(doc(db, docSnap.ref.path), {
          status: 'approved',
          acknowledgedAt: approvedAt,
          approvedBy,
          approvedSign,
        });

        // Create next step if needed
        const maxSteps = getMaxSteps(n.sourceForm);
        let nextItem = null;
        if (step < maxSteps) {
          nextItem = buildNextStep(n, step + 1);
          await addDoc(getCollRef(), {
            ...nextItem,
            firestoreCreatedAt: Timestamp.now(),
          });
        }

        // Update local cache too
        const all = readAllLocal();
        const idx = all.findIndex((x) => x.id === notificationId);
        if (idx !== -1) {
          all[idx] = { ...all[idx], status: 'approved', acknowledgedAt: approvedAt, approvedBy, approvedSign };
          if (nextItem) all.unshift(nextItem);
          writeAllLocal(all);
        }

        // Fire-and-forget email notifications
        const approvedItem = { ...n, status: 'approved', acknowledgedAt: approvedAt, approvedBy, approvedSign };
        try {
          if (nextItem) {
            notifyStepApproved(nextItem, approvedItem);
          } else {
            // workflow complete → แจ้งผู้ขอ
            notifyWorkflowCompleted(approvedItem);
          }
        } catch {}
        return;
      }
    } catch (err) {
      console.warn('Firestore approve failed, using localStorage fallback:', err);
    }
  }

  // localStorage fallback
  const all = readAllLocal();
  const idx = all.findIndex((n) => n.id === notificationId);
  if (idx === -1) return;

  const n = all[idx];
  const step = n.step || 1;

  all[idx] = {
    ...n,
    status: 'approved',
    acknowledgedAt: approvedAt,
    approvedBy,
    approvedSign,
  };

  const maxStepsLocal = getMaxSteps(n.sourceForm);
  let nextLocal = null;
  if (step < maxStepsLocal) {
    nextLocal = buildNextStep(all[idx], step + 1);
    all.unshift(nextLocal);
  }

  writeAllLocal(all);

  try {
    if (nextLocal) {
      notifyStepApproved(nextLocal, all[idx]);
    } else {
      notifyWorkflowCompleted(all[idx]);
    }
  } catch {}
}
