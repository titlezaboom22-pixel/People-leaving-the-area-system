import React, { useState, useEffect } from 'react';
import { Download, Share2, Plus, X, Smartphone } from 'lucide-react';

const DISMISS_KEY = 'install_prompt_dismissed_at';
const DISMISS_DAYS = 7;

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function isInStandaloneMode() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function wasRecentlyDismissed() {
  try {
    const t = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (!t) return false;
    const days = (Date.now() - t) / 86_400_000;
    return days < DISMISS_DAYS;
  } catch {
    return false;
  }
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  const [platform, setPlatform] = useState('unknown');

  useEffect(() => {
    if (isInStandaloneMode()) return;
    if (wasRecentlyDismissed()) return;

    if (isIOS()) {
      setPlatform('ios');
      setTimeout(() => setShowBanner(true), 3000);
      return;
    }

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setPlatform('android');
      setShowBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (platform === 'ios') {
      setShowIOSHelp(true);
      return;
    }
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted' || outcome === 'dismissed') {
      setDeferredPrompt(null);
      setShowBanner(false);
    }
  };

  const handleDismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setShowBanner(false);
  };

  if (!showBanner && !showIOSHelp) return null;

  return (
    <>
      {showBanner && !showIOSHelp && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[1000] w-[calc(100%-2rem)] max-w-md bg-white rounded-2xl shadow-2xl border-2 border-indigo-200 p-4 animate-in slide-in-from-bottom">
          <button
            onClick={handleDismiss}
            className="absolute top-2 right-2 text-slate-300 hover:text-slate-500"
            aria-label="ปิด"
          >
            <X size={18} />
          </button>
          <div className="flex items-start gap-3 pr-6">
            <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white">
              <Smartphone size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-black text-slate-800 text-sm">ติดตั้งเป็นแอป</h3>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                {platform === 'ios'
                  ? 'เปิดเร็วขึ้น รับแจ้งเตือนได้'
                  : 'เปิดเร็วขึ้น รับแจ้งเตือน ใช้งานเหมือนแอปจริง'}
              </p>
              <button
                onClick={handleInstallClick}
                className="mt-3 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm py-2.5 rounded-xl flex items-center justify-center gap-2 transition"
              >
                {platform === 'ios' ? <Share2 size={16} /> : <Download size={16} />}
                {platform === 'ios' ? 'ดูวิธีติดตั้ง' : 'ติดตั้งแอป'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showIOSHelp && (
        <div
          className="fixed inset-0 z-[1001] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowIOSHelp(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 animate-in slide-in-from-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
                  <Smartphone size={20} />
                </div>
                <h3 className="font-black text-slate-800">ติดตั้งบน iPhone / iPad</h3>
              </div>
              <button onClick={() => setShowIOSHelp(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-900">
              ⚠️ ต้องเปิดใน <b>Safari</b> เท่านั้น (Chrome บน iOS ไม่รองรับ)
            </div>

            <ol className="space-y-3 text-sm text-slate-700">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-600 text-white font-black text-xs flex items-center justify-center">1</span>
                <div>
                  กดปุ่ม <b>Share</b> <Share2 size={14} className="inline align-text-bottom" /> ด้านล่างของ Safari
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-600 text-white font-black text-xs flex items-center justify-center">2</span>
                <div>
                  เลื่อนหาเมนู <b>"Add to Home Screen"</b> <Plus size={14} className="inline align-text-bottom" />
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-600 text-white font-black text-xs flex items-center justify-center">3</span>
                <div>กด <b>"Add"</b> มุมขวาบน → เสร็จ ไอคอนจะขึ้นหน้าจอ</div>
              </li>
            </ol>

            <button
              onClick={() => { handleDismiss(); setShowIOSHelp(false); }}
              className="mt-5 w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm py-2.5 rounded-xl transition"
            >
              เข้าใจแล้ว
            </button>
          </div>
        </div>
      )}
    </>
  );
}
