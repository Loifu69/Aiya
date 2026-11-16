// Records a drink from the notification's "Sudah Minum" button (Vercel serverless function).
//
// The service worker POSTs the signed ticket it received in the push payload:
//   POST /api/drink  { userId, exp, sig }
// The ticket is an HMAC (CRON_SECRET) made by api/send-reminders.ts, so only the
// user's own devices can record a drink for them, and only for 24 hours.
//
// It does the same as pressing "Sudah Minum Sekarang" in the app: logs the drink
// (amount = the user's glass size) and schedules the next drink after the interval.
// Open apps pick the change up through their live Firestore listeners.
//
// Uses the same env vars as send-reminders: FIREBASE_SERVICE_ACCOUNT, CRON_SECRET.
// (Kept self-contained instead of sharing a module with send-reminders, so each
// Vercel function bundles on its own.)

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createHmac, timingSafeEqual } from 'node:crypto';

// ----------------- Core logic (testable without Firebase) -----------------

export interface DrinkTicket {
  userId: string;
  exp: number;
  sig: string;
}

export interface DrinkStoreUser {
  intervalMinutes: number;
  glassMl: number;
  dueAt: string | null;
  lastDrinkAt: string | null;
}

export interface DrinkStore {
  getUser(userId: string): Promise<DrinkStoreUser | null>;
  saveDrink(userId: string, status: { lastDrinkAt: string; dueAt: string; nextAlarmAt: string }, log: DrinkLogDoc): Promise<void>;
}

export interface DrinkLogDoc {
  id: string;
  userId: string;
  action: 'SUDAH' | 'MANUAL';
  timestamp: string;
  amountMl: number;
  note: string;
}

export type DrinkResult =
  | { ok: true; amountMl: number; nextDueAt: string; duplicate?: boolean }
  | { ok: false; status: number; error: string };

const DEFAULT_INTERVAL_MINUTES = 180;
const DEFAULT_GLASS_ML = 250;
// A second press within this window (double tap, two devices) is not counted twice
const DUPLICATE_WINDOW_MS = 60 * 1000;

export function signTicket(secret: string, userId: string, exp: number): string {
  return createHmac('sha256', secret).update(`${userId}.${exp}`).digest('base64url');
}

export function verifyTicket(secret: string, t: Partial<DrinkTicket> | null, nowMs: number): boolean {
  if (!t || typeof t.userId !== 'string' || typeof t.exp !== 'number' || typeof t.sig !== 'string') return false;
  if (!t.userId || t.exp < nowMs) return false;
  const expected = Buffer.from(signTicket(secret, t.userId, t.exp));
  const given = Buffer.from(t.sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function recordDrink(
  store: DrinkStore,
  secret: string,
  ticket: Partial<DrinkTicket> | null,
  nowMs: number
): Promise<DrinkResult> {
  if (!verifyTicket(secret, ticket, nowMs)) return { ok: false, status: 401, error: 'Invalid or expired ticket' };
  const userId = ticket!.userId!;

  const user = await store.getUser(userId);
  if (!user) return { ok: false, status: 404, error: 'User not found' };

  const interval = user.intervalMinutes > 0 ? user.intervalMinutes : DEFAULT_INTERVAL_MINUTES;
  const amountMl = user.glassMl > 0 ? user.glassMl : DEFAULT_GLASS_ML;

  const lastMs = user.lastDrinkAt ? new Date(user.lastDrinkAt).getTime() : 0;
  if (nowMs - lastMs < DUPLICATE_WINDOW_MS && user.dueAt) {
    return { ok: true, amountMl, nextDueAt: user.dueAt, duplicate: true };
  }

  const nowIso = new Date(nowMs).toISOString();
  const nextIso = new Date(nowMs + interval * 60000).toISOString();
  const wasDue = user.dueAt ? nowMs >= new Date(user.dueAt).getTime() : true;

  await store.saveDrink(
    userId,
    { lastDrinkAt: nowIso, dueAt: nextIso, nextAlarmAt: nextIso },
    {
      id: `log-${nowMs}-${Math.floor(Math.random() * 1000)}`,
      userId,
      action: wasDue ? 'SUDAH' : 'MANUAL',
      timestamp: nowIso,
      amountMl,
      note: 'Dicatat dari notifikasi',
    }
  );
  return { ok: true, amountMl, nextDueAt: nextIso };
}

// ----------------- Firestore wiring -----------------

function firestoreDrinkStore(): DrinkStore {
  if (getApps().length === 0) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
    initializeApp({ credential: cert(JSON.parse(raw)) });
  }
  const db = getFirestore();

  return {
    async getUser(userId) {
      const [settingsSnap, statusSnap] = await Promise.all([
        db.collection('settings').doc(userId).get(),
        db.collection('statuses').doc(userId).get(),
      ]);
      if (!settingsSnap.exists && !statusSnap.exists) return null;
      const s = settingsSnap.data() || {};
      const st = statusSnap.data() || {};
      return {
        intervalMinutes: Number(s.intervalMinutes) || 0,
        glassMl: Number(s.glassMl) || 0,
        dueAt: typeof st.dueAt === 'string' ? st.dueAt : null,
        lastDrinkAt: typeof st.lastDrinkAt === 'string' ? st.lastDrinkAt : null,
      };
    },
    async saveDrink(userId, status, log) {
      const batch = db.batch();
      batch.set(db.collection('statuses').doc(userId), { ...status, userId }, { merge: true });
      batch.set(db.collection('drinkLogs').doc(log.id), log);
      await batch.commit();
    },
  };
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ ok: false, error: 'Server not configured' }, { status: 500 });

  let ticket: Partial<DrinkTicket> | null = null;
  try {
    ticket = (await request.json()) as Partial<DrinkTicket>;
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  // Reject bad tickets before touching the database
  const now = Date.now();
  if (!verifyTicket(secret, ticket, now)) {
    return Response.json({ ok: false, error: 'Invalid or expired ticket' }, { status: 401 });
  }

  try {
    const result = await recordDrink(firestoreDrinkStore(), secret, ticket, now);
    if (!result.ok) return Response.json(result, { status: result.status });
    return Response.json(result);
  } catch (err) {
    console.error('drink error:', err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
