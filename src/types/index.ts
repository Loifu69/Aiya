export type FriendStatus = 'SUDAH_MINUM' | 'WAKTUNYA_MINUM' | 'TERLAMBAT';

export type SoundType = 'river' | 'droplets' | 'rain' | 'custom';

// User-uploaded reminder sound. The audio itself is stored in Firestore
// (collection ringtoneChunks, split into base64 pieces) and cached per device.
export interface RingtoneMeta {
  id: string;
  name: string;
  mimeType: string;
  size: number; // bytes
  chunks: number;
  durationSec: number;
  updatedAt: string;
}

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
  dailyTargetMl: number; // daily water goal, e.g. 2000 ml
  glassMl: number; // amount added each time "Sudah Minum" is pressed, e.g. 250 ml
  soundType: SoundType;
  ringtone?: RingtoneMeta | null; // used when soundType is 'custom'
  stopWhenTargetReached?: boolean; // no more reminders once today's target is reached
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
  // Today's progress, kept in the cloud for the reminder server and for friends
  intakeDate?: string; // local day 'YYYY-MM-DD'
  intakeMl?: number;
  targetMl?: number;
}

export interface DrinkLog {
  id: string;
  userId: string;
  action: 'SUDAH' | 'MANUAL'; // SUDAH = after reminder was due, MANUAL = before it
  timestamp: string; // ISO
  note?: string;
  amountMl?: number; // water drunk in this entry (older entries have none -> default glass size)
  dayKey?: string; // local calendar day 'YYYY-MM-DD' (used to load only recent days)
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
  // Friend's progress today (from their status)
  intakeDate?: string;
  intakeMl?: number;
  targetMl?: number;
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
  toName?: string;
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
  pushed?: boolean; // false until the reminder server has sent it as a push notification
}
