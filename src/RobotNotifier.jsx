import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, firebaseReady, appId } from './firebase';
import { normalizeDepartment } from './constants';

const RobotNotifier = ({ role, hostIdentity }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [bounce, setBounce] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [toast, setToast] = useState(null); // { title, name, sourceForm } | null
  const prevIdsRef = useRef(new Set());
  const audioCtxRef = useRef(null);

  // เสียงดิ๊ง (ใช้ Web Audio API — ไม่ต้องมีไฟล์ mp3)
  const playDing = () => {
    try {
      if (!audioCtxRef.current) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        audioCtxRef.current = new Ctx();
      }
      const ctx = audioCtxRef.current;
      // 2 tones: hi → lo
      const playTone = (freq, when, dur = 0.15) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0, ctx.currentTime + when);
        gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + when + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + when);
        osc.stop(ctx.currentTime + when + dur);
      };
      playTone(880, 0);
      playTone(1320, 0.18);
    } catch {}
  };

  // Browser desktop notification
  const showDesktopNotif = (title, body) => {
    try {
      if (typeof Notification === 'undefined') return;
      if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/favicon.svg', tag: 'soc-approve' });
      } else if (Notification.permission === 'default') {
        Notification.requestPermission().then((p) => {
          if (p === 'granted') new Notification(title, { body, icon: '/favicon.svg', tag: 'soc-approve' });
        });
      }
    } catch {}
  };

  // Realtime listener — เด้งทันทีเมื่อ Firestore เปลี่ยน
  useEffect(() => {
    if (!firebaseReady || !db) return;
    if (!hostIdentity?.department && role !== 'SECURITY') return;

    const targetDept = role === 'SECURITY' ? 'SECURITY' : hostIdentity.department;
    const targetNorm = normalizeDepartment(targetDept);

    // ขอ permission เปิดเด้ง browser notification (ครั้งแรก)
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    } catch {}

    const collRef = collection(db, 'artifacts', appId, 'public', 'data', 'approval_workflows');
    const q = query(collRef, where('status', '==', 'pending'));
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ ...d.data(), _docId: d.id }));
      const filtered = all
        .filter((x) => normalizeDepartment(x.department) === targetNorm)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

      // ตรวจของใหม่ที่เพิ่งเข้ามา (เทียบกับ prevIds)
      const currentIds = new Set(filtered.map((n) => n.id));
      const isFirstLoad = prevIdsRef.current.size === 0 && currentIds.size > 0 && !window.__robotNotifierLoaded;
      const newOnes = filtered.filter((n) => !prevIdsRef.current.has(n.id));

      // ถ้ามีใหม่และไม่ใช่โหลดครั้งแรก → เด้ง toast + เสียง
      if (newOnes.length > 0 && !isFirstLoad && prevIdsRef.current.size > 0) {
        const first = newOnes[0];
        const sourceForm = first.sourceForm || 'เอกสาร';
        const formLabel = {
          VEHICLE_BOOKING: '🚗 ขอใช้รถ',
          DRINK_ORDER: '☕ สั่งเครื่องดื่ม',
          FOOD_ORDER: '🍽 สั่งอาหาร',
          OUTING_REQUEST: '🚪 ขอออกนอก',
          GOODS_IN_OUT: '📦 ของเข้า/ออก',
          VISITOR: '👥 ผู้มาติดต่อ',
          EQUIPMENT_REQUEST: '✏️ เบิกอุปกรณ์',
        }[sourceForm] || '📄 เอกสารใหม่';

        setToast({
          title: formLabel,
          name: first.requesterName || first.requesterId || '-',
          dept: first.requesterDepartment || '-',
          docId: first.id,
        });
        setBounce(true);
        setTimeout(() => setBounce(false), 3000);
        playDing();
        showDesktopNotif(`${formLabel} — รออนุมัติ`, `จาก: ${first.requesterName || first.requesterId || '-'}`);

        // Auto-dismiss toast หลัง 8 วินาที
        setTimeout(() => setToast(null), 8000);
      }

      prevIdsRef.current = currentIds;
      window.__robotNotifierLoaded = true;
      setNotifications(filtered);
    }, (err) => {
      console.warn('[RobotNotifier] snapshot error:', err);
    });

    return () => unsub();
  }, [hostIdentity?.department, role]);

  const count = notifications.length;

  const getRobotMessage = () => {
    if (count === 0) return 'ไม่มีงานค้าง สบายๆ ครับ~ 😊';
    if (count === 1) return `มีเอกสารรออนุมัติ 1 รายการครับ!`;
    return `มีเอกสารรออนุมัติ ${count} รายการครับ!`;
  };

  const getRoleGreeting = () => {
    if (role === 'HOST') return `สวัสดีครับหัวหน้า!`;
    if (role === 'EMPLOYEE') return `สวัสดีครับ!`;
    if (role === 'SECURITY') return `สวัสดีครับ รปภ.!`;
    if (role === 'ADMIN') return `สวัสดีครับ Admin!`;
    return 'สวัสดีครับ!';
  };

  const getSourceFormLabel = (sf) => {
    const map = {
      VEHICLE_BOOKING: 'ขอใช้รถ',
      DRINK_ORDER: 'สั่งเครื่องดื่ม',
      FOOD_ORDER: 'สั่งอาหาร',
      OUTING_REQUEST: 'ขอออกนอก',
      GOODS_IN_OUT: 'ของเข้า/ออก',
      VISITOR: 'ผู้มาติดต่อ',
      EQUIPMENT_REQUEST: 'เบิกอุปกรณ์',
    };
    return map[sf] || sf || 'เอกสาร';
  };

  // ซ่อนสำหรับ Guest
  if (role === 'GUEST') return null;

  return (
    <>
      {/* 🎉 Toast Popup — เด้งกลางจอเมื่อมีเอกสารใหม่ */}
      {toast && (
        <div
          onClick={() => {
            // คลิก toast → เปิด chat bubble + selected doc
            const doc = notifications.find((n) => n.id === toast.docId);
            if (doc) {
              setSelectedDoc(doc);
              setIsOpen(true);
            }
            setToast(null);
          }}
          style={{
            position: 'fixed',
            top: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 99999,
            background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
            color: '#fff',
            padding: '16px 24px',
            borderRadius: 16,
            boxShadow: '0 12px 40px rgba(239,68,68,0.4)',
            border: '3px solid #fff',
            cursor: 'pointer',
            minWidth: 320,
            maxWidth: 480,
            animation: 'toastSlideDown 0.4s ease, toastShake 0.5s ease 0.4s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 36 }}>📩</div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 11, fontWeight: 800, opacity: 0.9, margin: 0, letterSpacing: 1, textTransform: 'uppercase' }}>
                เอกสารใหม่เข้ามา!
              </p>
              <p style={{ fontSize: 16, fontWeight: 900, margin: '2px 0 0' }}>
                {toast.title}
              </p>
              <p style={{ fontSize: 13, margin: '2px 0 0', opacity: 0.95 }}>
                จาก: <strong>{toast.name}</strong> · {toast.dept}
              </p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setToast(null); }}
              style={{
                background: 'rgba(255,255,255,0.25)', border: 'none', color: '#fff',
                width: 28, height: 28, borderRadius: 8, cursor: 'pointer', fontSize: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}
            >✕</button>
          </div>
          <p style={{ fontSize: 11, margin: '8px 0 0', opacity: 0.85, textAlign: 'center' }}>
            👆 คลิกเพื่อดูรายละเอียดและเซ็นอนุมัติ
          </p>
        </div>
      )}

      {/* Robot Button */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 9999,
          cursor: 'pointer',
          animation: bounce ? 'robotBounce 0.5s ease 5' : 'robotFloat 3s ease-in-out infinite',
        }}
      >
        {/* Badge จำนวน */}
        {count > 0 && (
          <div style={{
            position: 'absolute', top: -6, right: -6,
            background: '#ef4444', color: '#fff',
            width: 24, height: 24, borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 900, border: '2px solid #fff',
            boxShadow: '0 2px 8px rgba(239,68,68,0.4)',
            animation: bounce ? 'badgePulse 0.6s ease infinite' : 'none',
          }}>
            {count}
          </div>
        )}

        {/* Robot SVG */}
        <div style={{
          width: 64, height: 64,
          background: bounce ? 'linear-gradient(135deg, #f59e0b, #ef4444)' : 'linear-gradient(135deg, #3b82f6, #6366f1)',
          borderRadius: 20, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          boxShadow: bounce ? '0 8px 32px rgba(239,68,68,0.6)' : '0 8px 32px rgba(59,130,246,0.4)',
          border: '3px solid #fff',
          transition: 'all 0.3s',
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
            <rect x="5" y="4" width="14" height="12" rx="3" fill="#fff"/>
            <circle cx="9" cy="10" r="1.5" fill={count > 0 ? '#ef4444' : '#3b82f6'}/>
            <circle cx="15" cy="10" r="1.5" fill={count > 0 ? '#ef4444' : '#3b82f6'}/>
            <path d={count > 0 ? "M9 13 Q12 15 15 13" : "M9 13 Q12 15 15 13"} stroke={count > 0 ? '#ef4444' : '#3b82f6'} strokeWidth="1.5" fill="none" strokeLinecap="round"/>
            <line x1="12" y1="4" x2="12" y2="1" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="12" cy="1" r="1.5" fill={count > 0 ? '#fbbf24' : '#fff'}/>
            <rect x="8" y="17" width="8" height="4" rx="1.5" fill="#fff" opacity="0.7"/>
          </svg>
        </div>
      </div>

      {/* Chat Bubble */}
      {isOpen && (
        <div style={{
          position: 'fixed', bottom: 100, right: 24,
          zIndex: 9998, width: 320, maxHeight: '70vh',
          background: '#fff', borderRadius: 24,
          boxShadow: '0 12px 48px rgba(0,0,0,0.15)',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          animation: 'robotSlideUp 0.3s ease',
        }}>
          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
            padding: '16px 20px', color: '#fff',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: 11, opacity: 0.8, margin: 0 }}>🤖 SOC Bot</p>
                <p style={{ fontSize: 16, fontWeight: 900, margin: '4px 0 0' }}>{getRoleGreeting()}</p>
              </div>
              <button onClick={() => setIsOpen(false)} style={{
                background: 'rgba(255,255,255,0.2)', border: 'none',
                color: '#fff', width: 28, height: 28, borderRadius: 8,
                cursor: 'pointer', fontSize: 16, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}>✕</button>
            </div>
            <p style={{ fontSize: 13, margin: '8px 0 0', opacity: 0.9 }}>
              {getRobotMessage()}
            </p>
          </div>

          {/* Content */}
          <div style={{ maxHeight: 360, overflowY: 'auto', padding: '8px 0' }}>
            {count === 0 ? (
              <div style={{ padding: 32, textAlign: 'center' }}>
                <p style={{ fontSize: 48, margin: 0 }}>✨</p>
                <p style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>ไม่มีเอกสารรออนุมัติ</p>
                <p style={{ color: '#cbd5e1', fontSize: 11 }}>เมื่อมีงานใหม่ผมจะบอกครับ!</p>
              </div>
            ) : (
              selectedDoc ? (
                <div style={{ padding: '16px 20px' }}>
                  <button onClick={() => setSelectedDoc(null)} style={{
                    background: '#f1f5f9', border: 'none', padding: '6px 14px',
                    borderRadius: 10, fontSize: 12, fontWeight: 700, color: '#64748b',
                    cursor: 'pointer', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 4,
                  }}>← กลับ</button>

                  <p style={{ fontSize: 10, fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>
                    {getSourceFormLabel(selectedDoc.sourceForm)}
                  </p>
                  <p style={{ fontSize: 16, fontWeight: 900, color: '#1e293b', margin: '4px 0 12px' }}>
                    {selectedDoc.topic || '-'}
                  </p>

                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 12, marginBottom: 12 }}>
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div><span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>ผู้ขอ:</span> <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{selectedDoc.requesterName || '-'}</span></div>
                      <div><span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>รหัส:</span> <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{selectedDoc.requesterId || '-'}</span></div>
                      <div><span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>แผนก:</span> <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{selectedDoc.requesterDepartment || '-'}</span></div>
                      <div><span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>ขั้นตอน:</span> <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{selectedDoc.stepLabel || `ขั้น ${selectedDoc.step}`}</span></div>
                      <div><span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>วันที่ส่ง:</span> <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{selectedDoc.createdAt?.split('T')[0] || '-'}</span></div>
                      {selectedDoc.requestPayload?.destination && (
                        <div><span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>ปลายทาง:</span> <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{selectedDoc.requestPayload.destination}</span></div>
                      )}
                      {selectedDoc.requestPayload?.date && (
                        <div><span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>วันที่ใช้:</span> <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{selectedDoc.requestPayload.date}</span></div>
                      )}
                      {selectedDoc.requestPayload?.note && (
                        <div><span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>หมายเหตุ:</span> <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{selectedDoc.requestPayload.note}</span></div>
                      )}
                    </div>
                  </div>

                  <a
                    href={`/index.html?approve=${selectedDoc.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'block', width: '100%', padding: '12px 0',
                      background: '#16a34a', color: '#fff', textAlign: 'center',
                      borderRadius: 12, fontWeight: 900, fontSize: 14,
                      textDecoration: 'none', border: 'none', cursor: 'pointer',
                    }}
                  >
                    ✓ เปิดหน้าเซ็นอนุมัติ
                  </a>
                </div>
              ) : (
              notifications.map((n, idx) => (
                <div key={n.id || idx} style={{
                  padding: '12px 20px', borderBottom: '1px solid #f1f5f9',
                  cursor: 'pointer', transition: 'background 0.15s',
                }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                   onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                   onClick={() => setSelectedDoc(n)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <p style={{
                        fontSize: 10, fontWeight: 800, color: '#3b82f6',
                        textTransform: 'uppercase', letterSpacing: 1, margin: 0,
                      }}>
                        {getSourceFormLabel(n.sourceForm)}
                      </p>
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '4px 0 0' }}>
                        {n.requesterName || n.requesterId || '-'}
                      </p>
                      <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>
                        {n.topic || '-'}
                      </p>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '4px 10px',
                      borderRadius: 8, background: '#fef3c7', color: '#d97706',
                      whiteSpace: 'nowrap',
                    }}>
                      ขั้น {n.step || 1}
                    </span>
                  </div>
                </div>
              ))
              )
            )}
          </div>

          {count > 0 && (
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9' }}>
              <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', margin: 0 }}>
                กดที่รายการเพื่อดูรายละเอียด
              </p>
            </div>
          )}
        </div>
      )}

      {/* CSS Animations */}
      <style>{`
        @keyframes robotFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes robotBounce {
          0%, 100% { transform: scale(1) rotate(0deg); }
          25% { transform: scale(1.25) rotate(-8deg); }
          50% { transform: scale(1.3) rotate(0deg); }
          75% { transform: scale(1.25) rotate(8deg); }
        }
        @keyframes badgePulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.4); }
        }
        @keyframes robotSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes toastSlideDown {
          from { opacity: 0; transform: translate(-50%, -40px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes toastShake {
          0%, 100% { transform: translate(-50%, 0) rotate(0); }
          15%, 45%, 75% { transform: translate(-50%, 0) rotate(-2deg); }
          30%, 60%, 90% { transform: translate(-50%, 0) rotate(2deg); }
        }
      `}</style>
    </>
  );
};

export default RobotNotifier;
