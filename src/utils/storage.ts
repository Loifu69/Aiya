import {
  DrinkLog,
  DrinkStatus,
  Friend,
  FriendRequest,
  FriendStatus,
  NudgeEvent,
  UserSettings,
} from '../types';

const STORAGE_KEYS = {
  SETTINGS: 'aiya_settings_v1',
  STATUS: 'aiya_drink_status_v1',
  LOGS: 'aiya_drink_logs_v1',
  FRIENDS: 'aiya_friends_v1',
  REQUESTS: 'aiya_friend_requests_v1',
  NUDGES: 'aiya_nudges_v1',
  CURRENT_USER_ID: 'aiya_active_user_id_v1',
};

// Grace period for "Waktunya minum" vs "Terlambat" (5 minutes)
export const GRACE_PERIOD_MS = 5 * 60 * 1000;
// Nudge cooldown (15 minutes)
export const NUDGE_COOLDOWN_MS = 15 * 60 * 1000;

// Default initial state
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

// Default friends matching PDF specification (Sari, Budi, Andi)
export const INITIAL_FRIENDS: Friend[] = [
  {
    id: 'user-002',
    name: 'Sari',
    userCode: 'AIYA-SARI',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    // 3 hours ago -> dueAt 35 minutes ago, so status is "TERLAMBAT"
    lastDrinkAt: new Date(Date.now() - 3.5 * 60 * 60 * 1000).toISOString(),
    dueAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    lastNudgeAt: null,
  },
  {
    id: 'user-003',
    name: 'Budi',
    userCode: 'AIYA-BUDI',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
    // Drank 40 minutes ago -> next drink in 2 hours 20 mins
    lastDrinkAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    dueAt: new Date(Date.now() + 140 * 60 * 1000).toISOString(),
    lastNudgeAt: null,
  },
  {
    id: 'user-004',
    name: 'Andi',
    userCode: 'AIYA-ANDI',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
    // Drank 1 hour ago -> next drink in 1 hour
    lastDrinkAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    dueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    lastNudgeAt: null,
  },
];

export const INITIAL_REQUESTS: FriendRequest[] = [
  {
    id: 'req-01',
    fromUserId: 'user-005',
    fromName: 'Dimas',
    fromCode: 'AIYA-DIMAS',
    fromAvatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=120&auto=format&fit=crop&q=80',
    toUserId: 'user-001',
    status: 'PENDING',
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
];

export function getStoredSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return DEFAULT_USER;
}

export function saveStoredSettings(settings: UserSettings): void {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
}

export function getStoredDrinkStatus(): DrinkStatus {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.STATUS);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  const now = Date.now();
  const settings = getStoredSettings();
  const nextTime = new Date(now + settings.intervalMinutes * 60 * 1000).toISOString();
  return {
    userId: settings.userId,
    lastDrinkAt: new Date(now - 10 * 60 * 1000).toISOString(),
    dueAt: nextTime,
    nextAlarmAt: nextTime,
    reminderState: 'IDLE',
  };
}

export function saveStoredDrinkStatus(status: DrinkStatus): void {
  localStorage.setItem(STORAGE_KEYS.STATUS, JSON.stringify(status));
}

export function getStoredLogs(): DrinkLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LOGS);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  const now = Date.now();
  return [
    {
      id: 'log-1',
      userId: 'user-001',
      action: 'SUDAH',
      timestamp: new Date(now - 190 * 60 * 1000).toISOString(),
      note: 'Minum 1 gelas air putih (250ml)',
    },
    {
      id: 'log-2',
      userId: 'user-001',
      action: 'SUDAH',
      timestamp: new Date(now - 10 * 60 * 1000).toISOString(),
      note: 'Minum setelah diingatkan Aiya',
    },
  ];
}

export function addStoredLog(log: Omit<DrinkLog, 'id'>): DrinkLog {
  const logs = getStoredLogs();
  const newLog: DrinkLog = {
    ...log,
    id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
  };
  const updated = [newLog, ...logs].slice(0, 50);
  localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(updated));
  return newLog;
}

export function getStoredFriends(): Friend[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.FRIENDS);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return INITIAL_FRIENDS;
}

export function saveStoredFriends(friends: Friend[]): void {
  localStorage.setItem(STORAGE_KEYS.FRIENDS, JSON.stringify(friends));
}

export function getStoredRequests(): FriendRequest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.REQUESTS);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return INITIAL_REQUESTS;
}

export function saveStoredRequests(requests: FriendRequest[]): void {
  localStorage.setItem(STORAGE_KEYS.REQUESTS, JSON.stringify(requests));
}

export function getStoredNudges(): NudgeEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.NUDGES);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return [];
}

export function saveStoredNudges(nudges: NudgeEvent[]): void {
  localStorage.setItem(STORAGE_KEYS.NUDGES, JSON.stringify(nudges));
}

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
