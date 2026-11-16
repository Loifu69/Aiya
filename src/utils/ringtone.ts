// Custom reminder sound ("Nada Kustom").
// On upload, only the first 30 s are kept (that's all a reminder plays) and re-encoded
// as a compact WAV (mono, 22.05 kHz, 16-bit => at most ~1.3 MB), so big song
// files are fine. The result is stored in Firestore as base64 pieces (Firebase Storage
// needs a paid plan) and syncs to every device; each device caches it locally.
import { RingtoneMeta, UserSettings } from '../types';
import { getAudioContext, playReminderSound } from './audio';
import { firestoreDeleteRingtone, firestoreLoadRingtoneChunks, firestoreSaveRingtoneChunks } from './firebase';

export const MAX_RINGTONE_BYTES = 15 * 1024 * 1024; // input file limit (15 MB)
export const RINGTONE_MAX_SECONDS = 30;
const TARGET_SAMPLE_RATE = 22050;
const FADE_OUT_SECONDS = 0.4;
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

// First 30 s, mixed down to mono, resampled to 22.05 kHz, short fade-out if cut.
// Mono keeps the upload small (it's a reminder sound, not music playback).
async function trimAndResample(source: AudioBuffer): Promise<AudioBuffer> {
  const channels = 1;
  const duration = Math.min(source.duration, RINGTONE_MAX_SECONDS);
  const length = Math.max(1, Math.ceil(duration * TARGET_SAMPLE_RATE));
  const offline = new OfflineAudioContext(channels, length, TARGET_SAMPLE_RATE);
  const node = offline.createBufferSource();
  node.buffer = source;
  const gain = offline.createGain();
  if (source.duration > RINGTONE_MAX_SECONDS) {
    // avoid a click where the song is cut off
    gain.gain.setValueAtTime(1, duration - FADE_OUT_SECONDS);
    gain.gain.linearRampToValueAtTime(0, duration);
  }
  node.connect(gain);
  gain.connect(offline.destination);
  node.start();
  return offline.startRendering();
}

// 16-bit PCM WAV
function encodeWav(buffer: AudioBuffer): ArrayBuffer {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const dataBytes = frames * channels * 2;
  const out = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(out);
  const str = (o: number, t: string) => {
    for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, buffer.sampleRate, true);
  v.setUint32(28, buffer.sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, dataBytes, true);
  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const x = Math.max(-1, Math.min(1, data[c][i]));
      v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true);
      o += 2;
    }
  }
  return out;
}

export async function uploadRingtone(
  file: File,
  userId: string
): Promise<{ ok: true; meta: RingtoneMeta } | { ok: false; message: string }> {
  const looksLikeAudio = file.type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|oga|opus|webm|flac)$/i.test(file.name);
  if (!looksLikeAudio) return { ok: false, message: 'Pilih file audio (mp3, m4a, wav, ogg, ...).' };
  if (file.size > MAX_RINGTONE_BYTES) return { ok: false, message: 'Ukuran file maksimal 15 MB.' };

  let buffer: AudioBuffer;
  let bytes: ArrayBuffer;
  try {
    const original = await decode(await file.arrayBuffer());
    buffer = await trimAndResample(original);
    bytes = encodeWav(buffer);
  } catch {
    return { ok: false, message: 'File audio ini tidak bisa diputar oleh browser.' };
  }

  const base64 = bytesToBase64(new Uint8Array(bytes));
  const chunks: string[] = [];
  for (let i = 0; i < base64.length; i += CHUNK_CHARS) chunks.push(base64.slice(i, i + CHUNK_CHARS));

  const id = `rt-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const saved = await firestoreSaveRingtoneChunks(userId, id, chunks);
  if (!saved) return { ok: false, message: 'Gagal mengunggah ke database. Periksa koneksi lalu coba lagi.' };

  const mimeType = 'audio/wav';
  await writeCache(id, bytes, mimeType);
  decoded.set(id, buffer);

  return {
    ok: true,
    meta: {
      id,
      name: file.name.slice(0, 80),
      mimeType,
      size: bytes.byteLength, // stored size after trimming/compressing
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
