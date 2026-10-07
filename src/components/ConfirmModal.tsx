import React from 'react';
import { Check, Clock, Volume2, Droplets } from 'lucide-react';
import { ReminderState } from '../types';

interface ConfirmModalProps {
  isOpen: boolean;
  reminderState: ReminderState;
  snoozeMinutes: number;
  intervalMinutes: number;
  onAnswerSudah: () => void;
  onAnswerBelum: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  reminderState,
  snoozeMinutes,
  intervalMinutes,
  onAnswerSudah,
  onAnswerBelum,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-sky-100 text-center relative overflow-hidden">
        {/* Decorative water ripple waves */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-sky-400 via-cyan-400 to-blue-500" />
        
        {/* Animated water droplet icon */}
        <div className="relative mx-auto my-3 w-20 h-20 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-sky-100 animate-ping opacity-75" />
          <div className="absolute inset-2 rounded-full bg-sky-200/60 animate-pulse" />
          <div className="relative z-10 w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-500 to-cyan-400 text-white flex items-center justify-center shadow-lg shadow-sky-500/30">
            <Droplets className="w-8 h-8" />
          </div>
        </div>

        {/* Audio Ringing Indicator */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 text-sky-700 text-xs font-medium mb-3 border border-sky-200/60">
          <Volume2 className="w-3.5 h-3.5 animate-bounce" />
          <span>Suara air sedang berbunyi...</span>
        </div>

        {/* Core Question as specified in documentation */}
        <h2 id="confirm-dialog-title" className="text-2xl font-bold text-slate-900 mb-2">
          Sudahkah kamu minum?
        </h2>
        <p className="text-slate-600 text-sm mb-6 leading-relaxed">
          Waktunya minum air untuk menjaga hidrasi tubuhmu. Suara air akan berhenti setelah kamu memilih tombol di bawah.
        </p>

        {/* Action Buttons: Sudah & Belum */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onAnswerBelum}
            className="flex flex-col items-center justify-center py-3.5 px-3 rounded-2xl border-2 border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 text-slate-700 font-semibold transition-all active:scale-[0.97]"
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <Clock className="w-4 h-4 text-slate-500" />
              <span className="text-base font-bold text-slate-800">Belum</span>
            </div>
            <span className="text-[11px] text-slate-500 font-normal">
              Tunda {snoozeMinutes} mnt
            </span>
          </button>

          <button
            onClick={onAnswerSudah}
            className="flex flex-col items-center justify-center py-3.5 px-3 rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-600 hover:from-sky-500 hover:to-cyan-500 text-white font-semibold shadow-md shadow-sky-500/25 transition-all active:scale-[0.97]"
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <Check className="w-4 h-4 text-white" />
              <span className="text-base font-bold text-white">Sudah</span>
            </div>
            <span className="text-[11px] text-sky-100 font-normal">
              Berikutnya +{Math.round(intervalMinutes / 60)} jam
            </span>
          </button>
        </div>

        <p className="text-[11px] text-slate-600 mt-4">
          Pilihanmu menentukan pergeseran dinamis jadwal minum berikutnya
        </p>
      </div>
    </div>
  );
};
