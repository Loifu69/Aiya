import React from 'react';
import {
  Clock,
  Droplets,
  BellRing,
  RotateCcw,
  FastForward,
  Info,
  Calendar,
  CheckCircle2,
} from 'lucide-react';
import { DrinkStatus, UserSettings } from '../types';
import { formatRemainingTime, formatTimeHM } from '../utils/storage';

interface HomePageProps {
  settings: UserSettings;
  drinkStatus: DrinkStatus;
  currentTimeMs: number;
  onDrinkNow: () => void;
  onTriggerAlarmNow: () => void;
  onFastForward: (minutes: number) => void;
  lastFeedbackMessage: string | null;
  onClearFeedback: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  settings,
  drinkStatus,
  currentTimeMs,
  onDrinkNow,
  onTriggerAlarmNow,
  onFastForward,
  lastFeedbackMessage,
  onClearFeedback,
}) => {
  const remaining = formatRemainingTime(drinkStatus.nextAlarmAt, currentTimeMs);
  const nextTimeHM = formatTimeHM(drinkStatus.nextAlarmAt);
  const dueTimeHM = formatTimeHM(drinkStatus.dueAt);
  const lastDrinkHM = formatTimeHM(drinkStatus.lastDrinkAt);

  // Compute hydration percentage for visual glass
  const lastDrinkMs = drinkStatus.lastDrinkAt
    ? new Date(drinkStatus.lastDrinkAt).getTime()
    : currentTimeMs - 60 * 60 * 1000;
  const targetMs = new Date(drinkStatus.dueAt).getTime();
  const totalDuration = Math.max(1, targetMs - lastDrinkMs);
  const elapsed = Math.max(0, currentTimeMs - lastDrinkMs);
  const progressRatio = Math.min(1, Math.max(0, 1 - elapsed / totalDuration));
  const waterFillPercent = Math.round(progressRatio * 100);

  const isAlarmDueOrPast = remaining.isOverdue;

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Feedback banner if user just clicked Sudah/Belum */}
      {lastFeedbackMessage && (
        <div className="bg-sky-50 border border-sky-200 text-sky-800 rounded-2xl p-4 flex items-center justify-between shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-sky-600 shrink-0" />
            <p className="text-sm font-semibold">{lastFeedbackMessage}</p>
          </div>
          <button
            onClick={onClearFeedback}
            className="text-xs text-sky-600 hover:text-sky-900 font-medium px-2 py-1 rounded"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Main Hydration Status Card */}
      <section className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 text-center relative overflow-hidden">
        {/* Soft background light */}
        <div className="absolute top-0 right-1/2 translate-x-1/2 w-64 h-64 bg-sky-100/50 rounded-full blur-3xl -z-10 pointer-events-none" />

        {/* Visual Water Sphere / Wave Indicator */}
        <div className="relative mx-auto w-36 h-36 my-2 rounded-full border-4 border-sky-100 bg-sky-50/50 flex flex-col items-center justify-center shadow-inner overflow-hidden">
          {/* Animated liquid height */}
          <div
            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-sky-400 to-cyan-300 transition-all duration-1000 ease-out opacity-85"
            style={{ height: `${Math.max(15, waterFillPercent)}%` }}
          />
          <div className="relative z-10 flex flex-col items-center text-slate-800">
            <Droplets className="w-7 h-7 text-sky-600 mb-1" />
            <span className="text-xs font-semibold text-slate-700">
              {waterFillPercent}%
            </span>
          </div>
        </div>

        {/* Primary Schedule Display as specified in doc Section 9.2 */}
        <div className="mt-4 space-y-1">
          <span className="text-xs font-semibold tracking-wide uppercase text-slate-600">
            Minum Berikutnya
          </span>
          <div className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight tabular-nums">
            {nextTimeHM}
          </div>
          <div className="text-sm font-medium text-sky-600">
            {remaining.text}
          </div>
        </div>

        {/* Dual time inspection note (dueAt vs nextAlarmAt) */}
        {drinkStatus.dueAt !== drinkStatus.nextAlarmAt && (
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            <Clock className="w-3.5 h-3.5" />
            <span>
              Alarm ditunda hingga {nextTimeHM} (jadwal utama seharusnya {dueTimeHM})
            </span>
          </div>
        )}

        {/* Last drink info as specified in Section 9.2 */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-center gap-2 text-xs text-slate-700 font-medium">
          <span>Terakhir minum:</span>
          <span className="font-semibold text-slate-900 tabular-nums">
            {lastDrinkHM !== '--:--' ? `${lastDrinkHM}` : 'Belum tercatat'}
          </span>
          <span aria-hidden="true">·</span>
          <span>Interval: {Math.round(settings.intervalMinutes / 60)} jam</span>
          <span aria-hidden="true">·</span>
          <span>Tunda: {settings.snoozeMinutes} mnt</span>
        </div>

        {/* Primary Action Button: Sudah Minum (opsional di luar alarm) */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={onDrinkNow}
            className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98]"
          >
            <Droplets className="w-4 h-4 text-cyan-400" />
            <span>Sudah Minum Sekarang</span>
          </button>

          <button
            onClick={onTriggerAlarmNow}
            className="w-full sm:w-auto px-5 py-3.5 rounded-2xl bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            <BellRing className="w-4 h-4 text-sky-600" />
            <span>Tes Alarm & Suara Air</span>
          </button>
        </div>
      </section>

      {/* Simulator Control & Information Card */}
      <section className="bg-slate-100/70 border border-slate-200 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FastForward className="w-4 h-4 text-slate-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Simulasi Waktu Cepat (Pengujian Dinamis)
            </h3>
          </div>
          <span className="text-[11px] text-slate-600 hidden sm:inline">
            Coba perilaku penjadwalan tanpa perlu menunggu berjam-jam
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            onClick={() => onFastForward(10)}
            className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 transition-colors"
          >
            +10 Menit (Tunda)
          </button>
          <button
            onClick={() => onFastForward(60)}
            className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 transition-colors"
          >
            +1 Jam
          </button>
          <button
            onClick={() => onFastForward(180)}
            className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 transition-colors"
          >
            +3 Jam (Interval Utama)
          </button>
          <button
            onClick={() => {
              // Jump right to nextAlarmAt + 1 second
              const targetDiff = new Date(drinkStatus.nextAlarmAt).getTime() - currentTimeMs;
              const minutes = Math.max(1, Math.ceil(targetDiff / (60 * 1000)) + 1);
              onFastForward(minutes);
            }}
            className="px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold transition-colors shadow-xs"
          >
            Lompat ke Alarm
          </button>
        </div>
      </section>

      {/* Dynamic Rule Summary according to PDF Section 6 */}
      <section className="bg-white rounded-2xl p-5 border border-slate-200 text-slate-700 text-xs space-y-2.5">
        <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
          <Info className="w-4 h-4 text-sky-600" />
          <span>Cara Kerja Penjadwalan Dinamis Aiya</span>
        </div>
        <p className="leading-relaxed">
          Seluruh jadwal dihitung dari <strong>waktu pengguna menekan tombol</strong>, bukan dari jadwal awal yang kaku:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="p-3 bg-sky-50/70 border border-sky-100 rounded-xl">
            <span className="font-semibold text-sky-900 block mb-1">Jika tekan &quot;Sudah&quot;:</span>
            <p className="text-slate-600 leading-normal">
              Jadwal berikutnya = waktu sekarang + interval utama ({Math.round(settings.intervalMinutes / 60)} jam). Suara berhenti &amp; status teman kembali segar.
            </p>
          </div>
          <div className="p-3 bg-amber-50/70 border border-amber-100 rounded-xl">
            <span className="font-semibold text-amber-900 block mb-1">Jika tekan &quot;Belum&quot;:</span>
            <p className="text-slate-600 leading-normal">
              Alarm diulang lebih cepat = sekarang + {settings.snoozeMinutes} menit. Jadwal utama (dueAt) tetap, sehingga teman melihat status terlambat dan bisa mengingatkanmu.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
