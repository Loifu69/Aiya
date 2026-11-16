import React, { useMemo, useState } from 'react';
import { CalendarDays, Droplet, Flame, History, Plus, Target, Trash2, TrendingUp } from 'lucide-react';
import { DrinkLog } from '../types';
import { formatTimeHM, logAmountMl } from '../utils/storage';

interface HistoryPageProps {
  logs: DrinkLog[];
  dailyTargetMl: number;
  currentTimeMs: number;
  onAddManualLog: () => void;
  onDeleteLog: (logId: string) => void;
}

// Bar color validated (dataviz validator) for both light and dark surfaces, so it is a
// fixed value instead of a palette class that flips in dark mode.
const BAR_COLOR = 'bg-[#0284c7]';

const formatMl = (ml: number) => ml.toLocaleString('id-ID');
const dayKey = (ms: number) => new Date(ms).toDateString();

function dayLabel(ms: number, nowMs: number): string {
  const diff = Math.round(
    (new Date(dayKey(nowMs)).getTime() - new Date(dayKey(ms)).getTime()) / 86400000
  );
  if (diff === 0) return 'Hari ini';
  if (diff === 1) return 'Kemarin';
  return new Date(ms).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' });
}

// Clean axis max: round up to a nice step
function niceMax(value: number): number {
  const step = value <= 2000 ? 500 : 1000;
  return Math.max(step, Math.ceil(value / step) * step);
}

export const HistoryPage: React.FC<HistoryPageProps> = ({ logs, dailyTargetMl, currentTimeMs, onAddManualLog, onDeleteLog }) => {
  const [activeBar, setActiveBar] = useState<number | null>(null);
  const target = Math.max(1, dailyTargetMl);

  // Last 7 days (oldest -> today)
  const week = useMemo(() => {
    const today = new Date(dayKey(currentTimeMs)).getTime();
    return Array.from({ length: 7 }, (_, i) => {
      const start = today - (6 - i) * 86400000;
      const key = dayKey(start);
      const dayLogs = logs.filter((l) => dayKey(new Date(l.timestamp).getTime()) === key);
      return {
        start,
        short: i === 6 ? 'Hari ini' : new Date(start).toLocaleDateString('id-ID', { weekday: 'short' }),
        long: new Date(start).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' }),
        ml: dayLogs.reduce((sum, l) => sum + logAmountMl(l), 0),
        count: dayLogs.length,
      };
    });
  }, [logs, currentTimeMs]);

  const todayMl = week[6].ml;
  const avgMl = Math.round(week.reduce((s, d) => s + d.ml, 0) / 7);
  const daysOnTarget = week.filter((d) => d.ml >= target).length;
  const axisMax = niceMax(Math.max(target, ...week.map((d) => d.ml)));
  const ticks = [0, axisMax / 2, axisMax];

  // Entries grouped by day, newest first
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; ml: number; items: DrinkLog[] }>();
    for (const log of logs) {
      const ms = new Date(log.timestamp).getTime();
      const key = dayKey(ms);
      if (!map.has(key)) map.set(key, { label: dayLabel(ms, currentTimeMs), ml: 0, items: [] });
      const g = map.get(key)!;
      g.items.push(log);
      g.ml += logAmountMl(log);
    }
    return Array.from(map.values());
  }, [logs, currentTimeMs]);

  return (
    <div className="space-y-5 max-w-2xl mx-auto pb-24 md:pb-8">
      {/* Header + stats */}
      <section className="bg-white/80 backdrop-blur-sm rounded-[2rem] p-6 border border-white/80 shadow-lg shadow-sky-100/60">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-2xl bg-gradient-to-br from-sky-400 to-cyan-400 text-white flex items-center justify-center shadow-md shadow-sky-300/40">
              <History className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Riwayat Minum</h1>
              <p className="text-xs text-slate-500">Pantau kebiasaan minummu setiap hari</p>
            </div>
          </div>
          <button
            onClick={() => onAddManualLog()}
            className="flex items-center gap-1.5 px-3 py-2 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-xl text-xs font-bold transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Catat</span>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2.5 mt-5">
          {[
            { Icon: Droplet, label: 'Hari ini', value: `${formatMl(todayMl)} ml`, tone: 'bg-sky-100 text-sky-600' },
            { Icon: TrendingUp, label: 'Rata-rata 7 hari', value: `${formatMl(avgMl)} ml`, tone: 'bg-cyan-100 text-cyan-600' },
            { Icon: Flame, label: 'Hari capai target', value: `${daysOnTarget}/7`, tone: 'bg-amber-100 text-amber-600' },
          ].map(({ Icon, label, value, tone }) => (
            <div key={label} className="rounded-2xl p-3 bg-slate-50/80 border border-slate-100">
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${tone}`}>
                <Icon className="w-3.5 h-3.5" />
              </span>
              <div className="mt-2 text-sm sm:text-base font-extrabold text-slate-900 tabular-nums">{value}</div>
              <div className="text-[11px] text-slate-500 leading-tight">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 7-day chart */}
      <section className="bg-white/80 backdrop-blur-sm rounded-[2rem] p-6 border border-white/80 shadow-lg shadow-sky-100/60">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900">Air yang diminum, 7 hari terakhir</h2>
          <span className="text-[11px] text-slate-500 inline-flex items-center gap-1 whitespace-nowrap shrink-0">
            <Target className="w-3 h-3" /> Target {formatMl(target)} ml
          </span>
        </div>

        <div className="mt-4 flex gap-2" onMouseLeave={() => setActiveBar(null)}>
          {/* y axis */}
          <div className="relative w-9 h-44 shrink-0 text-[10px] text-slate-500 tabular-nums">
            {ticks.map((t) => (
              <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (t / axisMax) * 100}%` }}>
                {t >= 1000 ? `${(t / 1000).toLocaleString('id-ID')}L` : t}
              </span>
            ))}
          </div>

          {/* plot */}
          <div className="relative flex-1 h-44">
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute inset-x-0 border-t border-slate-200"
                style={{ top: `${100 - (t / axisMax) * 100}%` }}
              />
            ))}
            {/* target reference line */}
            <div
              className="absolute inset-x-0 border-t border-slate-400 z-10 pointer-events-none"
              style={{ top: `${100 - (target / axisMax) * 100}%` }}
            />

            <div className="absolute inset-0 grid grid-cols-7">
              {week.map((d, i) => {
                const h = (d.ml / axisMax) * 100;
                const active = activeBar === i;
                return (
                  <button
                    key={d.start}
                    type="button"
                    className="relative h-full flex items-end justify-center focus:outline-hidden group"
                    onMouseEnter={() => setActiveBar(i)}
                    onFocus={() => setActiveBar(i)}
                    onClick={() => setActiveBar(active ? null : i)}
                    aria-label={`${d.long}: ${formatMl(d.ml)} ml dari ${d.count} kali minum`}
                  >
                    {d.ml > 0 && (
                      <span
                        className={`w-full max-w-6 rounded-t-[4px] ${BAR_COLOR} transition-opacity ${
                          activeBar !== null && !active ? 'opacity-50' : ''
                        }`}
                        style={{ height: `${h}%` }}
                      />
                    )}
                    {active && (
                      <span
                        className="absolute z-20 left-1/2 -translate-x-1/2 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 shadow-lg text-[11px] text-left whitespace-nowrap pointer-events-none"
                        style={{ bottom: `calc(${Math.min(h, 78)}% + 8px)` }}
                      >
                        <span className="block font-bold text-slate-900 tabular-nums">{formatMl(d.ml)} ml</span>
                        <span className="block text-slate-500">
                          {d.short === 'Hari ini' ? 'Hari ini' : d.long} · {d.count}x minum
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* x axis */}
        <div className="flex gap-2 mt-2">
          <div className="w-9 shrink-0" />
          <div className="flex-1 grid grid-cols-7 text-center text-[10px] text-slate-500">
            {week.map((d, i) => (
              <span key={d.start} className={i === 6 ? 'font-bold text-slate-900' : ''}>
                {d.short}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Entries grouped by day */}
      <section className="bg-white/80 backdrop-blur-sm rounded-[2rem] p-6 border border-white/80 shadow-lg shadow-sky-100/60">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-sky-600" />
          Catatan minum
        </h2>

        {groups.length === 0 ? (
          <div className="py-10 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-sky-50 text-sky-400 flex items-center justify-center">
              <Droplet className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-700 mt-3">Belum ada catatan</p>
            <p className="text-xs text-slate-500 mt-1">Tekan &quot;Sudah Minum&quot; dan catatanmu akan muncul di sini.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            {groups.map((g) => (
              <div key={g.label}>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-bold text-slate-700 capitalize">{g.label}</span>
                  <span className="text-slate-500 tabular-nums">
                    {formatMl(g.ml)} ml · {g.items.length}x
                  </span>
                </div>
                <ol className="relative border-l-2 border-sky-100 ml-3 space-y-3">
                  {g.items.map((log) => (
                    <li key={log.id} className="relative pl-5">
                      <span className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-gradient-to-b from-sky-400 to-sky-600 ring-4 ring-white" />
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-xs font-bold text-slate-900">
                              {log.action === 'SUDAH' ? 'Minum setelah diingatkan' : 'Minum sebelum pengingat'}
                            </span>
                            <span className="text-[11px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded-md tabular-nums whitespace-nowrap">
                              +{formatMl(logAmountMl(log))} ml
                            </span>
                          </div>
                          {log.note && <p className="text-[11px] text-slate-500 mt-0.5 truncate">{log.note}</p>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-xs font-mono font-semibold text-slate-700 tabular-nums">
                            {formatTimeHM(log.timestamp)}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Hapus catatan minum jam ${formatTimeHM(log.timestamp)} (+${formatMl(logAmountMl(log))} ml)?`)) {
                                onDeleteLog(log.id);
                              }
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            aria-label="Hapus catatan ini"
                            title="Hapus catatan ini"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
