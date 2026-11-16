import React, { useEffect, useState } from 'react';
import { BellRing, Check, AlertCircle } from 'lucide-react';
import { disablePush, enablePush, getPushState, PushState } from '../utils/push';

interface BackgroundReminderCardProps {
  userId: string;
}

// Lets the user turn on reminders that still arrive when Aiya is closed (Web Push)
export const BackgroundReminderCard: React.FC<BackgroundReminderCardProps> = ({ userId }) => {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    getPushState().then(setState).catch(() => setState('unsupported'));
  }, []);

  const handleEnable = async () => {
    setBusy(true);
    setMessage(null);
    const res = await enablePush(userId);
    setMessage({ type: res.success ? 'success' : 'error', text: res.message });
    setState(await getPushState());
    setBusy(false);
  };

  const handleDisable = async () => {
    setBusy(true);
    setMessage(null);
    await disablePush();
    setState(await getPushState());
    setMessage({ type: 'success', text: 'Pengingat latar belakang dimatikan di perangkat ini.' });
    setBusy(false);
  };

  const statusText: Record<PushState, string> = {
    on: 'Aktif di perangkat ini',
    off: 'Belum aktif di perangkat ini',
    denied: 'Izin notifikasi diblokir di browser',
    unsupported: 'Browser ini tidak mendukung',
    'dev-mode': 'Hanya tersedia di versi yang di-deploy',
  };

  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
        <BellRing className="w-4 h-4 text-sky-600" />
        <h2 className="text-sm font-bold text-slate-900">Pengingat Saat Aplikasi Ditutup</h2>
      </div>

      <p className="text-xs text-slate-600 leading-relaxed">
        Notifikasi pengingat minum tetap muncul walaupun Aiya ditutup, selama browser masih berjalan di latar belakang.
        Aktifkan di setiap perangkat (HP / laptop) yang ingin menerima pengingat.
      </p>

      <div className="flex items-center justify-between gap-3">
        <span
          className={`text-xs font-semibold ${
            state === 'on' ? 'text-emerald-600' : state === 'off' ? 'text-slate-600' : 'text-amber-700'
          }`}
        >
          {state ? statusText[state] : 'Memeriksa...'}
        </span>

        {state === 'on' && (
          <button
            type="button"
            onClick={handleDisable}
            disabled={busy}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
          >
            {busy ? 'Memproses...' : 'Matikan'}
          </button>
        )}
        {(state === 'off' || state === 'denied') && (
          <button
            type="button"
            onClick={handleEnable}
            disabled={busy}
            className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
          >
            {busy ? 'Memproses...' : 'Aktifkan'}
          </button>
        )}
      </div>

      {message && (
        <div
          className={`flex items-start gap-2 text-xs rounded-xl p-2.5 ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
          }`}
        >
          {message.type === 'success' ? (
            <Check className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}
    </div>
  );
};
