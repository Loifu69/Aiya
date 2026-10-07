import React from 'react';
import { Bell, Droplets, X } from 'lucide-react';
import { NudgeEvent } from '../types';

interface NudgeToastProps {
  nudge: NudgeEvent | null;
  onOpenConfirm: () => void;
  onDismiss: () => void;
}

export const NudgeToast: React.FC<NudgeToastProps> = ({
  nudge,
  onOpenConfirm,
  onDismiss,
}) => {
  if (!nudge) return null;

  return (
    <aside
      aria-label="Pemberitahuan dari Teman"
      className="fixed top-16 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 animate-in slide-in-from-top-4 duration-300"
    >
      <div className="bg-white rounded-2xl p-4 shadow-xl border border-sky-200 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
          <Bell className="w-5 h-5 animate-wiggle" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-sky-700 uppercase tracking-wider">
              Pengingat dari Teman
            </span>
            <button
              onClick={onDismiss}
              className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
              aria-label="Tutup notifikasi"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm font-medium text-slate-900 mt-0.5 leading-snug">
            {nudge.message}
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              onClick={() => {
                onDismiss();
                onOpenConfirm();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-xs transition-colors"
            >
              <Droplets className="w-3.5 h-3.5" />
              <span>Konfirmasi Minum</span>
            </button>
            <button
              onClick={onDismiss}
              className="px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-slate-800 text-xs font-medium"
            >
              Nanti
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
