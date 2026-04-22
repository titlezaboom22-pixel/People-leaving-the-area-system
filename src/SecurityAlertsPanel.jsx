// ============================================================================
// Security Alerts Panel — Layer 4
// ============================================================================
// แสดงใน AdminView — รายการ security events จาก email-server + frontend
//
// จะเห็นอะไรบ้าง:
//   - rate-limit-*         → ใครยิง API เกิน limit
//   - invalid-api-key      → ใครลอง API โดยไม่มี key
//   - recipient-not-allowed → พยายามส่ง email ไป domain นอก whitelist
//   - payload-too-large    → ส่ง body เกิน 500KB
//   - honeypot-filled (frontend) → bot กรอก honeypot
//   - too-fast (frontend)  → submit เร็วเกินมนุษย์
// ============================================================================
import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Shield, AlertTriangle, Trash2, CheckCircle2, Clock, Globe, Filter } from 'lucide-react';
import { db, firebaseReady, appId } from './firebase';

const SEVERITY_STYLE = {
  high:   { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    label: 'HIGH',   icon: '🚨' },
  medium: { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  label: 'MEDIUM', icon: '⚠️' },
  low:    { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   label: 'LOW',    icon: 'ℹ️' },
};

const TYPE_LABELS = {
  'rate-limit-general':     { th: 'ยิง API บ่อยเกิน (ทั่วไป)',     emoji: '🚦' },
  'rate-limit-email':       { th: 'ส่งอีเมลบ่อยเกิน',             emoji: '📧' },
  'rate-limit-public-form': { th: 'ลงทะเบียน Guest form บ่อยเกิน', emoji: '📝' },
  'invalid-api-key':        { th: 'API key ผิด / ไม่มี',           emoji: '🔑' },
  'recipient-not-allowed':  { th: 'ส่งอีเมลไป domain ไม่อนุญาต',     emoji: '📬' },
  'payload-too-large':      { th: 'ส่ง body ใหญ่เกิน',              emoji: '📦' },
  'invalid-phone':          { th: 'เบอร์โทรผิด format',              emoji: '📞' },
  'honeypot-filled':        { th: 'Bot กรอก honeypot',               emoji: '🍯' },
  'too-fast':               { th: 'Submit เร็วเกินมนุษย์',           emoji: '⚡' },
};

export default function SecurityAlertsPanel() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | unresolved | high

  useEffect(() => {
    if (!firebaseReady || !db) { setLoading(false); return; }
    const ref = collection(db, 'artifacts', appId, 'public', 'data', 'security_alerts');
    const q = query(ref, orderBy('at', 'desc'), limit(200));
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAlerts(rows);
      setLoading(false);
    }, (err) => {
      console.error('security_alerts listener error:', err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'unresolved') return alerts.filter(a => !a.resolved);
    if (filter === 'high')       return alerts.filter(a => a.severity === 'high');
    return alerts;
  }, [alerts, filter]);

  const stats = useMemo(() => {
    const last24h = Date.now() - 24 * 60 * 60 * 1000;
    const recent = alerts.filter(a => {
      const t = a.at?.toDate?.() || new Date(a.at);
      return t && t.getTime() > last24h;
    });
    return {
      total: alerts.length,
      last24h: recent.length,
      unresolved: alerts.filter(a => !a.resolved).length,
      high: alerts.filter(a => a.severity === 'high').length,
      uniqueIPs: new Set(alerts.map(a => a.ip).filter(Boolean)).size,
    };
  }, [alerts]);

  const markResolved = async (id) => {
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'security_alerts', id), {
        resolved: true,
        resolvedAt: new Date().toISOString(),
      });
    } catch (err) {
      alert('ไม่สามารถอัปเดตได้: ' + err.message);
    }
  };

  const deleteAlert = async (id) => {
    if (!confirm('ลบ alert นี้ถาวร?')) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'security_alerts', id));
    } catch (err) {
      alert('ไม่สามารถลบได้: ' + err.message);
    }
  };

  const formatTime = (at) => {
    try {
      const d = at?.toDate?.() || new Date(at);
      return d.toLocaleString('th-TH', { hour12: false });
    } catch {
      return '-';
    }
  };

  if (loading) return (
    <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400">
      <Shield className="w-8 h-8 mx-auto mb-2 animate-pulse" />
      กำลังโหลด security events...
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header + Stats */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-700 text-white rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-6 h-6" />
          <h3 className="text-lg font-black">Security Monitoring</h3>
          <span className="ml-auto text-xs bg-white/10 px-3 py-1 rounded-full">Real-time</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Total" value={stats.total} />
          <StatCard label="24 ชม" value={stats.last24h} accent="bg-amber-500/20 border-amber-400/30" />
          <StatCard label="ยังไม่แก้" value={stats.unresolved} accent="bg-red-500/20 border-red-400/30" />
          <StatCard label="High severity" value={stats.high} accent="bg-red-500/20 border-red-400/30" />
          <StatCard label="IPs" value={stats.uniqueIPs} accent="bg-blue-500/20 border-blue-400/30" />
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-slate-400" />
        <FilterBtn active={filter === 'all'}        onClick={() => setFilter('all')}>ทั้งหมด ({stats.total})</FilterBtn>
        <FilterBtn active={filter === 'unresolved'} onClick={() => setFilter('unresolved')}>ยังไม่แก้ ({stats.unresolved})</FilterBtn>
        <FilterBtn active={filter === 'high'}       onClick={() => setFilter('high')}>High severity ({stats.high})</FilterBtn>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 mb-3" />
          <p className="text-emerald-700 font-bold">ไม่พบ security event — ระบบปลอดภัย</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(a => {
            const sev = SEVERITY_STYLE[a.severity] || SEVERITY_STYLE.medium;
            const typeMeta = TYPE_LABELS[a.type] || { th: a.type, emoji: '⚠️' };
            return (
              <div key={a.id} className={`rounded-xl border p-4 ${a.resolved ? 'bg-slate-50 border-slate-200 opacity-60' : sev.bg + ' ' + sev.border}`}>
                <div className="flex items-start gap-3">
                  <div className="text-2xl">{typeMeta.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${sev.text} ${sev.bg}`}>{sev.label}</span>
                      <span className="font-black text-slate-900 text-sm">{typeMeta.th}</span>
                      {a.resolved && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">✓ แก้แล้ว</span>}
                    </div>
                    <div className="flex items-center gap-4 flex-wrap text-xs text-slate-600">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatTime(a.at)}</span>
                      <span className="flex items-center gap-1 font-mono"><Globe className="w-3 h-3" />{a.ip || '-'}</span>
                      <span className="truncate">{a.path}</span>
                    </div>
                    {a.details && a.details !== '{}' && (
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-slate-500 hover:text-slate-700">details</summary>
                        <pre className="mt-1 bg-slate-900 text-slate-100 p-2 rounded-md overflow-x-auto text-[11px]">{a.details}</pre>
                      </details>
                    )}
                    {a.userAgent && (
                      <div className="mt-1 text-[10px] text-slate-400 truncate">UA: {a.userAgent}</div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {!a.resolved && (
                      <button onClick={() => markResolved(a.id)} title="แก้แล้ว" className="p-2 rounded-lg hover:bg-white/60 text-emerald-600">
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => deleteAlert(a.id)} title="ลบ" className="p-2 rounded-lg hover:bg-white/60 text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent = 'bg-white/10 border-white/20' }) {
  return (
    <div className={`${accent} border rounded-xl p-3 text-center`}>
      <div className="text-2xl font-black">{value}</div>
      <div className="text-[10px] opacity-80 uppercase tracking-wider">{label}</div>
    </div>
  );
}

function FilterBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
        active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {children}
    </button>
  );
}
