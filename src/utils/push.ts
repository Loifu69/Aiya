// Web Push: lets the server (api/send-reminders.ts) show drink reminders
// even when Aiya is closed. Needs the service worker, so it only works in the
// production build (Vercel, or `npm run build && npm run preview`).
import { firestoreDeletePushSubscription, firestoreSavePushSubscription } from './firebase';
import { sha256Hex } from './password';

// Public half of the VAPID key pair. The private half lives only in Vercel env (VAPID_PRIVATE_KEY).
export const VAPID_PUBLIC_KEY =
  'BOmz2fPpHYDrywxaOCTNl14V5Lpba5UJZuwE32B4otZJafMh5zSzphiWoq9xpiTrqkZ3VdSJP_sarTf92qz6uIk';

export type PushState = 'unsupported' | 'dev-mode' | 'denied' | 'off' | 'on';

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration()) || null;
  } catch {
    return null;
  }
}

function subscriptionId(endpoint: string): string {
  return sha256Hex(endpoint);
}

async function saveSubscription(userId: string, sub: PushSubscription): Promise<boolean> {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;
  return firestoreSavePushSubscription(subscriptionId(json.endpoint), {
    userId,
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta',
    userAgent: navigator.userAgent.slice(0, 200),
    updatedAt: new Date().toISOString(),
  });
}

export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported';
  if (import.meta.env.DEV) return 'dev-mode';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

// Ask permission (must be called from a click) and register this device for background reminders.
export async function enablePush(userId: string): Promise<{ success: boolean; message: string }> {
  if (!isPushSupported()) {
    return { success: false, message: 'Browser ini tidak mendukung notifikasi latar belakang.' };
  }
  if (import.meta.env.DEV) {
    return { success: false, message: 'Hanya aktif di versi yang di-deploy (bukan npm run dev).' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { success: false, message: 'Izin notifikasi ditolak. Aktifkan lewat pengaturan situs di browser.' };
  }

  try {
    const reg = (await getRegistration()) || (await navigator.serviceWorker.register('/sw.js'));
    await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }));
    const ok = await saveSubscription(userId, sub);
    return ok
      ? { success: true, message: 'Pengingat latar belakang aktif di perangkat ini.' }
      : { success: false, message: 'Gagal menyimpan ke database. Periksa koneksi lalu coba lagi.' };
  } catch (err) {
    console.error('Push subscribe error:', err);
    return { success: false, message: 'Gagal mengaktifkan notifikasi di browser ini.' };
  }
}

// Stop background reminders on this device (e.g. on logout or when the user turns it off).
export async function disablePush(): Promise<void> {
  const reg = await getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return;
  await firestoreDeletePushSubscription(subscriptionId(sub.endpoint));
  try {
    await sub.unsubscribe();
  } catch {
    // ignore
  }
}

// On app start: if this device already allowed notifications, make sure its
// subscription is saved for the signed-in user (also refreshes the time zone).
export async function syncPush(userId: string): Promise<void> {
  if (!isPushSupported() || import.meta.env.DEV || Notification.permission !== 'granted') return;
  const reg = await getRegistration();
  if (!reg) return;
  try {
    const sub =
      (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }));
    await saveSubscription(userId, sub);
  } catch (err) {
    console.warn('Push sync notice:', err);
  }
}
