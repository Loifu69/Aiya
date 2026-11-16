/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
} from './utils/storage';
import {
  playNudgeTone,
  playSuccessChime,
  playReminderSound,
  stopWaterSound,
} from './utils/audio';

import { disablePush, syncPush } from './utils/push';

import { AuthPage } from './components/AuthPage';
import { Header } from './components/Header';
import { Navigation, NavTab } from './components/Navigation';
import { HomePage } from './components/HomePage';
import { FriendsPage } from './components/FriendsPage';
import { SettingsPage } from './components/SettingsPage';
import { HistoryPage } from './components/HistoryPage';
import { OnboardingModal } from './components/OnboardingModal';
import { CloudSyncModal } from './components/CloudSyncModal';
import {
  firestoreAddLog,
  firestoreGetLogs,
  firestoreSendFriendRequest,
  firestoreSubscribeRequests,
  firestoreSubscribeOutgoingRequests,
  firestoreAcceptFriendRequest,
  firestoreRejectFriendRequest,
  firestoreSendNudge,
  firestoreMarkNudgeAsRead,
  firestoreSubscribeNudges,
  firestoreRegisterAccount,
  firestoreGetAllAccounts,
  firestoreFindAccountByUsername,
  firestoreSubscribeFriendsLive,
  firestoreMigrateLegacyFriends,
  firestoreRemoveFriendship,
  firestoreSaveSettings,
  firestoreUpdateAccountName,
  firestoreGetSettings,
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
async function showSystemNotification(title: string, body: string, tag: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag,
    renotify: true,
    requireInteraction: true,
    vibrate: [300, 150, 300],
  };
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, options);
        return;
      }
    }
    new Notification(title, options);
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
  const [isCloudSyncOpen, setIsCloudSyncOpen] = useState(false);

  const isSoundMutedRef = useRef(false);
  useEffect(() => {
    isSoundMutedRef.current = isSoundMuted;
  }, [isSoundMuted]);

  // Firestore Realtime Listeners for Cross-Device Synchronization
  useEffect(() => {
    if (!currentUser || !isFirebaseReady()) return;

    // 1. Ensure active account and status are stored in cloud Firestore
    firestoreRegisterAccount(currentUser, settings, drinkStatus).catch(() => {});

    // 2. Load all registered accounts from Firestore to enable friend discovery across devices
    firestoreGetAllAccounts().then((cloudAccounts) => {
      if (cloudAccounts && cloudAccounts.length > 0) {
        const local = getStoredAccounts();
        const mergedMap = new Map<string, UserAccount>();
        local.forEach((a) => mergedMap.set(a.id, a));
        cloudAccounts.forEach((a) => {
          // If there was an old local dummy account with same username, deduplicate
          for (const [k, v] of mergedMap.entries()) {
            if (v.username.toLowerCase() === a.username.toLowerCase() && v.id !== a.id) {
              mergedMap.delete(k);
            }
          }
          mergedMap.set(a.id, a);
        });
        const merged = Array.from(mergedMap.values());
        saveStoredAccounts(merged);
        setAllAccounts(getStoredAccounts()); // getStoredAccounts filters removed demo accounts

        // Align currentUser with official cloud ID if needed
        const cloudMe = cloudAccounts.find(a => a.username.toLowerCase() === currentUser.username.toLowerCase());
        if (cloudMe && cloudMe.id !== currentUser.id) {
          setCurrentUser(cloudMe);
          setActiveSessionUserId(cloudMe.id);
        }
      }
    }).catch(() => {});

    // 2b. Load settings from cloud so changes made on another device apply here
    firestoreGetSettings(currentUser.id).then((cloudSettings) => {
      if (cloudSettings) {
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
    }).catch(() => {});

    // 2b'. Keep this device registered for background (push) reminders if already allowed
    syncPush(currentUser.id).catch(() => {});

    // 2c. Load drink history from cloud; upload any entries only stored on this device
    firestoreGetLogs(currentUser.id).then((cloudLogs) => {
      if (!cloudLogs) return;
      const local = getStoredLogs(currentUser.id);
      const cloudIds = new Set(cloudLogs.map((l) => l.id));
      local
        .filter((l) => !cloudIds.has(l.id))
        .forEach((l) => firestoreAddLog({ ...l, userId: currentUser.id }).catch(() => {}));
      const merged = mergeLogs(cloudLogs, local);
      saveStoredLogs(merged, currentUser.id);
      setLogs(merged);
    }).catch(() => {});

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
    firestoreMigrateLegacyFriends(currentUser.id, currentUser.username).catch(() => {});
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
      if (unsubRequests) unsubRequests();
      if (unsubOutgoing) unsubOutgoing();
      if (unsubFriends) unsubFriends();
      if (unsubNudges) unsubNudges();
    };
  }, [currentUser]);

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
    // This device should stop receiving background reminders for the account
    disablePush().catch(() => {});
    logoutUser();
    setCurrentUser(null);
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

  const isInQuietHours = useCallback((nowMs: number) => {
    if (!settings.quietHoursEnabled) return false;
    const now = new Date(nowMs);
    const curHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (settings.quietStart > settings.quietEnd) {
      return curHM >= settings.quietStart || curHM <= settings.quietEnd;
    }
    return curHM >= settings.quietStart && curHM <= settings.quietEnd;
  }, [settings]);

  // Play a reminder: short sound + system notification. No confirmation popup.
  const ringReminder = useCallback((nowMs: number) => {
    const inQuiet = isInQuietHours(nowMs);
    if (inQuiet) return;
    if (!isSoundMuted) {
      playReminderSound(settings.soundType, settings.volume);
    }
    showSystemNotification('Aiya: Waktunya Minum!', 'Jangan lupa minum air, lalu tekan "Sudah Minum".', 'aiya-drink');
  }, [isInQuietHours, isSoundMuted, settings]);

  // Reminder loop: when the reminder time is reached, ring, then repeat every
  // snoozeMinutes until the user presses "Sudah Minum Sekarang".
  // dueAt stays the same, so friends see "Terlambat" and can nudge.
  useEffect(() => {
    if (!currentUser) return;
    const nextAlarmMs = new Date(drinkStatus.nextAlarmAt).getTime();
    if (currentTimeMs < nextAlarmMs) return;

    ringReminder(currentTimeMs);

    const updated: DrinkStatus = {
      ...drinkStatus,
      nextAlarmAt: new Date(currentTimeMs + settings.snoozeMinutes * 60 * 1000).toISOString(),
    };
    setDrinkStatus(updated);
    saveStoredDrinkStatus(updated, currentUser.id);
  }, [currentUser, currentTimeMs, drinkStatus, settings, ringReminder]);

  // Handler: "Sudah Minum Sekarang" -> stops reminders, schedules next drink
  const handleDrinkNow = useCallback(() => {
    if (!currentUser) return;
    stopWaterSound();
    playSuccessChime();

    const wasDue = currentTimeMs >= new Date(drinkStatus.dueAt).getTime();
    const nowIso = new Date(currentTimeMs).toISOString();
    const nextTimeIso = new Date(currentTimeMs + settings.intervalMinutes * 60 * 1000).toISOString();

    const newStatus: DrinkStatus = {
      userId: currentUser.id,
      lastDrinkAt: nowIso,
      dueAt: nextTimeIso,
      nextAlarmAt: nextTimeIso,
    };

    setDrinkStatus(newStatus);
    saveStoredDrinkStatus(newStatus, currentUser.id);

    const newLog = addStoredLog({
      userId: currentUser.id,
      action: wasDue ? 'SUDAH' : 'MANUAL',
      timestamp: nowIso,
      amountMl: settings.glassMl,
      note: wasDue ? 'Minum setelah pengingat berbunyi' : 'Minum sebelum waktu pengingat',
    }, currentUser.id);
    setLogs((prev) => [newLog, ...prev]);

    setLastFeedbackMessage(`+${settings.glassMl} ml tercatat! Jadwal berikutnya jam ${formatTimeHM(nextTimeIso)}.`);
  }, [currentTimeMs, currentUser, drinkStatus, settings]);

  // Test the reminder sound + notification without changing the schedule
  const handleTriggerAlarmNow = useCallback(() => {
    if (!isSoundMuted) {
      playReminderSound(settings.soundType, settings.volume);
    }
    showSystemNotification('Aiya: Tes Pengingat', 'Seperti inilah pengingat minum akan berbunyi.', 'aiya-test');
  }, [isSoundMuted, settings]);

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

    // Refresh outgoing requests & friends
    setOutgoingRequests(getOutgoingRequests(currentUser.id));
    setFriends(getStoredFriends(currentUser.id));
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
      const cloudAccounts = await firestoreGetAllAccounts();
      requester = cloudAccounts.find(
        (a) =>
          a.id === req.fromUserId ||
          (req.fromUsername && a.username.toLowerCase() === req.fromUsername.toLowerCase())
      );
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
  const handleCompleteOnboarding = (data: { name: string; intervalMinutes: number; snoozeMinutes: number }) => {
    if (!currentUser) return;
    const updated: UserSettings = {
      ...settings,
      name: data.name,
      intervalMinutes: data.intervalMinutes,
      snoozeMinutes: data.snoozeMinutes,
      isOnboarded: true,
    };
    setSettings(updated);
    saveStoredSettings(updated, currentUser.id);

    const nowIso = new Date(currentTimeMs).toISOString();
    const nextIso = new Date(currentTimeMs + data.intervalMinutes * 60 * 1000).toISOString();
    const newStatus: DrinkStatus = {
      userId: updated.userId,
      lastDrinkAt: nowIso,
      dueAt: nextIso,
      nextAlarmAt: nextIso,
    };
    setDrinkStatus(newStatus);
    saveStoredDrinkStatus(newStatus, currentUser.id);
  };

  // If user is not authenticated, display the Register/Login page!
  if (!currentUser) {
    return (
      <>
        <AuthPage
          onAuthSuccess={handleAuthSuccess}
          onOpenCloudSync={() => setIsCloudSyncOpen(true)}
        />
        <CloudSyncModal
          isOpen={isCloudSyncOpen}
          onClose={() => setIsCloudSyncOpen(false)}
          onConfigUpdated={() => {
            setAllAccounts(getStoredAccounts());
          }}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
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
            settings={settings}
            drinkStatus={drinkStatus}
            currentTimeMs={currentTimeMs}
            todayIntakeMl={getIntakeForDayMl(logs, currentTimeMs)}
            onDrinkNow={handleDrinkNow}
            onTriggerAlarmNow={handleTriggerAlarmNow}
            onFastForward={handleFastForward}
            lastFeedbackMessage={lastFeedbackMessage}
            onClearFeedback={() => setLastFeedbackMessage(null)}
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
            onAddManualLog={handleDrinkNow}
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
        onComplete={handleCompleteOnboarding}
      />

      {/* Cloud Database Sync Modal (Firebase Firestore) */}
      <CloudSyncModal
        isOpen={isCloudSyncOpen}
        onClose={() => setIsCloudSyncOpen(false)}
        onConfigUpdated={() => {
          setAllAccounts(getStoredAccounts());
        }}
      />
    </div>
  );
}
