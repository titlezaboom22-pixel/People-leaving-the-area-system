import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db, firebaseReady, appId } from './firebase';

export async function logAction(action, details = {}) {
  if (!firebaseReady || !db) return;

  try {
    const collRef = collection(db, 'artifacts', appId, 'public', 'data', 'audit_logs');
    await addDoc(collRef, {
      action,
      ...details,
      timestamp: Timestamp.now(),
      date: new Date().toISOString().split('T')[0],
      userAgent: navigator.userAgent?.slice(0, 200) || '-',
    });
  } catch (err) {
    console.warn('Audit log error:', err);
  }
}

// Predefined actions
export const ACTIONS = {
  LOGIN: 'LOGIN',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  APPROVE_DOCUMENT: 'APPROVE_DOCUMENT',
  CREATE_APPOINTMENT: 'CREATE_APPOINTMENT',
  ADMIT_VISITOR: 'ADMIT_VISITOR',
  EXIT_VISITOR: 'EXIT_VISITOR',
  SUBMIT_FORM: 'SUBMIT_FORM',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
};
