import React from 'react';
import { History, Plus, Droplet } from 'lucide-react';
import { DrinkLog } from '../types';
import { formatTimeHM, getIntakeForDayMl, logAmountMl } from '../utils/storage';

interface HistoryPageProps {
  logs: DrinkLog[];
  onAddManualLog: () => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({ logs, onAddManualLog }) => {
  const totalCount = logs.length;
  const totalMl = logs.reduce((sum, l) => sum + logAmountMl(l), 0);
  const todayKey = new Date().toDateString();
  const todayCount = logs.filter((l) => new Date(l.timestamp).toDateString() === todayKey).length;
  const todayMl = getIntakeForDayMl(logs);
  const formatMl = (ml: number) => ml.toLocaleString('id-ID');

  return (
    <div className="space-y-6 max-w-xl mx-auto pb-20 md:pb-8">
      {/* Overview Stat Cards */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <History className="w-5 h-5 text-sky-600" />
              <span>Riwayat Minum</span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Catatan setiap kali kamu menekan &quot;Sudah Minum&quot;.
            </p>
          </div>
          <button
            onClick={onAddManualLog}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-xl text-xs font-semibold transition-colors shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Catat Minum</span>
          </button>
        </div>

        {/* Unboxed metric stats as per design constitution */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Hari Ini
            </span>
            <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums flex items-baseline gap-1.5">
              <span>{todayCount}</span>
              <span className="text-xs font-normal text-slate-500">kali</span>
            </div>
            <span className="text-[11px] text-emerald-600 mt-1 block">
              {formatMl(todayMl)} ml air
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Total Tercatat
            </span>
            <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums flex items-baseline gap-1.5">
              <span>{totalCount}</span>
              <span className="text-xs font-normal text-slate-500">kali</span>
            </div>
            <span className="text-[11px] text-sky-600 mt-1 block">
              {formatMl(totalMl)} ml air
            </span>
          </div>
        </div>
      </div>

      {/* Log list */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-3">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
          Aktivitas Terakhir
        </h2>

        {logs.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">
            Belum ada aktivitas tercatat hari ini
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {logs.map((log) => {
              const timeHM = formatTimeHM(log.timestamp);
              const dateStr = new Date(log.timestamp).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'short',
              });

              return (
                <div key={log.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-sky-50 text-sky-600 border border-sky-100">
                      <Droplet className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">
                          {log.action === 'SUDAH' ? 'Minum Setelah Diingatkan' : 'Minum Sebelum Pengingat'}
                        </span>
                        <span className="text-[11px] font-semibold text-sky-600">+{logAmountMl(log)} ml</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {log.note || 'Jadwal berikutnya dihitung ulang dari waktu ini'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono font-semibold text-slate-900 tabular-nums">
                      {timeHM}
                    </div>
                    <span className="text-[10px] text-slate-600">{dateStr}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
