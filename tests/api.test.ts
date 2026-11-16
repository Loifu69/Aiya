import { describe, expect, it } from 'vitest';
import * as drink from '../api/drink';
import * as rem from '../api/send-reminders';

// 2026-11-16 08:00 in Asia/Jakarta == 01:00Z
const now = Date.parse('2026-11-16T01:00:00Z');
const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();
const MIN = 60_000;

function makeStore(opts: {
  statuses: Record<string, any>;
  settings?: Record<string, any>;
  subs?: Record<string, any[]>;
  nudges?: any[];
}) {
  const deleted: string[] = [];
  const pushedNudges: string[] = [];
  const store: rem.ReminderStore = {
    async getDueStatuses(nowIso) {
      return Object.entries(opts.statuses)
        .filter(([, s]) => s.nextAlarmAt <= nowIso)
        .map(([userId, s]) => ({
          userId,
          dueAt: s.dueAt,
          nextAlarmAt: s.nextAlarmAt,
          intakeDate: s.intakeDate,
          intakeMl: s.intakeMl,
          reschedule: async (next: string) => {
            if (s.changed) return false;
            s.nextAlarmAt = next;
            return true;
          },
        }));
    },
    getSettings: async (u) => opts.settings?.[u] || null,
    getSubscriptions: async (u) => opts.subs?.[u] || [],
    deleteSubscription: async (id) => void deleted.push(id),
    getPendingNudges: async () => (opts.nudges || []).filter((n) => !n.pushed),
    markNudgePushed: async (id) => {
      const n = (opts.nudges || []).find((x) => x.id === id);
      if (!n || n.pushed) return false;
      n.pushed = true;
      pushedNudges.push(id);
      return true;
    },
  };
  return { store, deleted, pushedNudges };
}

const sub = (id: string, timeZone?: string) => ({ id, endpoint: `https://push/${id}`, keys: { p256dh: 'x', auth: 'y' }, timeZone });

describe('time helpers', () => {
  it('uses the user time zone', () => {
    expect(rem.localTimeHM(now, 'Asia/Jakarta')).toBe('08:00');
    expect(rem.localDateKey(Date.parse('2026-11-16T18:00:00Z'), 'Asia/Jakarta')).toBe('2026-11-17');
  });
  it('quiet hours wrap past midnight', () => {
    const night = { quietHoursEnabled: true, quietStart: '22:00', quietEnd: '07:00' };
    expect(rem.isInQuietHours(night, Date.parse('2026-11-16T17:30:00Z'), 'Asia/Jakarta')).toBe(true);
    expect(rem.isInQuietHours(night, now, 'Asia/Jakarta')).toBe(false);
  });
  it('reminder text', () => {
    expect(rem.buildReminderPayload(iso(-26 * 60 * MIN), now).body).toMatch(/lebih dari sehari/);
    expect(rem.buildReminderPayload(iso(-125 * MIN), now).body).toMatch(/2 jam 5 menit/);
    expect(rem.buildReminderPayload(iso(0), now).body).toMatch(/Waktunya minum/);
  });
});

describe('processDueReminders', () => {
  it('sends, skips and reschedules correctly', async () => {
    const statuses: Record<string, any> = {
      alice: { dueAt: iso(-12 * MIN), nextAlarmAt: iso(-MIN) },
      bob: { dueAt: iso(-5 * MIN), nextAlarmAt: iso(-1000) }, // no device
      cici: { dueAt: iso(-90 * MIN), nextAlarmAt: iso(-1000) }, // quiet hours
      dodi: { dueAt: iso(-5 * MIN), nextAlarmAt: iso(-1000), changed: true }, // just drank
      eka: { dueAt: iso(-5 * MIN), nextAlarmAt: iso(-1000) }, // device gone
      fina: { dueAt: iso(-5 * MIN), nextAlarmAt: iso(-1000), intakeDate: '2026-11-16', intakeMl: 2100 }, // target reached
      fajar: { dueAt: iso(60 * MIN), nextAlarmAt: iso(60 * MIN) }, // not due
    };
    const { store, deleted } = makeStore({
      statuses,
      settings: {
        alice: { snoozeMinutes: 5 },
        cici: { snoozeMinutes: 10, quietHoursEnabled: true, quietStart: '07:30', quietEnd: '09:00' },
        fina: { stopWhenTargetReached: true, dailyTargetMl: 2000 },
      },
      subs: { alice: [sub('a1', 'Asia/Jakarta'), sub('a2')], cici: [sub('c1', 'Asia/Jakarta')], dodi: [sub('d1')], eka: [sub('e1')], fina: [sub('f1', 'Asia/Jakarta')] },
    });
    const sent: any[] = [];
    const send: rem.SendPush = async (s, p) => {
      if (s.id === 'e1') throw Object.assign(new Error('gone'), { statusCode: 410 });
      sent.push({ id: s.id, ...p });
    };

    const summary = await rem.processDueReminders(store, send, now, rem.ticketMaker('secret', now));
    expect(summary).toEqual({ due: 6, sent: 1, quiet: 1, noDevice: 1, removedDevices: 1, skippedChanged: 1, targetReached: 1, failed: 0 });
    expect(sent.map((s) => s.id).sort()).toEqual(['a1', 'a2']);
    expect(sent[0].body).toMatch(/terlambat minum 12 menit/);
    expect(sent[0].drink.userId).toBe('alice');
    expect(deleted).toEqual(['e1']);
    expect(statuses.alice.nextAlarmAt).toBe(iso(5 * MIN));
    expect(statuses.bob.nextAlarmAt).toBe(iso(10 * MIN)); // default snooze
    expect(statuses.fina.nextAlarmAt).toBe(iso(10 * MIN)); // still rescheduled, just silent
    expect(statuses.dodi.nextAlarmAt).toBe(iso(-1000));
    expect(statuses.fajar.nextAlarmAt).toBe(iso(60 * MIN));
  });
});

describe('processPendingNudges', () => {
  it('pushes unread nudges once, skips read ones', async () => {
    const nudges = [
      { id: 'n1', toUserId: 'alice', fromName: 'Budi', message: 'Budi mengingatkanmu untuk minum.', isRead: false, pushed: false },
      { id: 'n2', toUserId: 'alice', fromName: 'Cici', message: 'x', isRead: true, pushed: false }, // seen in the open app
      { id: 'n3', toUserId: 'nobody', fromName: 'Dodi', message: 'x', isRead: false, pushed: false }, // no device
    ];
    const { store, pushedNudges } = makeStore({ statuses: {}, nudges, subs: { alice: [sub('a1')] } });
    const sent: any[] = [];
    const r1 = await rem.processPendingNudges(store, async (s, p) => void sent.push(p), now, rem.ticketMaker('secret', now));
    expect(r1).toEqual({ nudges: 3, nudgesSent: 1, nudgesSkipped: 2 });
    expect(sent[0].title).toBe('Budi mengingatkanmu!');
    expect(sent[0].tag).toBe('aiya-nudge');
    expect(pushedNudges.sort()).toEqual(['n1', 'n2', 'n3']);
    const r2 = await rem.processPendingNudges(store, async (s, p) => void sent.push(p), now);
    expect(r2.nudges).toBe(0);
    expect(sent).toHaveLength(1);
  });
});

describe('drink tickets and /api/drink', () => {
  const secret = 'test-secret';
  const ticket = rem.ticketMaker(secret, now)('user-1');

  it('verifies tickets made by send-reminders', () => {
    expect(drink.verifyTicket(secret, ticket, now)).toBe(true);
    expect(drink.verifyTicket('other', ticket, now)).toBe(false);
    expect(drink.verifyTicket(secret, { ...ticket, userId: 'user-2' }, now)).toBe(false);
    expect(drink.verifyTicket(secret, ticket, ticket.exp + 1)).toBe(false);
    expect(drink.verifyTicket(secret, null, now)).toBe(false);
  });

  it('records a drink, updates today intake, ignores double taps', async () => {
    const users: Record<string, any> = {
      'user-1': {
        intervalMinutes: 180,
        glassMl: 600,
        dailyTargetMl: 3000,
        dueAt: iso(-60 * MIN),
        lastDrinkAt: iso(-240 * MIN),
        intakeDate: '2026-11-16',
        intakeMl: 600,
        timeZone: 'Asia/Jakarta',
      },
    };
    const saves: any[] = [];
    const store: drink.DrinkStore = {
      getUser: async (id) => users[id] || null,
      saveDrink: async (id, status, log) => {
        saves.push({ status, log });
        users[id] = { ...users[id], ...status };
      },
    };

    const r1 = await drink.recordDrink(store, secret, ticket, now);
    expect(r1).toMatchObject({ ok: true, amountMl: 600 });
    expect(saves[0].log).toMatchObject({ action: 'SUDAH', amountMl: 600, dayKey: '2026-11-16' });
    expect(saves[0].status).toMatchObject({ intakeDate: '2026-11-16', intakeMl: 1200, targetMl: 3000, dueAt: iso(180 * MIN) });

    const r2 = await drink.recordDrink(store, secret, ticket, now + 20_000);
    expect(r2.ok && r2.duplicate).toBe(true);
    expect(saves).toHaveLength(1);

    const r3 = await drink.recordDrink(store, secret, ticket, now + 30 * MIN);
    expect(r3.ok).toBe(true);
    expect(saves[1].log.action).toBe('MANUAL');
    expect(saves[1].status.intakeMl).toBe(1800);

    expect(await drink.recordDrink(store, secret, { ...ticket, sig: 'x' }, now)).toEqual({ ok: false, status: 401, error: 'Invalid or expired ticket' });
  });

  it('rejects bad requests before touching the database', async () => {
    process.env.CRON_SECRET = secret;
    const bad = await drink.POST(new Request('http://x/api/drink', { method: 'POST', body: JSON.stringify({ userId: 'u', exp: now, sig: 'no' }) }));
    expect(bad.status).toBe(401);
    const notJson = await drink.POST(new Request('http://x/api/drink', { method: 'POST', body: 'hello' }));
    expect(notJson.status).toBe(400);
  });

  it('cron endpoint needs the secret', async () => {
    process.env.CRON_SECRET = 'abc';
    expect((await rem.GET(new Request('http://x/api/send-reminders'))).status).toBe(401);
  });
});
