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
  firestoreFindAccountByUsername,
  firestoreGetAllAccounts,
  firestoreRegisterAccount,
  isFirebaseReady,
} from './firebase';

const STORAGE_KEYS = {
  ACCOUNTS: 'aiya_accounts_db_v2',
  ACTIVE_USER_ID: 'aiya_active_session_v2',
};

// Grace period for "Waktunya minum" vs "Terlambat" (5 minutes)
export const GRACE_PERIOD_MS = 5 * 60 * 1000;
// Nudge cooldown (15 minutes)
export const NUDGE_COOLDOWN_MS = 15 * 60 * 1000;

// Default demo accounts matching PDF specification
export const SEED_ACCOUNTS: UserAccount[] = [
  {
    id: 'user-001',
    username: 'rina',
    password: '123',
    name: 'Rina',
    userCode: 'AIYA-RINA',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80',
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'user-002',
    username: 'sari',
    password: '123',
    name: 'Sari',
    userCode: 'AIYA-SARI',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    createdAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'user-003',
    username: 'budi',
    password: '123',
    name: 'Budi',
    userCode: 'AIYA-BUDI',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
    createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'user-004',
    username: 'andi',
    password: '123',
    name: 'Andi',
    userCode: 'AIYA-ANDI',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export const DEFAULT_USER: UserSettings = {
  userId: 'user-001',
  name: 'Rina',
  userCode: 'AIYA-RINA',
  intervalMinutes: 180, // 3 hours
  snoozeMinutes: 10,    // 10 minutes
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
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // fallback
  }
  // Initialize with seed accounts
  saveStoredAccounts(SEED_ACCOUNTS);
  seedInitialStatuses();
  return SEED_ACCOUNTS;
}

export function saveStoredAccounts(accounts: UserAccount[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
  } catch {
    // ignore
  }
}

function seedInitialStatuses(): void {
  const now = Date.now();

  // Sari status: Terlambat (dueAt 35 mins ago)
  const sariStatus: DrinkStatus = {
    userId: 'user-002',
    lastDrinkAt: new Date(now - 3.5 * 60 * 60 * 1000).toISOString(),
    dueAt: new Date(now - 35 * 60 * 1000).toISOString(),
    nextAlarmAt: new Date(now - 35 * 60 * 1000).toISOString(),
    reminderState: 'IDLE',
  };
  saveStoredDrinkStatus(sariStatus, 'user-002');

  // Budi status: Sudah minum (dueAt 140 mins in future)
  const budiStatus: DrinkStatus = {
    userId: 'user-003',
    lastDrinkAt: new Date(now - 40 * 60 * 1000).toISOString(),
    dueAt: new Date(now + 140 * 60 * 1000).toISOString(),
    nextAlarmAt: new Date(now + 140 * 60 * 1000).toISOString(),
    reminderState: 'IDLE',
  };
  saveStoredDrinkStatus(budiStatus, 'user-003');

  // Andi status: Sudah minum (dueAt 60 mins in future)
  const andiStatus: DrinkStatus = {
    userId: 'user-004',
    lastDrinkAt: new Date(now - 60 * 60 * 1000).toISOString(),
    dueAt: new Date(now + 60 * 60 * 1000).toISOString(),
    nextAlarmAt: new Date(now + 60 * 60 * 1000).toISOString(),
    reminderState: 'IDLE',
  };
  saveStoredDrinkStatus(andiStatus, 'user-004');
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
    return { success: false, message: `Username "${username}" sudah digunakan, silakan pilih yang lain.` };
  }

  // Also check cloud Firestore if connected
  if (isFirebaseReady()) {
    try {
      const cloudExisting = await firestoreFindAccountByUsername(username);
      if (cloudExisting) {
        return { success: false, message: `Username "${username}" sudah digunakan di database cloud.` };
      }
    } catch {
      // ignore
    }
  }

  const userId = `user-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const displayName = username.charAt(0).toUpperCase() + username.slice(1);
  const userCode = `AIYA-${username.toUpperCase()}`;

  const newAccount: UserAccount = {
    id: userId,
    username,
    password,
    name: displayName,
    userCode,
    avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`,
    createdAt: new Date().toISOString(),
  };

  const updatedAccounts = [...accounts, newAccount];
  saveStoredAccounts(updatedAccounts);

  // Initialize Default Settings for this user
  const newSettings: UserSettings = {
    userId,
    name: displayName,
    userCode,
    intervalMinutes: 180,
    snoozeMinutes: 10,
    soundType: 'river',
    volume: 0.8,
    quietHoursEnabled: false,
    quietStart: '22:00',
    quietEnd: '07:00',
    isOnboarded: true,
  };
  saveStoredSettings(newSettings, userId);

  // Initialize Default Drink Status
  const now = Date.now();
  const nextTime = new Date(now + 180 * 60 * 1000).toISOString();
  const initialStatus: DrinkStatus = {
    userId,
    lastDrinkAt: new Date(now - 15 * 60 * 1000).toISOString(),
    dueAt: nextTime,
    nextAlarmAt: nextTime,
    reminderState: 'IDLE',
  };
  saveStoredDrinkStatus(initialStatus, userId);

  // New user starts with EMPTY friend list and requests (must be approved two-way!)
  saveStoredFriends([], userId);
  saveStoredRequests([], userId);

  // Sync to Cloud Firestore if connected!
  if (isFirebaseReady()) {
    try {
      await firestoreRegisterAccount(newAccount, newSettings, initialStatus);
    } catch (err) {
      console.warn('Firestore register sync warning:', err);
    }
  }

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

  // 1. Check local cache
  const accounts = getStoredAccounts();
  let user = accounts.find(
    (a) => a.username.toLowerCase() === username && a.password === password
  );

  // 2. If not found in local cache and Firebase is connected, check cloud Firestore!
  if (!user && isFirebaseReady()) {
    try {
      const cloudUser = await firestoreFindAccountByUsername(username);
      if (cloudUser && cloudUser.password === password) {
        user = cloudUser;
        // Merge into local accounts cache
        saveStoredAccounts([...accounts.filter((a) => a.id !== cloudUser.id), cloudUser]);
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

// ----------------- PER-USER DATA STORAGE -----------------

export function getStoredSettings(targetUserId?: string): UserSettings {
  const uid = targetUserId || getActiveSessionUserId() || 'user-001';
  try {
    const raw = localStorage.getItem(`aiya_settings_${uid}`);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }

  const accounts = getStoredAccounts();
  const account = accounts.find((a) => a.id === uid);

  return {
    userId: uid,
    name: account?.name || DEFAULT_USER.name,
    userCode: account?.userCode || DEFAULT_USER.userCode,
    intervalMinutes: 180,
    snoozeMinutes: 10,
    soundType: 'river',
    volume: 0.8,
    quietHoursEnabled: false,
    quietStart: '22:00',
    quietEnd: '07:00',
    isOnboarded: true,
  };
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
    reminderState: 'IDLE',
  };
}

export function saveStoredDrinkStatus(status: DrinkStatus, targetUserId?: string): void {
  const uid = targetUserId || status.userId || getActiveSessionUserId() || 'user-001';
  try {
    localStorage.setItem(`aiya_status_${uid}`, JSON.stringify(status));
  } catch {
    // ignore
  }
}

export function getStoredLogs(targetUserId?: string): DrinkLog[] {
  const uid = targetUserId || getActiveSessionUserId() || 'user-001';
  try {
    const raw = localStorage.getItem(`aiya_logs_${uid}`);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  const now = Date.now();
  return [
    {
      id: `log-${uid}-1`,
      userId: uid,
      action: 'SUDAH',
      timestamp: new Date(now - 190 * 60 * 1000).toISOString(),
      note: 'Minum 1 gelas air putih (250ml)',
    },
    {
      id: `log-${uid}-2`,
      userId: uid,
      action: 'SUDAH',
      timestamp: new Date(now - 10 * 60 * 1000).toISOString(),
      note: 'Minum setelah diingatkan Aiya',
    },
  ];
}

export function addStoredLog(log: Omit<DrinkLog, 'id'>, targetUserId?: string): DrinkLog {
  const uid = targetUserId || log.userId || getActiveSessionUserId() || 'user-001';
  const logs = getStoredLogs(uid);
  const newLog: DrinkLog = {
    ...log,
    id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
  };
  const updated = [newLog, ...logs].slice(0, 50);
  try {
    localStorage.setItem(`aiya_logs_${uid}`, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return newLog;
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
  // A friendship is only valid if target friend also has this user in their friends list!
  // Any unreciprocal/hardcoded entries (like previous starter friends) are automatically filtered out.
  const mutualList = list.filter((f) => {
    try {
      const otherRaw = localStorage.getItem(`aiya_friends_${f.id}`);
      if (!otherRaw) return false;
      const otherFriends: Friend[] = JSON.parse(otherRaw);
      return Array.isArray(otherFriends) && otherFriends.some((of) => of.id === uid);
    } catch {
      return false;
    }
  });

  // Permanently clean unreciprocal entries from localStorage if found
  if (mutualList.length !== list.length) {
    try {
      localStorage.setItem(`aiya_friends_${uid}`, JSON.stringify(mutualList));
    } catch {
      // ignore
    }
  }

  // DYNAMIC LIVE SYNC: update friend's dueAt & lastDrinkAt from their actual live status
  const allAccounts = getStoredAccounts();
  const syncedList = mutualList.map((f) => {
    const matchedAccount = allAccounts.find(
      (a) => a.id === f.id || a.userCode.toUpperCase() === f.userCode.toUpperCase()
    );
    if (matchedAccount) {
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
): { success: boolean; message: string; request?: FriendRequest } {
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
    acceptFriendRequest(fromUser, existingIncoming.id);
    return {
      success: true,
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
    fromName: fromUser.name,
    fromCode: fromUser.userCode,
    fromAvatar: fromUser.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${fromUser.username}`,
    toUserId: targetAccount.id,
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
  requestId: string
): { success: boolean; message: string; friend?: Friend } {
  const myRequests = getStoredRequests(recipientUser.id);
  const req = myRequests.find((r) => r.id === requestId);
  if (!req) {
    return { success: false, message: 'Permintaan tidak ditemukan.' };
  }

  const allAccounts = getStoredAccounts();
  const requester = allAccounts.find((a) => a.id === req.fromUserId);
  if (!requester) {
    // Requester account deleted
    saveStoredRequests(myRequests.filter((r) => r.id !== requestId), recipientUser.id);
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

// Deliver nudge to target user's nudge inbox
export function deliverNudgeToUser(
  fromUser: { id: string; name: string },
  toUserId: string,
  nowIso: string
): NudgeEvent {
  const nudgeEvent: NudgeEvent = {
    id: `nudge-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    fromUserId: fromUser.id,
    fromName: fromUser.name,
    toUserId,
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
