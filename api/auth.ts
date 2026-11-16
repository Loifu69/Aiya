// Account endpoint (Vercel serverless function): register, login, change password, delete account.
//
// Passwords are checked here on the server (the `credentials` collection is closed to the app by
// the Firestore rules). On success the server returns a Firebase custom token; the app signs in
// with it, so Firestore knows who is asking (request.auth.uid == the Aiya user id).
//
//   POST /api/auth  { action: 'register', username, password }        -> { ok, token, account }
//   POST /api/auth  { action: 'login', username, password }           -> { ok, token, account }
//   POST /api/auth  { action: 'change-password', currentPassword, newPassword }  + Authorization: Bearer <idToken>
//   POST /api/auth  { action: 'delete-account', password }            + Authorization: Bearer <idToken>
//
// Env: FIREBASE_SERVICE_ACCOUNT. Hashing matches src/utils/password.ts (salted SHA-256, 2000 rounds).

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { createHash, createPublicKey, createSign, randomBytes, timingSafeEqual, verify as verifySignature } from 'node:crypto';

// ----------------- Password hashing (same algorithm as the app) -----------------

const ITERATIONS = 2000;
export const PASSWORD_ALGO = 'sha256-x2000';

export function hashPassword(password: string, salt: string): string {
  let digest = createHash('sha256').update(`${salt}:${password}`).digest();
  const saltBytes = Buffer.from(salt);
  for (let i = 1; i < ITERATIONS; i++) {
    digest = createHash('sha256').update(Buffer.concat([digest, saltBytes])).digest();
  }
  return digest.toString('hex');
}

export interface Credential {
  userId: string;
  hash: string;
  salt: string;
  algo: string;
  updatedAt: string;
}

export function createCredential(userId: string, password: string): Credential {
  const salt = randomBytes(16).toString('hex');
  return { userId, salt, hash: hashPassword(password, salt), algo: PASSWORD_ALGO, updatedAt: new Date().toISOString() };
}

export function verifyCredential(cred: Partial<Credential> | null | undefined, password: string): boolean {
  if (!cred?.hash || !cred.salt) return false;
  const a = Buffer.from(hashPassword(password, cred.salt));
  const b = Buffer.from(cred.hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ----------------- Validation (same messages as before) -----------------

export function validateUsername(raw: unknown): { ok: true; username: string } | { ok: false; message: string } {
  const username = String(raw ?? '').trim().toLowerCase();
  if (!username) return { ok: false, message: 'Username tidak boleh kosong' };
  if (username.length < 3) return { ok: false, message: 'Username minimal 3 karakter' };
  if (username.length > 30) return { ok: false, message: 'Username maksimal 30 karakter' };
  if (!/^[a-z0-9_]+$/.test(username)) return { ok: false, message: 'Username hanya boleh huruf, angka, dan underscore (_)' };
  return { ok: true, username };
}

export function validatePassword(raw: unknown): { ok: true; password: string } | { ok: false; message: string } {
  const password = String(raw ?? '').trim();
  if (!password) return { ok: false, message: 'Password tidak boleh kosong' };
  if (password.length < 3) return { ok: false, message: 'Password minimal 3 karakter' };
  if (password.length > 200) return { ok: false, message: 'Password terlalu panjang' };
  return { ok: true, password };
}

// Public account fields only (old docs may still carry a plain-text `password`)
export function publicAccount(raw: Record<string, unknown>) {
  const account: Record<string, string> = {
    id: String(raw.id || ''),
    username: String(raw.username || ''),
    name: String(raw.name || ''),
    userCode: String(raw.userCode || raw.username || ''),
    createdAt: String(raw.createdAt || ''),
  };
  if (typeof raw.avatar === 'string') account.avatar = raw.avatar;
  return account;
}

export function newAccountDocs(username: string, nowMs: number) {
  const id = `user-${nowMs}-${Math.floor(Math.random() * 1000)}`;
  const name = username.charAt(0).toUpperCase() + username.slice(1);
  const account = {
    id,
    username,
    name,
    userCode: username,
    avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`,
    createdAt: new Date(nowMs).toISOString(),
  };
  const settings = {
    userId: id,
    name,
    userCode: username,
    intervalMinutes: 180,
    snoozeMinutes: 10,
    dailyTargetMl: 2000,
    glassMl: 250,
    stopWhenTargetReached: false,
    soundType: 'river',
    volume: 0.8,
    quietHoursEnabled: false,
    quietStart: '22:00',
    quietEnd: '07:00',
    isOnboarded: false, // the app shows the onboarding questions
  };
  const next = new Date(nowMs + 180 * 60000).toISOString();
  const status = { userId: id, lastDrinkAt: null, dueAt: next, nextAlarmAt: next };
  return { account, settings, status };
}

// ----------------- Actions -----------------

type Result = { status: number; body: Record<string, unknown> };
const fail = (status: number, message: string): Result => ({ status, body: { ok: false, message } });

// ----------------- Firebase Auth tokens -----------------
// Done by hand with node:crypto instead of 'firebase-admin/auth': that module loads an ESM-only
// dependency (jose) with require(), which crashes the function on Vercel before it can run.

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

const b64url = (data: string | Buffer) => Buffer.from(data).toString('base64url');

/** Custom token for signInWithCustomToken (https://firebase.google.com/docs/auth/admin/create-custom-tokens) */
export function signCustomToken(sa: ServiceAccount, uid: string, nowMs = Date.now()): string {
  const iat = Math.floor(nowMs / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      iss: sa.client_email,
      sub: sa.client_email,
      aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
      iat,
      exp: iat + 3600,
      uid,
    })
  );
  const signature = createSign('RSA-SHA256').update(`${header}.${payload}`).sign(sa.private_key);
  return `${header}.${payload}.${b64url(signature)}`;
}

const ID_TOKEN_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let certCache: { certs: Record<string, string>; expiresAt: number } | null = null;

async function idTokenCerts(): Promise<Record<string, string>> {
  if (certCache && certCache.expiresAt > Date.now()) return certCache.certs;
  const res = await fetch(ID_TOKEN_CERTS_URL);
  if (!res.ok) throw new Error(`Could not load Firebase token certificates (${res.status})`);
  const certs = (await res.json()) as Record<string, string>;
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') || '')?.[1] || 3600);
  certCache = { certs, expiresAt: Date.now() + maxAge * 1000 };
  return certs;
}

/** Checks a Firebase ID token (https://firebase.google.com/docs/auth/admin/verify-id-tokens) and returns its uid */
export function checkIdToken(
  token: string,
  projectId: string,
  certs: Record<string, string>,
  nowMs = Date.now()
): string {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [h, p, sig] = parts;
  const header = JSON.parse(Buffer.from(h, 'base64url').toString());
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  const pem = certs[header.kid];
  if (header.alg !== 'RS256' || !pem) throw new Error('unknown signing key');
  const ok = verifySignature('RSA-SHA256', Buffer.from(`${h}.${p}`), createPublicKey(pem), Buffer.from(sig, 'base64url'));
  if (!ok) throw new Error('bad signature');
  const now = Math.floor(nowMs / 1000);
  if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('token is for another project');
  }
  if (typeof payload.exp !== 'number' || payload.exp <= now) throw new Error('token expired');
  if (typeof payload.iat !== 'number' || payload.iat > now + 300) throw new Error('token issued in the future');
  if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('token has no user');
  return payload.sub;
}

function admin() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
  const sa = JSON.parse(raw) as ServiceAccount;
  if (getApps().length === 0) initializeApp({ credential: cert(JSON.parse(raw)) });
  const credential = getApps()[0].options.credential!;

  return {
    db: getFirestore(),
    auth: {
      createCustomToken: async (uid: string) => signCustomToken(sa, uid),
      verifyIdToken: async (idToken: string) => ({ uid: checkIdToken(idToken, sa.project_id, await idTokenCerts()) }),
      deleteUser: async (uid: string) => {
        const { access_token } = await credential.getAccessToken();
        const res = await fetch(
          `https://identitytoolkit.googleapis.com/v1/projects/${sa.project_id}/accounts:delete`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ localId: uid }),
          }
        );
        if (!res.ok) throw new Error(`deleteUser failed (${res.status})`);
      },
    },
  };
}

async function register(body: Record<string, unknown>): Promise<Result> {
  const u = validateUsername(body.username);
  if (!u.ok) return fail(400, u.message);
  const p = validatePassword(body.password);
  if (!p.ok) return fail(400, p.message);

  const { db, auth } = admin();
  // Older accounts were created before username reservations existed
  const legacy = await db.collection('accounts').where('username', '==', u.username).limit(1).get();
  if (!legacy.empty) return fail(409, 'Username telah digunakan');

  const { account, settings, status } = newAccountDocs(u.username, Date.now());
  const credential = createCredential(account.id, p.password);
  try {
    await db.runTransaction(async (tx) => {
      const nameRef = db.collection('usernames').doc(u.username);
      if ((await tx.get(nameRef)).exists) throw new Error('USERNAME_TAKEN');
      tx.set(nameRef, { userId: account.id, createdAt: account.createdAt });
      tx.set(db.collection('accounts').doc(account.id), account);
      tx.set(db.collection('credentials').doc(account.id), credential);
      tx.set(db.collection('settings').doc(account.id), settings);
      tx.set(db.collection('statuses').doc(account.id), status);
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'USERNAME_TAKEN') return fail(409, 'Username telah digunakan');
    throw err;
  }
  const token = await auth.createCustomToken(account.id);
  return { status: 200, body: { ok: true, token, account, message: `Pendaftaran berhasil! Selamat datang, ${account.name}.` } };
}

async function login(body: Record<string, unknown>): Promise<Result> {
  const username = String(body.username ?? '').trim().toLowerCase();
  const password = String(body.password ?? '').trim();
  if (!username || !password) return fail(400, 'Masukkan username dan password.');

  const { db, auth } = admin();
  const snap = await db.collection('accounts').where('username', '==', username).limit(1).get();
  if (snap.empty) return fail(401, 'Username atau password salah.');
  const doc = snap.docs[0];
  const raw = doc.data();
  const account = publicAccount({ ...raw, id: raw.id || doc.id });

  const credRef = db.collection('credentials').doc(account.id);
  let cred = (await credRef.get()).data() as Credential | undefined;

  // Very old accounts: plain-text password on the account doc -> move to a hash
  if (typeof raw.password === 'string' && raw.password) {
    if (!cred) {
      cred = createCredential(account.id, raw.password);
      await credRef.set(cred);
    }
    await doc.ref.update({ password: FieldValue.delete() });
  }

  if (!verifyCredential(cred, password)) return fail(401, 'Username atau password salah.');
  const token = await auth.createCustomToken(account.id);
  return { status: 200, body: { ok: true, token, account, message: `Selamat datang kembali, ${account.name}!` } };
}

async function uidFrom(request: Request): Promise<string | null> {
  const header = request.headers.get('authorization') || '';
  const idToken = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!idToken) return null;
  try {
    return (await admin().auth.verifyIdToken(idToken)).uid;
  } catch {
    return null;
  }
}

async function changePassword(uid: string, body: Record<string, unknown>): Promise<Result> {
  const current = String(body.currentPassword ?? '').trim();
  const p = validatePassword(body.newPassword);
  if (!current) return fail(400, 'Isi password lama dan password baru.');
  if (!p.ok) return fail(400, p.message.replace('Password', 'Password baru'));
  if (p.password === current) return fail(400, 'Password baru tidak boleh sama dengan yang lama.');

  const { db } = admin();
  const ref = db.collection('credentials').doc(uid);
  if (!verifyCredential((await ref.get()).data() as Credential | undefined, current)) {
    return fail(401, 'Password lama salah.');
  }
  await ref.set(createCredential(uid, p.password));
  return { status: 200, body: { ok: true, message: 'Password berhasil diganti.' } };
}

// Everything that belongs to (or mentions) the user
export const USER_DOC_QUERIES: [string, string][] = [
  ['friendships', 'user1Id'],
  ['friendships', 'user2Id'],
  ['friendRequests', 'fromUserId'],
  ['friendRequests', 'toUserId'],
  ['nudges', 'fromUserId'],
  ['nudges', 'toUserId'],
  ['drinkLogs', 'userId'],
  ['pushSubscriptions', 'userId'],
  ['ringtoneChunks', 'userId'],
];

async function deleteEverything(db: Firestore, uid: string): Promise<void> {
  const accSnap = await db.collection('accounts').doc(uid).get();
  const username = String(accSnap.data()?.username || '').toLowerCase();
  if (username) {
    const res = await db.collection('usernames').doc(username).get();
    if (res.exists && res.data()?.userId === uid) await res.ref.delete();
  }
  for (const col of ['accounts', 'credentials', 'settings', 'statuses', 'userFriends']) {
    await db.collection(col).doc(uid).delete();
  }
  for (const [col, field] of USER_DOC_QUERIES) {
    const snap = await db.collection(col).where(field, '==', uid).get();
    let batch = db.batch();
    let n = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      if (++n === 450) {
        await batch.commit();
        batch = db.batch();
        n = 0;
      }
    }
    if (n > 0) await batch.commit();
  }
}

async function deleteAccount(uid: string, body: Record<string, unknown>): Promise<Result> {
  const password = String(body.password ?? '').trim();
  if (!password) return fail(400, 'Masukkan password untuk konfirmasi');
  const { db, auth } = admin();
  const cred = (await db.collection('credentials').doc(uid).get()).data() as Credential | undefined;
  if (!verifyCredential(cred, password)) return fail(401, 'Password salah. Konfirmasi penghapusan gagal.');

  await deleteEverything(db, uid);
  try {
    await auth.deleteUser(uid);
  } catch {
    // the auth user may not exist yet
  }
  return { status: 200, body: { ok: true, message: 'Akun berhasil dihapus permanen.' } };
}

export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, message: 'Permintaan tidak valid.' }, { status: 400 });
  }

  try {
    let result: Result;
    switch (body.action) {
      case 'register':
        result = await register(body);
        break;
      case 'login':
        result = await login(body);
        break;
      case 'change-password':
      case 'delete-account': {
        const uid = await uidFrom(request);
        if (!uid) {
          result = fail(401, 'Sesi berakhir. Silakan keluar lalu masuk lagi.');
          break;
        }
        result = body.action === 'change-password' ? await changePassword(uid, body) : await deleteAccount(uid, body);
        break;
      }
      default:
        result = fail(400, 'Aksi tidak dikenal.');
    }
    return Response.json(result.body, { status: result.status });
  } catch (err) {
    console.error('auth error:', err);
    return Response.json({ ok: false, message: 'Terjadi kesalahan di server. Coba lagi sebentar.' }, { status: 500 });
  }
}
