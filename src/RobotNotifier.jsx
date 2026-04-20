import React, { useState, useEffect } from 'react';
import { getPendingNotificationsByDepartment } from './approvalNotifications';

const RobotNotifier = ({ role, hostIdentity }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [bounce, setBounce] = useState(false);
  const [prevCount, setPrevCount] = useState(0);
  const [selectedDoc, setSelectedDoc] = useState(null);

  useEffect(() => {
    if (!hostIdentity?.department && role !== 'SECURITY') return;

    const load = async () => {
      try {
        const dept = role === 'SECURITY' ? 'SECURITY' : hostIdentity.department;
        const items = await getPendingNotificationsByDepartment(dept);
        setNotifications(items);

        // กระดิกเมื่อมีงานใหม่
        if (items.length > prevCount && items.length > 0) {
          setBounce(true);
          setTimeout(() => setBounce(false), 2000);
        }
        setPrevCount(items.length);
      } catch {}
    };

    load();
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [hostIdentity?.department, role, prevCount]);

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
      EQUIPMENT: 'เบิกอุปกรณ์',
    };
    return map[sf] || sf || 'เอกสาร';
  };

  // ซ่อนสำหรับ Guest
  if (role === 'GUEST') return null;

  return (
    <>
      {/* Robot Button */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 9999,
          cursor: 'pointer',
          animation: bounce ? 'robotBounce 0.5s ease 3' : 'robotFloat 3s ease-in-out infinite',
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
          }}>
            {count}
          </div>
        )}

        {/* Robot SVG */}
        <div style={{
          width: 64, height: 64,
          background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
          borderRadius: 20, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 32px rgba(59,130,246,0.4)',
          border: '3px solid #fff',
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
            {/* Head */}
            <rect x="5" y="4" width="14" height="12" rx="3" fill="#fff"/>
            {/* Eyes */}
            <circle cx="9" cy="10" r="1.5" fill={count > 0 ? '#ef4444' : '#3b82f6'}/>
            <circle cx="15" cy="10" r="1.5" fill={count > 0 ? '#ef4444' : '#3b82f6'}/>
            {/* Mouth */}
            <path d={count > 0 ? "M9 13 Q12 15 15 13" : "M9 13 Q12 15 15 13"} stroke={count > 0 ? '#ef4444' : '#3b82f6'} strokeWidth="1.5" fill="none" strokeLinecap="round"/>
            {/* Antenna */}
            <line x1="12" y1="4" x2="12" y2="1" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="12" cy="1" r="1.5" fill={count > 0 ? '#fbbf24' : '#fff'}/>
            {/* Body */}
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
                  {/* Back button */}
                  <button onClick={() => setSelectedDoc(null)} style={{
                    background: '#f1f5f9', border: 'none', padding: '6px 14px',
                    borderRadius: 10, fontSize: 12, fontWeight: 700, color: '#64748b',
                    cursor: 'pointer', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 4,
                  }}>← กลับ</button>

                  {/* Doc type */}
                  <p style={{ fontSize: 10, fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>
                    {getSourceFormLabel(selectedDoc.sourceForm)}
                  </p>
                  <p style={{ fontSize: 16, fontWeight: 900, color: '#1e293b', margin: '4px 0 12px' }}>
                    {selectedDoc.topic || '-'}
                  </p>

                  {/* Details */}
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

                  {/* Approve button - link to ApprovePage */}
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

          {/* Footer */}
          {count > 0 && (
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9' }}>
              <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', margin: 0 }}>
                กดที่รายการเพื่อดูรายละเอียด
              </p>
            </div>
          )}
        </div>
      )}

      {/* CSS Animation */}
      <style>{`
        @keyframes robotFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes robotBounce {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }
        @keyframes robotSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
};

export default RobotNotifier;
