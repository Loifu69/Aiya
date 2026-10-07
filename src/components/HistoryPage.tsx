import React from 'react';
import { History, Check, Clock, Calendar, Plus, Droplet } from 'lucide-react';
import { DrinkLog } from '../types';
import { formatTimeHM } from '../utils/storage';

interface HistoryPageProps {
  logs: DrinkLog[];
  onAddManualLog: () => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({ logs, onAddManualLog }) => {
  const sudahCount = logs.filter((l) => l.action === 'SUDAH' || l.action === 'MANUAL').length;
  const belumCount = logs.filter((l) => l.action === 'BELUM').length;

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
              Catatan konfirmasi &quot;Sudah&quot; dan &quot;Belum&quot; minum air.
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
              Konfirmasi Sudah
            </span>
            <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums flex items-baseline gap-1.5">
              <span>{sudahCount}</span>
              <span className="text-xs font-normal text-slate-500">kali</span>
            </div>
            <span className="text-[11px] text-emerald-600 mt-1 block">
              ≈ {(sudahCount * 250) / 1000} Liter air
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Ditunda (Belum)
            </span>
            <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums flex items-baseline gap-1.5">
              <span>{belumCount}</span>
              <span className="text-xs font-normal text-slate-500">kali</span>
            </div>
            <span className="text-[11px] text-amber-600 mt-1 block">
              Jadwal disesuaikan
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
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        log.action === 'SUDAH' || log.action === 'MANUAL'
                          ? 'bg-sky-50 text-sky-600 border border-sky-100'
                          : 'bg-amber-50 text-amber-600 border border-amber-100'
                      }`}
                    >
                      {log.action === 'SUDAH' || log.action === 'MANUAL' ? (
                        <Droplet className="w-4 h-4" />
                      ) : (
                        <Clock className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">
                          {log.action === 'SUDAH'
                            ? 'Konfirmasi Minum ("Sudah")'
                            : log.action === 'MANUAL'
                            ? 'Minum di Luar Alarm'
                            : 'Alarm Ditunda ("Belum")'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {log.note || (log.action === 'BELUM' ? 'Jadwal alarm digeser ke durasi tunda' : 'Jadwal berikutnya dimajukan +interval')}
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
