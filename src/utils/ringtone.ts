// Custom reminder sound ("Nada Kustom").
// The file is stored in Firestore as base64 pieces (Firebase Storage needs a paid plan),
// so it syncs to every device. Each device keeps a copy in the Cache API and in memory.
import { RingtoneMeta, UserSettings } from '../types';
import { getAudioContext, playReminderSound } from './audio';
import { firestoreDeleteRingtone, firestoreLoadRingtoneChunks, firestoreSaveRingtoneChunks } from './firebase';

export const MAX_RINGTONE_BYTES = 2 * 1024 * 1024; // 2 MB
const CHUNK_CHARS = 700_000; // keeps each Firestore doc well under its 1 MiB limit
const CACHE_NAME = 'aiya-ringtone-v1';

const decoded = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer>>();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const cacheKey = (id: string) => `/__aiya_ringtone__/${id}`;

async function readCache(id: string): Promise<ArrayBuffer | null> {
  try {
    if (!('caches' in window)) return null;
    const res = await (await caches.open(CACHE_NAME)).match(cacheKey(id));
    return res ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

async function writeCache(id: string, bytes: ArrayBuffer, mimeType: string): Promise<void> {
  try {
    if (!('caches' in window)) return;
    await (await caches.open(CACHE_NAME)).put(cacheKey(id), new Response(bytes, { headers: { 'Content-Type': mimeType } }));
  } catch {
    // ignore (private mode, quota)
  }
}

async function decode(bytes: ArrayBuffer): Promise<AudioBuffer> {
  // decodeAudioData detaches the buffer it gets, so give it a copy
  return getAudioContext().decodeAudioData(bytes.slice(0));
}

export async function uploadRingtone(
  file: File,
  userId: string
): Promise<{ ok: true; meta: RingtoneMeta } | { ok: false; message: string }> {
  const looksLikeAudio = file.type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|oga|opus|webm|flac)$/i.test(file.name);
  if (!looksLikeAudio) return { ok: false, message: 'Pilih file audio (mp3, m4a, wav, ogg, ...).' };
  if (file.size > MAX_RINGTONE_BYTES) return { ok: false, message: 'Ukuran file maksimal 2 MB.' };

  const bytes = await file.arrayBuffer();
  let buffer: AudioBuffer;
  try {
    buffer = await decode(bytes);
  } catch {
    return { ok: false, message: 'File audio ini tidak bisa diputar oleh browser.' };
  }

  const base64 = bytesToBase64(new Uint8Array(bytes));
  const chunks: string[] = [];
  for (let i = 0; i < base64.length; i += CHUNK_CHARS) chunks.push(base64.slice(i, i + CHUNK_CHARS));

  const id = `rt-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const saved = await firestoreSaveRingtoneChunks(userId, id, chunks);
  if (!saved) return { ok: false, message: 'Gagal mengunggah ke database. Periksa koneksi lalu coba lagi.' };

  const mimeType = file.type || 'audio/mpeg';
  await writeCache(id, bytes, mimeType);
  decoded.set(id, buffer);

  return {
    ok: true,
    meta: {
      id,
      name: file.name.slice(0, 80),
      mimeType,
      size: file.size,
      chunks: chunks.length,
      durationSec: Math.round(buffer.duration * 10) / 10,
      updatedAt: new Date().toISOString(),
    },
  };
}

// Memory -> device cache -> cloud (then cached for next time)
export function getRingtoneBuffer(meta: RingtoneMeta): Promise<AudioBuffer> {
  const ready = decoded.get(meta.id);
  if (ready) return Promise.resolve(ready);
  const inFlight = loading.get(meta.id);
  if (inFlight) return inFlight;

  const p = (async () => {
    let bytes = await readCache(meta.id);
    if (!bytes) {
      const chunks = await firestoreLoadRingtoneChunks(meta.id);
      if (!chunks || chunks.length === 0) throw new Error('Ringtone not found');
      bytes = base64ToBytes(chunks.join('')).buffer;
      await writeCache(meta.id, bytes, meta.mimeType);
    }
    const buffer = await decode(bytes);
    decoded.set(meta.id, buffer);
    return buffer;
  })().finally(() => loading.delete(meta.id));

  loading.set(meta.id, p);
  return p;
}

export async function deleteRingtone(meta: RingtoneMeta): Promise<void> {
  decoded.delete(meta.id);
  try {
    if ('caches' in window) await (await caches.open(CACHE_NAME)).delete(cacheKey(meta.id));
  } catch {
    // ignore
  }
  await firestoreDeleteRingtone(meta.id);
}

// Rings the reminder with the user's chosen sound; falls back to the river sound
// if the custom file can't be loaded (e.g. offline on a device that never cached it).
export async function playConfiguredReminder(settings: UserSettings): Promise<void> {
  if (settings.soundType === 'custom' && settings.ringtone) {
    try {
      const buffer = await getRingtoneBuffer(settings.ringtone);
      playReminderSound('custom', settings.volume, undefined, buffer);
      return;
    } catch (err) {
      console.warn('Custom ringtone unavailable, using default sound:', err);
    }
  }
  playReminderSound(settings.soundType === 'custom' ? 'river' : settings.soundType, settings.volume);
}

export function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
