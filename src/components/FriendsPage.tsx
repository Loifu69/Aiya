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
  Send,
  Hourglass,
  Sparkles,
} from 'lucide-react';
import { Friend, FriendRequest, UserAccount } from '../types';
import {
  computeFriendStatus,
  formatRemainingTime,
  formatTimeHM,
  NUDGE_COOLDOWN_MS,
} from '../utils/storage';

interface FriendsPageProps {
  currentUser: UserAccount;
  friends: Friend[];
  friendRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  allAccounts: UserAccount[];
  currentTimeMs: number;
  onNudgeFriend: (friend: Friend) => void;
  onSendFriendRequest: (identifier: string) => Promise<{ success: boolean; message: string }> | { success: boolean; message: string };
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
  outgoingRequests,
  allAccounts,
  currentTimeMs,
  onNudgeFriend,
  onSendFriendRequest,
  onAcceptRequest,
  onRejectRequest,
  onRemoveFriend,
  onToggleMuteFriend,
  activeNudgeSuccessMessage,
}) => {
  const [activeTab, setActiveTab] = useState<'list' | 'requests' | 'add'>('list');
  const [friendInput, setFriendInput] = useState('');
  const [addFeedback, setAddFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendInput.trim()) {
      setAddFeedback({ type: 'error', text: 'Masukkan kode atau username teman' });
      return;
    }

    const res = await onSendFriendRequest(friendInput.trim());
    if (res.success) {
      setAddFeedback({ type: 'success', text: res.message });
      setFriendInput('');
      setTimeout(() => {
        setAddFeedback(null);
      }, 4000);
    } else {
      setAddFeedback({ type: 'error', text: res.message });
    }
  };

  const handleQuickSend = async (identifier: string) => {
    const res = await onSendFriendRequest(identifier);
    if (res.success) {
      setAddFeedback({ type: 'success', text: res.message });
      setTimeout(() => {
        setAddFeedback(null);
      }, 4000);
    } else {
      setAddFeedback({ type: 'error', text: res.message });
    }
  };

  // Other accounts that can be added
  const otherAccounts = allAccounts.filter((a) => a.id !== currentUser.id);

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
              Pertemanan dua arah: kirim permintaan dan tunggu persetujuan untuk saling memantau jadwal minum.
            </p>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
            <button
              onClick={() => setActiveTab('list')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === 'list'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Teman ({friends.length})
            </button>
            <button
              onClick={() => setActiveTab('requests')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all relative cursor-pointer ${
                activeTab === 'requests'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Permintaan
              {friendRequests.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-rose-500 text-white rounded-full text-[10px] font-bold">
                  {friendRequests.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('add')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
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
                Kirim permintaan pertemanan ke pengguna lain. Setelah mereka menyetujui, kalian akan saling terhubung!
              </p>
              <button
                onClick={() => setActiveTab('add')}
                className="mt-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-xl cursor-pointer"
              >
                + Tambah Teman Sekarang
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
                          {friend.isMuted && (
                            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">
                              Dibisukan
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 mt-1">
                          <span>
                            Terakhir minum:{' '}
                            <strong className="text-slate-800">
                              {lastDrinkHM !== '--:--' ? lastDrinkHM : 'Belum tercatat'}
                            </strong>
                          </span>
                          <span>·</span>
                          <span>
                            Jadwal berikutnya:{' '}
                            <strong className="text-slate-800">{dueHM}</strong>
                          </span>
                        </div>

                        <div className="text-xs mt-1">
                          {status === 'TERLAMBAT' && (
                            <span className="text-amber-700 font-semibold inline-flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
                              <span>{remaining.text} (Perlu minum!)</span>
                            </span>
                          )}
                          {status === 'WAKTUNYA_MINUM' && (
                            <span className="text-sky-700 font-medium">
                              Waktunya minum sekarang!
                            </span>
                          )}
                          {status === 'SUDAH_MINUM' && (
                            <span className="text-emerald-700 font-medium">
                              Terhidrasi ({remaining.text})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions: Nudge, Mute, Remove */}
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {status === 'TERLAMBAT' ? (
                        <button
                          onClick={() => onNudgeFriend(friend)}
                          disabled={isCoolingDown}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer ${
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
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
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
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
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

      {/* Tab: Friend Requests (Permintaan Masuk & Terkirim) */}
      {activeTab === 'requests' && (
        <div className="space-y-6">
          {/* Section: Incoming Requests */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Permintaan Masuk ({friendRequests.length})
            </h2>

            {friendRequests.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 border border-slate-200 text-center space-y-1">
                <UserCheck className="w-7 h-7 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-700">Tidak ada permintaan masuk</p>
                <p className="text-[11px] text-slate-400">
                  Ketika orang lain mengirimkan permintaan kepadamu, permintaan tersebut akan muncul di sini untuk kamu setujui.
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
                      <span className="text-[10px] text-sky-600 font-medium">
                        Ingin menjadi teman hidrasimu
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onAcceptRequest(req.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors cursor-pointer shadow-xs"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Terima</span>
                    </button>
                    <button
                      onClick={() => onRejectRequest(req.id)}
                      className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                      title="Tolak"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Section: Outgoing Requests */}
          {outgoingRequests.length > 0 && (
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Permintaan Terkirim ({outgoingRequests.length})
              </h2>

              <div className="space-y-2">
                {outgoingRequests.map((req) => {
                  const targetUser = allAccounts.find((a) => a.id === req.toUserId);
                  return (
                    <div
                      key={req.id}
                      className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <Hourglass className="w-4 h-4 text-amber-500 shrink-0" />
                        <div>
                          <span className="font-semibold text-slate-800">
                            {targetUser?.name || 'Pengguna Aiya'}
                          </span>
                          <span className="text-slate-400 ml-1.5 font-mono text-[11px]">
                            {targetUser?.userCode}
                          </span>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-md bg-amber-100/70 text-amber-800 text-[10px] font-semibold">
                        Menunggu Persetujuan
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Add Friend */}
      {activeTab === 'add' && (
        <div className="space-y-6 max-w-xl mx-auto">
          {/* Add form */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2 mb-2">
              <UserPlus className="w-5 h-5 text-sky-600" />
              <h2 className="text-base font-bold text-slate-900">Kirim Permintaan Pertemanan</h2>
            </div>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              Masukkan Username atau Kode Teman untuk mengirim permintaan. Akun orang lain baru akan menjadi temanmu setelah disetujui.
            </p>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label htmlFor="friendIdentifier" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Username atau Kode Teman
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="friendIdentifier"
                    type="text"
                    placeholder="Misal: sari, budi, atau AIYA-SARI"
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

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Kirim Permintaan Pertemanan</span>
              </button>
            </form>
          </div>

          {/* List of Registered Users */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-sky-600" />
              <h2 className="text-sm font-bold text-slate-900">
                Pengguna Terdaftar di Aiya
              </h2>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Klik &quot;Kirim Permintaan&quot; untuk mengirim permintaan pertemanan ke akun lain.
            </p>

            <div className="divide-y divide-slate-100">
              {otherAccounts.map((account) => {
                const isFriend = friends.some((f) => f.id === account.id);
                const hasSentRequest = outgoingRequests.some((r) => r.toUserId === account.id);
                const hasIncomingRequest = friendRequests.find((r) => r.fromUserId === account.id);

                return (
                  <div
                    key={account.id}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full overflow-hidden bg-sky-100 border border-slate-200 shrink-0">
                        <img
                          src={account.avatar}
                          alt={account.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs text-slate-900">
                            {account.name}
                          </span>
                          <span className="text-[10px] text-slate-600 font-mono">
                            @{account.username}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-600 font-mono block">
                          {account.userCode}
                        </span>
                      </div>
                    </div>

                    <div>
                      {isFriend ? (
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-1">
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>Sudah Berteman</span>
                        </span>
                      ) : hasIncomingRequest ? (
                        <button
                          type="button"
                          onClick={() => onAcceptRequest(hasIncomingRequest.id)}
                          className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-xs cursor-pointer"
                        >
                          Terima Permintaan
                        </button>
                      ) : hasSentRequest ? (
                        <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold flex items-center gap-1">
                          <Hourglass className="w-3 h-3 text-amber-600" />
                          <span>Menunggu Persetujuan</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleQuickSend(account.username)}
                          className="px-3 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Kirim Permintaan</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Privacy rule card from Section 10.4 */}
          <section className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-xs text-slate-600 space-y-1.5">
            <span className="font-bold text-slate-800 block">Aturan Persetujuan Dua Arah (Sesuai Dokumen Spesifikasi 10.4):</span>
            <ul className="list-disc list-inside space-y-1 text-slate-600">
              <li>Pertemanan harus disetujui oleh penerima agar status hidrasi dapat saling terlihat.</li>
              <li>Teman hanya dapat melihat waktu terakhir minum, jadwal berikutnya, dan status hidrasi.</li>
            </ul>
          </section>
        </div>
      )}
    </div>
  );
};
