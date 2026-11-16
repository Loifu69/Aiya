import { createSign, generateKeyPairSync, verify } from 'node:crypto';
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

describe('Firebase tokens without firebase-admin/auth', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const sa = {
    project_id: 'aiya-test',
    client_email: 'svc@aiya-test.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
  const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const now = Date.parse('2026-11-16T01:00:00Z');
  const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString());

  // An ID token shaped like the ones Firebase issues, signed with our test key
  const idToken = (claims: Record<string, unknown>, kid = 'k1') => {
    const h = Buffer.from(JSON.stringify({ alg: 'RS256', kid })).toString('base64url');
    const p = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const s = createSign('RSA-SHA256').update(`${h}.${p}`).sign(sa.private_key).toString('base64url');
    return `${h}.${p}.${s}`;
  };
  const good = {
    aud: 'aiya-test',
    iss: 'https://securetoken.google.com/aiya-test',
    sub: 'user-1',
    iat: now / 1000 - 60,
    exp: now / 1000 + 3000,
  };

  it('signs a custom token Firebase accepts', () => {
    const [h, p, sig] = auth.signCustomToken(sa, 'user-1', now).split('.');
    expect(decode(h)).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(decode(p)).toMatchObject({ uid: 'user-1', iss: sa.client_email, sub: sa.client_email, exp: now / 1000 + 3600 });
    expect(verify('RSA-SHA256', Buffer.from(`${h}.${p}`), pub, Buffer.from(sig, 'base64url'))).toBe(true);
  });

  it('accepts a valid ID token and rejects bad ones', () => {
    const certs = { k1: pub };
    expect(auth.checkIdToken(idToken(good), 'aiya-test', certs, now)).toBe('user-1');
    expect(() => auth.checkIdToken(idToken(good, 'other'), 'aiya-test', certs, now)).toThrow();
    expect(() => auth.checkIdToken(idToken({ ...good, aud: 'x' }), 'aiya-test', certs, now)).toThrow();
    expect(() => auth.checkIdToken(idToken({ ...good, exp: now / 1000 - 1 }), 'aiya-test', certs, now)).toThrow();
    const t = idToken(good).split('.');
    const forged = Buffer.from(JSON.stringify({ ...good, sub: 'user-2' })).toString('base64url');
    expect(() => auth.checkIdToken(`${t[0]}.${forged}.${t[2]}`, 'aiya-test', certs, now)).toThrow();
    expect(() => auth.checkIdToken('nope', 'aiya-test', certs, now)).toThrow();
  });
});
