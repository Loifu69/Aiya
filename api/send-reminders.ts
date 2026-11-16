// Background drink reminders (Vercel serverless function).
//
// Called every minute by an external cron (cron-job.org) with
//   Authorization: Bearer <CRON_SECRET>
// It finds users whose reminder time (statuses.nextAlarmAt) has passed, sends a
// Web Push notification to each of their devices, and moves nextAlarmAt forward
// by their snooze duration, so reminders repeat until they press "Sudah Minum".
//
// Required environment variables (Vercel > Settings > Environment Variables):
//   FIREBASE_SERVICE_ACCOUNT  service account JSON (one line)
//   VAPID_PUBLIC_KEY          must match VAPID_PUBLIC_KEY in src/utils/push.ts
//   VAPID_PRIVATE_KEY
//   CRON_SECRET               random string, also set in the cron job header
//   VAPID_SUBJECT (optional)  e.g. https://your-app.vercel.app

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { sendNotification, setVapidDetails } from 'web-push';
import { createHmac } from 'node:crypto';

// ----------------- Core logic (no Firebase/Vercel dependency, easy to test) -----------------

export interface DueStatus {
  userId: string;
  dueAt: string;
  nextAlarmAt: string;
  // Moves nextAlarmAt forward; returns false if the doc changed meanwhile (e.g. user just drank)
  reschedule: (nextAlarmAtIso: string) => Promise<boolean>;
}

export interface ReminderSettings {
  snoozeMinutes?: number;
  quietHoursEnabled?: boolean;
  quietStart?: string;
  quietEnd?: string;
}

export interface DeviceSubscription {
  id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  timeZone?: string;
}

export interface ReminderStore {
  getDueStatuses(nowIso: string): Promise<DueStatus[]>;
  getSettings(userId: string): Promise<ReminderSettings | null>;
  getSubscriptions(userId: string): Promise<DeviceSubscription[]>;
  deleteSubscription(id: string): Promise<void>;
}

// Signed ticket so the notification's "Sudah Minum" button can record a drink
// via /api/drink without opening the app. Verified with the same secret in api/drink.ts.
export interface DrinkTicket {
  userId: string;
  exp: number; // ms epoch
  sig: string;
}

export interface PushPayload {
  title: string;
  body: string;
  tag: string;
  url: string;
  drink?: DrinkTicket;
}

export type MakeTicket = (userId: string) => DrinkTicket;

const TICKET_TTL_MS = 24 * 60 * 60 * 1000;

export function signTicket(secret: string, userId: string, exp: number): string {
  return createHmac('sha256', secret).update(`${userId}.${exp}`).digest('base64url');
}

export function ticketMaker(secret: string, nowMs: number): MakeTicket {
  return (userId) => {
    const exp = nowMs + TICKET_TTL_MS;
    return { userId, exp, sig: signTicket(secret, userId, exp) };
  };
}

// Throws an error with statusCode 404/410 when the device is gone
export type SendPush = (sub: DeviceSubscription, payload: PushPayload) => Promise<void>;

export interface RunSummary {
  due: number;
  sent: number;
  quiet: number;
  noDevice: number;
  removedDevices: number;
  skippedChanged: number;
  failed: number;
}

const DEFAULT_TIME_ZONE = 'Asia/Jakarta';
const DEFAULT_SNOOZE_MINUTES = 10;

// "HH:mm" in the user's own time zone
export function localTimeHM(nowMs: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(nowMs));
  } catch {
    return localTimeHM(nowMs, DEFAULT_TIME_ZONE);
  }
}

// Same rule as the app: a range like 22:00-07:00 wraps past midnight
export function isInQuietHours(settings: ReminderSettings | null, nowMs: number, timeZone: string): boolean {
  if (!settings?.quietHoursEnabled || !settings.quietStart || !settings.quietEnd) return false;
  const hm = localTimeHM(nowMs, timeZone);
  const { quietStart, quietEnd } = settings;
  if (quietStart > quietEnd) return hm >= quietStart || hm <= quietEnd;
  return hm >= quietStart && hm <= quietEnd;
}

export function buildReminderPayload(dueAtIso: string, nowMs: number): PushPayload {
  const lateMinutes = Math.floor((nowMs - new Date(dueAtIso).getTime()) / 60000);
  let body: string;
  if (!Number.isFinite(lateMinutes) || lateMinutes < 1) {
    body = 'Waktunya minum air sekarang. Tekan "Sudah Minum" setelah minum ya.';
  } else if (lateMinutes >= 24 * 60) {
    body = 'Kamu sudah lebih dari sehari tidak mencatat minum. Yuk minum air dulu!';
  } else {
    const h = Math.floor(lateMinutes / 60);
    const m = lateMinutes % 60;
    const late = h > 0 ? `${h} jam ${m} menit` : `${m} menit`;
    body = `Kamu terlambat minum ${late}. Yuk minum dulu, lalu tekan "Sudah Minum".`;
  }
  return { title: 'Aiya: Waktunya Minum!', body, tag: 'aiya-drink', url: '/#home' };
}

export async function processDueReminders(
  store: ReminderStore,
  send: SendPush,
  nowMs: number,
  makeTicket?: MakeTicket
): Promise<RunSummary> {
  const summary: RunSummary = { due: 0, sent: 0, quiet: 0, noDevice: 0, removedDevices: 0, skippedChanged: 0, failed: 0 };
  const due = await store.getDueStatuses(new Date(nowMs).toISOString());
  summary.due = due.length;

  await Promise.all(
    due.map(async (status) => {
      const [settings, subs] = await Promise.all([
        store.getSettings(status.userId),
        store.getSubscriptions(status.userId),
      ]);
      const snooze = settings?.snoozeMinutes && settings.snoozeMinutes > 0 ? settings.snoozeMinutes : DEFAULT_SNOOZE_MINUTES;

      // Claim this reminder first so overlapping runs (or the open app) don't double-send
      const claimed = await status.reschedule(new Date(nowMs + snooze * 60000).toISOString());
      if (!claimed) {
        summary.skippedChanged++;
        return;
      }

      if (subs.length === 0) {
        summary.noDevice++;
        return;
      }

      const timeZone = subs.find((s) => s.timeZone)?.timeZone || DEFAULT_TIME_ZONE;
      if (isInQuietHours(settings, nowMs, timeZone)) {
        summary.quiet++;
        return;
      }

      const payload: PushPayload = { ...buildReminderPayload(status.dueAt, nowMs), drink: makeTicket?.(status.userId) };
      let anySent = false;
      await Promise.all(
        subs.map(async (sub) => {
          try {
            await send(sub, payload);
            anySent = true;
          } catch (err) {
            const code = (err as { statusCode?: number }).statusCode;
            if (code === 404 || code === 410) {
              await store.deleteSubscription(sub.id);
              summary.removedDevices++;
            } else {
              summary.failed++;
              console.error(`Push failed for ${status.userId}:`, err);
            }
          }
        })
      );
      if (anySent) summary.sent++;
    })
  );

  return summary;
}

// ----------------- Firestore + web-push wiring -----------------

function firestoreStore(): ReminderStore {
  if (getApps().length === 0) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
    initializeApp({ credential: cert(JSON.parse(raw)) });
  }
  const db = getFirestore();

  return {
    async getDueStatuses(nowIso) {
      const snap = await db.collection('statuses').where('nextAlarmAt', '<=', nowIso).get();
      return snap.docs.map((d) => {
        const data = d.data();
        const updateTime: Timestamp = d.updateTime;
        return {
          userId: d.id,
          dueAt: String(data.dueAt || ''),
          nextAlarmAt: String(data.nextAlarmAt || ''),
          reschedule: async (nextAlarmAt: string) => {
            try {
              await d.ref.update({ nextAlarmAt }, { lastUpdateTime: updateTime });
              return true;
            } catch {
              return false;
            }
          },
        };
      });
    },
    async getSettings(userId) {
      const snap = await db.collection('settings').doc(userId).get();
      return snap.exists ? (snap.data() as ReminderSettings) : null;
    },
    async getSubscriptions(userId) {
      const snap = await db.collection('pushSubscriptions').where('userId', '==', userId).get();
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DeviceSubscription, 'id'>) }));
    },
    async deleteSubscription(id) {
      await db.collection('pushSubscriptions').doc(id).delete();
    },
  };
}

function webPushSender(): SendPush {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set');
  setVapidDetails(process.env.VAPID_SUBJECT || 'https://aiya.vercel.app', publicKey, privateKey);

  return async (sub, payload) => {
    await sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify(payload),
      { TTL: 10 * 60, urgency: 'high', topic: 'aiya-drink' }
    );
  };
}

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const now = Date.now();
    const summary = await processDueReminders(firestoreStore(), webPushSender(), now, ticketMaker(secret, now));
    return Response.json({ ok: true, ...summary });
  } catch (err) {
    console.error('send-reminders error:', err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
