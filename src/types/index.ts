export type ReminderState = 'IDLE' | 'RINGING' | 'CONFIRMING';

export type FriendStatus = 'SUDAH_MINUM' | 'WAKTUNYA_MINUM' | 'TERLAMBAT';

export type SoundType = 'river' | 'droplets' | 'rain';

export interface UserAccount {
  id: string;
  username: string;
  password: string;
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
  dueAt: string; // ISO - changes ONLY on 'Sudah'
  nextAlarmAt: string; // ISO - changes on 'Sudah' and 'Belum'
  reminderState: ReminderState;
}

export interface DrinkLog {
  id: string;
  userId: string;
  action: 'SUDAH' | 'BELUM' | 'MANUAL';
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
  fromName: string;
  fromCode: string;
  fromAvatar: string;
  toUserId: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  timestamp: string;
}

export interface NudgeEvent {
  id: string;
  fromUserId: string;
  fromName: string;
  toUserId: string;
  timestamp: string;
  message: string;
  isRead: boolean;
}
