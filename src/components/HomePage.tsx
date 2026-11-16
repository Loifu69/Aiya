import React from 'react';
import {
  BellRing,
  CheckCircle2,
  Clock,
  Droplets,
  FastForward,
  GlassWater,
  Lightbulb,
  Moon,
  Repeat,
  Sun,
  Sunrise,
  Sunset,
  Target,
  Trophy,
} from 'lucide-react';
import { DrinkStatus, UserSettings } from '../types';
import { formatRemainingTime, formatTimeHM } from '../utils/storage';
import { Bubbles, Wave } from './WaterDecor';

interface HomePageProps {
  userName: string;
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

const HYDRATION_TIPS = [
  'Minum segelas air setelah bangun tidur membantu tubuh kembali segar setelah semalaman tanpa cairan.',
  'Rasa haus sering datang terlambat. Minum sedikit-sedikit tapi rutin lebih baik daripada sekaligus banyak.',
  'Urin berwarna kuning pucat adalah tanda tubuhmu cukup terhidrasi.',
  'Kurang minum bisa bikin sulit fokus dan cepat lelah. Coba minum dulu sebelum ngopi.',
  'Taruh botol minum di meja kerja atau dekat laptop supaya gampang diingat.',
  'Saat cuaca panas atau habis olahraga, kebutuhan air tubuh meningkat. Tambah porsimu.',
  'Buah seperti semangka, jeruk, dan melon juga menyumbang cairan untuk tubuh.',
  'Minum air sebelum makan bisa membantu pencernaan dan mencegah makan berlebihan.',
  'Sakit kepala ringan kadang hanya tanda tubuh butuh air. Minum dulu, istirahat sebentar.',
  'Ajak teman saling mengingatkan di tab Teman. Lebih seru kalau bareng!',
];

function greeting(hour: number): { text: string; Icon: typeof Sun } {
  if (hour >= 4 && hour < 11) return { text: 'Selamat pagi', Icon: Sunrise };
  if (hour >= 11 && hour < 15) return { text: 'Selamat siang', Icon: Sun };
  if (hour >= 15 && hour < 18) return { text: 'Selamat sore', Icon: Sunset };
  return { text: 'Selamat malam', Icon: Moon };
}

const formatMl = (ml: number) => ml.toLocaleString('id-ID');

// Bottle that fills up with gently moving water as today's intake grows
const WaterBottle: React.FC<{ fillPercent: number; percent: number; intakeMl: number; targetMl: number }> = ({
  fillPercent,
  percent,
  intakeMl,
  targetMl,
}) => {
  const textOnWater = fillPercent >= 58;
  return (
    <div className="relative mx-auto w-40 sm:w-44">
      {/* cap */}
      <div className="mx-auto w-16 h-4 rounded-t-xl bg-sky-300/80 border-x-4 border-t-4 border-sky-200" />
      <div className="relative h-56 sm:h-60 rounded-[2.5rem] border-4 border-sky-200 bg-white/70 overflow-hidden shadow-inner shadow-sky-100">
        {/* water */}
        <div
          className="absolute inset-x-0 bottom-0 transition-[height] duration-1000 ease-out"
          style={{ height: `${fillPercent}%` }}
        >
          {fillPercent > 0 && fillPercent < 100 && (
            <div className="absolute inset-x-0 -top-3 h-4 overflow-hidden">
              <Wave className="aiya-wave-slow fill-cyan-300/70 bottom-0" style={{ height: '100%' }} />
              <Wave className="aiya-wave fill-sky-400 bottom-0" style={{ height: '80%', animationDelay: '-2s' }} />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-sky-400 to-sky-600 overflow-hidden">
            <Bubbles count={7} className="bg-white/50" />
          </div>
        </div>

        {/* glass shine */}
        <div className="absolute top-6 left-4 w-2.5 h-24 rounded-full bg-white/40 pointer-events-none" />

        {/* numbers */}
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center ${
            textOnWater ? 'text-white' : 'text-slate-900'
          }`}
        >
          <span className="text-4xl font-black tabular-nums drop-shadow-sm">{percent}%</span>
          <span className={`text-xs font-semibold mt-1 ${textOnWater ? 'text-white/90' : 'text-slate-500'}`}>
            {formatMl(intakeMl)} / {formatMl(targetMl)} ml
          </span>
        </div>
      </div>
    </div>
  );
};

export const HomePage: React.FC<HomePageProps> = ({
  userName,
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
  const now = new Date(currentTimeMs);
  const { text: greetText, Icon: GreetIcon } = greeting(now.getHours());
  const dateLabel = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });

  // Schedule
  const remaining = formatRemainingTime(drinkStatus.dueAt, currentTimeMs);
  const isOverdue = remaining.isOverdue;
  const dueTimeHM = formatTimeHM(drinkStatus.dueAt);
  const nextReminderHM = formatTimeHM(drinkStatus.nextAlarmAt);
  const lastDrinkHM = formatTimeHM(drinkStatus.lastDrinkAt);
  const dueMs = new Date(drinkStatus.dueAt).getTime();
  const startMs = dueMs - settings.intervalMinutes * 60000;
  const scheduleProgress = isOverdue
    ? 100
    : Math.min(100, Math.max(0, ((currentTimeMs - startMs) / (dueMs - startMs)) * 100));

  // Daily intake
  const targetMl = Math.max(1, settings.dailyTargetMl);
  const glassMl = Math.max(1, settings.glassMl);
  const intakePercent = Math.round((todayIntakeMl / targetMl) * 100);
  const fillPercent = Math.min(100, intakePercent);
  const isTargetReached = todayIntakeMl >= targetMl;
  const remainingMl = Math.max(0, targetMl - todayIntakeMl);
  const glassesTotal = Math.min(12, Math.max(1, Math.ceil(targetMl / glassMl)));
  const glassesDone = Math.min(glassesTotal, Math.floor(todayIntakeMl / glassMl));

  const dayOfYear = Math.floor((currentTimeMs - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  const tip = HYDRATION_TIPS[dayOfYear % HYDRATION_TIPS.length];

  return (
    <div className="space-y-5 pb-24 md:pb-8">
      {/* Greeting */}
      <div className="flex items-center gap-3 px-1">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-200 to-sky-200 flex items-center justify-center text-amber-700 shadow-sm">
          <GreetIcon className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
            {greetText}, {userName}!
          </h1>
          <p className="text-xs text-slate-500 capitalize">{dateLabel}</p>
        </div>
      </div>

      {/* Feedback banner after the user records a drink */}
      {lastFeedbackMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="text-sm font-semibold">{lastFeedbackMessage}</p>
          </div>
          <button
            onClick={onClearFeedback}
            className="text-xs text-emerald-700 hover:text-emerald-900 font-medium px-2 py-1 rounded shrink-0"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Hero: bottle + schedule */}
      <section className="bg-white/80 backdrop-blur-sm rounded-[2rem] p-6 sm:p-8 shadow-lg shadow-sky-100/60 border border-white/80 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-sky-100/60 rounded-full blur-3xl pointer-events-none" />

        <div className="relative grid gap-8 md:grid-cols-[auto_1fr] md:items-center">
          {/* Bottle */}
          <div className="flex flex-col items-center gap-3">
            <div key={todayIntakeMl} className="aiya-pop">
              <WaterBottle
                fillPercent={fillPercent}
                percent={intakePercent}
                intakeMl={todayIntakeMl}
                targetMl={settings.dailyTargetMl}
              />
            </div>
            {isTargetReached ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                <Trophy className="w-3.5 h-3.5" />
                Target harian tercapai!
              </span>
            ) : (
              <span className="text-xs text-slate-500">
                Kurang <strong className="text-sky-700">{formatMl(remainingMl)} ml</strong> lagi hari ini
              </span>
            )}
          </div>

          {/* Schedule + actions */}
          <div className="space-y-5 text-center md:text-left">
            <div>
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                  isOverdue ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-700'
                }`}
              >
                {isOverdue ? <BellRing className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                {isOverdue ? 'Waktunya minum!' : 'Minum berikutnya'}
              </span>
              <div
                className={`mt-2 text-5xl sm:text-6xl font-black tracking-tight tabular-nums ${
                  isOverdue ? 'text-amber-600' : 'text-slate-900'
                }`}
              >
                {dueTimeHM}
              </div>
              <div className={`text-sm font-semibold ${isOverdue ? 'text-amber-600' : 'text-sky-600'}`}>
                {remaining.text}
              </div>

              {/* time until the next drink */}
              <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden max-w-sm mx-auto md:mx-0">
                <div
                  className={`h-full rounded-full transition-[width] duration-1000 ${
                    isOverdue ? 'bg-amber-400' : 'bg-gradient-to-r from-sky-400 to-cyan-400'
                  }`}
                  style={{ width: `${scheduleProgress}%` }}
                />
              </div>

              {isOverdue && (
                <p className="mt-3 inline-flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-left">
                  <Repeat className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    Pengingat berbunyi lagi jam {nextReminderHM} (setiap {settings.snoozeMinutes} menit) sampai kamu
                    menekan &quot;Sudah Minum&quot;.
                  </span>
                </p>
              )}
            </div>

            {/* Glass tracker */}
            <div>
              <div className="flex flex-wrap justify-center md:justify-start gap-1 sm:gap-1.5">
                {Array.from({ length: glassesTotal }, (_, i) => (
                  <span
                    key={i}
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl flex items-center justify-center transition-colors ${
                      i < glassesDone
                        ? 'bg-gradient-to-b from-sky-400 to-sky-600 text-white shadow-sm shadow-sky-300/50'
                        : 'border border-dashed border-slate-300 text-slate-300'
                    }`}
                  >
                    <GlassWater className="w-4 h-4" />
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                {glassesDone} dari {Math.ceil(targetMl / glassMl)} gelas · {formatMl(glassMl)} ml per gelas
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
              <button
                onClick={onDrinkNow}
                className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500 hover:from-sky-500 hover:to-cyan-400 text-white dark:from-[#0369a1] dark:to-[#0e7490] dark:hover:from-[#0284c7] dark:hover:to-[#0891b2] dark:text-[#f8fafc] font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-sky-500/25 transition-colors active:scale-[0.98]"
              >
                <Droplets className="w-4 h-4" />
                <span>Sudah Minum Sekarang</span>
                <span className="text-xs font-semibold opacity-80">+{formatMl(settings.glassMl)} ml</span>
              </button>
              <button
                onClick={onTriggerAlarmNow}
                className="px-5 py-3.5 rounded-2xl bg-white hover:bg-sky-50 text-sky-700 border border-sky-200 font-semibold text-sm flex items-center justify-center gap-2 transition-colors active:scale-[0.98]"
              >
                <BellRing className="w-4 h-4" />
                <span>Tes Suara</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            Icon: Clock,
            label: 'Terakhir minum',
            value: lastDrinkHM !== '--:--' ? lastDrinkHM : '-',
            tone: 'bg-sky-100 text-sky-600',
          },
          {
            Icon: Repeat,
            label: 'Interval',
            value: `${Math.floor(settings.intervalMinutes / 60)}j${settings.intervalMinutes % 60 ? ` ${settings.intervalMinutes % 60}m` : ''}`,
            tone: 'bg-cyan-100 text-cyan-600',
          },
          {
            Icon: Target,
            label: 'Target harian',
            value: `${(targetMl / 1000).toLocaleString('id-ID')} L`,
            tone: 'bg-blue-100 text-blue-600',
          },
        ].map(({ Icon, label, value, tone }) => (
          <div
            key={label}
            className="bg-white/80 backdrop-blur-sm rounded-2xl p-3 sm:p-4 border border-white/80 shadow-sm shadow-sky-100/50"
          >
            <span className={`w-8 h-8 rounded-xl flex items-center justify-center ${tone}`}>
              <Icon className="w-4 h-4" />
            </span>
            <div className="mt-2 text-base sm:text-lg font-extrabold text-slate-900 tabular-nums">{value}</div>
            <div className="text-[11px] text-slate-500 leading-tight">{label}</div>
          </div>
        ))}
      </div>

      {/* Daily hydration tip */}
      <section className="rounded-2xl p-4 sm:p-5 bg-gradient-to-r from-sky-100/80 to-cyan-100/80 border border-sky-200/60 flex gap-3">
        <span className="w-9 h-9 shrink-0 rounded-xl bg-white/80 text-amber-500 flex items-center justify-center shadow-xs">
          <Lightbulb className="w-4 h-4" />
        </span>
        <div>
          <h3 className="text-xs font-bold text-sky-800 uppercase tracking-wider">Tips hidrasi hari ini</h3>
          <p className="text-sm text-slate-700 mt-1 leading-relaxed">{tip}</p>
        </div>
      </section>

      {/* Time simulator: only for development (npm run dev), hidden in the deployed app */}
      {import.meta.env.DEV && (
        <section className="bg-white/60 border border-dashed border-slate-300 rounded-2xl p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <FastForward className="w-4 h-4 text-slate-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Simulasi Waktu (Dev)</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: '+10 Menit', minutes: 10 },
              { label: '+1 Jam', minutes: 60 },
              { label: '+3 Jam', minutes: 180 },
            ].map(({ label, minutes }) => (
              <button
                key={label}
                onClick={() => onFastForward(minutes)}
                className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 transition-colors"
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => {
                const targetDiff = new Date(drinkStatus.nextAlarmAt).getTime() - currentTimeMs;
                onFastForward(Math.max(1, Math.ceil(targetDiff / 60000) + 1));
              }}
              className="px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold transition-colors"
            >
              Lompat ke Alarm
            </button>
          </div>
        </section>
      )}
    </div>
  );
};
