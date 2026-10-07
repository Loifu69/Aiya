import React, { useState } from 'react';
import { Sparkles, X, ArrowRight, Play, CheckCircle2, Clock, Users, RefreshCw } from 'lucide-react';

interface DocumentScenarioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyScenarioB: () => void;
}

export const DocumentScenarioModal: React.FC<DocumentScenarioModalProps> = ({
  isOpen,
  onClose,
  onApplyScenarioB,
}) => {
  const [selectedTab, setSelectedTab] = useState<'A' | 'B' | 'C'>('B');

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="scenario-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-1 rounded-lg"
          aria-label="Tutup dialog skenario"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-1">
          <div className="w-7 h-7 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <h2 id="scenario-modal-title" className="text-lg font-bold text-slate-900">
            Contoh Skenario Dokumen Aiya (Bagian 7)
          </h2>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Asumsi: Interval Minum = 3 jam (180 mnt), Durasi Tunda = 10 menit.
        </p>

        {/* Tab switcher */}
        <div className="flex rounded-xl bg-slate-100 p-1 mb-5">
          <button
            onClick={() => setSelectedTab('A')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              selectedTab === 'A' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Skenario A (Langsung Sudah)
          </button>
          <button
            onClick={() => setSelectedTab('B')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              selectedTab === 'B' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Skenario B (Tunda &quot;Belum&quot;)
          </button>
          <button
            onClick={() => setSelectedTab('C')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              selectedTab === 'C' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Skenario C (Sisi Teman)
          </button>
        </div>

        {/* Tab Content */}
        {selectedTab === 'A' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-600">
              Pengguna selalu langsung minum begitu alarm berbunyi:
            </p>
            <div className="border border-slate-200 rounded-2xl overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-700">
                  <tr>
                    <th className="p-2.5">Waktu</th>
                    <th className="p-2.5">Kejadian</th>
                    <th className="p-2.5">Aksi</th>
                    <th className="p-2.5">Jadwal Berikutnya</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  <tr>
                    <td className="p-2.5 font-semibold">09:00</td>
                    <td className="p-2.5">Alarm berbunyi</td>
                    <td className="p-2.5 text-sky-700 font-bold">Sudah</td>
                    <td className="p-2.5 font-semibold text-slate-900">12:00</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-semibold">12:00</td>
                    <td className="p-2.5">Alarm berbunyi</td>
                    <td className="p-2.5 text-sky-700 font-bold">Sudah</td>
                    <td className="p-2.5 font-semibold text-slate-900">15:00</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-500 italic">
              Siklus berjalan teratur dengan penambahan 3 jam dari saat tombol ditekan.
            </p>
          </div>
        )}

        {selectedTab === 'B' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-600">
              Pengguna menunda dua kali dengan &quot;Belum&quot;, lalu menekan &quot;Sudah&quot; pada 09:20:
            </p>
            <div className="border border-slate-200 rounded-2xl overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-700">
                  <tr>
                    <th className="p-2.5">Waktu</th>
                    <th className="p-2.5">Kejadian</th>
                    <th className="p-2.5">Aksi</th>
                    <th className="p-2.5">Jadwal Berikutnya</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  <tr>
                    <td className="p-2.5 font-semibold">09:00</td>
                    <td className="p-2.5">Alarm berbunyi</td>
                    <td className="p-2.5 text-amber-700 font-bold">Belum</td>
                    <td className="p-2.5 font-semibold text-slate-900">09:10</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-semibold">09:10</td>
                    <td className="p-2.5">Alarm berbunyi</td>
                    <td className="p-2.5 text-amber-700 font-bold">Belum</td>
                    <td className="p-2.5 font-semibold text-slate-900">09:20</td>
                  </tr>
                  <tr className="bg-sky-50/60">
                    <td className="p-2.5 font-semibold text-sky-900">09:20</td>
                    <td className="p-2.5 text-sky-900">Alarm berbunyi</td>
                    <td className="p-2.5 text-sky-700 font-bold">Sudah</td>
                    <td className="p-2.5 font-extrabold text-sky-900">12:20</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed">
              <strong>Aturan Utama Dokumen:</strong> Setelah menjawab &quot;Sudah&quot; pada pukul 09:20, jadwal berikutnya adalah <strong>12:20 (bukan 12:00)</strong>, karena penghitungan dinamis dimulai dari waktu pengguna menekan tombol.
            </div>
            <button
              onClick={() => {
                onApplyScenarioB();
                onClose();
              }}
              className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Muat Skenario B Ini ke Jadwal Aktif Sekarang</span>
            </button>
          </div>
        )}

        {selectedTab === 'C' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-600">
              Bagaimana status pengguna terlihat oleh teman saat menunda:
            </p>
            <div className="border border-slate-200 rounded-2xl overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-700">
                  <tr>
                    <th className="p-2.5">Waktu</th>
                    <th className="p-2.5">Status Pengguna</th>
                    <th className="p-2.5">Yang Terlihat oleh Teman</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="p-2.5 font-semibold tabular-nums">09:00</td>
                    <td className="p-2.5">Alarm berbunyi, dueAt = 09:00</td>
                    <td className="p-2.5 text-sky-700 font-medium">Waktunya minum</td>
                  </tr>
                  <tr className="bg-amber-50/60">
                    <td className="p-2.5 font-semibold tabular-nums text-amber-900">09:10</td>
                    <td className="p-2.5 text-amber-900">Menekan &quot;Belum&quot;, dueAt masih 09:00</td>
                    <td className="p-2.5 text-amber-800 font-bold">Terlambat (opsi: kirim pengingat)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-semibold tabular-nums">09:20</td>
                    <td className="p-2.5">Menekan &quot;Sudah&quot; pukul 09:20</td>
                    <td className="p-2.5 text-emerald-700 font-medium">Terakhir minum 09:20, berikutnya 12:20</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 leading-relaxed">
              <strong>Pemisahan dueAt &amp; nextAlarmAt:</strong> Jika pengguna menekan &quot;Belum&quot;, nextAlarmAt bergeser 10 menit, tetapi dueAt tetap. Dengan begitu teman dapat melihat bahwa pengguna sudah melewati jadwal minumnya (terlambat), walaupun alarm masih ditunda.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
