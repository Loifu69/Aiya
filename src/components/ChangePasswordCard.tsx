import React, { useState } from 'react';
import { AlertCircle, Check, Eye, EyeOff, KeyRound } from 'lucide-react';
import { changePassword } from '../utils/storage';

// "Keamanan Akun": change the account password (needs the current one).
export const ChangePasswordCard: React.FC<{ userId: string }> = ({ userId }) => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    if (next.trim() !== confirm.trim()) {
      setResult({ ok: false, text: 'Konfirmasi password baru tidak sama.' });
      return;
    }
    setBusy(true);
    try {
      const res = await changePassword(userId, current, next);
      setResult({ ok: res.success, text: res.message });
      if (res.success) {
        setCurrent('');
        setNext('');
        setConfirm('');
      }
    } finally {
      setBusy(false);
    }
  };

  const input =
    'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-sky-500 focus:bg-white';

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white/80 backdrop-blur-sm rounded-[2rem] p-6 border border-white/80 shadow-lg shadow-sky-100/60 space-y-4"
    >
      <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
        <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-400 to-cyan-400 text-white flex items-center justify-center shadow-sm shadow-sky-300/40 shrink-0">
          <KeyRound className="w-4 h-4" />
        </span>
        <h2 className="text-sm font-bold text-slate-900">Keamanan Akun</h2>
      </div>

      <div className="space-y-3">
        <div>
          <label htmlFor="pw-current" className="block text-xs font-semibold text-slate-700 mb-1">
            Password lama
          </label>
          <input
            id="pw-current"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={input}
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="pw-new" className="block text-xs font-semibold text-slate-700 mb-1">
              Password baru
            </label>
            <input
              id="pw-new"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className={input}
            />
          </div>
          <div>
            <label htmlFor="pw-confirm" className="block text-xs font-semibold text-slate-700 mb-1">
              Ulangi password baru
            </label>
            <input
              id="pw-confirm"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={input}
            />
          </div>
        </div>
      </div>

      {result && (
        <div
          className={`flex items-start gap-2 text-xs rounded-xl p-2.5 ${
            result.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
          }`}
        >
          {result.ok ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{result.text}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1.5"
        >
          {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {show ? 'Sembunyikan' : 'Tampilkan'}
        </button>
        <button
          type="submit"
          disabled={busy || !current || !next || !confirm}
          className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-colors disabled:opacity-50"
        >
          {busy ? 'Menyimpan...' : 'Ganti Password'}
        </button>
      </div>
    </form>
  );
};
