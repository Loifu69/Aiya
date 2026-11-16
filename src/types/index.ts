export type FriendStatus = 'SUDAH_MINUM' | 'WAKTUNYA_MINUM' | 'TERLAMBAT';

export type SoundType = 'river' | 'droplets' | 'rain';

export interface UserAccount {
  id: string;
  username: string;
  name: string;
  userCode: string;
  avatar?: string;
  createdAt: string;
}

export interface UserSettings {
  userId: string;
  name: string;
  userCode: string;
  intervalMinutes: number; // e.g. 180 (3 jam)
  snoozeMinutes: number; // e.g. 10 (10 menit)
  soundType: SoundType;
  volume: number;
  quietHoursEnabled: boolean;
  quietStart: string; // "22:00"
  quietEnd: string; // "07:00"
  isOnboarded: boolean;
}

export interface DrinkStatus {
  userId: string;
  lastDrinkAt: string | null; // ISO
  dueAt: string; // ISO - next scheduled drink, changes only when the user drinks
  nextAlarmAt: string; // ISO - next time the reminder sound plays (repeats every snoozeMinutes while overdue)
}

export interface DrinkLog {
  id: string;
  userId: string;
  action: 'SUDAH' | 'MANUAL'; // SUDAH = after reminder was due, MANUAL = before it
  timestamp: string; // ISO
  note?: string;
}

export interface Friend {
  id: string;
  name: string;
  userCode: string;
  avatar: string;
  lastDrinkAt: string | null;
  dueAt: string;
  lastNudgeAt: string | null;
  isMuted?: boolean;
}

export interface FriendRequest {
  id: string;
  fromUserId: string;
  fromUsername?: string;
  fromName: string;
  fromCode: string;
  fromAvatar: string;
  toUserId: string;
  toUsername?: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  timestamp: string;
}

export interface NudgeEvent {
  id: string;
  fromUserId: string;
  fromUsername?: string;
  fromName: string;
  toUserId: string;
  toUsername?: string;
  timestamp: string;
  message: string;
  isRead: boolean;
}
