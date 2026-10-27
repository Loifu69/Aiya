import React, { useState } from 'react';
import {
  Settings,
  Volume2,
  Clock,
  Moon,
  User,
  Copy,
  Check,
  Play,
  Square,
  Sparkles,
  AlertCircle,
  Save,
  LogOut,
  Cloud,
  Database,
  Trash2,
  Eye,
  EyeOff,
  AlertTriangle,
} from 'lucide-react';
import { SoundType, UserAccount, UserSettings } from '../types';
import { playWaterSound, stopWaterSound } from '../utils/audio';
import { isFirebaseReady } from '../utils/firebase';

interface SettingsPageProps {
  currentUser: UserAccount;
  settings: UserSettings;
  onUpdateSettings: (newSettings: Partial<UserSettings>) => { success: boolean; message?: string };
  onResetToDemoScenario: () => void;
  onLogout: () => void;
  onOpenCloudSync: () => void;
  onDeleteAccount: (password: string) => Promise<{ success: boolean; message: string }>;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  currentUser,
  settings,
  onUpdateSettings,
  onResetToDemoScenario,
  onLogout,
  onOpenCloudSync,
  onDeleteAccount,
}) => {
  const [name, setName] = useState(settings.name);
  const [intervalMinutes, setIntervalMinutes] = useState(settings.intervalMinutes);
  const [snoozeMinutes, setSnoozeMinutes] = useState(settings.snoozeMinutes);
  const [soundType, setSoundType] = useState<SoundType>(settings.soundType);
  const [volume, setVolume] = useState(settings.volume);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(settings.quietHoursEnabled);
  const [quietStart, setQuietStart] = useState(settings.quietStart);
  const [quietEnd, setQuietEnd] = useState(settings.quietEnd);

  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Delete Account Confirmation State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletePassword.trim()) {
      setDeleteError('Masukkan password untuk konfirmasi');
      return;
    }
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await onDeleteAccount(deletePassword);
      if (!res.success) {
        setDeleteError(res.message);
        setIsDeleting(false);
      }
    } catch {
      setDeleteError('Terjadi kesalahan saat menghapus akun.');
      setIsDeleting(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(settings.userCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleToggleSoundPreview = (type: SoundType) => {
    if (isPlayingAudio) {
      stopWaterSound();
      setIsPlayingAudio(false);
    } else {
      playWaterSound(type, volume);
      setIsPlayingAudio(true);
      setTimeout(() => {
        stopWaterSound();
        setIsPlayingAudio(false);
      }, 5000);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus(null);

    // Validation according to Section 11 of PDF
    if (!name.trim()) {
      setSaveStatus({ type: 'error', text: 'Nama pengguna tidak boleh kosong' });
      return;
    }

    if (!intervalMinutes || intervalMinutes <= 0) {
      setSaveStatus({ type: 'error', text: 'Interval minum tidak boleh kosong atau 0' });
      return;
    }

    if (intervalMinutes < 15) {
      setSaveStatus({ type: 'error', text: 'Batas minimum interval adalah 15 menit' });
      return;
    }

    if (intervalMinutes > 720) {
      setSaveStatus({ type: 'error', text: 'Batas maksimum interval adalah 12 jam (720 menit)' });
      return;
    }

    if (!snoozeMinutes || snoozeMinutes <= 0) {
      setSaveStatus({ type: 'error', text: 'Durasi tunda tidak boleh kosong atau 0' });
      return;
    }

    if (snoozeMinutes >= intervalMinutes) {
      setSaveStatus({
        type: 'error',
        text: 'Durasi tunda harus lebih kecil dari interval minum utama',
      });
      return;
    }

    const res = onUpdateSettings({
      name: name.trim(),
      intervalMinutes,
      snoozeMinutes,
      soundType,
      volume,
      quietHoursEnabled,
      quietStart,
      quietEnd,
    });

    if (res.success) {
      setSaveStatus({ type: 'success', text: 'Pengaturan berhasil disimpan!' });
      setTimeout(() => setSaveStatus(null), 3000);
    } else {
      setSaveStatus({ type: 'error', text: res.message || 'Gagal menyimpan pengaturan' });
    }
  };

  return (
    <div className="space-y-6 max-w-xl mx-auto pb-20 md:pb-8">
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Settings className="w-5 h-5 text-sky-600" />
          <span>Pengaturan Aiya</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Sesuaikan ritme pengingat, durasi tunda, dan preferensi suara air.
        </p>

        {saveStatus && (
          <div
            className={`mt-4 p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
              saveStatus.type === 'error'
                ? 'bg-rose-50 border border-rose-200 text-rose-800'
                : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{saveStatus.text}</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section: Profile */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <User className="w-4 h-4 text-sky-600" />
            <h2 className="text-sm font-bold text-slate-900">Profil &amp; Identitas Teman</h2>
          </div>

          <div>
            <label htmlFor="settingsName" className="block text-xs font-semibold text-slate-700 mb-1">
              Nama Kamu
            </label>
            <input
              id="settingsName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-sky-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Kode Teman (Bagikan ke temanmu)
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono font-semibold text-slate-800 tracking-wide select-all">
                {settings.userCode}
              </div>
              <button
                type="button"
                onClick={handleCopyCode}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                {copiedCode ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{copiedCode ? 'Disalin' : 'Salin'}</span>
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">
              Username: <strong className="text-slate-700">@{currentUser.username}</strong>
            </span>
            <button
              type="button"
              onClick={onLogout}
              className="text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1.5 py-1 px-2.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar Akun</span>
            </button>
          </div>
        </div>

        {/* Section: Cloud Database & Device Sync */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Cloud className="w-4 h-4 text-sky-600" />
              <h2 className="text-sm font-bold text-slate-900">Database &amp; Sinkronisasi Online</h2>
            </div>
            {isFirebaseReady() ? (
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold">
                ✓ Cloud Aktif
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-semibold">
                Lokal Saja
              </span>
            )}
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            Hubungkan ke Firebase Firestore agar akun, status hidrasi, dan daftar temanmu tersinkronisasi otomatis di HP, laptop, dan perangkat temanmu.
          </p>

          <button
            type="button"
            onClick={onOpenCloudSync}
            className="w-full py-2.5 px-3 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Database className="w-3.5 h-3.5" />
            <span>{isFirebaseReady() ? 'Kelola Database Cloud' : 'Hubungkan ke Firebase Firestore'}</span>
          </button>
        </div>

        {/* Section: Interval & Snooze (Core Spec Section 5.1 & 22.2) */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Clock className="w-4 h-4 text-sky-600" />
            <h2 className="text-sm font-bold text-slate-900">Jadwal &amp; Penundaan</h2>
          </div>

          {/* Interval Minum */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="customInterval" className="text-xs font-semibold text-slate-700">
                Seberapa sering kamu ingin minum? (Interval Utama)
              </label>
              <span className="text-xs font-bold text-sky-600">
                {Math.floor(intervalMinutes / 60)} jam {intervalMinutes % 60 > 0 ? `${intervalMinutes % 60} mnt` : ''}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-2">
              {[
                { label: 'Setiap 1 jam', value: 60 },
                { label: 'Setiap 2 jam', value: 120 },
                { label: 'Setiap 3 jam', value: 180 },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setIntervalMinutes(opt.value)}
                  className={`py-2 px-2 rounded-xl text-xs font-semibold transition-all border ${
                    intervalMinutes === opt.value
                      ? 'bg-sky-50 border-sky-500 text-sky-700 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-slate-500 whitespace-nowrap">Kustom menit:</span>
              <input
                id="customInterval"
                type="number"
                min={15}
                max={720}
                step={5}
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(parseInt(e.target.value) || 0)}
                className="w-24 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-medium focus:outline-hidden focus:border-sky-500"
              />
              <span className="text-xs text-slate-600">menit (15 - 720 mnt)</span>
            </div>
          </div>

          {/* Durasi Tunda */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="customSnooze" className="text-xs font-semibold text-slate-700">
                Kalau belum minum, ingatkan lagi dalam: (Durasi Tunda)
              </label>
              <span className="text-xs font-bold text-amber-600">
                {snoozeMinutes} menit
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2">
              {[
                { label: '5 menit', value: 5 },
                { label: '10 menit (Standar)', value: 10 },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSnoozeMinutes(opt.value)}
                  className={`py-2 px-2 rounded-xl text-xs font-semibold transition-all border ${
                    snoozeMinutes === opt.value
                      ? 'bg-amber-50 border-amber-500 text-amber-800 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-slate-500 whitespace-nowrap">Kustom menit:</span>
              <input
                id="customSnooze"
                type="number"
                min={1}
                max={60}
                value={snoozeMinutes}
                onChange={(e) => setSnoozeMinutes(parseInt(e.target.value) || 0)}
                className="w-24 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-medium focus:outline-hidden focus:border-sky-500"
              />
              <span className="text-xs text-slate-600">menit</span>
            </div>
          </div>
        </div>

        {/* Section: Sound (Section 5.2 & 12) */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Volume2 className="w-4 h-4 text-sky-600" />
            <h2 className="text-sm font-bold text-slate-900">Suara Notifikasi Air</h2>
          </div>

          <div className="space-y-2">
            {[
              { id: 'river' as SoundType, label: 'Aliran Sungai Tenang', desc: 'Suara air mengalir lembut alami (Default Aiya)' },
              { id: 'droplets' as SoundType, label: 'Tetesan Air Lembut', desc: 'Rintik tetesan air bertahap yang menyejukkan' },
              { id: 'rain' as SoundType, label: 'Rintik Hujan Menenangkan', desc: 'Desir hujan rintik santai dan meditatif' },
            ].map((sound) => (
              <div
                key={sound.id}
                className={`p-3 rounded-2xl border flex items-center justify-between transition-all ${
                  soundType === sound.id
                    ? 'border-sky-500 bg-sky-50/50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => setSoundType(sound.id)}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="soundType"
                      checked={soundType === sound.id}
                      onChange={() => setSoundType(sound.id)}
                      className="text-sky-600"
                    />
                    <span className="text-xs font-bold text-slate-900">{sound.label}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 ml-5 mt-0.5">{sound.desc}</p>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleSoundPreview(sound.id)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors ml-2"
                >
                  {isPlayingAudio && soundType === sound.id ? (
                    <>
                      <Square className="w-3.5 h-3.5 text-rose-600" />
                      <span>Stop</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 text-sky-600" />
                      <span>Dengar</span>
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>

          {/* Volume slider */}
          <div className="pt-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
              <label htmlFor="volumeSlider">Volume Suara</label>
              <span>{Math.round(volume * 100)}%</span>
            </div>
            <input
              id="volumeSlider"
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-full accent-sky-600 cursor-pointer"
            />
          </div>
        </div>

        {/* Section: Quiet Hours (Section 21) */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Moon className="w-4 h-4 text-sky-600" />
              <h2 className="text-sm font-bold text-slate-900">Mode Jam Tidur (Hening)</h2>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={quietHoursEnabled}
                onChange={(e) => setQuietHoursEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-600"></div>
            </label>
          </div>

          {quietHoursEnabled && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label htmlFor="quietStartInput" className="block text-xs font-semibold text-slate-700 mb-1">
                  Mulai Jam
                </label>
                <input
                  id="quietStartInput"
                  type="time"
                  value={quietStart}
                  onChange={(e) => setQuietStart(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
                />
              </div>
              <div>
                <label htmlFor="quietEndInput" className="block text-xs font-semibold text-slate-700 mb-1">
                  Selesai Jam
                </label>
                <input
                  id="quietEndInput"
                  type="time"
                  value={quietEnd}
                  onChange={(e) => setQuietEnd(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
                />
              </div>
            </div>
          )}
        </div>

        {/* Save & Reset buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <button
            type="submit"
            className="w-full sm:flex-1 py-3 px-4 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-xs transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>Simpan Pengaturan</span>
          </button>

          <button
            type="button"
            onClick={onResetToDemoScenario}
            className="w-full sm:w-auto py-3 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
            title="Reset ke skenario bawaan dokumen (Interval 3 jam, Snooze 10 mnt, Teman Sari/Budi/Andi)"
          >
            <Sparkles className="w-3.5 h-3.5 text-sky-600" />
            <span>Muat Ulang Skenario Dokumen</span>
          </button>
        </div>
      </form>

      {/* Danger Zone: Delete Account */}
      <div className="bg-rose-50/60 rounded-3xl p-6 border border-rose-200/80 shadow-xs space-y-3">
        <div className="flex items-center gap-2 border-b border-rose-200/60 pb-3">
          <Trash2 className="w-4 h-4 text-rose-600" />
          <h2 className="text-sm font-bold text-rose-900">Zona Berbahaya</h2>
        </div>
        <p className="text-xs text-rose-700 leading-relaxed">
          Menghapus akun akan menghapus profil, riwayat minum, dan seluruh koneksi pertemanan akun <strong>@{currentUser.username}</strong> secara permanen dari perangkat dan database cloud.
        </p>
        <button
          type="button"
          onClick={() => {
            setDeletePassword('');
            setDeleteError(null);
            setIsDeleteModalOpen(true);
          }}
          className="py-2.5 px-4 rounded-xl bg-white hover:bg-rose-50 border border-rose-300 text-rose-700 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Hapus Akun @{currentUser.username}</span>
        </button>
      </div>

      {/* Delete Account Password Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-rose-100 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Konfirmasi Hapus Akun</h3>
                <p className="text-xs text-slate-500">Tindakan ini permanen dan tidak dapat dibatalkan</p>
              </div>
            </div>

            <div className="p-3.5 bg-rose-50 rounded-2xl border border-rose-100 text-xs text-rose-700 leading-relaxed">
              Kamu akan menghapus akun <strong>@{currentUser.username}</strong> beserta seluruh status hidrasi dan permintaan pertemanan dari database cloud dan lokal.
            </div>

            <form onSubmit={handleConfirmDelete} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Masukkan Password Akunmu
                </label>
                <div className="relative">
                  <input
                    type={showDeletePassword ? 'text' : 'password'}
                    required
                    autoFocus
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Ketik password untuk konfirmasi"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-rose-500 focus:bg-white pr-10 text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => setShowDeletePassword(!showDeletePassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showDeletePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {deleteError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{deleteError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isDeleting || !deletePassword}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isDeleting ? 'Menghapus...' : 'Ya, Hapus Akun Permanen'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
