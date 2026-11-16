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
  limit,
  deleteDoc,
  deleteField,
  runTransaction,
  Unsubscribe,
} from 'firebase/firestore';
import { Auth, getAuth, onAuthStateChanged, signInWithCustomToken, signOut, User } from 'firebase/auth';
import {
  DrinkLog,
  DrinkStatus,
  Friend,
  FriendRequest,
  NudgeEvent,
  UserAccount,
  UserSettings,
} from '../types';

// Firebase web config (public values; access is controlled by Firestore rules + Auth)
const env = import.meta.env;

export interface FirebaseCustomConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

// Default configuration from Firebase Project "Aiya"
const DEFAULT_FIREBASE_CONFIG: FirebaseCustomConfig = {
  apiKey: "AIzaSyArwGQDf6kUuD5elaqswIy96HNIFDW53sQ",
  authDomain: "aiya-60746.firebaseapp.com",
  projectId: "aiya-60746",
  storageBucket: "aiya-60746.firebasestorage.app",
  messagingSenderId: "388168705041",
  appId: "1:388168705041:web:a6384b8809a0ed6848fdb0",
};

// Env vars (VITE_FIREBASE_*) override the built-in project config
function firebaseConfig(): FirebaseCustomConfig {
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
  return DEFAULT_FIREBASE_CONFIG;
}

let appInstance: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;

export function initFirebase(): { app: FirebaseApp | null; db: Firestore | null } {
  if (dbInstance) return { app: appInstance, db: dbInstance };

  const config = firebaseConfig();
  if (!config.projectId || !config.apiKey) {
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

// ----------------- FIREBASE AUTH (signed in with a custom token from api/auth.ts) -----------------

export function firebaseAuth(): Auth | null {
  const { app } = initFirebase();
  return app ? getAuth(app) : null;
}

export function currentAuthUid(): string | null {
  return firebaseAuth()?.currentUser?.uid ?? null;
}

export async function signInWithServerToken(token: string): Promise<void> {
  const auth = firebaseAuth();
  if (!auth) throw new Error('Firebase is not configured');
  await signInWithCustomToken(auth, token);
}

export async function firebaseSignOut(): Promise<void> {
  const auth = firebaseAuth();
  if (auth) await signOut(auth).catch(() => {});
}

// Called with the signed-in user (or null) once the saved session is restored, and on every change
export function onFirebaseUser(callback: (user: User | null) => void): () => void {
  const auth = firebaseAuth();
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

export async function currentIdToken(): Promise<string | null> {
  const user = firebaseAuth()?.currentUser;
  return user ? user.getIdToken() : null;
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

// Make sure the signed-in user's settings and status docs exist (older accounts / first login).
// Accounts, usernames and credentials are created by the server (api/auth.ts).
export async function firestoreEnsureUserDocs(
  userId: string,
  settings: UserSettings,
  status: DrinkStatus
): Promise<void> {
  const { db } = initFirebase();
  if (!db) return;
  try {
    const settingsRef = doc(db, 'settings', userId);
    if (!(await getDoc(settingsRef)).exists()) await setDoc(settingsRef, { ...settings, userId });
    const statusRef = doc(db, 'statuses', userId);
    if (!(await getDoc(statusRef)).exists()) await setDoc(statusRef, { ...status, userId });
  } catch (err) {
    console.error('Firestore ensure user docs error:', err);
  }
}

// One account by id (allowed for any signed-in user: friends need names/avatars)
export async function firestoreGetAccount(userId: string): Promise<UserAccount | null> {
  const { db } = initFirebase();
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, 'accounts', userId));
    return snap.exists() ? sanitizeAccount(snap.data()) : null;
  } catch (err) {
    console.error('Firestore get account error:', err);
    return null;
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
      where('username', '==', username.toLowerCase().trim()),
      limit(1)
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

// Today's intake on the status doc (read by the reminder server and by friends)
export async function firestoreUpdateIntake(
  userId: string,
  intake: { intakeDate: string; intakeMl: number; targetMl: number }
): Promise<void> {
  const { db } = initFirebase();
  if (!db) return;
  try {
    await setDoc(doc(db, 'statuses', userId), intake, { merge: true });
  } catch (err) {
    console.error('Firestore update intake error:', err);
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
      user1Id: requesterUser.id, // sent the request
      user2Id: recipientUser.id, // accepted it (the signed-in user)
      requestId: request.id,
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

    return true;
  } catch (err) {
    console.error('Firestore remove friendship error:', err);
    return false;
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

export async function firestoreAddLog(log: DrinkLog): Promise<boolean> {
  const { db } = initFirebase();
  if (!db) return false;

  try {
    await setDoc(doc(db, 'drinkLogs', log.id), log);
    return true;
  } catch (err) {
    console.error('Firestore add log error:', err);
    return false;
  }
}

export async function firestoreDeleteLog(logId: string): Promise<boolean> {
  const { db } = initFirebase();
  if (!db) return false;
  try {
    await deleteDoc(doc(db, 'drinkLogs', logId));
    return true;
  } catch (err) {
    console.error('Firestore delete log error:', err);
    return false;
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

// Live drink history for the given days only (e.g. the last 30), so reads stay small
// no matter how long the account has been used. '==' + 'in' needs no composite index.
export const HISTORY_DAYS = 30; // Firestore 'in' accepts at most 30 values

export function firestoreSubscribeLogs(
  userId: string,
  dayKeys: string[],
  onChange: (logs: DrinkLog[]) => void
): Unsubscribe | null {
  const { db } = initFirebase();
  if (!db) return null;

  return onSnapshot(
    query(collection(db, 'drinkLogs'), where('userId', '==', userId), where('dayKey', 'in', dayKeys.slice(0, HISTORY_DAYS))),
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

// One-time fix for logs saved before 'dayKey' existed, so they show up in the query above
export async function firestoreBackfillLogDayKeys(userId: string, toDayKey: (ms: number) => string): Promise<number> {
  const { db } = initFirebase();
  if (!db) return 0;
  const snap = await getDocs(query(collection(db, 'drinkLogs'), where('userId', '==', userId)));
  const missing = snap.docs.filter((d) => !d.data().dayKey);
  await Promise.all(
    missing.map((d) =>
      setDoc(d.ref, { dayKey: toDayKey(new Date(String(d.data().timestamp)).getTime()) }, { merge: true })
    )
  );
  return missing.length;
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
    const uid = currentAuthUid();
    if (!uid) return null;
    const snap = await getDocs(
      query(collection(db, 'ringtoneChunks'), where('userId', '==', uid), where('ringtoneId', '==', ringtoneId))
    );
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
    const uid = currentAuthUid();
    if (!uid) return;
    const snap = await getDocs(
      query(collection(db, 'ringtoneChunks'), where('userId', '==', uid), where('ringtoneId', '==', ringtoneId))
    );
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
