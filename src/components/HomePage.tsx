import React from 'react';
import {
  Clock,
  Droplets,
  BellRing,
  FastForward,
  CheckCircle2,
} from 'lucide-react';
import { DrinkStatus, UserSettings } from '../types';
import { formatRemainingTime, formatTimeHM } from '../utils/storage';

interface HomePageProps {
  settings: UserSettings;
  drinkStatus: DrinkStatus;
  currentTimeMs: number;
  todayIntakeMl: number;
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
  todayIntakeMl,
  onDrinkNow,
  onTriggerAlarmNow,
  onFastForward,
  lastFeedbackMessage,
  onClearFeedback,
}) => {
  // Main display follows the drink schedule (dueAt); reminders repeat via nextAlarmAt
  const remaining = formatRemainingTime(drinkStatus.dueAt, currentTimeMs);
  const dueTimeHM = formatTimeHM(drinkStatus.dueAt);
  const nextReminderHM = formatTimeHM(drinkStatus.nextAlarmAt);
  const lastDrinkHM = formatTimeHM(drinkStatus.lastDrinkAt);

  // Daily intake progress: how much of today's target has been drunk
  const targetMl = Math.max(1, settings.dailyTargetMl);
  const intakePercent = Math.round((todayIntakeMl / targetMl) * 100);
  const waterFillPercent = Math.min(100, intakePercent);
  const isTargetReached = todayIntakeMl >= targetMl;
  const formatMl = (ml: number) => ml.toLocaleString('id-ID');

  const isAlarmDueOrPast = remaining.isOverdue;

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Feedback banner after the user records a drink */}
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
            style={{ height: `${waterFillPercent}%` }}
          />
          <div className="relative z-10 flex flex-col items-center text-slate-800">
            <Droplets className="w-6 h-6 text-sky-600 mb-0.5" />
            <span className="text-2xl font-extrabold text-slate-900 tabular-nums">
              {intakePercent}%
            </span>
          </div>
        </div>

        {/* Today's intake vs daily target */}
        <div className="mt-2 text-sm text-slate-700">
          <span className="font-bold text-slate-900 tabular-nums">{formatMl(todayIntakeMl)}</span>
          <span className="text-slate-500"> / {formatMl(settings.dailyTargetMl)} ml hari ini</span>
        </div>
        {isTargetReached && (
          <div className="mt-1 text-xs font-semibold text-emerald-600">Target harian tercapai!</div>
        )}

        {/* Primary Schedule Display as specified in doc Section 9.2 */}
        <div className="mt-4 space-y-1">
          <span className="text-xs font-semibold tracking-wide uppercase text-slate-600">
            {isAlarmDueOrPast ? 'Waktunya Minum!' : 'Minum Berikutnya'}
          </span>
          <div className={`text-4xl sm:text-5xl font-extrabold tracking-tight tabular-nums ${isAlarmDueOrPast ? 'text-amber-600' : 'text-slate-900'}`}>
            {dueTimeHM}
          </div>
          <div className={`text-sm font-medium ${isAlarmDueOrPast ? 'text-amber-600' : 'text-sky-600'}`}>
            {remaining.text}
          </div>
        </div>

        {/* Repeating reminder info while overdue */}
        {isAlarmDueOrPast && (
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            <Clock className="w-3.5 h-3.5" />
            <span>
              Pengingat berbunyi lagi jam {nextReminderHM} (setiap {settings.snoozeMinutes} menit) sampai kamu menekan "Sudah Minum"
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
            className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors active:scale-[0.98]"
          >
            <Droplets className="w-4 h-4 text-cyan-400" />
            <span>Sudah Minum Sekarang</span>
            <span className="text-xs font-medium text-cyan-300">+{settings.glassMl} ml</span>
          </button>

          <button
            onClick={onTriggerAlarmNow}
            className="w-full sm:w-auto px-5 py-3.5 rounded-2xl bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            <BellRing className="w-4 h-4 text-sky-600" />
            <span>Tes Suara Pengingat</span>
          </button>
        </div>
      </section>

      {/* Time simulator: only for development (npm run dev), hidden in the deployed app */}
      {import.meta.env.DEV && (
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
      )}
    </div>
  );
};
