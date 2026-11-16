import {
  DrinkLog,
  DrinkStatus,
  Friend,
  FriendRequest,
  FriendStatus,
  NudgeEvent,
  UserAccount,
  UserSettings,
} from '../types';
import {
  firestoreAddLog,
  firestoreCreateAccountUnique,
  firestoreDeleteAccount,
  firestoreGetCredential,
  firestoreGetLoginRecord,
  firestoreSaveDrinkStatus,
  isFirebaseReady,
  MAX_LOGS,
  sanitizeAccount,
} from './firebase';
import { createCredential, PasswordCredential, verifyCredential } from './password';

const STORAGE_KEYS = {
  ACCOUNTS: 'aiya_accounts_db_v2',
  ACTIVE_USER_ID: 'aiya_active_session_v2',
  CREDENTIALS: 'aiya_credentials_v1',
};

// ----------------- LOCAL PASSWORD CREDENTIALS (hashed) -----------------

function getLocalCredentials(): Record<string, PasswordCredential> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CREDENTIALS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    // fallback
  }
  return {};
}

function getLocalCredential(userId: string): PasswordCredential | null {
  return getLocalCredentials()[userId] || null;
}

function saveLocalCredential(cred: PasswordCredential): void {
  try {
    const all = getLocalCredentials();
    all[cred.userId] = cred;
    localStorage.setItem(STORAGE_KEYS.CREDENTIALS, JSON.stringify(all));
  } catch {
    // ignore
  }
}

function removeLocalCredential(userId: string): void {
  try {
    const all = getLocalCredentials();
    delete all[userId];
    localStorage.setItem(STORAGE_KEYS.CREDENTIALS, JSON.stringify(all));
  } catch {
    // ignore
  }
}

// Grace period for "Waktunya minum" vs "Terlambat" (5 minutes)
export const GRACE_PERIOD_MS = 5 * 60 * 1000;
// Nudge cooldown (15 minutes)
// Friend code shown to users is just the username (old codes were "AIYA-USERNAME")
export function toFriendCode(code?: string | null): string {
  return (code || '').replace(/^AIYA-/i, '').toLowerCase();
}

export const NUDGE_COOLDOWN_MS = 15 * 60 * 1000;

// Daily water goal defaults
export const DEFAULT_DAILY_TARGET_ML = 2000;
export const DEFAULT_GLASS_ML = 250;

// Demo accounts have been removed. These old IDs are purged from browsers that still have them cached.
export const SEED_ACCOUNTS: UserAccount[] = [];
const REMOVED_DEMO_IDS = new Set(['user-001', 'user-002', 'user-003', 'user-004']);
const REMOVED_DEMO_USERNAMES = new Set(['rina', 'sari', 'budi', 'andi']);

function isRemovedDemoAccount(a: UserAccount): boolean {
  return REMOVED_DEMO_IDS.has(a.id) || REMOVED_DEMO_USERNAMES.has((a.username || '').toLowerCase());
}

export const DEFAULT_USER: UserSettings = {
  userId: 'user-001',
  name: 'Pengguna',
  userCode: '',
  intervalMinutes: 180, // 3 hours
  snoozeMinutes: 10,    // 10 minutes
  dailyTargetMl: DEFAULT_DAILY_TARGET_ML,
  glassMl: DEFAULT_GLASS_ML,
  soundType: 'river',
  volume: 0.8,
  quietHoursEnabled: false,
  quietStart: '22:00',
  quietEnd: '07:00',
  isOnboarded: true,
};

// ----------------- ACCOUNTS MANAGEMENT -----------------

export function getStoredAccounts(): UserAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACCOUNTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        let changed = false;
        const cleaned = (parsed as (UserAccount & { password?: string })[])
          .filter((a) => {
            const keep = a && !isRemovedDemoAccount(a);
            if (!keep) changed = true;
            return keep;
          })
          .map((a) => {
            // Old caches stored the plain-text password: hash it and drop it
            if (typeof a.password === 'string') {
              changed = true;
              if (a.password && !getLocalCredential(a.id)) {
                saveLocalCredential(createCredential(a.id, a.password));
              }
            }
            return sanitizeAccount(a);
          });
        if (changed) {
          saveStoredAccounts(cleaned);
        }
        return cleaned;
      }
    }
  } catch {
    // fallback
  }
  return [];
}

export function saveStoredAccounts(accounts: UserAccount[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts.map(sanitizeAccount)));
  } catch {
    // ignore
  }
}

export function getActiveSessionUserId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_USER_ID);
  } catch {
    return null;
  }
}

export function setActiveSessionUserId(userId: string | null): void {
  try {
    if (userId) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_USER_ID, userId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_USER_ID);
    }
  } catch {
    // ignore
  }
}

export function getActiveUser(): UserAccount | null {
  const activeId = getActiveSessionUserId();
  if (!activeId) return null;
  const accounts = getStoredAccounts();
  return accounts.find((acc) => acc.id === activeId) || null;
}

export async function registerAccount(
  usernameRaw: string,
  passwordRaw: string
): Promise<{ success: boolean; message: string; user?: UserAccount }> {
  const username = usernameRaw.trim().toLowerCase();
  const password = passwordRaw.trim();

  if (!username) {
    return { success: false, message: 'Username tidak boleh kosong' };
  }
  if (username.length < 3) {
    return { success: false, message: 'Username minimal 3 karakter' };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return { success: false, message: 'Username hanya boleh huruf, angka, dan underscore (_)' };
  }
  if (!password) {
    return { success: false, message: 'Password tidak boleh kosong' };
  }
  if (password.length < 3) {
    return { success: false, message: 'Password minimal 3 karakter' };
  }

  const accounts = getStoredAccounts();
  const existing = accounts.find((a) => a.username.toLowerCase() === username);
  if (existing) {
    return { success: false, message: 'Username telah digunakan' };
  }

  const userId = `user-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const displayName = username.charAt(0).toUpperCase() + username.slice(1);
  const userCode = username; // friend code is simply the username

  const newAccount: UserAccount = {
    id: userId,
    username,
    name: displayName,
    userCode,
    avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`,
    createdAt: new Date().toISOString(),
  };

  // Initialize Default Settings for this user
  const newSettings: UserSettings = {
    userId,
    name: displayName,
    userCode,
    intervalMinutes: 180,
    snoozeMinutes: 10,
    dailyTargetMl: DEFAULT_DAILY_TARGET_ML,
    glassMl: DEFAULT_GLASS_ML,
    soundType: 'river',
    volume: 0.8,
    quietHoursEnabled: false,
    quietStart: '22:00',
    quietEnd: '07:00',
    isOnboarded: true,
  };

  // Initialize Default Drink Status
  const now = Date.now();
  const nextTime = new Date(now + 180 * 60 * 1000).toISOString();
  const initialStatus: DrinkStatus = {
    userId,
    lastDrinkAt: new Date(now - 15 * 60 * 1000).toISOString(),
    dueAt: nextTime,
    nextAlarmAt: nextTime,
  };

  const credential = createCredential(userId, password);

  // Create in cloud FIRST with a unique username reservation.
  // If the cloud is unreachable, do NOT create a local-only account (it would be invisible to friends).
  if (isFirebaseReady()) {
    const result = await firestoreCreateAccountUnique(newAccount, newSettings, initialStatus, credential);
    if (result === 'taken') {
      return { success: false, message: 'Username telah digunakan' };
    }
    if (result === 'error') {
      return {
        success: false,
        message: 'Gagal terhubung ke database cloud. Periksa koneksi internet lalu coba lagi.',
      };
    }
  }

  // Save locally only after the cloud accepted the account
  saveStoredAccounts([...accounts, newAccount]);
  saveLocalCredential(credential);
  saveStoredSettings(newSettings, userId);
  saveStoredDrinkStatus(initialStatus, userId);

  // New user starts with EMPTY friend list and requests (must be approved two-way!)
  saveStoredFriends([], userId);
  saveStoredRequests([], userId);

  // Set active session
  setActiveSessionUserId(userId);

  return {
    success: true,
    message: `Pendaftaran berhasil! Selamat datang, ${displayName}.`,
    user: newAccount,
  };
}

export async function loginAccount(
  usernameRaw: string,
  passwordRaw: string
): Promise<{ success: boolean; message: string; user?: UserAccount }> {
  const username = usernameRaw.trim().toLowerCase();
  const password = passwordRaw.trim();

  if (!username || !password) {
    return { success: false, message: 'Masukkan username dan password.' };
  }

  // 1. Check local cache (hashed credential saved on this device)
  const accounts = getStoredAccounts();
  const local = accounts.find((a) => a.username.toLowerCase() === username);
  let user = local && verifyCredential(getLocalCredential(local.id), password) ? local : undefined;

  // 2. Otherwise check the cloud (also moves old plain-text passwords to hashed credentials)
  if (!user && isFirebaseReady()) {
    try {
      const record = await firestoreGetLoginRecord(username);
      if (record && record.credential && verifyCredential(record.credential, password)) {
        user = record.account;
        saveLocalCredential(record.credential);
        saveStoredAccounts([...accounts.filter((a) => a.id !== record.account.id), record.account]);
      }
    } catch (err) {
      console.warn('Firestore login check warning:', err);
    }
  }

  if (!user) {
    return { success: false, message: 'Username atau password salah.' };
  }

  setActiveSessionUserId(user.id);
  return {
    success: true,
    message: `Selamat datang kembali, ${user.name}!`,
    user,
  };
}

export function logoutUser(): void {
  setActiveSessionUserId(null);
}

export async function deleteAccount(
  userId: string,
  passwordConfirm: string
): Promise<{ success: boolean; message: string }> {
  const accounts = getStoredAccounts();
  const account = accounts.find((a) => a.id === userId);

  if (!account) {
    return { success: false, message: 'Akun tidak ditemukan.' };
  }

  const pw = passwordConfirm.trim();
  let passwordOk = verifyCredential(getLocalCredential(userId), pw);
  if (!passwordOk && isFirebaseReady()) {
    passwordOk = verifyCredential(await firestoreGetCredential(userId), pw);
  }
  if (!passwordOk) {
    return { success: false, message: 'Password salah. Konfirmasi penghapusan gagal.' };
  }

  // 1. Remove from all friends' lists (mutual cleanup)
  const myFriends = getStoredFriends(userId);
  for (const f of myFriends) {
    removeMutualFriendship(userId, f.id);
  }

  // 2. Remove all personal keys from localStorage
  try {
    localStorage.removeItem(`aiya_settings_${userId}`);
    localStorage.removeItem(`aiya_status_${userId}`);
    localStorage.removeItem(`aiya_friends_${userId}`);
    localStorage.removeItem(`aiya_requests_${userId}`);
    localStorage.removeItem(`aiya_logs_${userId}`);
    localStorage.removeItem(`aiya_nudges_${userId}`);
  } catch {
    // ignore
  }

  removeLocalCredential(userId);

  // 3. Remove from accounts list
  const remainingAccounts = accounts.filter((a) => a.id !== userId);
  saveStoredAccounts(remainingAccounts);

  // 4. Delete from Firestore if connected
  if (isFirebaseReady()) {
    try {
      await firestoreDeleteAccount(userId);
    } catch (err) {
      console.warn('Firestore delete account notice:', err);
    }
  }

  // 5. Clear active session
  logoutUser();

  return {
    success: true,
    message: `Akun @${account.username} berhasil dihapus permanen.`,
  };
}

// ----------------- PER-USER DATA STORAGE -----------------

export function getStoredSettings(targetUserId?: string): UserSettings {
  const uid = targetUserId || getActiveSessionUserId() || 'user-001';
  const accounts = getStoredAccounts();
  const account = accounts.find((a) => a.id === uid);

  const defaults: UserSettings = {
    userId: uid,
    name: account?.name || DEFAULT_USER.name,
    userCode: account?.userCode || DEFAULT_USER.userCode,
    intervalMinutes: 180,
    snoozeMinutes: 10,
    dailyTargetMl: DEFAULT_DAILY_TARGET_ML,
    glassMl: DEFAULT_GLASS_ML,
    soundType: 'river',
    volume: 0.8,
    quietHoursEnabled: false,
    quietStart: '22:00',
    quietEnd: '07:00',
    isOnboarded: true,
  };

  try {
    const raw = localStorage.getItem(`aiya_settings_${uid}`);
    // Older saved settings may miss newer fields (e.g. daily target), so fill them from defaults
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {
    // fallback
  }
  return defaults;
}

export function saveStoredSettings(settings: UserSettings, targetUserId?: string): void {
  const uid = targetUserId || settings.userId || getActiveSessionUserId() || 'user-001';
  try {
    localStorage.setItem(`aiya_settings_${uid}`, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function getStoredDrinkStatus(targetUserId?: string): DrinkStatus {
  const uid = targetUserId || getActiveSessionUserId() || 'user-001';
  try {
    const raw = localStorage.getItem(`aiya_status_${uid}`);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  const now = Date.now();
  const settings = getStoredSettings(uid);
  const nextTime = new Date(now + settings.intervalMinutes * 60 * 1000).toISOString();
  return {
    userId: uid,
    lastDrinkAt: new Date(now - 10 * 60 * 1000).toISOString(),
    dueAt: nextTime,
    nextAlarmAt: nextTime,
  };
}

export function saveStoredDrinkStatus(status: DrinkStatus, targetUserId?: string): void {
  const uid = targetUserId || status.userId || getActiveSessionUserId() || 'user-001';
  try {
    localStorage.setItem(`aiya_status_${uid}`, JSON.stringify(status));
  } catch {
    // ignore
  }

  // Push the active user's own status to cloud so friends see it live
  if (uid === getActiveSessionUserId() && isFirebaseReady()) {
    firestoreSaveDrinkStatus(uid, { ...status, userId: uid }).catch(() => { });
  }
}

export function getStoredLogs(targetUserId?: string): DrinkLog[] {
  const uid = targetUserId || getActiveSessionUserId() || 'user-001';
  try {
    const raw = localStorage.getItem(`aiya_logs_${uid}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Drop old placeholder entries and the retired "BELUM" action
        return (parsed as DrinkLog[]).filter(
          (l) =>
            l &&
            (l.action === 'SUDAH' || l.action === 'MANUAL') &&
            l.id !== `log-${uid}-1` &&
            l.id !== `log-${uid}-2`
        );
      }
    }
  } catch {
    // fallback
  }
  return [];
}

export function saveStoredLogs(logs: DrinkLog[], targetUserId?: string): void {
  const uid = targetUserId || getActiveSessionUserId() || 'user-001';
  try {
    localStorage.setItem(`aiya_logs_${uid}`, JSON.stringify(logs.slice(0, MAX_LOGS)));
  } catch {
    // ignore
  }
}

// Merge cloud + local logs by id, newest first
export function mergeLogs(a: DrinkLog[], b: DrinkLog[]): DrinkLog[] {
  const map = new Map<string, DrinkLog>();
  [...a, ...b].forEach((l) => map.set(l.id, l));
  return Array.from(map.values())
    .sort((x, y) => new Date(y.timestamp).getTime() - new Date(x.timestamp).getTime())
    .slice(0, MAX_LOGS);
}

export function addStoredLog(log: Omit<DrinkLog, 'id'>, targetUserId?: string): DrinkLog {
  const uid = targetUserId || log.userId || getActiveSessionUserId() || 'user-001';
  const newLog: DrinkLog = {
    ...log,
    userId: uid,
    id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
  };
  saveStoredLogs([newLog, ...getStoredLogs(uid)], uid);

  // Sync to cloud so history follows the user across devices
  if (isFirebaseReady()) {
    firestoreAddLog(newLog).catch(() => {});
  }
  return newLog;
}

function isSameLocalDay(aMs: number, bMs: number): boolean {
  return new Date(aMs).toDateString() === new Date(bMs).toDateString();
}

export function logAmountMl(log: DrinkLog): number {
  return typeof log.amountMl === 'number' && log.amountMl > 0 ? log.amountMl : DEFAULT_GLASS_ML;
}

// Total water drunk on the same calendar day as nowMs
export function getIntakeForDayMl(logs: DrinkLog[], nowMs = Date.now()): number {
  return logs
    .filter((l) => isSameLocalDay(new Date(l.timestamp).getTime(), nowMs))
    .reduce((sum, l) => sum + logAmountMl(l), 0);
}

// ----------------- MUTUAL RECIPROCAL FRIENDS -----------------

export function getStoredFriends(targetUserId?: string): Friend[] {
  const uid = targetUserId || getActiveSessionUserId() || 'user-001';
  let list: Friend[] = [];
  try {
    const raw = localStorage.getItem(`aiya_friends_${uid}`);
    if (raw) {
      list = JSON.parse(raw);
    }
  } catch {
    list = [];
  }

  // TWO-WAY MUTUAL VERIFICATION (Section 10.4 of PDF):
  // When running strictly offline without Firebase, verify against other local account.
  // When connected to Cloud Firebase, mutual friendship is already verified and synced from cloud.
  let mutualList = list;
  if (!isFirebaseReady()) {
    mutualList = list.filter((f) => {
      try {
        const otherRaw = localStorage.getItem(`aiya_friends_${f.id}`);
        if (!otherRaw) return false;
        const otherFriends: Friend[] = JSON.parse(otherRaw);
        return Array.isArray(otherFriends) && otherFriends.some((of) => of.id === uid);
      } catch {
        return false;
      }
    });

    // Permanently clean unreciprocal entries from localStorage if found in offline mode
    if (mutualList.length !== list.length) {
      try {
        localStorage.setItem(`aiya_friends_${uid}`, JSON.stringify(mutualList));
      } catch {
        // ignore
      }
    }
  }

  // DYNAMIC LIVE SYNC: update friend's dueAt & lastDrinkAt from their actual live status
  const allAccounts = getStoredAccounts();
  const syncedList = mutualList.map((f) => {
    const matchedAccount = allAccounts.find(
      (a) => a.id === f.id || a.userCode.toUpperCase() === f.userCode.toUpperCase()
    );
    if (matchedAccount) {
      if (!isFirebaseReady()) {
        const realStatus = getStoredDrinkStatus(matchedAccount.id);
        return {
          ...f,
          name: matchedAccount.name,
          userCode: matchedAccount.userCode,
          avatar: matchedAccount.avatar || f.avatar,
          dueAt: realStatus.dueAt,
          lastDrinkAt: realStatus.lastDrinkAt,
        };
      }
      return {
        ...f,
        name: matchedAccount.name,
        userCode: matchedAccount.userCode,
        avatar: matchedAccount.avatar || f.avatar,
      };
    }
    return f;
  });

  return syncedList;
}

export function saveStoredFriends(friends: Friend[], targetUserId?: string): void {
  const uid = targetUserId || getActiveSessionUserId() || 'user-001';
  try {
    localStorage.setItem(`aiya_friends_${uid}`, JSON.stringify(friends));
  } catch {
    // ignore
  }
}

// ----------------- FRIEND REQUESTS (PERMINTAAN PERTEMANAN) -----------------

export function getStoredRequests(targetUserId?: string): FriendRequest[] {
  const uid = targetUserId || getActiveSessionUserId() || 'user-001';
  try {
    const raw = localStorage.getItem(`aiya_requests_${uid}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // fallback
  }
  return [];
}

export function saveStoredRequests(requests: FriendRequest[], targetUserId?: string): void {
  const uid = targetUserId || getActiveSessionUserId() || 'user-001';
  try {
    localStorage.setItem(`aiya_requests_${uid}`, JSON.stringify(requests));
  } catch {
    // ignore
  }
}

// Get outgoing requests sent by this user to others that are pending
export function getOutgoingRequests(userId: string): FriendRequest[] {
  const allAccounts = getStoredAccounts();
  const outgoing: FriendRequest[] = [];

  for (const acc of allAccounts) {
    if (acc.id === userId) continue;
    const reqs = getStoredRequests(acc.id);
    for (const r of reqs) {
      if (r.fromUserId === userId && r.status === 'PENDING') {
        outgoing.push(r);
      }
    }
  }
  return outgoing;
}

// Send Friend Request from one user to another
export function sendFriendRequest(
  fromUser: UserAccount,
  targetAccount: UserAccount
): { success: boolean; message: string; request?: FriendRequest; acceptedRequest?: FriendRequest } {
  if (fromUser.id === targetAccount.id) {
    return { success: false, message: 'Tidak dapat menambahkan diri sendiri sebagai teman.' };
  }

  // Check if already mutual friends
  const currentFriends = getStoredFriends(fromUser.id);
  if (currentFriends.some((f) => f.id === targetAccount.id)) {
    return { success: false, message: `${targetAccount.name} sudah menjadi temanmu.` };
  }

  // Check if target user has already sent a request to fromUser
  const myIncoming = getStoredRequests(fromUser.id);
  const existingIncoming = myIncoming.find(
    (r) => r.fromUserId === targetAccount.id && r.status === 'PENDING'
  );
  if (existingIncoming) {
    // Mutual request! Auto-accept into mutual friendship
    acceptFriendRequest(fromUser, existingIncoming.id, existingIncoming, targetAccount);
    return {
      success: true,
      acceptedRequest: existingIncoming,
      message: `${targetAccount.name} juga telah mengirimkan permintaan kepadamu. Sekarang kalian resmi berteman!`,
    };
  }

  // Check if fromUser already sent a pending request to target
  const targetIncoming = getStoredRequests(targetAccount.id);
  const alreadySent = targetIncoming.some(
    (r) => r.fromUserId === fromUser.id && r.status === 'PENDING'
  );
  if (alreadySent) {
    return {
      success: false,
      message: `Permintaan pertemanan sudah dikirim ke ${targetAccount.name}. Menunggu persetujuan darinya.`,
    };
  }

  // Create new FriendRequest
  const newReq: FriendRequest = {
    id: `req-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    fromUserId: fromUser.id,
    fromUsername: fromUser.username.toLowerCase(),
    fromName: fromUser.name,
    fromCode: fromUser.userCode,
    fromAvatar: fromUser.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${fromUser.username}`,
    toUserId: targetAccount.id,
    toUsername: targetAccount.username.toLowerCase(),
    status: 'PENDING',
    timestamp: new Date().toISOString(),
  };

  saveStoredRequests([newReq, ...targetIncoming], targetAccount.id);

  return {
    success: true,
    message: `Permintaan pertemanan berhasil dikirim ke ${targetAccount.name}! Menunggu persetujuan.`,
    request: newReq,
  };
}

// Accept friend request -> establishes TWO-WAY reciprocal friendship!
export function acceptFriendRequest(
  recipientUser: UserAccount,
  requestId: string,
  providedReq?: FriendRequest,
  providedRequester?: UserAccount
): { success: boolean; message: string; friend?: Friend } {
  const myRequests = getStoredRequests(recipientUser.id);
  const req = providedReq || myRequests.find((r) => r.id === requestId);
  if (!req) {
    return { success: false, message: 'Permintaan tidak ditemukan.' };
  }

  const allAccounts = getStoredAccounts();
  const requester =
    providedRequester ||
    allAccounts.find(
      (a) =>
        a.id === req.fromUserId ||
        (req.fromUsername && a.username.toLowerCase() === req.fromUsername.toLowerCase())
    );
  if (!requester) {
    return { success: false, message: 'Akun pengirim tidak ditemukan.' };
  }

  const requesterStatus = getStoredDrinkStatus(requester.id);
  const recipientStatus = getStoredDrinkStatus(recipientUser.id);

  // 1. Friend item for recipient (containing requester)
  const friendForRecipient: Friend = {
    id: requester.id,
    name: requester.name,
    userCode: requester.userCode,
    avatar: requester.avatar || req.fromAvatar,
    lastDrinkAt: requesterStatus.lastDrinkAt,
    dueAt: requesterStatus.dueAt,
    lastNudgeAt: null,
  };

  // 2. Friend item for requester (containing recipient)
  const friendForRequester: Friend = {
    id: recipientUser.id,
    name: recipientUser.name,
    userCode: recipientUser.userCode,
    avatar: recipientUser.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${recipientUser.username}`,
    lastDrinkAt: recipientStatus.lastDrinkAt,
    dueAt: recipientStatus.dueAt,
    lastNudgeAt: null,
  };

  // 3. Save to recipient's friends list
  const recipientFriends = getStoredFriends(recipientUser.id);
  const updatedRecipientFriends = [
    friendForRecipient,
    ...recipientFriends.filter((f) => f.id !== requester.id),
  ];
  saveStoredFriends(updatedRecipientFriends, recipientUser.id);

  // 4. Save to requester's friends list (TWO-WAY RECIPROCAL PERSISTENCE)
  const requesterFriends = getStoredFriends(requester.id);
  const updatedRequesterFriends = [
    friendForRequester,
    ...requesterFriends.filter((f) => f.id !== recipientUser.id),
  ];
  saveStoredFriends(updatedRequesterFriends, requester.id);

  // 5. Remove request from recipient's inbox
  saveStoredRequests(myRequests.filter((r) => r.id !== requestId), recipientUser.id);

  return {
    success: true,
    message: `${requester.name} sekarang telah resmi menjadi temanmu!`,
    friend: friendForRecipient,
  };
}

// Reject friend request
export function rejectFriendRequest(
  recipientUserId: string,
  requestId: string
): { success: boolean; message: string } {
  const myRequests = getStoredRequests(recipientUserId);
  const updated = myRequests.filter((r) => r.id !== requestId);
  saveStoredRequests(updated, recipientUserId);
  return { success: true, message: 'Permintaan pertemanan ditolak.' };
}

// Remove mutual friendship cleanly from both accounts
export function removeMutualFriendship(userAId: string, userBId: string): void {
  const friendsA = getStoredFriends(userAId);
  saveStoredFriends(friendsA.filter((f) => f.id !== userBId), userAId);

  const friendsB = getStoredFriends(userBId);
  saveStoredFriends(friendsB.filter((f) => f.id !== userAId), userBId);
}

// ----------------- NUDGES -----------------

export function getStoredNudges(targetUserId?: string): NudgeEvent[] {
  const uid = targetUserId || getActiveSessionUserId() || 'user-001';
  try {
    const raw = localStorage.getItem(`aiya_nudges_${uid}`);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return [];
}

export function saveStoredNudges(nudges: NudgeEvent[], targetUserId?: string): void {
  const uid = targetUserId || getActiveSessionUserId() || 'user-001';
  try {
    localStorage.setItem(`aiya_nudges_${uid}`, JSON.stringify(nudges));
  } catch {
    // ignore
  }
}

export function markStoredNudgeAsRead(nudgeId: string, targetUserId?: string): void {
  const uid = targetUserId || getActiveSessionUserId() || 'user-001';
  try {
    const list = getStoredNudges(uid);
    const updated = list.map((n) => (n.id === nudgeId ? { ...n, isRead: true } : n));
    saveStoredNudges(updated, uid);
  } catch {
    // ignore
  }
}

// Deliver nudge to target user's nudge inbox
export function deliverNudgeToUser(
  fromUser: { id: string; name: string; username?: string },
  toUserId: string,
  nowIso: string,
  toUsername?: string
): NudgeEvent {
  const nudgeEvent: NudgeEvent = {
    id: `nudge-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    fromUserId: fromUser.id,
    fromUsername: fromUser.username?.toLowerCase(),
    fromName: fromUser.name,
    toUserId,
    toUsername: toUsername?.toLowerCase(),
    timestamp: nowIso,
    message: `${fromUser.name} mengingatkanmu untuk minum.`,
    isRead: false,
  };

  const recipientNudges = getStoredNudges(toUserId);
  saveStoredNudges([nudgeEvent, ...recipientNudges], toUserId);

  return nudgeEvent;
}

// ----------------- CALCULATIONS & FORMATTERS -----------------

// Calculate friend status according to Section 17.3
export function computeFriendStatus(dueAtIso: string, currentTimeMs = Date.now()): FriendStatus {
  const dueMs = new Date(dueAtIso).getTime();
  if (currentTimeMs < dueMs) {
    return 'SUDAH_MINUM';
  }
  if (currentTimeMs - dueMs < GRACE_PERIOD_MS) {
    return 'WAKTUNYA_MINUM';
  }
  return 'TERLAMBAT';
}

// Format ISO string to HH:mm
export function formatTimeHM(isoString: string | null | undefined): string {
  if (!isoString) return '--:--';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '--:--';
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '--:--';
  }
}

// Format relative remaining time (e.g. "dalam 2 jam 41 menit" or "lewat 12 menit")
export function formatRemainingTime(targetIso: string, nowMs = Date.now()): {
  text: string;
  isOverdue: boolean;
  totalSeconds: number;
} {
  const targetMs = new Date(targetIso).getTime();
  const diffMs = targetMs - nowMs;
  const totalSeconds = Math.round(diffMs / 1000);

  if (diffMs <= 0) {
    const overdueMinutes = Math.abs(Math.floor(diffMs / (60 * 1000)));
    if (overdueMinutes === 0) {
      return { text: 'Waktunya minum sekarang!', isOverdue: true, totalSeconds };
    }
    const hours = Math.floor(overdueMinutes / 60);
    const mins = overdueMinutes % 60;
    if (hours > 0) {
      return { text: `Terlambat ${hours} jam ${mins} menit`, isOverdue: true, totalSeconds };
    }
    return { text: `Terlambat ${mins} menit`, isOverdue: true, totalSeconds };
  }

  const remainingMinutes = Math.floor(diffMs / (60 * 1000));
  const hours = Math.floor(remainingMinutes / 60);
  const mins = remainingMinutes % 60;

  if (hours > 0) {
    return {
      text: mins > 0 ? `dalam ${hours} jam ${mins} menit` : `dalam ${hours} jam`,
      isOverdue: false,
      totalSeconds,
    };
  }

  if (mins > 0) {
    return { text: `dalam ${mins} menit`, isOverdue: false, totalSeconds };
  }

  return { text: `dalam ${Math.max(0, totalSeconds)} detik`, isOverdue: false, totalSeconds };
}
