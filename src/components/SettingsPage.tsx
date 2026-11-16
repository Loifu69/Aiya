import React, { useEffect, useRef, useState } from 'react';
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
  AlertCircle,
  Save,
  LogOut,
  Trash2,
  Eye,
  EyeOff,
  AlertTriangle,
  GlassWater,
} from 'lucide-react';
import { SoundType, UserAccount, UserSettings } from '../types';
import { playWaterSound, stopWaterSound } from '../utils/audio';
import { BackgroundReminderCard } from './BackgroundReminderCard';
import { ThemeCard } from './ThemeCard';
import { RingtoneOption } from './RingtoneOption';

interface SettingsPageProps {
  currentUser: UserAccount;
  settings: UserSettings;
  onUpdateSettings: (newSettings: Partial<UserSettings>) => Promise<{ success: boolean; message?: string }>;
  onLogout: () => void;
  onDeleteAccount: (password: string) => Promise<{ success: boolean; message: string }>;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  currentUser,
  settings,
  onUpdateSettings,
  onLogout,
  onDeleteAccount,
}) => {
  const [name, setName] = useState(settings.name);
  const [intervalMinutes, setIntervalMinutes] = useState(settings.intervalMinutes);
  const [snoozeMinutes, setSnoozeMinutes] = useState(settings.snoozeMinutes);
  const [dailyTargetMl, setDailyTargetMl] = useState(settings.dailyTargetMl);
  const [glassMl, setGlassMl] = useState(settings.glassMl);
  const [soundType, setSoundType] = useState<SoundType>(settings.soundType);
  const [volume, setVolume] = useState(settings.volume);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(settings.quietHoursEnabled);
  const [quietStart, setQuietStart] = useState(settings.quietStart);
  const [quietEnd, setQuietEnd] = useState(settings.quietEnd);

  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  // Floating toast (fixed top-center, fades out)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimers = useRef<number[]>([]);

  // Save confirmation dialog
  const [isSaveConfirmOpen, setIsSaveConfirmOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const showToast = (type: 'success' | 'error', text: string) => {
    toastTimers.current.forEach((t) => window.clearTimeout(t));
    setToast({ type, text });
    setToastVisible(false);
    // next frame -> fade in
    toastTimers.current = [
      window.setTimeout(() => setToastVisible(true), 20),
      window.setTimeout(() => setToastVisible(false), 3000), // start fade out
      window.setTimeout(() => setToast(null), 3500), // remove after fade
    ];
  };

  useEffect(() => () => toastTimers.current.forEach((t) => window.clearTimeout(t)), []);

  // Keep the form in sync when settings change (e.g. loaded from cloud)
  useEffect(() => {
    setName(settings.name);
    setIntervalMinutes(settings.intervalMinutes);
    setSnoozeMinutes(settings.snoozeMinutes);
    setDailyTargetMl(settings.dailyTargetMl);
    setGlassMl(settings.glassMl);
    setSoundType(settings.soundType);
    setVolume(settings.volume);
    setQuietHoursEnabled(settings.quietHoursEnabled);
    setQuietStart(settings.quietStart);
    setQuietEnd(settings.quietEnd);
  }, [settings]);

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
    navigator.clipboard.writeText(currentUser.username);
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

  const validate = (): string | null => {
    if (!name.trim()) return 'Nama pengguna tidak boleh kosong';
    if (soundType === 'custom' && !settings.ringtone) return 'Unggah file nada kustom dulu, atau pilih suara lain';
    if (!dailyTargetMl || dailyTargetMl < 500) return 'Target harian minimal 500 ml';
    if (dailyTargetMl > 6000) return 'Target harian maksimal 6000 ml';
    if (!glassMl || glassMl < 50) return 'Jumlah sekali minum minimal 50 ml';
    if (glassMl > 1000) return 'Jumlah sekali minum maksimal 1000 ml';
    if (glassMl > dailyTargetMl) return 'Jumlah sekali minum tidak boleh melebihi target harian';
    if (!intervalMinutes || intervalMinutes <= 0) return 'Interval minum tidak boleh kosong atau 0';
    if (intervalMinutes < 15) return 'Batas minimum interval adalah 15 menit';
    if (intervalMinutes > 720) return 'Batas maksimum interval adalah 12 jam (720 menit)';
    if (!snoozeMinutes || snoozeMinutes <= 0) return 'Durasi tunda tidak boleh kosong atau 0';
    if (snoozeMinutes >= intervalMinutes) return 'Durasi tunda harus lebih kecil dari interval minum utama';
    return null;
  };

  // Step 1: validate, then ask for confirmation
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const error = validate();
    if (error) {
      showToast('error', error);
      return;
    }
    setIsSaveConfirmOpen(true);
  };

  // Step 2: user confirmed -> save locally + cloud
  const handleConfirmSave = async () => {
    setIsSaving(true);
    try {
      const res = await onUpdateSettings({
        name: name.trim(),
        intervalMinutes,
        snoozeMinutes,
        dailyTargetMl,
        glassMl,
        soundType,
        volume,
        quietHoursEnabled,
        quietStart,
        quietEnd,
      });
      setIsSaveConfirmOpen(false);
      if (res.success) {
        showToast('success', 'Perubahan telah disimpan');
      } else {
        showToast('error', res.message || 'Gagal menyimpan pengaturan');
      }
    } catch {
      setIsSaveConfirmOpen(false);
      showToast('error', 'Terjadi kesalahan saat menyimpan pengaturan');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl mx-auto pb-20 md:pb-8">
      {/* Floating toast: fixed at top-center, stays visible while scrolling, then fades out */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] max-w-[calc(100vw-2rem)] px-4 py-2.5 rounded-2xl shadow-lg text-xs sm:text-sm font-semibold flex items-center gap-2 pointer-events-none transition-all duration-500 ${
            toastVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
          } ${
            toast.type === 'error'
              ? 'bg-rose-600 text-white shadow-rose-600/30'
              : 'bg-emerald-600 text-white shadow-emerald-600/30'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="w-4 h-4 shrink-0" />
          ) : (
            <Check className="w-4 h-4 shrink-0" />
          )}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Save confirmation dialog */}
      {isSaveConfirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
        >
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-sky-100 space-y-4 text-center">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-sky-100 flex items-center justify-center text-sky-600">
              <Save className="w-6 h-6" />
            </div>
            <div>
              <h3 id="save-confirm-title" className="text-base font-bold text-slate-900">
                Apakah kamu yakin?
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Pengaturan baru akan disimpan dan langsung dipakai untuk pengingat minummu.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsSaveConfirmOpen(false)}
                disabled={isSaving}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                disabled={isSaving}
                className="flex-1 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSaving ? 'Menyimpan...' : 'Ya, Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Settings className="w-5 h-5 text-sky-600" />
          <span>Pengaturan Aiya</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Sesuaikan target minum, ritme pengingat, durasi tunda, dan preferensi suara air.
        </p>

      </div>

      {/* Light / dark mode (applies immediately, per device) */}
      <ThemeCard />

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
              Username (Bagikan ke temanmu)
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono font-semibold text-slate-800 tracking-wide select-all">
                @{currentUser.username}
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

          <div className="pt-2 border-t border-slate-100 flex items-center justify-end text-xs">
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

        {/* Section: Daily water target */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <GlassWater className="w-4 h-4 text-sky-600" />
            <h2 className="text-sm font-bold text-slate-900">Target Minum Harian</h2>
          </div>

          {/* Daily target */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="customDailyTarget" className="text-xs font-semibold text-slate-700">
                Target minum per hari
              </label>
              <span className="text-xs font-bold text-sky-600">{dailyTargetMl} ml</span>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-2">
              {[1500, 2000, 2500].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setDailyTargetMl(val)}
                  className={`py-2 px-2 rounded-xl text-xs font-semibold transition-all border ${
                    dailyTargetMl === val
                      ? 'bg-sky-50 border-sky-500 text-sky-700 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {val} ml
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-slate-500 whitespace-nowrap">Kustom:</span>
              <input
                id="customDailyTarget"
                type="number"
                min={500}
                max={6000}
                step={50}
                value={dailyTargetMl}
                onChange={(e) => setDailyTargetMl(parseInt(e.target.value) || 0)}
                className="w-24 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-medium focus:outline-hidden focus:border-sky-500"
              />
              <span className="text-xs text-slate-600">ml (500 - 6000 ml)</span>
            </div>
          </div>

          {/* Amount per drink */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="customGlass" className="text-xs font-semibold text-slate-700">
                Sekali minum (tombol &quot;Sudah Minum&quot;)
              </label>
              <span className="text-xs font-bold text-sky-600">{glassMl} ml</span>
            </div>

            <div className="grid grid-cols-4 gap-2 mb-2">
              {[150, 200, 250, 300].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setGlassMl(val)}
                  className={`py-2 px-2 rounded-xl text-xs font-semibold transition-all border ${
                    glassMl === val
                      ? 'bg-sky-50 border-sky-500 text-sky-700 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {val} ml
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-slate-500 whitespace-nowrap">Kustom:</span>
              <input
                id="customGlass"
                type="number"
                min={50}
                max={1000}
                step={10}
                value={glassMl}
                onChange={(e) => setGlassMl(parseInt(e.target.value) || 0)}
                className="w-24 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-medium focus:outline-hidden focus:border-sky-500"
              />
              <span className="text-xs text-slate-600">ml (50 - 1000 ml)</span>
            </div>

            {dailyTargetMl > 0 && glassMl > 0 && (
              <p className="text-[11px] text-slate-500 mt-2">
                Setiap kali minum menambah {Math.round((glassMl / dailyTargetMl) * 1000) / 10}% dari target. Butuh sekitar {Math.ceil(dailyTargetMl / glassMl)} kali minum per hari.
              </p>
            )}
          </div>
        </div>

        {/* Section: Interval & Snooze */}
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

        {/* Section: Background reminders (Web Push) */}
        <BackgroundReminderCard userId={currentUser.id} />

        {/* Section: Sound */}
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

            <RingtoneOption
              userId={currentUser.id}
              settings={settings}
              selected={soundType === 'custom'}
              volume={volume}
              onSelect={() => setSoundType('custom')}
              onUpdateSettings={onUpdateSettings}
              notify={showToast}
            />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
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
