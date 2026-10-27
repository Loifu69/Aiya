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
  Unsubscribe,
} from 'firebase/firestore';
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

// Cloud Account: Register
export async function firestoreRegisterAccount(
  account: UserAccount,
  settings: UserSettings,
  status: DrinkStatus
): Promise<boolean> {
  const { db } = initFirebase();
  if (!db) return false;

  try {
    // Save account
    await setDoc(doc(db, 'accounts', account.id), account);
    // Save settings
    await setDoc(doc(db, 'settings', account.id), settings);
    // Save status
    await setDoc(doc(db, 'statuses', account.id), status);
    return true;
  } catch (err) {
    console.error('Firestore register error:', err);
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
      return snap.docs[0].data() as UserAccount;
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
    return snap.docs.map((d) => d.data() as UserAccount);
  } catch (err) {
    console.error('Firestore get all accounts error:', err);
    return [];
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

export function firestoreSubscribeRequests(
  userId: string,
  onChange: (reqs: FriendRequest[]) => void
): Unsubscribe | null {
  const { db } = initFirebase();
  if (!db) return null;

  const q = query(
    collection(db, 'friendRequests'),
    where('toUserId', '==', userId),
    where('status', '==', 'PENDING')
  );

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as FriendRequest);
      onChange(list);
    },
    (err) => console.warn('Requests snapshot listener:', err)
  );
}

export async function firestoreAcceptFriendRequest(
  request: FriendRequest,
  requesterUser: UserAccount,
  recipientUser: UserAccount
): Promise<void> {
  const { db } = initFirebase();
  if (!db) return;

  try {
    // Delete pending request
    await deleteDoc(doc(db, 'friendRequests', request.id));

    // Save mutual friendship record
    const friendshipId = [requesterUser.id, recipientUser.id].sort().join('_');
    await setDoc(doc(db, 'friendships', friendshipId), {
      id: friendshipId,
      user1Id: requesterUser.id,
      user2Id: recipientUser.id,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Firestore accept request error:', err);
  }
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

export function firestoreSubscribeNudges(
  userId: string,
  onNudge: (nudge: NudgeEvent) => void
): Unsubscribe | null {
  const { db } = initFirebase();
  if (!db) return null;

  const q = query(
    collection(db, 'nudges'),
    where('toUserId', '==', userId),
    where('isRead', '==', false)
  );

  return onSnapshot(
    q,
    (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          onNudge(change.doc.data() as NudgeEvent);
        }
      });
    },
    (err) => console.warn('Nudges snapshot listener:', err)
  );
}
