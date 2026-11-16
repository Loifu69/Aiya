import React, { useState } from 'react';
import { Monitor, Moon, Palette, Sun } from 'lucide-react';
import { getThemePreference, setThemePreference, ThemePreference } from '../utils/theme';

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Terang', icon: Sun },
  { value: 'dark', label: 'Gelap', icon: Moon },
  { value: 'system', label: 'Ikuti Sistem', icon: Monitor },
];

// Theme picker. Applies immediately and is saved on this device (no "Simpan" needed).
export const ThemeCard: React.FC = () => {
  const [pref, setPref] = useState<ThemePreference>(getThemePreference);

  const choose = (value: ThemePreference) => {
    setPref(value);
    setThemePreference(value);
  };

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-[2rem] p-6 border border-white/80 shadow-lg shadow-sky-100/60 space-y-4">
      <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
        <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-400 to-cyan-400 text-white flex items-center justify-center shadow-sm shadow-sky-300/40 shrink-0"><Palette className="w-4 h-4" /></span>
        <h2 className="text-sm font-bold text-slate-900">Tampilan</h2>
      </div>

      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Mode tampilan">
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const active = pref === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => choose(value)}
              className={`py-3 px-2 rounded-xl text-xs font-semibold border flex flex-col items-center gap-1.5 transition-colors cursor-pointer ${
                active
                  ? 'bg-sky-50 border-sky-500 text-sky-700 shadow-xs'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-slate-500">
        {pref === 'system'
          ? 'Mengikuti mode terang/gelap perangkat secara otomatis.'
          : 'Disimpan di perangkat ini dan langsung diterapkan.'}
      </p>
    </div>
  );
};
