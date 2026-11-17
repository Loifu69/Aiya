import React, { useState } from 'react';

export interface OnboardingData {
  name: string;
  dailyTargetMl: number;
  glassMl: number;
  intervalMinutes: number;
  snoozeMinutes: number;
}

interface OnboardingModalProps {
  isOpen: boolean;
  defaultName: string;
  onComplete: (data: OnboardingData) => void | Promise<void>;
}

const Choice: React.FC<{
  options: { label: string; val: number }[];
  value: number;
  onChange: (v: number) => void;
}> = ({ options, value, onChange }) => (
  <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
    {options.map((o) => (
      <button
        key={o.val}
        type="button"
        onClick={() => onChange(o.val)}
        className={`py-2 px-1 text-center rounded-xl text-xs font-semibold border transition-colors ${
          value === o.val
            ? 'border-sky-500 bg-sky-50 text-sky-700 font-bold'
            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

// Shown once to new accounts: sets name, daily target and reminder rhythm.
export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, defaultName, onComplete }) => {
  const [name, setName] = useState(defaultName);
  const [dailyTargetMl, setDailyTargetMl] = useState(2000);
  const [glassMl, setGlassMl] = useState(250);
  const [intervalMinutes, setIntervalMinutes] = useState(120);
  const [snoozeMinutes, setSnoozeMinutes] = useState(10);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onComplete({ name: name.trim() || defaultName, dailyTargetMl, glassMl, intervalMinutes, snoozeMinutes });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div className="bg-white rounded-[2rem] max-w-md w-full max-h-[92vh] overflow-y-auto p-6 sm:p-8 shadow-2xl border border-sky-100 relative">
        <div className="text-center">
          <img src="/favicon.svg" alt="Logo Aiya" className="w-16 h-16 rounded-2xl mx-auto mb-3 shadow-lg shadow-sky-500/25" />
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Selamat datang di Aiya!</h1>
          <p className="text-xs text-slate-500 mt-1 mb-6">Atur sebentar supaya pengingatnya pas buat kamu.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="onboardingName" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Nama panggilan
            </label>
            <input
              id="onboardingName"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-sky-500 focus:bg-white"
            />
          </div>

          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-1.5">Target minum per hari</span>
            <Choice
              value={dailyTargetMl}
              onChange={setDailyTargetMl}
              options={[
                { label: '1,5 L', val: 1500 },
                { label: '2 L', val: 2000 },
                { label: '2,5 L', val: 2500 },
                { label: '3 L', val: 3000 },
              ]}
            />
          </div>

          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-1.5">Sekali minum biasanya</span>
            <Choice
              value={glassMl}
              onChange={setGlassMl}
              options={[
                { label: '200 ml', val: 200 },
                { label: '250 ml', val: 250 },
                { label: '350 ml', val: 350 },
                { label: '500 ml', val: 500 },
              ]}
            />
          </div>

          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-1.5">Ingatkan aku minum setiap</span>
            <Choice
              value={intervalMinutes}
              onChange={setIntervalMinutes}
              options={[
                { label: '1 jam', val: 60 },
                { label: '2 jam', val: 120 },
                { label: '3 jam', val: 180 },
              ]}
            />
          </div>

          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-1.5">Kalau belum minum, ingatkan lagi dalam</span>
            <Choice
              value={snoozeMinutes}
              onChange={setSnoozeMinutes}
              options={[
                { label: '5 menit', val: 5 },
                { label: '10 menit', val: 10 },
                { label: '15 menit', val: 15 },
              ]}
            />
          </div>

          <p className="text-[11px] text-slate-500 text-center">
            Butuh sekitar {Math.ceil(dailyTargetMl / glassMl)} kali minum per hari. Semua bisa diubah lagi di Pengaturan.
          </p>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500 hover:from-sky-500 hover:to-cyan-400 text-white font-bold text-sm shadow-md shadow-sky-500/20 active:scale-[0.98] transition-colors disabled:opacity-60"
          >
            {saving ? 'Menyimpan...' : 'Mulai Sekarang'}
          </button>
        </form>
      </div>
    </div>
  );
};
