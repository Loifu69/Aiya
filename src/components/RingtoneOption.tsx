import React, { useRef, useState } from 'react';
import { Music, Play, Square, Trash2, Upload } from 'lucide-react';
import { UserSettings } from '../types';
import { playAudioBuffer, stopWaterSound } from '../utils/audio';
import {
  deleteRingtone,
  formatBytes,
  getRingtoneBuffer,
  MAX_RINGTONE_BYTES,
  RINGTONE_MAX_SECONDS,
  uploadRingtone,
} from '../utils/ringtone';

interface RingtoneOptionProps {
  userId: string;
  settings: UserSettings;
  selected: boolean;
  volume: number;
  onSelect: () => void;
  onUpdateSettings: (partial: Partial<UserSettings>) => Promise<{ success: boolean; message?: string }>;
  notify: (type: 'success' | 'error', text: string) => void;
}

// "Nada Kustom": upload your own reminder sound. Saved to the cloud right away
// (no need to press "Simpan") and synced to every device.
export const RingtoneOption: React.FC<RingtoneOptionProps> = ({
  userId,
  settings,
  selected,
  volume,
  onSelect,
  onUpdateSettings,
  notify,
}) => {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'upload' | 'delete' | 'load' | null>(null);
  const [playing, setPlaying] = useState(false);
  const stopTimer = useRef<number | null>(null);
  const ringtone = settings.ringtone || null;

  const stopPreview = () => {
    if (stopTimer.current) window.clearTimeout(stopTimer.current);
    stopWaterSound();
    setPlaying(false);
  };

  const handlePreview = async () => {
    if (!ringtone) return;
    if (playing) return stopPreview();
    setBusy('load');
    try {
      const buffer = await getRingtoneBuffer(ringtone);
      playAudioBuffer(buffer, volume);
      setPlaying(true);
      stopTimer.current = window.setTimeout(() => setPlaying(false), Math.min(buffer.duration, 30) * 1000 + 200);
    } catch {
      notify('error', 'Nada kustom gagal dimuat. Periksa koneksi lalu coba lagi.');
    } finally {
      setBusy(null);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    stopPreview();
    setBusy('upload');
    try {
      const res = await uploadRingtone(file, userId);
      if (!res.ok) {
        notify('error', res.message);
        return;
      }
      const old = ringtone;
      const saved = await onUpdateSettings({ ringtone: res.meta, soundType: 'custom' });
      if (!saved.success) {
        await deleteRingtone(res.meta);
        notify('error', saved.message || 'Gagal menyimpan nada kustom.');
        return;
      }
      if (old) deleteRingtone(old).catch(() => {});
      notify('success', 'Nada kustom tersimpan dan dipakai di semua perangkat.');
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!ringtone) return;
    stopPreview();
    setBusy('delete');
    try {
      const saved = await onUpdateSettings({
        ringtone: null,
        soundType: settings.soundType === 'custom' ? 'river' : settings.soundType,
      });
      if (!saved.success) {
        notify('error', saved.message || 'Gagal menghapus nada kustom.');
        return;
      }
      await deleteRingtone(ringtone);
      notify('success', 'Nada kustom dihapus. Kembali ke suara Aliran Sungai.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className={`p-3 rounded-2xl border transition-all ${
        selected ? 'border-sky-500 bg-sky-50/50' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div
          className={`flex-1 min-w-0 ${ringtone ? 'cursor-pointer' : ''}`}
          onClick={() => ringtone && onSelect()}
        >
          <div className="flex items-center gap-2">
            <input
              type="radio"
              name="soundType"
              checked={selected}
              disabled={!ringtone}
              onChange={() => ringtone && onSelect()}
              className="text-sky-600"
            />
            <Music className="w-3.5 h-3.5 text-sky-600 shrink-0" />
            <span className="text-xs font-bold text-slate-900">Nada Kustom</span>
          </div>
          <p className="text-[11px] text-slate-500 ml-5 mt-0.5 truncate">
            {ringtone
              ? `${ringtone.name} · ${formatBytes(ringtone.size)} · ${ringtone.durationSec} dtk`
              : `Unggah file audio sendiri (maks ${formatBytes(MAX_RINGTONE_BYTES)}, diputar ${RINGTONE_MAX_SECONDS} detik pertama)`}
          </p>
        </div>

        {ringtone && (
          <button
            type="button"
            onClick={handlePreview}
            disabled={busy !== null}
            className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-50"
          >
            {playing ? (
              <>
                <Square className="w-3.5 h-3.5 text-rose-600" />
                <span>Stop</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 text-sky-600" />
                <span>{busy === 'load' ? 'Memuat...' : 'Dengar'}</span>
              </>
            )}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 mt-2.5 ml-5">
        <input
          ref={fileInput}
          type="file"
          accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac"
          onChange={handleFile}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy !== null}
          className="px-2.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>{busy === 'upload' ? 'Memproses & mengunggah...' : ringtone ? 'Ganti File' : 'Pilih File Audio'}</span>
        </button>
        {ringtone && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy !== null}
            className="px-2.5 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{busy === 'delete' ? 'Menghapus...' : 'Hapus'}</span>
          </button>
        )}
      </div>
    </div>
  );
};
