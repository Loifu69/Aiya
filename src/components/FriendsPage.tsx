import React, { useState } from 'react';
import {
  Users,
  Bell,
  UserPlus,
  Clock,
  CheckCircle,
  AlertCircle,
  Volume2,
  VolumeX,
  Trash2,
  Search,
  Check,
  X,
  UserCheck,
} from 'lucide-react';
import { Friend, FriendRequest, UserSettings } from '../types';
import {
  computeFriendStatus,
  formatRemainingTime,
  formatTimeHM,
  NUDGE_COOLDOWN_MS,
} from '../utils/storage';

interface FriendsPageProps {
  currentUser: UserSettings;
  friends: Friend[];
  friendRequests: FriendRequest[];
  currentTimeMs: number;
  onNudgeFriend: (friend: Friend) => void;
  onAddFriend: (identifier: string) => { success: boolean; message: string };
  onAcceptRequest: (reqId: string) => void;
  onRejectRequest: (reqId: string) => void;
  onRemoveFriend: (friendId: string) => void;
  onToggleMuteFriend: (friendId: string) => void;
  activeNudgeSuccessMessage: string | null;
}

export const FriendsPage: React.FC<FriendsPageProps> = ({
  currentUser,
  friends,
  friendRequests,
  currentTimeMs,
  onNudgeFriend,
  onAddFriend,
  onAcceptRequest,
  onRejectRequest,
  onRemoveFriend,
  onToggleMuteFriend,
  activeNudgeSuccessMessage,
}) => {
  const [activeTab, setActiveTab] = useState<'list' | 'requests' | 'add'>('list');
  const [friendInput, setFriendInput] = useState('');
  const [addFeedback, setAddFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendInput.trim()) {
      setAddFeedback({ type: 'error', text: 'Masukkan kode atau username teman' });
      return;
    }

    const res = onAddFriend(friendInput.trim());
    if (res.success) {
      setAddFeedback({ type: 'success', text: res.message });
      setFriendInput('');
      setTimeout(() => {
        setActiveTab('list');
        setAddFeedback(null);
      }, 1500);
    } else {
      setAddFeedback({ type: 'error', text: res.message });
    }
  };

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Top Banner & Tab switcher */}
      <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Users className="w-5 h-5 text-sky-600" />
              <span>Daftar Teman &amp; Saling Mengingatkan</span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Lihat jadwal minum temanmu. Jika ada yang terlambat, kirimkan pengingat ramah.
            </p>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
            <button
              onClick={() => setActiveTab('list')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'list'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Teman ({friends.length})
            </button>
            <button
              onClick={() => setActiveTab('requests')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all relative ${
                activeTab === 'requests'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Permintaan
              {friendRequests.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 bg-rose-500 text-white rounded-full text-[10px] font-bold">
                  {friendRequests.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('add')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'add'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              + Tambah
            </button>
          </div>
        </div>

        {/* Nudge Success Alert */}
        {activeNudgeSuccessMessage && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{activeNudgeSuccessMessage}</span>
          </div>
        )}
      </div>

      {/* Tab: Friend List */}
      {activeTab === 'list' && (
        <div className="space-y-3">
          {friends.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center space-y-3">
              <Users className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-700">Belum ada teman terhubung</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Tambahkan teman menggunakan ID atau username mereka agar bisa saling menjaga hidrasi!
              </p>
              <button
                onClick={() => setActiveTab('add')}
                className="mt-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-xl"
              >
                Tambah Teman Sekarang
              </button>
            </div>
          ) : (
            friends.map((friend) => {
              const status = computeFriendStatus(friend.dueAt, currentTimeMs);
              const lastDrinkHM = formatTimeHM(friend.lastDrinkAt);
              const dueHM = formatTimeHM(friend.dueAt);
              const remaining = formatRemainingTime(friend.dueAt, currentTimeMs);

              // Check nudge cooldown
              const lastNudgeMs = friend.lastNudgeAt ? new Date(friend.lastNudgeAt).getTime() : 0;
              const timeSinceNudge = currentTimeMs - lastNudgeMs;
              const isCoolingDown = timeSinceNudge < NUDGE_COOLDOWN_MS;
              const cooldownMinutesLeft = Math.ceil((NUDGE_COOLDOWN_MS - timeSinceNudge) / (60 * 1000));

              return (
                <div
                  key={friend.id}
                  className={`bg-white rounded-2xl p-4 sm:p-5 border transition-all ${
                    status === 'TERLAMBAT'
                      ? 'border-amber-200 shadow-xs bg-gradient-to-r from-white to-amber-50/20'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    {/* Friend Profile & Hydration Data */}
                    <div className="flex items-start gap-3.5">
                      <div className="w-11 h-11 rounded-full overflow-hidden bg-sky-100 border border-slate-200 shrink-0">
                        <img
                          src={friend.avatar}
                          alt={friend.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // graceful fallback container
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 truncate">
                            {friend.name}
                          </span>
                          <span className="text-xs text-slate-600 font-mono">
                            {friend.userCode}
                          </span>
                        </div>

                        {/* Unboxed Metadata as mandated by Frontend Design Constitution */}
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 mt-1">
                          <span>Terakhir: <strong className="text-slate-700 font-medium">{lastDrinkHM}</strong></span>
                          <span aria-hidden="true">·</span>
                          <span>Berikutnya: <strong className="text-slate-700 font-medium">{dueHM}</strong></span>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-600">{remaining.text}</span>
                        </div>

                        {/* Status text according to Section 10.2 */}
                        <div className="mt-2 flex items-center gap-2">
                          {status === 'SUDAH_MINUM' && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 rounded-md">
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Sudah minum</span>
                            </span>
                          )}
                          {status === 'WAKTUNYA_MINUM' && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200/60 px-2.5 py-0.5 rounded-md">
                              <Clock className="w-3.5 h-3.5 text-sky-600" />
                              <span>Waktunya minum</span>
                            </span>
                          )}
                          {status === 'TERLAMBAT' && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-md">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                              <span>Terlambat</span>
                            </span>
                          )}

                          {friend.isMuted && (
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              <VolumeX className="w-3 h-3" /> Dibisukan
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions: Nudge button & Friend Options */}
                    <div className="flex items-center justify-end gap-2 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
                      {status === 'TERLAMBAT' ? (
                        <button
                          onClick={() => onNudgeFriend(friend)}
                          disabled={isCoolingDown}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-xs ${
                            isCoolingDown
                              ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                              : 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20 active:scale-[0.98]'
                          }`}
                          title={
                            isCoolingDown
                              ? `Tunggu ${cooldownMinutesLeft} menit sebelum mengingatkan lagi`
                              : 'Kirim notifikasi ramah untuk mengingatkan teman'
                          }
                        >
                          <Bell className={`w-3.5 h-3.5 ${isCoolingDown ? '' : 'animate-bounce'}`} />
                          <span>
                            {isCoolingDown
                              ? `Diingatkan (${cooldownMinutesLeft}m)`
                              : 'Ingatkan'}
                          </span>
                        </button>
                      ) : (
                        <span className="text-xs text-slate-600 italic px-2 py-1">
                          {status === 'SUDAH_MINUM' ? 'Sudah terhidrasi' : 'Tepat jadwal'}
                        </span>
                      )}

                      <button
                        onClick={() => onToggleMuteFriend(friend.id)}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        title={friend.isMuted ? 'Nyalakan notifikasi teman ini' : 'Bisukan notifikasi teman ini'}
                      >
                        {friend.isMuted ? (
                          <VolumeX className="w-4 h-4 text-amber-500" />
                        ) : (
                          <Volume2 className="w-4 h-4" />
                        )}
                      </button>

                      <button
                        onClick={() => onRemoveFriend(friend.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Hapus dari daftar teman"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab: Friend Requests (Permintaan Masuk) */}
      {activeTab === 'requests' && (
        <div className="space-y-3">
          {friendRequests.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center space-y-2">
              <UserCheck className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-700">Tidak ada permintaan tertunda</p>
              <p className="text-xs text-slate-500">
                Permintaan pertemanan baru dari orang lain akan muncul di sini.
              </p>
            </div>
          ) : (
            friendRequests.map((req) => (
              <div
                key={req.id}
                className="bg-white rounded-2xl p-4 border border-slate-200 flex items-center justify-between gap-3 shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 border border-slate-200">
                    <img
                      src={req.fromAvatar}
                      alt={req.fromName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 leading-tight">
                      {req.fromName}
                    </h3>
                    <p className="text-xs text-slate-500 font-mono">{req.fromCode}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onAcceptRequest(req.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Terima</span>
                  </button>
                  <button
                    onClick={() => onRejectRequest(req.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                    title="Tolak"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab: Add Friend */}
      {activeTab === 'add' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs max-w-lg mx-auto">
          <div className="flex items-center gap-2 mb-3">
            <UserPlus className="w-5 h-5 text-sky-600" />
            <h2 className="text-base font-bold text-slate-900">Tambah Teman Baru</h2>
          </div>
          <p className="text-xs text-slate-500 mb-5 leading-relaxed">
            Masukkan Kode Teman (contoh: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">AIYA-DIMAS</code>, <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">AIYA-BUDI</code>) atau username teman untuk mengirim permintaan.
          </p>

          <form onSubmit={handleAddSubmit} className="space-y-4">
            <div>
              <label htmlFor="friendIdentifier" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Kode / Username Teman
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="friendIdentifier"
                  type="text"
                  placeholder="Misal: AIYA-DIMAS atau Dimas"
                  value={friendInput}
                  onChange={(e) => setFriendInput(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-sky-500 focus:bg-white transition-all font-mono"
                />
              </div>
            </div>

            {addFeedback && (
              <div
                className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                  addFeedback.type === 'error'
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                }`}
              >
                {addFeedback.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                ) : (
                  <CheckCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{addFeedback.text}</span>
              </div>
            )}

            <div className="pt-2 flex items-center gap-2">
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs transition-colors shadow-xs"
              >
                Kirim Permintaan Pertemanan
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('list');
                  setAddFeedback(null);
                }}
                className="px-4 py-2.5 rounded-xl text-slate-600 hover:text-slate-800 text-xs font-medium"
              >
                Batal
              </button>
            </div>
          </form>

          {/* Quick preset suggestions */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Coba kode contoh berikut:
            </span>
            <div className="flex flex-wrap gap-2">
              {['AIYA-DIMAS', 'AIYA-MAYA', 'AIYA-REZA'].map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setFriendInput(code)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-xs transition-colors"
                >
                  {code}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recommendation rule card from Section 10.4 */}
      <section className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-xs text-slate-600 space-y-1.5">
        <span className="font-bold text-slate-800 block">Etika &amp; Privasi Saling Mengingatkan:</span>
        <ul className="list-disc list-inside space-y-1 text-slate-600">
          <li><strong>Cooldown 15 Menit:</strong> Mencegah spam pengingat bertubi-tubi.</li>
          <li><strong>Hanya Status Esensial:</strong> Teman hanya melihat kapan kamu terakhir minum dan kapan jadwal berikutnya. Pengaturan interval pribadimu tetap rahasia.</li>
        </ul>
      </section>
    </div>
  );
};
