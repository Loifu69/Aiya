import { describe, expect, it } from 'vitest';
import * as auth from '../api/auth';
import { hashPassword as clientHash, createCredential as clientCredential } from '../src/utils/password';

describe('server password hashing', () => {
  it('produces the same hash as the app (existing credentials keep working)', () => {
    expect(auth.hashPassword('rahasia123', 'abcdef')).toBe(clientHash('rahasia123', 'abcdef'));
    const fromApp = clientCredential('u1', 'tes12345');
    expect(auth.verifyCredential(fromApp, 'tes12345')).toBe(true);
    expect(auth.verifyCredential(fromApp, 'salah')).toBe(false);
  });

  it('creates salted credentials', () => {
    const a = auth.createCredential('u1', 'x1y2z3');
    expect(a.algo).toBe('sha256-x2000');
    expect(a.salt).toHaveLength(32);
    expect(auth.verifyCredential(a, 'x1y2z3')).toBe(true);
    expect(auth.createCredential('u1', 'x1y2z3').hash).not.toBe(a.hash);
    expect(auth.verifyCredential(null, 'x')).toBe(false);
  });
});

describe('validation', () => {
  it('username', () => {
    expect(auth.validateUsername('  Roip_01 ')).toEqual({ ok: true, username: 'roip_01' });
    expect(auth.validateUsername('ab')).toMatchObject({ ok: false });
    expect(auth.validateUsername('nama spasi')).toMatchObject({ ok: false });
    expect(auth.validateUsername('')).toMatchObject({ ok: false });
  });
  it('password', () => {
    expect(auth.validatePassword(' abc ')).toEqual({ ok: true, password: 'abc' });
    expect(auth.validatePassword('ab')).toMatchObject({ ok: false });
  });
});

describe('account docs', () => {
  it('never exposes a password and starts with onboarding', () => {
    const { account, settings, status } = auth.newAccountDocs('budi', Date.parse('2026-11-16T01:00:00Z'));
    expect(account).toMatchObject({ username: 'budi', name: 'Budi', userCode: 'budi' });
    expect(account.id).toMatch(/^user-\d+-\d+$/);
    expect(settings).toMatchObject({ userId: account.id, isOnboarded: false, dailyTargetMl: 2000, glassMl: 250 });
    expect(status).toMatchObject({ userId: account.id, lastDrinkAt: null });
    expect(auth.publicAccount({ ...account, password: 'polos' })).not.toHaveProperty('password');
  });

  it('deletion covers every collection that references a user', () => {
    const cols = new Set(auth.USER_DOC_QUERIES.map(([c]) => c));
    for (const c of ['friendships', 'friendRequests', 'nudges', 'drinkLogs', 'pushSubscriptions', 'ringtoneChunks']) {
      expect(cols.has(c)).toBe(true);
    }
  });
});

describe('POST /api/auth', () => {
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    auth.POST(new Request('http://x/api/auth', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers }));

  it('rejects bad input without touching the database', async () => {
    expect((await post('not json')).status).toBe(400);
    expect((await post({ action: 'nope' })).status).toBe(400);
    const res = await post({ action: 'register', username: 'a b', password: 'x' });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/Username/);
    expect((await post({ action: 'login', username: '', password: '' })).status).toBe(400);
  });

  it('requires a session for change-password and delete-account', async () => {
    expect((await post({ action: 'change-password', currentPassword: 'a', newPassword: 'b' })).status).toBe(401);
    expect((await post({ action: 'delete-account', password: 'a' })).status).toBe(401);
  });
});
