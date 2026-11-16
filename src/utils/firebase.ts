import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  onSnapshot,
  deleteDoc,
  deleteField,
  runTransaction,
  Unsubscribe,
} from 'firebase/firestore';
import { createCredential, PasswordCredential } from './password';
import {
  DrinkLog,
  DrinkStatus,
  Friend,
  FriendRequest,
  NudgeEvent,
  UserAccount,
  UserSettings,
} from '../types';

// Load config from Vite environment variables (or localStorage fallback for easy setup in UI)
const env = import.meta.env;

export interface FirebaseCustomConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

const STORAGE_KEY_FIREBASE = 'aiya_firebase_runtime_config_v1';

// Default configuration from Firebase Project "Aiya"
const DEFAULT_FIREBASE_CONFIG: FirebaseCustomConfig = {
  apiKey: "AIzaSyArwGQDf6kUuD5elaqswIy96HNIFDW53sQ",
  authDomain: "aiya-60746.firebaseapp.com",
  projectId: "aiya-60746",
  storageBucket: "aiya-60746.firebasestorage.app",
  messagingSenderId: "388168705041",
  appId: "1:388168705041:web:a6384b8809a0ed6848fdb0",
};

export function getStoredFirebaseConfig(): FirebaseCustomConfig | null {
  // 1. Try env vars first
  if (env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_API_KEY) {
    return {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || `${env.VITE_FIREBASE_PROJECT_ID}.appspot.com`,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
      appId: env.VITE_FIREBASE_APP_ID || '',
    };
  }

  // 2. Try localStorage custom config (useful for immediate in-browser setup)
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FIREBASE);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }

  // 3. Built-in default project config
  return DEFAULT_FIREBASE_CONFIG;
}

export function saveStoredFirebaseConfig(config: FirebaseCustomConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY_FIREBASE, JSON.stringify(config));
  } catch {
    // ignore
  }
}

let appInstance: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;

export function initFirebase(): { app: FirebaseApp | null; db: Firestore | null } {
  if (dbInstance) return { app: appInstance, db: dbInstance };

  const config = getStoredFirebaseConfig();
  if (!config || !config.projectId || !config.apiKey) {
    return { app: null, db: null };
  }

  try {
    const existing = getApps();
    appInstance = existing.length > 0 ? existing[0] : initializeApp(config);
    dbInstance = getFirestore(appInstance);
    return { app: appInstance, db: dbInstance };
  } catch (err) {
    console.warn('Firebase initialization notice:', err);
    return { app: null, db: null };
  }
}

export function isFirebaseReady(): boolean {
  const { db } = initFirebase();
  return db !== null;
}

// ----------------- FIRESTORE CLOUD OPERATIONS -----------------

// Keep only public account fields. Old account docs had a plain-text `password`
// field; it must never be cached, shown, or written back.
export function sanitizeAccount(raw: unknown): UserAccount {
  const a = (raw || {}) as Record<string, unknown>;
  const account: UserAccount = {
    id: String(a.id || ''),
    username: String(a.username || ''),
    name: String(a.name || ''),
    userCode: String(a.userCode || a.username || ''),
    createdAt: String(a.createdAt || ''),
  };
  if (typeof a.avatar === 'string') account.avatar = a.avatar;
  return account;
}

// Credentials live in their own collection, never inside the public account doc.
export async function firestoreGetCredential(userId: string): Promise<PasswordCredential | null> {
  const { db } = initFirebase();
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, 'credentials', userId));
    return snap.exists() ? (snap.data() as PasswordCredential) : null;
  } catch (err) {
    console.error('Firestore get credential error:', err);
    return null;
  }
}

// Move a legacy plain-text password out of the account doc into a hashed credential.
async function migrateLegacyPassword(db: Firestore, userId: string, plain: string): Promise<PasswordCredential | null> {
  try {
    const credRef = doc(db, 'credentials', userId);
    const existing = await getDoc(credRef);
    let cred = existing.exists() ? (existing.data() as PasswordCredential) : null;
    if (!cred) {
      cred = createCredential(userId, plain);
      await setDoc(credRef, cred);
    }
    await setDoc(doc(db, 'accounts', userId), { password: deleteField() }, { merge: true });
    return cred;
  } catch (err) {
    console.error('Firestore password migration error:', err);
    return null;
  }
}

export interface LoginRecord {
  account: UserAccount;
  credential: PasswordCredential | null;
}

// Look up everything needed to check a login, migrating an old plain-text password if found.
export async function firestoreGetLoginRecord(username: string): Promise<LoginRecord | null> {
  const { db } = initFirebase();
  if (!db) return null;

  try {
    const snap = await getDocs(
      query(collection(db, 'accounts'), where('username', '==', username.toLowerCase().trim()))
    );
    if (snap.empty) return null;
    const raw = snap.docs[0].data();
    const account = sanitizeAccount(raw);

    let credential = await firestoreGetCredential(account.id);
    if (typeof raw.password === 'string' && raw.password) {
      credential = (await migrateLegacyPassword(db, account.id, raw.password)) || credential;
    }
    return { account, credential };
  } catch (err) {
    console.error('Firestore login lookup error:', err);
    return null;
  }
}

export async function firestoreSaveCredential(cred: PasswordCredential): Promise<boolean> {
  const { db } = initFirebase();
  if (!db) return false;
  try {
    await setDoc(doc(db, 'credentials', cred.userId), cred);
    return true;
  } catch (err) {
    console.error('Firestore save credential error:', err);
    return false;
  }
}

// Cloud Account: Register
export async function firestoreRegisterAccount(
  account: UserAccount,
  settings: UserSettings,
  status: DrinkStatus
): Promise<boolean> {
  const { db } = initFirebase();
  if (!db) return false;

  try {
    // Never let a cached/stale account claim a username owned by another account
    const uname = account.username.toLowerCase().trim();
    const usernameRef = doc(db, 'usernames', uname);
    const owned = await runTransaction(db, async (tx) => {
      const snap = await tx.get(usernameRef);
      if (snap.exists() && snap.data().userId !== account.id) return false;
      if (!snap.exists()) {
        tx.set(usernameRef, { userId: account.id, createdAt: new Date().toISOString() });
      }
      return true;
    });
    if (!owned) {
      console.warn(`Username "${uname}" belongs to another account; skipping cloud sync.`);
      return false;
    }

    // Save account (public fields only)
    await setDoc(doc(db, 'accounts', account.id), sanitizeAccount(account));
    // Settings and drink status: the cloud copy is the source of truth. Only create them
    // when missing, so a new device (with placeholder local data) never overwrites them.
    const settingsRef = doc(db, 'settings', account.id);
    if (!(await getDoc(settingsRef)).exists()) {
      await setDoc(settingsRef, settings);
    }
    const statusRef = doc(db, 'statuses', account.id);
    if (!(await getDoc(statusRef)).exists()) {
      await setDoc(statusRef, { ...status, userId: account.id });
    }
    return true;
  } catch (err) {
    console.error('Firestore register error:', err);
    return false;
  }
}

// Cloud Account: Create with a GUARANTEED-UNIQUE username.
// Reserves `usernames/{username}` inside a transaction, so two people can never
// get the same username, even if they register at the same moment.
export type CreateAccountResult = 'ok' | 'taken' | 'error';

export async function firestoreCreateAccountUnique(
  account: UserAccount,
  settings: UserSettings,
  status: DrinkStatus,
  credential: PasswordCredential
): Promise<CreateAccountResult> {
  const { db } = initFirebase();
  if (!db) return 'error';

  const username = account.username.toLowerCase().trim();

  try {
    // Older accounts were created before username reservations existed
    const legacy = await getDocs(
      query(collection(db, 'accounts'), where('username', '==', username))
    );
    if (!legacy.empty) return 'taken';

    await runTransaction(db, async (tx) => {
      const usernameRef = doc(db, 'usernames', username);
      const snap = await tx.get(usernameRef);
      if (snap.exists()) {
        throw new Error('USERNAME_TAKEN');
      }
      tx.set(usernameRef, { userId: account.id, createdAt: new Date().toISOString() });
      tx.set(doc(db, 'accounts', account.id), sanitizeAccount(account));
      tx.set(doc(db, 'credentials', account.id), credential);
      tx.set(doc(db, 'settings', account.id), settings);
      tx.set(doc(db, 'statuses', account.id), status);
    });
    return 'ok';
  } catch (err) {
    if (err instanceof Error && err.message === 'USERNAME_TAKEN') return 'taken';
    console.error('Firestore create account error:', err);
    return 'error';
  }
}

// Cloud Account: Delete Account & related documents
export async function firestoreDeleteAccount(userId: string): Promise<boolean> {
  const { db } = initFirebase();
  if (!db) return false;

  try {
    // Release the username reservation so it can be used again
    const accSnap = await getDoc(doc(db, 'accounts', userId));
    const uname = accSnap.exists() ? String(accSnap.data().username || '').toLowerCase().trim() : '';
    if (uname) {
      const resSnap = await getDoc(doc(db, 'usernames', uname));
      if (resSnap.exists() && resSnap.data().userId === userId) {
        await deleteDoc(doc(db, 'usernames', uname));
      }
    }

    await deleteDoc(doc(db, 'accounts', userId));
    await deleteDoc(doc(db, 'credentials', userId));
    await deleteDoc(doc(db, 'settings', userId));
    await deleteDoc(doc(db, 'statuses', userId));
    await deleteDoc(doc(db, 'userFriends', userId));

    // Delete every doc that references this user: friendships (both sides lose the friend),
    // friend requests and nudges (sent or received), and drink logs.
    const targets: [string, string][] = [
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
    for (const [col, field] of targets) {
      const snap = await getDocs(query(collection(db, col), where(field, '==', userId)));
      for (const d of snap.docs) {
        await deleteDoc(d.ref);
      }
    }
    return true;
  } catch (err) {
    console.error('Firestore delete account error:', err);
    return false;
  }
}

// Cloud Account: Find By Username
export async function firestoreFindAccountByUsername(
  username: string
): Promise<UserAccount | null> {
  const { db } = initFirebase();
  if (!db) return null;

  try {
    const q = query(
      collection(db, 'accounts'),
      where('username', '==', username.toLowerCase().trim())
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      return sanitizeAccount(snap.docs[0].data());
    }
  } catch (err) {
    console.error('Firestore query username error:', err);
  }
  return null;
}

// Cloud Account: Get All Accounts
export async function firestoreGetAllAccounts(): Promise<UserAccount[]> {
  const { db } = initFirebase();
  if (!db) return [];

  try {
    const snap = await getDocs(collection(db, 'accounts'));
    // Clean up any account docs that still carry a plain-text password
    for (const d of snap.docs) {
      const raw = d.data();
      if (typeof raw.password === 'string' && raw.password) {
        migrateLegacyPassword(db, d.id, raw.password).catch(() => {});
      }
    }
    return snap.docs.map((d) => sanitizeAccount(d.data()));
  } catch (err) {
    console.error('Firestore get all accounts error:', err);
    return [];
  }
}

// Cloud Account: update display name (friends see it live)
export async function firestoreUpdateAccountName(userId: string, name: string): Promise<boolean> {
  const { db } = initFirebase();
  if (!db) return false;

  try {
    await setDoc(doc(db, 'accounts', userId), { name }, { merge: true });
    return true;
  } catch (err) {
    console.error('Firestore update account name error:', err);
    return false;
  }
}

// Cloud Settings: Save & Load
export async function firestoreSaveSettings(userId: string, settings: UserSettings): Promise<boolean> {
  const { db } = initFirebase();
  if (!db) return false;

  try {
    await setDoc(doc(db, 'settings', userId), { ...settings, userId }, { merge: true });
    return true;
  } catch (err) {
    console.error('Firestore save settings error:', err);
    return false;
  }
}

export async function firestoreGetSettings(userId: string): Promise<UserSettings | null> {
  const { db } = initFirebase();
  if (!db) return null;

  try {
    const snap = await getDoc(doc(db, 'settings', userId));
    return snap.exists() ? (snap.data() as UserSettings) : null;
  } catch (err) {
    console.error('Firestore get settings error:', err);
    return null;
  }
}

// Cloud Drink Status: Save & Realtime Listen
export async function firestoreSaveDrinkStatus(
  userId: string,
  status: DrinkStatus
): Promise<void> {
  const { db } = initFirebase();
  if (!db) return;

  try {
    await setDoc(doc(db, 'statuses', userId), status, { merge: true });
  } catch (err) {
    console.error('Firestore save status error:', err);
  }
}

// Only moves the next reminder time. Used by the repeating reminder loop so a device
// with an outdated local copy can't overwrite lastDrinkAt/dueAt set by another device.
export async function firestoreUpdateNextAlarm(userId: string, nextAlarmAt: string): Promise<void> {
  const { db } = initFirebase();
  if (!db) return;

  try {
    await setDoc(doc(db, 'statuses', userId), { nextAlarmAt }, { merge: true });
  } catch (err) {
    console.error('Firestore update next alarm error:', err);
  }
}

export function firestoreSubscribeDrinkStatus(
  userId: string,
  onChange: (status: DrinkStatus) => void
): Unsubscribe | null {
  const { db } = initFirebase();
  if (!db) return null;

  return onSnapshot(
    doc(db, 'statuses', userId),
    (snap) => {
      if (snap.exists()) {
        onChange(snap.data() as DrinkStatus);
      }
    },
    (err) => console.warn('Status snapshot listener:', err)
  );
}

// Cloud Friend Requests: Send, Subscribe, Accept, Reject
export async function firestoreSendFriendRequest(request: FriendRequest): Promise<boolean> {
  const { db } = initFirebase();
  if (!db) return false;

  try {
    await setDoc(doc(db, 'friendRequests', request.id), request);
    return true;
  } catch (err) {
    console.error('Firestore send request error:', err);
    return false;
  }
}

// Only this user's pending requests are fetched (not the whole collection)
function subscribePendingRequests(
  field: 'toUserId' | 'fromUserId',
  userId: string,
  onChange: (reqs: FriendRequest[]) => void
): Unsubscribe | null {
  const { db } = initFirebase();
  if (!db) return null;

  const q = query(
    collection(db, 'friendRequests'),
    where(field, '==', userId),
    where('status', '==', 'PENDING')
  );

  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => d.data() as FriendRequest)),
    (err) => console.warn(`Requests snapshot listener (${field}):`, err)
  );
}

export function firestoreSubscribeRequests(
  user: { id: string },
  onChange: (reqs: FriendRequest[]) => void
): Unsubscribe | null {
  return subscribePendingRequests('toUserId', user.id, onChange);
}

export function firestoreSubscribeOutgoingRequests(
  user: { id: string },
  onChange: (reqs: FriendRequest[]) => void
): Unsubscribe | null {
  return subscribePendingRequests('fromUserId', user.id, onChange);
}

export async function firestoreSaveUserFriends(
  userId: string,
  friends: Friend[],
  username?: string
): Promise<void> {
  const { db } = initFirebase();
  if (!db) return;

  try {
    await setDoc(doc(db, 'userFriends', userId), { friends }, { merge: true });
    if (username) {
      await setDoc(doc(db, 'userFriends', `usr_${username.toLowerCase().trim()}`), { friends }, { merge: true });
    }
  } catch (err) {
    console.error('Firestore save userFriends error:', err);
  }
}

export function firestoreSubscribeUserFriends(
  user: { id: string; username?: string } | string,
  onChange: (friends: Friend[]) => void
): Unsubscribe | null {
  const { db } = initFirebase();
  if (!db) return null;

  const targetId = typeof user === 'string' ? user : user.id;
  const targetUsername = typeof user === 'string' ? '' : (user.username || '').toLowerCase().trim();

  // Listen to primary userFriends document
  return onSnapshot(
    doc(db, 'userFriends', targetId),
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data && Array.isArray(data.friends)) {
          onChange(data.friends);
          return;
        }
      }
      // If primary not found or empty, check username fallback
      if (targetUsername) {
        getDoc(doc(db, 'userFriends', `usr_${targetUsername}`)).then((uSnap) => {
          if (uSnap.exists()) {
            const uData = uSnap.data();
            if (uData && Array.isArray(uData.friends)) {
              onChange(uData.friends);
            }
          }
        }).catch(() => { });
      }
    },
    (err) => console.warn('UserFriends listener:', err)
  );
}

function getFriendshipId(userAId: string, userBId: string): string {
  return [userAId, userBId].sort().join('_');
}

export async function firestoreAcceptFriendRequest(
  request: FriendRequest,
  requesterUser: UserAccount,
  recipientUser: UserAccount
): Promise<boolean> {
  const { db } = initFirebase();
  if (!db) return false;

  try {
    // Save mutual friendship record FIRST (single source of truth for both users)
    const friendshipId = getFriendshipId(requesterUser.id, recipientUser.id);
    await setDoc(doc(db, 'friendships', friendshipId), {
      id: friendshipId,
      user1Id: requesterUser.id,
      user2Id: recipientUser.id,
      createdAt: new Date().toISOString(),
    });

    // Then delete pending request
    await deleteDoc(doc(db, 'friendRequests', request.id));
    return true;
  } catch (err) {
    console.error('Firestore accept request error:', err);
    return false;
  }
}

// Remove friendship for BOTH users (deletes the shared record + legacy per-user lists)
export async function firestoreRemoveFriendship(userAId: string, userBId: string): Promise<boolean> {
  const { db } = initFirebase();
  if (!db) return false;

  try {
    await deleteDoc(doc(db, 'friendships', getFriendshipId(userAId, userBId)));

    // Clean legacy userFriends docs so an old list can never resurrect the friendship
    for (const [ownerId, otherId] of [[userAId, userBId], [userBId, userAId]]) {
      const ref = doc(db, 'userFriends', ownerId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const list = (snap.data().friends || []) as Friend[];
        if (list.some((f) => f.id === otherId)) {
          await setDoc(ref, { friends: list.filter((f) => f.id !== otherId) }, { merge: true });
        }
      }
    }
    return true;
  } catch (err) {
    console.error('Firestore remove friendship error:', err);
    return false;
  }
}

// One-time migration: convert old per-user userFriends lists into shared friendships records
export async function firestoreMigrateLegacyFriends(userId: string, username?: string): Promise<void> {
  const { db } = initFirebase();
  if (!db) return;

  const legacyIds = [userId];
  if (username) legacyIds.push(`usr_${username.toLowerCase().trim()}`);

  try {
    for (const legacyId of legacyIds) {
      const ref = doc(db, 'userFriends', legacyId);
      const snap = await getDoc(ref);
      if (!snap.exists()) continue;
      const list = (snap.data().friends || []) as Friend[];
      for (const f of list) {
        if (!f?.id || f.id === userId) continue;
        const fsRef = doc(db, 'friendships', getFriendshipId(userId, f.id));
        const fsSnap = await getDoc(fsRef);
        if (!fsSnap.exists()) {
          await setDoc(fsRef, {
            id: fsRef.id,
            user1Id: f.id,
            user2Id: userId,
            createdAt: new Date().toISOString(),
          });
        }
      }
      // Legacy list no longer used
      await deleteDoc(ref);
    }
  } catch (err) {
    console.error('Firestore migrate legacy friends error:', err);
  }
}

export interface LiveFriendData {
  id: string;
  account: UserAccount | null;
  status: DrinkStatus | null;
}

// Realtime friends list: reads shared friendships + each friend's live drink status
export function firestoreSubscribeFriendsLive(
  userId: string,
  onChange: (friends: LiveFriendData[]) => void
): Unsubscribe | null {
  const { db } = initFirebase();
  if (!db) return null;

  let disposed = false;
  let ready1 = false;
  let ready2 = false;
  let ids1: string[] = [];
  let ids2: string[] = [];
  const accountCache = new Map<string, UserAccount | null>();
  const statusCache = new Map<string, DrinkStatus | null>();
  const statusUnsubs = new Map<string, Unsubscribe>();
  const accountUnsubs = new Map<string, Unsubscribe>();

  const currentIds = () => Array.from(new Set([...ids1, ...ids2])).filter((id) => id && id !== userId);

  const emit = () => {
    if (disposed || !ready1 || !ready2) return;
    onChange(
      currentIds().map((id) => ({
        id,
        account: accountCache.get(id) ?? null,
        status: statusCache.get(id) ?? null,
      }))
    );
  };

  const refreshListeners = () => {
    if (disposed || !ready1 || !ready2) return;
    const ids = currentIds();

    // Stop listening to removed friends
    for (const [id, unsub] of statusUnsubs.entries()) {
      if (!ids.includes(id)) {
        unsub();
        statusUnsubs.delete(id);
        statusCache.delete(id);
      }
    }
    for (const [id, unsub] of accountUnsubs.entries()) {
      if (!ids.includes(id)) {
        unsub();
        accountUnsubs.delete(id);
        accountCache.delete(id);
      }
    }

    for (const id of ids) {
      if (!statusUnsubs.has(id)) {
        statusUnsubs.set(
          id,
          onSnapshot(
            doc(db, 'statuses', id),
            (snap) => {
              statusCache.set(id, snap.exists() ? (snap.data() as DrinkStatus) : null);
              emit();
            },
            (err) => console.warn('Friend status listener:', err)
          )
        );
      }
      // Live account listener so name/avatar changes show up immediately
      if (!accountUnsubs.has(id)) {
        accountUnsubs.set(
          id,
          onSnapshot(
            doc(db, 'accounts', id),
            (snap) => {
              accountCache.set(id, snap.exists() ? sanitizeAccount(snap.data()) : null);
              emit();
            },
            (err) => console.warn('Friend account listener:', err)
          )
        );
      }
    }
    emit();
  };

  const unsub1 = onSnapshot(
    query(collection(db, 'friendships'), where('user1Id', '==', userId)),
    (snap) => {
      ids1 = snap.docs.map((d) => d.data().user2Id as string);
      ready1 = true;
      refreshListeners();
    },
    (err) => {
      console.warn('Friendships listener (1):', err);
      ready1 = true;
      refreshListeners();
    }
  );

  const unsub2 = onSnapshot(
    query(collection(db, 'friendships'), where('user2Id', '==', userId)),
    (snap) => {
      ids2 = snap.docs.map((d) => d.data().user1Id as string);
      ready2 = true;
      refreshListeners();
    },
    (err) => {
      console.warn('Friendships listener (2):', err);
      ready2 = true;
      refreshListeners();
    }
  );

  return () => {
    disposed = true;
    unsub1();
    unsub2();
    for (const unsub of statusUnsubs.values()) unsub();
    statusUnsubs.clear();
    for (const unsub of accountUnsubs.values()) unsub();
    accountUnsubs.clear();
  };
}

export async function firestoreRejectFriendRequest(requestId: string): Promise<void> {
  const { db } = initFirebase();
  if (!db) return;

  try {
    await deleteDoc(doc(db, 'friendRequests', requestId));
  } catch (err) {
    console.error('Firestore reject request error:', err);
  }
}

// Cloud Nudges: Deliver & Realtime Listen
export async function firestoreSendNudge(nudge: NudgeEvent): Promise<void> {
  const { db } = initFirebase();
  if (!db) return;

  try {
    await setDoc(doc(db, 'nudges', nudge.id), nudge);
  } catch (err) {
    console.error('Firestore send nudge error:', err);
  }
}

export async function firestoreMarkNudgeAsRead(nudgeId: string): Promise<void> {
  const { db } = initFirebase();
  if (!db) return;

  try {
    await setDoc(doc(db, 'nudges', nudgeId), { isRead: true }, { merge: true });
  } catch (err) {
    console.error('Firestore mark nudge read error:', err);
  }
}

export function firestoreSubscribeNudges(
  user: { id: string },
  onNudge: (nudge: NudgeEvent) => void
): Unsubscribe | null {
  const { db } = initFirebase();
  if (!db) return null;

  // Only unread nudges addressed to this user
  const q = query(
    collection(db, 'nudges'),
    where('toUserId', '==', user.id),
    where('isRead', '==', false)
  );

  return onSnapshot(
    q,
    (snap) => {
      const incoming: NudgeEvent[] = [];
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          incoming.push(change.doc.data() as NudgeEvent);
        }
      });

      if (incoming.length > 0) {
        // Sort descending by timestamp, take the latest to show
        incoming.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const latestNudge = incoming[0];
        onNudge(latestNudge);

        // Immediately mark all matching unread nudges as read in Firestore
        // so they only appear ONCE and do not repeat every time the page refreshes
        incoming.forEach((n) => {
          firestoreMarkNudgeAsRead(n.id).catch(console.error);
        });
      }
    },
    (err) => console.warn('Nudges snapshot listener:', err)
  );
}

// ----------------- DRINK LOGS (RIWAYAT) -----------------

export const MAX_LOGS = 200; // enough for the 7-day chart even with many drinks a day

export async function firestoreAddLog(log: DrinkLog): Promise<void> {
  const { db } = initFirebase();
  if (!db) return;

  try {
    await setDoc(doc(db, 'drinkLogs', log.id), log);
  } catch (err) {
    console.error('Firestore add log error:', err);
  }
}

// Newest first. Sorted on the client so no composite index is needed.
export async function firestoreGetLogs(userId: string): Promise<DrinkLog[] | null> {
  const { db } = initFirebase();
  if (!db) return null;

  try {
    const snap = await getDocs(query(collection(db, 'drinkLogs'), where('userId', '==', userId)));
    return snap.docs
      .map((d) => d.data() as DrinkLog)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, MAX_LOGS);
  } catch (err) {
    console.error('Firestore get logs error:', err);
    return null;
  }
}

// ----------------- PUSH SUBSCRIPTIONS (background reminders) -----------------

export interface StoredPushSubscription {
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  timeZone: string;
  userAgent: string;
  updatedAt: string;
}

export async function firestoreSavePushSubscription(id: string, sub: StoredPushSubscription): Promise<boolean> {
  const { db } = initFirebase();
  if (!db) return false;
  try {
    await setDoc(doc(db, 'pushSubscriptions', id), sub);
    return true;
  } catch (err) {
    console.error('Firestore save push subscription error:', err);
    return false;
  }
}

export async function firestoreDeletePushSubscription(id: string): Promise<void> {
  const { db } = initFirebase();
  if (!db) return;
  try {
    await deleteDoc(doc(db, 'pushSubscriptions', id));
  } catch (err) {
    console.error('Firestore delete push subscription error:', err);
  }
}

// Live drink history, so a drink recorded on one device shows up on the others right away
export function firestoreSubscribeLogs(
  userId: string,
  onChange: (logs: DrinkLog[]) => void
): Unsubscribe | null {
  const { db } = initFirebase();
  if (!db) return null;

  return onSnapshot(
    query(collection(db, 'drinkLogs'), where('userId', '==', userId)),
    (snap) => {
      onChange(
        snap.docs
          .map((d) => d.data() as DrinkLog)
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, MAX_LOGS)
      );
    },
    (err) => console.warn('Drink logs listener:', err)
  );
}

// ----------------- CUSTOM RINGTONE (audio stored as base64 chunks) -----------------

export interface RingtoneChunk {
  userId: string;
  ringtoneId: string;
  index: number;
  data: string; // base64 piece
}

export async function firestoreSaveRingtoneChunks(userId: string, ringtoneId: string, chunks: string[]): Promise<boolean> {
  const { db } = initFirebase();
  if (!db) return false;
  try {
    // Upload all pieces in parallel (much faster than one by one)
    await Promise.all(
      chunks.map((data, index) => {
        const chunk: RingtoneChunk = { userId, ringtoneId, index, data };
        return setDoc(doc(db, 'ringtoneChunks', `${ringtoneId}_${index}`), chunk);
      })
    );
    return true;
  } catch (err) {
    console.error('Firestore save ringtone error:', err);
    return false;
  }
}

export async function firestoreLoadRingtoneChunks(ringtoneId: string): Promise<string[] | null> {
  const { db } = initFirebase();
  if (!db) return null;
  try {
    const snap = await getDocs(query(collection(db, 'ringtoneChunks'), where('ringtoneId', '==', ringtoneId)));
    if (snap.empty) return null;
    return snap.docs
      .map((d) => d.data() as RingtoneChunk)
      .sort((a, b) => a.index - b.index)
      .map((c) => c.data);
  } catch (err) {
    console.error('Firestore load ringtone error:', err);
    return null;
  }
}

export async function firestoreDeleteRingtone(ringtoneId: string): Promise<void> {
  const { db } = initFirebase();
  if (!db) return;
  try {
    const snap = await getDocs(query(collection(db, 'ringtoneChunks'), where('ringtoneId', '==', ringtoneId)));
    for (const d of snap.docs) await deleteDoc(d.ref);
  } catch (err) {
    console.error('Firestore delete ringtone error:', err);
  }
}

// Live settings, so changes made on another device (e.g. a new ringtone) apply right away
export function firestoreSubscribeSettings(
  userId: string,
  onChange: (settings: UserSettings) => void
): Unsubscribe | null {
  const { db } = initFirebase();
  if (!db) return null;
  return onSnapshot(
    doc(db, 'settings', userId),
    (snap) => {
      if (snap.exists()) onChange(snap.data() as UserSettings);
    },
    (err) => console.warn('Settings listener:', err)
  );
}
