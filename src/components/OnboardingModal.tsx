import React, { useState } from 'react';
import { Droplets, Sparkles, Check } from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete: (data: { name: string; intervalMinutes: number; snoozeMinutes: number }) => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onComplete }) => {
  const [name, setName] = useState('Rina');
  const [intervalMinutes, setIntervalMinutes] = useState(180);
  const [snoozeMinutes, setSnoozeMinutes] = useState(10);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onComplete({
      name: name.trim() || 'Teman Aiya',
      intervalMinutes,
      snoozeMinutes,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-sky-100 text-center relative overflow-hidden">
        {/* Soft background light */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-sky-100/60 rounded-full blur-2xl -z-10" />

        {/* Icon & Hero branding */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-500 to-cyan-400 text-white flex items-center justify-center mx-auto mb-4 shadow-lg shadow-sky-500/25">
          <Droplets className="w-8 h-8" />
        </div>

        <h1 className="text-2xl font-black tracking-tight text-slate-900 mb-1">
          AIYA
        </h1>
        <p className="text-sm font-semibold text-sky-700 mb-2">
          Ingat minum, ingatkan teman.
        </p>
        <p className="text-xs text-slate-500 mb-6 leading-relaxed max-w-xs mx-auto">
          Atur interval, dengarkan suara air, dan tetap terhidrasi bersama.
        </p>

        <form onSubmit={handleSubmit} className="text-left space-y-4">
          <div>
            <label htmlFor="onboardingName" className="block text-xs font-semibold text-slate-700 mb-1">
              Nama Panggilan
            </label>
            <input
              id="onboardingName"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Masukkan namamu (misal: Rina)"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-sky-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Seberapa sering kamu ingin minum?
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: '1 Jam', val: 60 },
                { label: '2 Jam', val: 120 },
                { label: '3 Jam (Standar)', val: 180 },
              ].map((item) => (
                <button
                  key={item.val}
                  type="button"
                  onClick={() => setIntervalMinutes(item.val)}
                  className={`py-2 px-1 text-center rounded-xl text-xs font-semibold border transition-all ${
                    intervalMinutes === item.val
                      ? 'border-sky-500 bg-sky-50 text-sky-700 font-bold'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Kalau belum minum, ingatkan lagi dalam:
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: '5 Menit', val: 5 },
                { label: '10 Menit (Standar)', val: 10 },
              ].map((item) => (
                <button
                  key={item.val}
                  type="button"
                  onClick={() => setSnoozeMinutes(item.val)}
                  className={`py-2 px-2 text-center rounded-xl text-xs font-semibold border transition-all ${
                    snoozeMinutes === item.val
                      ? 'border-amber-500 bg-amber-50 text-amber-800 font-bold'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="w-full mt-4 py-3 rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-600 hover:from-sky-500 hover:to-cyan-500 text-white font-bold text-sm shadow-md shadow-sky-500/20 active:scale-[0.98] transition-all"
          >
            MULAI SEKARANG
          </button>
        </form>

        <p className="text-[11px] text-slate-600 mt-4 text-center">
          Jadwal dihitung secara dinamis dari waktu kamu menekan tombol &quot;Sudah&quot;.
        </p>
      </div>
    </div>
  );
};
