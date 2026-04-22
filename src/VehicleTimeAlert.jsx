import React, { useState, useEffect, useRef, useCallback } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, firebaseReady, appId } from './firebase';
import { Bell, BellRing, X, Car, Clock, Volume2, VolumeX, CheckCircle2 } from 'lucide-react';
import ReturnVehicleModal from './ReturnVehicleModal';

// ========== CONFIG ==========
const ALERT_MINUTES_BEFORE = 10; // แจ้งเตือนก่อนหมดเวลา 10 นาที
const CHECK_INTERVAL_MS = 30_000; // เช็คทุก 30 วินาที
// ============================

// Parse "HH:MM" to today's Date object
function parseTimeToday(timeStr, dateStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;

  let base;
  if (dateStr) {
    base = new Date(dateStr);
    if (isNaN(base.getTime())) base = new Date();
  } else {
    base = new Date();
  }
  base.setHours(h, m, 0, 0);
  return base;
}

export default function VehicleTimeAlert({ userRole, requesterId }) {
  const [activeBookings, setActiveBookings] = useState([]);
  const [alerts, setAlerts] = useState([]); // { bookingId, message, plate, requester, timeEnd, type }
  const [showPanel, setShowPanel] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const notifiedRef = useRef(new Set()); // track already-notified bookings
  const audioRef = useRef(null);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Create audio element for alert sound
  useEffect(() => {
    // SIREN: สลับความถี่ต่ำ-สูง ให้ดังเหมือน siren รถพยาบาล/ตำรวจ
    audioRef.current = {
      play: (loud = false) => {
        if (!soundEnabled) return;
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const gain = ctx.createGain();
          gain.connect(ctx.destination);
          gain.gain.value = loud ? 0.55 : 0.3; // overdue ดังกว่า pre-alert

          const osc = ctx.createOscillator();
          osc.type = 'square'; // คม/ดัง กว่า sine
          osc.connect(gain);
          // Siren: สลับ 600 ↔ 1000 Hz ทุก 0.25s, รวม 3 วินาที
          const cycles = loud ? 12 : 6;
          const dur = 0.25;
          const now = ctx.currentTime;
          for (let i = 0; i < cycles; i++) {
            osc.frequency.setValueAtTime(i % 2 === 0 ? 1000 : 600, now + i * dur);
          }
          osc.start(now);
          osc.stop(now + cycles * dur);
        } catch (e) {
          console.warn('Audio play failed:', e);
        }
      }
    };
  }, [soundEnabled]);

  // Modal state
  const [returnModalBooking, setReturnModalBooking] = useState(null);

  // Load active vehicle bookings from Firestore
  useEffect(() => {
    if (!firebaseReady) return;
    const ref = collection(db, 'artifacts', appId, 'public', 'data', 'vehicle_bookings');
    const unsub = onSnapshot(ref, (snap) => {
      const bookings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setActiveBookings(bookings);
    });
    return () => unsub();
  }, []);

  // Check bookings every interval
  const checkBookings = useCallback(() => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Filter: GA/ADMIN sees all, employee sees only their own bookings
    const relevantBookings = requesterId
      ? activeBookings.filter(b => b.requesterId === requesterId)
      : activeBookings;

    relevantBookings.forEach(booking => {
      // Only check today's bookings
      if (booking.date !== today) return;
      // Skip if already returned
      if (booking.returned) return;

      const endTime = parseTimeToday(booking.timeEnd, booking.date);
      if (!endTime) return;

      const diffMs = endTime.getTime() - now.getTime();
      const diffMin = diffMs / 60000;

      const alertKey = `${booking.id}_${booking.date}`;

      // Alert: within 10 minutes before end time AND not yet past
      if (diffMin <= ALERT_MINUTES_BEFORE && diffMin > 0 && !notifiedRef.current.has(alertKey)) {
        notifiedRef.current.add(alertKey);

        const minutesLeft = Math.ceil(diffMin);
        const alertData = {
          bookingId: booking.id,
          plate: booking.plate || 'ไม่ระบุ',
          brand: booking.brand || '',
          requester: booking.requesterName || '-',
          driverName: booking.driverName || 'ขับเอง',
          driverPhone: booking.driverPhone || '',
          timeEnd: booking.timeEnd,
          minutesLeft,
          createdAt: new Date().toISOString(),
        };

        setAlerts(prev => [alertData, ...prev]);
        setShowPanel(true);

        // Play sound
        audioRef.current?.play();

        // Browser Notification
        if ('Notification' in window && Notification.permission === 'granted') {
          const title = `⏰ รถใกล้ถึงเวลาเก็บ!`;
          const body = `🚗 ${alertData.brand} ${alertData.plate}\n👤 ${alertData.requester}\n⏱️ เหลือ ${minutesLeft} นาที (ถึง ${alertData.timeEnd} น.)`;

          const notification = new Notification(title, {
            body,
            icon: '/icon-192.svg',
            badge: '/icon-192.svg',
            tag: alertKey,
            requireInteraction: true, // ไม่หายเอง ต้องกดปิด
            vibrate: [200, 100, 200, 100, 200], // สั่น
          });

          notification.onclick = () => {
            window.focus();
            setShowPanel(true);
            notification.close();
          };
        }
      }

      // Alert: OVERDUE (past end time)
      const overdueKey = `${booking.id}_${booking.date}_overdue`;
      if (diffMin <= 0 && diffMin > -60 && !notifiedRef.current.has(overdueKey)) {
        notifiedRef.current.add(overdueKey);

        const minutesOver = Math.abs(Math.floor(diffMin));
        const alertData = {
          bookingId: booking.id,
          plate: booking.plate || 'ไม่ระบุ',
          brand: booking.brand || '',
          requester: booking.requesterName || '-',
          driverName: booking.driverName || 'ขับเอง',
          driverPhone: booking.driverPhone || '',
          timeEnd: booking.timeEnd,
          minutesLeft: -minutesOver,
          overdue: true,
          createdAt: new Date().toISOString(),
        };

        setAlerts(prev => [alertData, ...prev]);
        setShowPanel(true);
        audioRef.current?.play(true); // loud=true สำหรับ overdue

        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('🚨 รถเลยเวลาแล้ว!', {
            body: `🚗 ${alertData.brand} ${alertData.plate}\n👤 ${alertData.requester}\n⚠️ เลยเวลา ${minutesOver} นาที!`,
            icon: '/icon-192.svg',
            tag: overdueKey,
            requireInteraction: true,
            vibrate: [500, 200, 500, 200, 500],
          });
        }
      }
    });
  }, [activeBookings, requesterId]);

  // Run check interval
  useEffect(() => {
    checkBookings(); // เช็คทันที
    const interval = setInterval(checkBookings, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkBookings]);

  // Dismiss single alert
  const dismissAlert = (idx) => {
    setAlerts(prev => prev.filter((_, i) => i !== idx));
  };

  // Show for GA, ADMIN, HOST, EMPLOYEE
  const showBell = userRole === 'GA' || userRole === 'ADMIN' || userRole === 'HOST' || userRole === 'EMPLOYEE';
  if (!showBell) return null;

  return (
    <>
      {/* Floating Bell Button */}
      <button
        onClick={() => setShowPanel(!showPanel)}
        className={`fixed bottom-4 left-4 sm:bottom-6 sm:left-6 z-[999] p-3 sm:p-4 rounded-full shadow-2xl transition-all ${
          alerts.length > 0
            ? 'bg-red-500 hover:bg-red-600 animate-bounce'
            : 'bg-slate-700 hover:bg-slate-800'
        }`}
      >
        {alerts.length > 0 ? (
          <BellRing className="text-white w-6 h-6" />
        ) : (
          <Bell className="text-white w-6 h-6" />
        )}
        {alerts.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-yellow-400 text-red-900 text-xs font-black px-2 py-0.5 rounded-full shadow-lg">
            {alerts.length}
          </span>
        )}
      </button>

      {/* Alert Panel */}
      {showPanel && (
        <div className="fixed bottom-24 left-3 right-3 sm:right-auto sm:left-6 z-[999] sm:w-[360px] max-h-[70vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-red-500 to-orange-500 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-white">
              <BellRing size={18} />
              <span className="font-black text-sm">แจ้งเตือนรถ</span>
              {alerts.length > 0 && (
                <span className="bg-white/30 px-2 py-0.5 rounded-full text-xs font-bold">{alerts.length}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setSoundEnabled(!soundEnabled)} className="text-white/80 hover:text-white">
                {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>
              <button onClick={() => setShowPanel(false)} className="text-white/80 hover:text-white">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Alert List */}
          <div className="overflow-y-auto max-h-[55vh] p-3 space-y-2">
            {alerts.length === 0 ? (
              <div className="text-center py-8 text-slate-300">
                <Bell size={32} className="mx-auto mb-2" />
                <p className="text-sm">ไม่มีแจ้งเตือน</p>
              </div>
            ) : (
              alerts.map((alert, idx) => (
                <div
                  key={`${alert.bookingId}-${idx}`}
                  className={`relative p-3 rounded-xl border-2 ${
                    alert.overdue
                      ? 'border-red-400 bg-red-50'
                      : 'border-amber-400 bg-amber-50'
                  }`}
                >
                  <button
                    onClick={() => dismissAlert(idx)}
                    className="absolute top-2 right-2 text-slate-300 hover:text-slate-500"
                  >
                    <X size={14} />
                  </button>
                  <div className="flex items-center gap-2 mb-1">
                    <Car size={14} className={alert.overdue ? 'text-red-500' : 'text-amber-500'} />
                    <span className="font-black text-sm">
                      {alert.brand} {alert.plate}
                    </span>
                  </div>
                  <div className="text-xs space-y-0.5 text-slate-600">
                    <p>👤 ผู้ขอ: <strong>{alert.requester}</strong></p>
                    {alert.driverName !== 'ขับเอง' && (
                      <p>🧑‍✈️ คนขับ: <strong>{alert.driverName}</strong> {alert.driverPhone && `📞 ${alert.driverPhone}`}</p>
                    )}
                    <p className="flex items-center gap-1">
                      <Clock size={12} />
                      เวลาเก็บรถ: <strong>{alert.timeEnd} น.</strong>
                    </p>
                  </div>
                  <div className={`mt-2 text-xs font-black px-2 py-1 rounded-lg inline-block ${
                    alert.overdue
                      ? 'bg-red-200 text-red-800'
                      : 'bg-amber-200 text-amber-800'
                  }`}>
                    {alert.overdue
                      ? `🚨 เลยเวลาแล้ว ${Math.abs(alert.minutesLeft)} นาที!`
                      : `⏰ เหลืออีก ${alert.minutesLeft} นาที`
                    }
                  </div>
                  {/* ปุ่มรถกลับแล้ว — กดเพื่อบันทึกเลขไมล์ + รูป */}
                  <button
                    onClick={() => {
                      const b = activeBookings.find((bk) => bk.id === alert.bookingId);
                      if (b) setReturnModalBooking(b);
                    }}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black py-2 rounded-lg transition active:scale-95"
                  >
                    <CheckCircle2 size={14} /> รถกลับแล้ว + บันทึกเลขไมล์
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <ReturnVehicleModal
        open={!!returnModalBooking}
        booking={returnModalBooking}
        currentUserId={requesterId || userRole}
        onClose={() => setReturnModalBooking(null)}
        onSaved={(b) => {
          // ล้าง alert ของ booking นี้ออกจากลิสต์
          setAlerts(prev => prev.filter(a => a.bookingId !== b.id));
        }}
      />
    </>
  );
}
