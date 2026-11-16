/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  DrinkLog,
  DrinkStatus,
  Friend,
  FriendRequest,
  NudgeEvent,
  UserAccount,
  UserSettings,
} from './types';
import {
  acceptFriendRequest,
  addStoredLog,
  computeFriendStatus,
  deliverNudgeToUser,
  formatTimeHM,
  getActiveUser,
  getIntakeForDayMl,
  localDayKey,
  getOutgoingRequests,
  getStoredAccounts,
  getStoredDrinkStatus,
  getStoredFriends,
  getStoredLogs,
  getStoredNudges,
  getStoredRequests,
  getStoredSettings,
  logoutUser,
  markStoredNudgeAsRead,
  mergeLogs,
  getPendingLogIds,
  uploadPendingLog,
  deleteStoredLog,
  NUDGE_COOLDOWN_MS,
  rejectFriendRequest,
  removeMutualFriendship,
  saveStoredAccounts,
  saveStoredRequests,
  setActiveSessionUserId,
  saveStoredDrinkStatus,
  saveStoredFriends,
  saveStoredLogs,
  saveStoredNudges,
  saveStoredSettings,
  sendFriendRequest,
  deleteAccount,
  removeOldLocalData,
} from './utils/storage';
import {
  playNudgeTone,
  playSuccessChime,
  playReminderSound,
  stopWaterSound,
} from './utils/audio';

import { disablePush, syncPush } from './utils/push';
import { getRingtoneBuffer, playConfiguredReminder } from './utils/ringtone';

import { AuthPage } from './components/AuthPage';
import { WaterBackground } from './components/WaterDecor';
import { Header } from './components/Header';
import { Navigation, NavTab } from './components/Navigation';
import { HomePage } from './components/HomePage';
import { FriendsPage } from './components/FriendsPage';
import { SettingsPage } from './components/SettingsPage';
import { HistoryPage } from './components/HistoryPage';
import { OnboardingData, OnboardingModal } from './components/OnboardingModal';
import {
  firestoreSubscribeDrinkStatus,
  firestoreUpdateIntake,
  firestoreSubscribeLogs,
  firestoreBackfillLogDayKeys,
  HISTORY_DAYS,
  firestoreSendFriendRequest,
  firestoreSubscribeRequests,
  firestoreSubscribeOutgoingRequests,
  firestoreAcceptFriendRequest,
  firestoreRejectFriendRequest,
  firestoreSendNudge,
  firestoreMarkNudgeAsRead,
  firestoreSubscribeNudges,
  firestoreEnsureUserDocs,
  firestoreGetAccount,
  onFirebaseUser,
  currentAuthUid,
  firestoreFindAccountByUsername,
  firestoreSubscribeFriendsLive,
  firestoreRemoveFriendship,
  firestoreSaveSettings,
  firestoreUpdateAccountName,
  firestoreSubscribeSettings,
  isFirebaseReady,
} from './utils/firebase';

const STORAGE_KEY_TAB = 'aiya_last_active_tab_v1';

function getInitialTab(): NavTab {
  try {
    const hash = window.location.hash.replace('#', '').toLowerCase();
    if (hash === 'home' || hash === 'friends' || hash === 'history' || hash === 'settings') {
      return hash as NavTab;
    }
    const saved = localStorage.getItem(STORAGE_KEY_TAB);
    if (saved === 'home' || saved === 'friends' || saved === 'history' || saved === 'settings') {
      return saved as NavTab;
    }
  } catch {
    // fallback
  }
  return 'home';
}

// Show an OS notification. Prefers the Service Worker (required on Android Chrome,
// more reliable when the tab is in the background), falls back to new Notification().
// Drink reminders get two buttons ("Sudah Minum" / "Tutup"), handled in public/sw.js.
async function showSystemNotification(title: string, body: string, tag: string, isReminder = false) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const options: NotificationOptions & {
    vibrate?: number[];
    renotify?: boolean;
    actions?: { action: string; title: string }[];
  } = {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag,
    renotify: true,
    requireInteraction: true,
    vibrate: [300, 150, 300],
    data: { kind: isReminder ? 'reminder' : 'other', url: '/#home' },
    ...(isReminder
      ? {
          actions: [
            { action: 'drink', title: 'Sudah Minum' },
            { action: 'dismiss', title: 'Tutup' },
          ],
        }
      : {}),
  };
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, options);
        return;
      }
    }
    // Plain notifications can't have buttons (would throw), so drop them here
    const { actions: _actions, ...plainOptions } = options;
    new Notification(title, plainOptions);
  } catch {
    // ignore
  }
}

export default function App() {
  // Authentication state
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => getActiveUser());
  const [allAccounts, setAllAccounts] = useState<UserAccount[]>(getStoredAccounts);

  // Primary application state initialized per active user
  const [settings, setSettings] = useState<UserSettings>(() =>
    getStoredSettings(currentUser?.id)
  );
  const [drinkStatus, setDrinkStatus] = useState<DrinkStatus>(() =>
    getStoredDrinkStatus(currentUser?.id)
  );
  const [friends, setFriends] = useState<Friend[]>(() =>
    getStoredFriends(currentUser?.id)
  );
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>(() =>
    getStoredRequests(currentUser?.id)
  );
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>(() =>
    currentUser ? getOutgoingRequests(currentUser.id) : []
  );
  const [logs, setLogs] = useState<DrinkLog[]>(() =>
    getStoredLogs(currentUser?.id)
  );
  const [nudges, setNudges] = useState<NudgeEvent[]>(() =>
    getStoredNudges(currentUser?.id)
  );

  // Time & Simulator state (allows live ticking + fast forward)
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(Date.now());
  // Simulator offset (ms) added on top of the REAL clock, so time never drifts
  // even when the browser throttles timers in background tabs.
  const simOffsetRef = useRef(0);
  const [currentTab, setCurrentTab] = useState<NavTab>(getInitialTab);
  const [lastFeedbackMessage, setLastFeedbackMessage] = useState<string | null>(null);
  const [nudgeSuccessBanner, setNudgeSuccessBanner] = useState<string | null>(null);
  const [isSoundMuted, setIsSoundMuted] = useState(false);

  // PWA Install Prompt State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalledPwa, setIsInstalledPwa] = useState(false);

  const isSoundMutedRef = useRef(false);
  useEffect(() => {
    isSoundMutedRef.current = isSoundMuted;
  }, [isSoundMuted]);

  // True once this device has the real drink status from the cloud.
  // Until then the local copy may be a placeholder (new device) or outdated.
  const [statusSynced, setStatusSynced] = useState(false);

  // Firebase Auth session (signed in with a token from api/auth.ts).
  // undefined = still restoring the saved session, null = signed out.
  const [authUid, setAuthUid] = useState<string | null | undefined>(isFirebaseReady() ? undefined : null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  useEffect(() => {
    removeOldLocalData();
    return onFirebaseUser((user) => setAuthUid(user ? user.uid : null));
  }, []);
  // Cloud data may only be used once Firebase knows it's this user (enforced by the Firestore rules)
  const cloudReady = Boolean(currentUser) && isFirebaseReady() && authUid === currentUser?.id;

  // Logged in here but not in Firebase (old session from before secure login, or signed out
  // elsewhere): ask to log in again instead of showing data that can't be loaded.
  useEffect(() => {
    if (!currentUser || authUid === undefined || !isFirebaseReady()) return;
    // Right after login the auth state may not have reached our listener yet: ask Firebase directly
    const liveUid = currentAuthUid();
    if (liveUid === currentUser.id) {
      if (authUid !== liveUid) setAuthUid(liveUid);
      return;
    }
    if (authUid !== currentUser.id) {
      stopWaterSound();
      logoutUser();
      setCurrentUser(null);
      setSessionNotice('Demi keamanan akunmu, silakan masuk lagi.');
    }
  }, [authUid, currentUser]);

  // Firestore Realtime Listeners for Cross-Device Synchronization
  useEffect(() => {
    if (!currentUser || !cloudReady) return;

    // 1. Settings/status docs exist (only created if missing; accounts are made by the server)
    firestoreEnsureUserDocs(currentUser.id, settings, drinkStatus).catch(() => {});

    // 1b. Own drink status: the cloud copy is the source of truth for every device.
    //     Live, so drinking on the phone updates the laptop (and vice versa).
    setStatusSynced(false);
    const statusFallback = window.setTimeout(() => setStatusSynced(true), 5000);
    const unsubStatus = firestoreSubscribeDrinkStatus(currentUser.id, (cloudStatus) => {
      const synced: DrinkStatus = {
        userId: currentUser.id,
        lastDrinkAt: cloudStatus.lastDrinkAt ?? null,
        dueAt: cloudStatus.dueAt,
        nextAlarmAt: cloudStatus.nextAlarmAt,
      };
      setDrinkStatus(synced);
      saveStoredDrinkStatus(synced, currentUser.id, 'none');
      setStatusSynced(true);
    });

    // 2b. Live settings from cloud so changes made on another device (e.g. a new ringtone) apply here
    const unsubSettings = firestoreSubscribeSettings(currentUser.id, (cloudSettings) => {
      {
        const merged = { ...getStoredSettings(currentUser.id), ...cloudSettings, userId: currentUser.id };
        setSettings(merged);
        saveStoredSettings(merged, currentUser.id);

        // Align the account's display name with the saved settings name
        const settingsName = (merged.name || '').trim();
        if (settingsName && settingsName !== currentUser.name) {
          firestoreUpdateAccountName(currentUser.id, settingsName).then((ok) => {
            if (!ok) return;
            const updatedAccount: UserAccount = { ...currentUser, name: settingsName };
            saveStoredAccounts(getStoredAccounts().map((a) => (a.id === updatedAccount.id ? updatedAccount : a)));
            setAllAccounts(getStoredAccounts());
            setCurrentUser(updatedAccount);
          });
        }
      }
    });

    // 2b'. Keep this device registered for background (push) reminders if already allowed
    syncPush(currentUser.id).catch(() => {});

    // 3. Listen to incoming friend requests in real-time
    const unsubRequests = firestoreSubscribeRequests(currentUser, (cloudReqs) => {
      setFriendRequests(cloudReqs);
      saveStoredRequests(cloudReqs, currentUser.id);
    });

    // 4. Listen to outgoing friend requests in real-time
    const unsubOutgoing = firestoreSubscribeOutgoingRequests(currentUser, (cloudOut) => {
      setOutgoingRequests(cloudOut);
    });

    // 5. Listen to shared friendships (single source of truth for BOTH users)
    //    + each friend's live drink status from cloud
    const unsubFriends = firestoreSubscribeFriendsLive(currentUser.id, (liveFriends) => {
      const previous = getStoredFriends(currentUser.id); // keeps local prefs (mute, nudge cooldown)
      const knownAccounts = getStoredAccounts();
      const built: Friend[] = liveFriends.map(({ id, account, status }) => {
        const old = previous.find((f) => f.id === id);
        const acc = account || knownAccounts.find((a) => a.id === id);
        return {
          id,
          name: acc?.name || old?.name || 'Teman',
          userCode: acc?.userCode || old?.userCode || '',
          avatar:
            acc?.avatar ||
            old?.avatar ||
            `https://api.dicebear.com/7.x/bottts/svg?seed=${acc?.username || id}`,
          lastDrinkAt: status ? status.lastDrinkAt : old?.lastDrinkAt ?? null,
          dueAt: status?.dueAt || old?.dueAt || new Date().toISOString(),
          lastNudgeAt: old?.lastNudgeAt ?? null,
          isMuted: old?.isMuted,
          intakeDate: status?.intakeDate,
          intakeMl: status?.intakeMl,
          targetMl: status?.targetMl,
        };
      });
      setFriends(built);
      saveStoredFriends(built, currentUser.id);
    });

    // 6. Listen to incoming nudges from cloud
    const unsubNudges = firestoreSubscribeNudges(currentUser, (cloudNudge) => {
      // Friend nudge: just a sound + system notification (no popup)
      if (!isSoundMutedRef.current) playNudgeTone();
      showSystemNotification(
        `${cloudNudge.fromName || 'Temanmu'} mengingatkanmu!`,
        cloudNudge.message || 'Ayo minum air sekarang.',
        'aiya-nudge'
      );
      if (currentUser) {
        markStoredNudgeAsRead(cloudNudge.id, currentUser.id);
      }
    });

    return () => {
      window.clearTimeout(statusFallback);
      if (unsubStatus) unsubStatus();
      if (unsubSettings) unsubSettings();
      if (unsubRequests) unsubRequests();
      if (unsubOutgoing) unsubOutgoing();
      if (unsubFriends) unsubFriends();
      if (unsubNudges) unsubNudges();
    };
  }, [currentUser, cloudReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Detect PWA installability
  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstalledPwa(true);
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalledPwa(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallPwa = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setDeferredPrompt(null);
      setIsInstalledPwa(true);
    }
  };

  // Switch/Load all data when currentUser changes
  const loadUserData = useCallback((account: UserAccount) => {
    setCurrentUser(account);
    setAllAccounts(getStoredAccounts());
    setSettings(getStoredSettings(account.id));
    setDrinkStatus(getStoredDrinkStatus(account.id));
    setFriends(getStoredFriends(account.id));
    setFriendRequests(getStoredRequests(account.id));
    setOutgoingRequests(getOutgoingRequests(account.id));
    setLogs(getStoredLogs(account.id));
    setNudges(getStoredNudges(account.id));
  }, []);

  const handleSelectTab = useCallback((tab: NavTab) => {
    setCurrentTab(tab);
    try {
      localStorage.setItem(STORAGE_KEY_TAB, tab);
      window.location.hash = tab;
    } catch {
      // ignore
    }
  }, []);

  // Listen to hash changes (e.g. browser back/forward buttons)
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '').toLowerCase();
      if (hash === 'home' || hash === 'friends' || hash === 'history' || hash === 'settings') {
        setCurrentTab(hash as NavTab);
        try {
          localStorage.setItem(STORAGE_KEY_TAB, hash);
        } catch {}
      }
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const handleAuthSuccess = (account: UserAccount) => {
    loadUserData(account);
  };

  const handleLogout = useCallback(() => {
    stopWaterSound();
    // This device should stop receiving background reminders for the account.
    // Remove the subscription while still signed in (the rules need the session), then sign out.
    setActiveSessionUserId(null);
    setCurrentUser(null);
    disablePush()
      .catch(() => {})
      .finally(() => logoutUser());
  }, []);

  const handleDeleteAccount = useCallback(async (password: string): Promise<{ success: boolean; message: string }> => {
    if (!currentUser) return { success: false, message: 'Tidak ada akun aktif' };
    const res = await deleteAccount(currentUser.id, password);
    if (res.success) {
      stopWaterSound();
      disablePush().catch(() => {});
      setCurrentUser(null);
      setAllAccounts(getStoredAccounts());
    }
    return res;
  }, [currentUser]);

  // Live clock: always derived from the real clock (Date.now) + simulator offset.
  // Background tabs may tick rarely, but every tick catches up to the true time.
  useEffect(() => {
    const tick = () => setCurrentTimeMs(Date.now() + simOffsetRef.current);
    const timer = setInterval(tick, 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', tick);
    };
  }, []);

  // Periodically refresh friend status, requests, and nudges (only when offline/no Firebase)
  useEffect(() => {
    if (!currentUser || isFirebaseReady()) return;
    const interval = setInterval(() => {
      setFriends(getStoredFriends(currentUser.id));
      setFriendRequests(getStoredRequests(currentUser.id));
      setOutgoingRequests(getOutgoingRequests(currentUser.id));
    }, 2000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Check incoming unread nudges for active user (local/offline mode)
  useEffect(() => {
    if (!currentUser) return;
    const userNudges = getStoredNudges(currentUser.id);
    const unread = userNudges.find((n) => !n.isRead);
    if (unread) {
      if (!isSoundMutedRef.current) playNudgeTone();
      showSystemNotification(
        `${unread.fromName || 'Temanmu'} mengingatkanmu!`,
        unread.message || 'Ayo minum air sekarang.',
        'aiya-nudge'
      );
      const updated = userNudges.map((n) =>
        n.id === unread.id ? { ...n, isRead: true } : n
      );
      setNudges(updated);
      saveStoredNudges(updated, currentUser.id);
      if (isFirebaseReady()) {
        firestoreMarkNudgeAsRead(unread.id).catch(console.error);
      }
    }
  }, [currentUser, currentTimeMs]);

  // Request browser notification permission gently on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        Notification.requestPermission();
      } catch {
        // ignore
      }
    }
  }, []);

  // Today's progress (shown on Home, and kept on the cloud status for the reminder server and friends)
  const todayKey = localDayKey(currentTimeMs);
  const todayIntakeMl = useMemo(() => getIntakeForDayMl(logs, currentTimeMs), [logs, todayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const targetReachedToday = todayIntakeMl >= settings.dailyTargetMl;
  const lastSyncedIntakeRef = useRef('');
  useEffect(() => {
    if (!currentUser || !cloudReady) return;
    const intake = { intakeDate: todayKey, intakeMl: todayIntakeMl, targetMl: settings.dailyTargetMl };
    const sig = `${currentUser.id}|${intake.intakeDate}|${intake.intakeMl}|${intake.targetMl}`;
    if (sig === lastSyncedIntakeRef.current) return;
    lastSyncedIntakeRef.current = sig;
    firestoreUpdateIntake(currentUser.id, intake).catch(() => {});
  }, [currentUser, todayKey, todayIntakeMl, settings.dailyTargetMl, cloudReady]);

  // Live drink history (last 30 days): the cloud is the source of truth, so drinks and
  // deletions from other devices show up immediately. Entries made here that haven't
  // reached the cloud yet ("pending") are kept and uploaded; anything else missing was
  // deleted elsewhere. Re-subscribes at midnight so the 30-day window moves along.
  useEffect(() => {
    if (!currentUser || !cloudReady) return;
    const uid = currentUser.id;

    const backfillFlag = `aiya_logs_daykey_v1_${uid}`;
    try {
      if (!localStorage.getItem(backfillFlag)) {
        firestoreBackfillLogDayKeys(uid, localDayKey)
          .then(() => localStorage.setItem(backfillFlag, '1'))
          .catch(() => {});
      }
    } catch {
      // ignore
    }

    const days = Array.from({ length: HISTORY_DAYS }, (_, i) => localDayKey(Date.now() - i * 86400000));
    let pendingRetried = false;
    const unsub = firestoreSubscribeLogs(uid, days, (cloudLogs) => {
      const cloudIds = new Set(cloudLogs.map((l) => l.id));
      const pendingIds = getPendingLogIds(uid);
      const pendingLocal = getStoredLogs(uid).filter((l) => pendingIds.has(l.id) && !cloudIds.has(l.id));
      if (!pendingRetried) {
        pendingRetried = true;
        pendingLocal.forEach((l) => uploadPendingLog({ ...l, userId: uid }, uid).catch(() => {}));
      }
      const merged = mergeLogs(cloudLogs, pendingLocal);
      saveStoredLogs(merged, uid);
      setLogs(merged);
    });
    return () => {
      if (unsub) unsub();
    };
  }, [currentUser, todayKey, cloudReady]);

  const isInQuietHours = useCallback((nowMs: number) => {
    if (!settings.quietHoursEnabled) return false;
    const now = new Date(nowMs);
    const curHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (settings.quietStart > settings.quietEnd) {
      return curHM >= settings.quietStart || curHM <= settings.quietEnd;
    }
    return curHM >= settings.quietStart && curHM <= settings.quietEnd;
  }, [settings]);

  // Download/decode the custom ringtone ahead of time so it rings without delay
  useEffect(() => {
    if (settings.soundType === 'custom' && settings.ringtone) {
      getRingtoneBuffer(settings.ringtone).catch(() => {});
    }
  }, [settings.soundType, settings.ringtone]);

  // Play a reminder: short sound + system notification. No confirmation popup.
  const ringReminder = useCallback((nowMs: number) => {
    const inQuiet = isInQuietHours(nowMs);
    if (inQuiet) return;
    // Optional: stay quiet once today's target is reached
    if (settings.stopWhenTargetReached && targetReachedToday) return;
    if (!isSoundMuted) {
      playConfiguredReminder(settings);
    }
    showSystemNotification('Aiya: Waktunya Minum!', 'Yuk minum air dulu, lalu tekan "Sudah Minum".', 'aiya-drink', true);
  }, [isInQuietHours, isSoundMuted, settings, targetReachedToday]);

  // Reminder loop: when the reminder time is reached, ring, then repeat every
  // snoozeMinutes until the user presses "Sudah Minum Sekarang".
  // dueAt stays the same, so friends see "Terlambat" and can nudge.
  useEffect(() => {
    if (!currentUser) return;
    // Wait for the real status from the cloud so an outdated copy doesn't ring by mistake
    if (isFirebaseReady() && !statusSynced) return;
    const nextAlarmMs = new Date(drinkStatus.nextAlarmAt).getTime();
    if (currentTimeMs < nextAlarmMs) return;

    ringReminder(currentTimeMs);

    const updated: DrinkStatus = {
      ...drinkStatus,
      nextAlarmAt: new Date(currentTimeMs + settings.snoozeMinutes * 60 * 1000).toISOString(),
    };
    setDrinkStatus(updated);
    // Only the reminder time moves; never overwrite lastDrinkAt/dueAt from here
    saveStoredDrinkStatus(updated, currentUser.id, 'nextAlarm');
  }, [currentUser, currentTimeMs, drinkStatus, settings, ringReminder, statusSynced]);

  // Last recorded drink, so the user can undo an accidental press
  const [undoInfo, setUndoInfo] = useState<{ logId: string; prevStatus: DrinkStatus } | null>(null);

  // Handler: "Sudah Minum Sekarang" -> stops reminders, schedules next drink.
  // amountMl: optional quick-pick amount; defaults to the user's glass size.
  const handleDrinkNow = useCallback((amountMl?: unknown) => {
    if (!currentUser) return;
    stopWaterSound();
    playSuccessChime();

    const amount = typeof amountMl === 'number' && amountMl > 0 ? amountMl : settings.glassMl;
    const wasDue = currentTimeMs >= new Date(drinkStatus.dueAt).getTime();
    const nowIso = new Date(currentTimeMs).toISOString();
    const nextTimeIso = new Date(currentTimeMs + settings.intervalMinutes * 60 * 1000).toISOString();

    const newStatus: DrinkStatus = {
      userId: currentUser.id,
      lastDrinkAt: nowIso,
      dueAt: nextTimeIso,
      nextAlarmAt: nextTimeIso,
    };

    const prevStatus = drinkStatus;
    setDrinkStatus(newStatus);
    saveStoredDrinkStatus(newStatus, currentUser.id);

    const newLog = addStoredLog({
      userId: currentUser.id,
      action: wasDue ? 'SUDAH' : 'MANUAL',
      timestamp: nowIso,
      amountMl: amount,
      note: wasDue ? 'Minum setelah pengingat berbunyi' : 'Minum sebelum waktu pengingat',
    }, currentUser.id);
    setLogs((prev) => [newLog, ...prev]);

    setUndoInfo({ logId: newLog.id, prevStatus });
    setLastFeedbackMessage(`+${amount} ml tercatat! Jadwal berikutnya jam ${formatTimeHM(nextTimeIso)}.`);
  }, [currentTimeMs, currentUser, drinkStatus, settings]);

  // "Batalkan": removes the last drink and puts the schedule back as it was
  const handleUndoLastDrink = useCallback(() => {
    if (!currentUser || !undoInfo) return;
    const { logId, prevStatus } = undoInfo;
    setUndoInfo(null);
    deleteStoredLog(logId, currentUser.id).catch(() => {});
    setLogs((prev) => prev.filter((l) => l.id !== logId));
    setDrinkStatus(prevStatus);
    saveStoredDrinkStatus(prevStatus, currentUser.id);
    setLastFeedbackMessage(null);
  }, [currentUser, undoInfo]);

  // Delete any entry from Riwayat (schedule stays as it is)
  const handleDeleteLog = useCallback(async (logId: string) => {
    if (!currentUser) return;
    setLogs((prev) => prev.filter((l) => l.id !== logId));
    if (undoInfo?.logId === logId) setUndoInfo(null);
    const ok = await deleteStoredLog(logId, currentUser.id);
    if (!ok) alert('Gagal menghapus dari database. Periksa koneksi lalu coba lagi.');
  }, [currentUser, undoInfo]);

  // Test the reminder sound + notification without changing the schedule
  const handleTriggerAlarmNow = useCallback(() => {
    if (!isSoundMuted) {
      playConfiguredReminder(settings);
    }
    // Looks exactly like a real reminder, so the user sees what they'll get
    showSystemNotification('Aiya: Waktunya Minum!', 'Yuk minum air dulu, lalu tekan "Sudah Minum".', 'aiya-test', true);
  }, [isSoundMuted, settings]);

  // Buttons on the notification (public/sw.js sends these messages):
  // "Tutup" / swipe away -> stop the reminder sound, "Sudah Minum" -> record the drink here.
  const handleDrinkNowRef = useRef(handleDrinkNow);
  useEffect(() => {
    handleDrinkNowRef.current = handleDrinkNow;
  }, [handleDrinkNow]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const type = event.data?.type;
      if (type === 'aiya-stop-sound') stopWaterSound();
      if (type === 'aiya-drink') handleDrinkNowRef.current();
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  // Opened from the notification's "Sudah Minum" while the app was closed (/?aiya-action=drink)
  const pendingDrinkActionRef = useRef(
    new URLSearchParams(window.location.search).get('aiya-action') === 'drink'
  );
  useEffect(() => {
    if (!pendingDrinkActionRef.current || !currentUser) return;
    if (isFirebaseReady() && !statusSynced) return; // record on top of the real cloud status
    pendingDrinkActionRef.current = false;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash || '#home'}`);
    handleDrinkNowRef.current();
  }, [currentUser, statusSynced]);

  // Simulator: fast forward time
  const handleFastForward = useCallback((minutes: number) => {
    simOffsetRef.current += minutes * 60 * 1000;
    setCurrentTimeMs(Date.now() + simOffsetRef.current);
  }, []);

  // Nudge friend (Section 17.4)
  const handleNudgeFriend = useCallback((targetFriend: Friend) => {
    if (!currentUser) return;
    const status = computeFriendStatus(targetFriend.dueAt, currentTimeMs);
    if (status !== 'TERLAMBAT') {
      alert('Teman belum terlambat');
      return;
    }

    const lastNudgeMs = targetFriend.lastNudgeAt ? new Date(targetFriend.lastNudgeAt).getTime() : 0;
    if (currentTimeMs - lastNudgeMs < NUDGE_COOLDOWN_MS) {
      alert('Tunggu sebentar sebelum mengingatkan lagi (cooldown 15 menit)');
      return;
    }

    const nowIso = new Date(currentTimeMs).toISOString();
    const updatedFriends = friends.map((f) =>
      f.id === targetFriend.id ? { ...f, lastNudgeAt: nowIso } : f
    );
    setFriends(updatedFriends);
    saveStoredFriends(updatedFriends, currentUser.id);

    // Deliver nudge directly to target user account inbox & cloud
    const targetUsername = (targetFriend.userCode || '').replace('AIYA-', '').toLowerCase();
    const nudgeEvent = deliverNudgeToUser(currentUser, targetFriend.id, nowIso, targetUsername);
    if (isFirebaseReady() && nudgeEvent) {
      firestoreSendNudge(nudgeEvent).catch(console.error);
    }

    setNudgeSuccessBanner(`Pengingat berhasil dikirim ke ${targetFriend.name}!`);
    setTimeout(() => setNudgeSuccessBanner(null), 3500);
  }, [currentTimeMs, currentUser, friends]);

  // Send Friend Request (Section 10.4: Two-Way Approval)
  const handleSendFriendRequest = useCallback(async (identifier: string): Promise<{ success: boolean; message: string }> => {
    if (!currentUser) return { success: false, message: 'Harap masuk terlebih dahulu' };
    const cleaned = identifier.trim().replace(/^@/, '').toLowerCase();

    // Check self
    if (
      cleaned === currentUser.username.toLowerCase() ||
      cleaned === currentUser.userCode.toLowerCase() ||
      cleaned === currentUser.name.toLowerCase() ||
      cleaned === currentUser.id.toLowerCase()
    ) {
      return { success: false, message: 'Tidak dapat menambahkan diri sendiri sebagai teman' };
    }

    // Search registered accounts in database (local + cloud fallback)
    const accounts = getStoredAccounts();
    let matched = accounts.find(
      (a) =>
        a.username.toLowerCase() === cleaned ||
        a.userCode.toLowerCase() === cleaned ||
        a.name.toLowerCase() === cleaned
    );

    if (!matched && isFirebaseReady()) {
      const cloudUser = await firestoreFindAccountByUsername(cleaned);
      if (cloudUser) {
        matched = cloudUser;
        const merged = [...accounts.filter((a) => a.id !== cloudUser.id), cloudUser];
        saveStoredAccounts(merged);
        setAllAccounts(merged);
      }
    }

    if (!matched) {
      return {
        success: false,
        message: 'Kode atau username teman tidak ditemukan. Pastikan akun teman sudah terdaftar.',
      };
    }

    const res = sendFriendRequest(currentUser, matched);
    if (res.success && isFirebaseReady()) {
      if (res.acceptedRequest) {
        // Both sent requests to each other -> create the shared friendship in cloud
        const ok = await firestoreAcceptFriendRequest(res.acceptedRequest, matched, currentUser);
        if (!ok) {
          return { success: false, message: 'Gagal menyimpan pertemanan ke cloud. Periksa koneksi lalu coba lagi.' };
        }
      } else if (res.request) {
        await firestoreSendFriendRequest(res.request);
      }
    }

    // Offline mode only: in cloud mode the live listeners update requests and friends
    if (!isFirebaseReady()) {
      setOutgoingRequests(getOutgoingRequests(currentUser.id));
      setFriends(getStoredFriends(currentUser.id));
    }
    return res;
  }, [currentUser]);

  // Accept Friend Request -> Establishes reciprocal two-way friendship
  const handleAcceptRequest = useCallback(async (reqId: string) => {
    if (!currentUser) return;
    const req = friendRequests.find((r) => r.id === reqId) || getStoredRequests(currentUser.id).find((r) => r.id === reqId);
    if (!req) return;

    let accounts = getStoredAccounts();
    let requester = accounts.find(
      (a) =>
        a.id === req.fromUserId ||
        (req.fromUsername && a.username.toLowerCase() === req.fromUsername.toLowerCase())
    );

    if (!requester && isFirebaseReady()) {
      requester = (await firestoreGetAccount(req.fromUserId)) || undefined;
      if (requester) {
        accounts = [...accounts.filter((a) => a.id !== requester!.id), requester];
        saveStoredAccounts(accounts);
        setAllAccounts(accounts);
      }
    }

    if (!requester) {
      alert('Akun pengirim tidak ditemukan.');
      return;
    }

    if (isFirebaseReady()) {
      const ok = await firestoreAcceptFriendRequest(req, requester, currentUser);
      if (!ok) {
        alert('Gagal menyimpan pertemanan ke cloud. Periksa koneksi lalu coba lagi.');
        return;
      }
    }

    if (isFirebaseReady()) {
      // Cloud mode: the friends list comes from the live friendships listener (with the
      // friend's real status). Writing a local copy here would overwrite it with stale data.
      setFriendRequests((prev) => prev.filter((r) => r.id !== reqId));
      setNudgeSuccessBanner(`${requester.name} sekarang telah resmi menjadi temanmu!`);
      setTimeout(() => setNudgeSuccessBanner(null), 3500);
      return;
    }

    const res = acceptFriendRequest(currentUser, reqId, req, requester);
    if (res.success) {
      setFriends(getStoredFriends(currentUser.id));
      setFriendRequests((prev) => prev.filter((r) => r.id !== reqId));
      setOutgoingRequests(getOutgoingRequests(currentUser.id));
      setNudgeSuccessBanner(res.message);
      setTimeout(() => setNudgeSuccessBanner(null), 3500);
    }
  }, [currentUser, friendRequests]);

  // Reject Request
  const handleRejectRequest = useCallback(async (reqId: string) => {
    if (!currentUser) return;
    if (isFirebaseReady()) {
      await firestoreRejectFriendRequest(reqId);
    }
    rejectFriendRequest(currentUser.id, reqId);
    setFriendRequests(getStoredRequests(currentUser.id));
  }, [currentUser]);

  // Remove Mutual Friend
  const handleRemoveFriend = useCallback(async (friendId: string) => {
    if (!currentUser) return;
    if (isFirebaseReady()) {
      const ok = await firestoreRemoveFriendship(currentUser.id, friendId);
      if (!ok) {
        alert('Gagal menghapus teman di cloud. Periksa koneksi lalu coba lagi.');
        return;
      }
    }
    removeMutualFriendship(currentUser.id, friendId);
    setFriends(getStoredFriends(currentUser.id));
  }, [currentUser]);

  // Mute Friend
  const handleToggleMuteFriend = useCallback((friendId: string) => {
    if (!currentUser) return;
    const updated = friends.map((f) =>
      f.id === friendId ? { ...f, isMuted: !f.isMuted } : f
    );
    setFriends(updated);
    saveStoredFriends(updated, currentUser.id);
  }, [currentUser, friends]);

  // Update Settings
  const handleUpdateSettings = useCallback(async (newPartial: Partial<UserSettings>): Promise<{ success: boolean; message?: string }> => {
    if (!currentUser) return { success: false, message: 'Harap masuk terlebih dahulu' };
    const updated: UserSettings = { ...settings, ...newPartial, userId: currentUser.id };

    const nameChanged = !!updated.name && updated.name !== currentUser.name;

    if (isFirebaseReady()) {
      const ok = await firestoreSaveSettings(currentUser.id, updated);
      const nameOk = nameChanged ? await firestoreUpdateAccountName(currentUser.id, updated.name) : true;
      if (!ok || !nameOk) {
        return { success: false, message: 'Gagal menyimpan ke database cloud. Periksa koneksi lalu coba lagi.' };
      }
    }

    setSettings(updated);
    saveStoredSettings(updated, currentUser.id);

    // Display name also lives on the account (used by header & friends' view)
    if (nameChanged) {
      const updatedAccount: UserAccount = { ...currentUser, name: updated.name };
      const accounts = getStoredAccounts();
      saveStoredAccounts(accounts.map((a) => (a.id === updatedAccount.id ? updatedAccount : a)));
      setAllAccounts(getStoredAccounts());
      setCurrentUser(updatedAccount);
    }
    return { success: true };
  }, [currentUser, settings]);

  // Complete onboarding
  // First-run setup for new accounts: saved to the cloud like any other settings change
  const handleCompleteOnboarding = async (data: OnboardingData) => {
    if (!currentUser) return;
    const res = await handleUpdateSettings({ ...data, isOnboarded: true });
    if (!res.success) {
      alert(res.message || 'Gagal menyimpan. Periksa koneksi lalu coba lagi.');
      return;
    }
    // First reminder one interval from now (no drink recorded yet)
    const nextIso = new Date(currentTimeMs + data.intervalMinutes * 60 * 1000).toISOString();
    const newStatus: DrinkStatus = {
      userId: currentUser.id,
      lastDrinkAt: drinkStatus.lastDrinkAt,
      dueAt: nextIso,
      nextAlarmAt: nextIso,
    };
    setDrinkStatus(newStatus);
    saveStoredDrinkStatus(newStatus, currentUser.id);
  };

  // Restoring the saved Firebase session (usually a split second)
  if (currentUser && authUid === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center relative">
        <WaterBackground />
        <div className="flex flex-col items-center gap-3 text-sky-700">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 to-cyan-400 animate-pulse" />
          <span className="text-sm font-semibold">Memuat Aiya...</span>
        </div>
      </div>
    );
  }

  // If user is not authenticated, display the Register/Login page!
  if (!currentUser) {
    return (
      <>
        <AuthPage
          notice={sessionNotice}
          onAuthSuccess={(account) => {
            setSessionNotice(null);
            handleAuthSuccess(account);
          }}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col font-sans relative">
      <WaterBackground />
      {/* Top Header */}
      <Header
        currentUser={currentUser}
        isSoundMuted={isSoundMuted}
        onToggleMute={() => {
          setIsSoundMuted(!isSoundMuted);
          if (!isSoundMuted) stopWaterSound();
        }}
        onLogout={handleLogout}
        canInstallPwa={Boolean(deferredPrompt) && !isInstalledPwa}
        onInstallPwa={handleInstallPwa}
      />

      {/* Navigation tabs */}
      <Navigation
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
        pendingRequestsCount={friendRequests.length}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6">
        {currentTab === 'home' && (
          <HomePage
            userName={currentUser.name}
            settings={settings}
            drinkStatus={drinkStatus}
            currentTimeMs={currentTimeMs}
            todayIntakeMl={todayIntakeMl}
            onDrinkNow={handleDrinkNow}
            onTriggerAlarmNow={handleTriggerAlarmNow}
            onFastForward={handleFastForward}
            lastFeedbackMessage={lastFeedbackMessage}
            onClearFeedback={() => {
              setLastFeedbackMessage(null);
              setUndoInfo(null);
            }}
            onUndoLastDrink={undoInfo ? handleUndoLastDrink : undefined}
          />
        )}

        {currentTab === 'friends' && (
          <FriendsPage
            currentUser={currentUser}
            friends={friends}
            friendRequests={friendRequests}
            outgoingRequests={outgoingRequests}
            allAccounts={allAccounts}
            currentTimeMs={currentTimeMs}
            onNudgeFriend={handleNudgeFriend}
            onSendFriendRequest={handleSendFriendRequest}
            onAcceptRequest={handleAcceptRequest}
            onRejectRequest={handleRejectRequest}
            onRemoveFriend={handleRemoveFriend}
            onToggleMuteFriend={handleToggleMuteFriend}
            activeNudgeSuccessMessage={nudgeSuccessBanner}
          />
        )}

        {currentTab === 'history' && (
          <HistoryPage
            logs={logs}
            dailyTargetMl={settings.dailyTargetMl}
            currentTimeMs={currentTimeMs}
            onAddManualLog={handleDrinkNow}
            onDeleteLog={handleDeleteLog}
          />
        )}

        {currentTab === 'settings' && (
          <SettingsPage
            currentUser={currentUser}
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onLogout={handleLogout}
            onDeleteAccount={handleDeleteAccount}
          />
        )}
      </main>

      {/* Onboarding Dialog if not completed */}
      <OnboardingModal
        isOpen={!settings.isOnboarded}
        defaultName={currentUser.name}
        onComplete={handleCompleteOnboarding}
      />
    </div>
  );
}
