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
  DEFAULT_USER,
  deliverNudgeToUser,
  formatTimeHM,
  getActiveUser,
  getOutgoingRequests,
  getStoredAccounts,
  getStoredDrinkStatus,
  getStoredFriends,
  getStoredLogs,
  getStoredNudges,
  getStoredRequests,
  getStoredSettings,
  logoutUser,
  NUDGE_COOLDOWN_MS,
  rejectFriendRequest,
  removeMutualFriendship,
  saveStoredDrinkStatus,
  saveStoredFriends,
  saveStoredNudges,
  saveStoredSettings,
  sendFriendRequest,
} from './utils/storage';
import {
  playNudgeTone,
  playSuccessChime,
  playWaterSound,
  stopWaterSound,
} from './utils/audio';

import { AuthPage } from './components/AuthPage';
import { Header } from './components/Header';
import { Navigation, NavTab } from './components/Navigation';
import { HomePage } from './components/HomePage';
import { FriendsPage } from './components/FriendsPage';
import { SettingsPage } from './components/SettingsPage';
import { HistoryPage } from './components/HistoryPage';
import { ConfirmModal } from './components/ConfirmModal';
import { NudgeToast } from './components/NudgeToast';
import { OnboardingModal } from './components/OnboardingModal';
import { DocumentScenarioModal } from './components/DocumentScenarioModal';
import { CloudSyncModal } from './components/CloudSyncModal';
import {
  firestoreSaveDrinkStatus,
  firestoreSubscribeDrinkStatus,
  firestoreSendFriendRequest,
  firestoreSubscribeRequests,
  firestoreSubscribeOutgoingRequests,
  firestoreAcceptFriendRequest,
  firestoreRejectFriendRequest,
  firestoreSendNudge,
  firestoreSubscribeNudges,
  firestoreRegisterAccount,
  firestoreGetAllAccounts,
  firestoreFindAccountByUsername,
  firestoreSaveUserFriends,
  firestoreSubscribeUserFriends,
  isFirebaseReady,
} from './utils/firebase';

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
  const [currentTab, setCurrentTab] = useState<NavTab>('home');
  const [activeNudge, setActiveNudge] = useState<NudgeEvent | null>(null);
  const [lastFeedbackMessage, setLastFeedbackMessage] = useState<string | null>(null);
  const [nudgeSuccessBanner, setNudgeSuccessBanner] = useState<string | null>(null);
  const [isScenarioModalOpen, setIsScenarioModalOpen] = useState(false);
  const [isSoundMuted, setIsSoundMuted] = useState(false);

  // PWA Install Prompt State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalledPwa, setIsInstalledPwa] = useState(false);
  const [isCloudSyncOpen, setIsCloudSyncOpen] = useState(false);

  // Track if sound is currently ringing for reminder
  const isRingingRef = useRef(false);

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
        cloudAccounts.forEach((a) => mergedMap.set(a.id, a));
        const merged = Array.from(mergedMap.values());
        saveStoredAccounts(merged);
        setAllAccounts(merged);
      }
    }).catch(() => {});

    // 3. Listen to incoming friend requests in real-time
    const unsubRequests = firestoreSubscribeRequests(currentUser.id, (cloudReqs) => {
      setFriendRequests(cloudReqs);
      saveStoredRequests(cloudReqs, currentUser.id);
    });

    // 4. Listen to outgoing friend requests in real-time
    const unsubOutgoing = firestoreSubscribeOutgoingRequests(currentUser.id, (cloudOut) => {
      setOutgoingRequests(cloudOut);
    });

    // 5. Listen to reciprocal user friends list in real-time
    const unsubFriends = firestoreSubscribeUserFriends(currentUser.id, (cloudFriends) => {
      setFriends(cloudFriends);
      saveStoredFriends(cloudFriends, currentUser.id);
    });

    // 6. Listen to incoming nudges from cloud
    const unsubNudges = firestoreSubscribeNudges(currentUser.id, (cloudNudge) => {
      setActiveNudge(cloudNudge);
      playNudgeTone();
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
    setCurrentTab('home');
  }, []);

  const handleAuthSuccess = (account: UserAccount) => {
    loadUserData(account);
  };

  const handleLogout = useCallback(() => {
    stopWaterSound();
    isRingingRef.current = false;
    logoutUser();
    setCurrentUser(null);
  }, []);

  // Live timer tick every 1000ms
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimeMs((prev) => prev + 1000);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Periodically refresh friend status, requests, and nudges
  useEffect(() => {
    if (!currentUser) return;
    const interval = setInterval(() => {
      setFriends(getStoredFriends(currentUser.id));
      setFriendRequests(getStoredRequests(currentUser.id));
      setOutgoingRequests(getOutgoingRequests(currentUser.id));
    }, 2000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Check incoming unread nudges for active user
  useEffect(() => {
    if (!currentUser) return;
    const userNudges = getStoredNudges(currentUser.id);
    const unread = userNudges.find((n) => !n.isRead);
    if (unread) {
      setActiveNudge(unread);
      playNudgeTone();
      const updated = userNudges.map((n) =>
        n.id === unread.id ? { ...n, isRead: true } : n
      );
      setNudges(updated);
      saveStoredNudges(updated, currentUser.id);
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

  // Check alarm time trigger (Section 5.2, 12.1)
  useEffect(() => {
    if (!currentUser) return;
    const nextAlarmMs = new Date(drinkStatus.nextAlarmAt).getTime();
    if (currentTimeMs >= nextAlarmMs && drinkStatus.reminderState === 'IDLE') {
      // Check quiet hours if enabled
      let inQuiet = false;
      if (settings.quietHoursEnabled) {
        const now = new Date(currentTimeMs);
        const curHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        if (settings.quietStart > settings.quietEnd) {
          inQuiet = curHM >= settings.quietStart || curHM <= settings.quietEnd;
        } else {
          inQuiet = curHM >= settings.quietStart && curHM <= settings.quietEnd;
        }
      }

      const updated: DrinkStatus = {
        ...drinkStatus,
        reminderState: 'RINGING',
      };
      setDrinkStatus(updated);
      saveStoredDrinkStatus(updated, currentUser.id);

      if (!inQuiet && !isSoundMuted) {
        isRingingRef.current = true;
        playWaterSound(settings.soundType, settings.volume);
      }

      // Browser Notification if supported
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('Aiya: Waktunya Minum!', {
            body: 'Waktunya minum. Dengarkan suara airnya.',
            icon: '/favicon.ico',
          });
        } catch {
          // ignore
        }
      }
    }
  }, [currentUser, currentTimeMs, drinkStatus, settings, isSoundMuted]);

  // Handler: "Sudah" (Section 17.1 of PDF)
  const handleAnswerSudah = useCallback(() => {
    if (!currentUser) return;
    stopWaterSound();
    isRingingRef.current = false;
    playSuccessChime();

    const nowIso = new Date(currentTimeMs).toISOString();
    const nextTimeIso = new Date(currentTimeMs + settings.intervalMinutes * 60 * 1000).toISOString();

    const newStatus: DrinkStatus = {
      userId: currentUser.id,
      lastDrinkAt: nowIso,
      dueAt: nextTimeIso,
      nextAlarmAt: nextTimeIso,
      reminderState: 'IDLE',
    };

    setDrinkStatus(newStatus);
    saveStoredDrinkStatus(newStatus, currentUser.id);

    // Record log
    const newLog = addStoredLog({
      userId: currentUser.id,
      action: 'SUDAH',
      timestamp: nowIso,
      note: 'Minum setelah pengingat air berbunyi',
    }, currentUser.id);
    setLogs((prev) => [newLog, ...prev]);

    // Copy from Section 22.5
    const feedback = `Bagus! Pengingat berikutnya jam ${formatTimeHM(nextTimeIso)}.`;
    setLastFeedbackMessage(feedback);
  }, [currentTimeMs, currentUser, settings]);

  // Handler: "Belum" (Section 17.2 of PDF)
  const handleAnswerBelum = useCallback(() => {
    if (!currentUser) return;
    stopWaterSound();
    isRingingRef.current = false;

    const nextAlarmIso = new Date(currentTimeMs + settings.snoozeMinutes * 60 * 1000).toISOString();

    // CRITICAL (Section 6.1 & 17.2): dueAt & lastDrinkAt DO NOT CHANGE!
    const newStatus: DrinkStatus = {
      ...drinkStatus,
      nextAlarmAt: nextAlarmIso,
      reminderState: 'IDLE',
    };

    setDrinkStatus(newStatus);
    saveStoredDrinkStatus(newStatus, currentUser.id);

    // Record log
    const newLog = addStoredLog({
      userId: currentUser.id,
      action: 'BELUM',
      timestamp: new Date(currentTimeMs).toISOString(),
      note: `Ditunda ${settings.snoozeMinutes} menit`,
    }, currentUser.id);
    setLogs((prev) => [newLog, ...prev]);

    // Copy from Section 22.5
    const feedback = `Oke, Aiya ingatkan lagi ${settings.snoozeMinutes} menit lagi.`;
    setLastFeedbackMessage(feedback);
  }, [currentTimeMs, currentUser, drinkStatus, settings]);

  // Handler: Drink Now (outside scheduled alarm - Section 9.2 & 13)
  const handleDrinkNowOutsideAlarm = useCallback(() => {
    if (!currentUser) return;
    stopWaterSound();
    isRingingRef.current = false;
    playSuccessChime();

    const nowIso = new Date(currentTimeMs).toISOString();
    const nextTimeIso = new Date(currentTimeMs + settings.intervalMinutes * 60 * 1000).toISOString();

    const newStatus: DrinkStatus = {
      userId: currentUser.id,
      lastDrinkAt: nowIso,
      dueAt: nextTimeIso,
      nextAlarmAt: nextTimeIso,
      reminderState: 'IDLE',
    };

    setDrinkStatus(newStatus);
    saveStoredDrinkStatus(newStatus, currentUser.id);

    const newLog = addStoredLog({
      userId: currentUser.id,
      action: 'MANUAL',
      timestamp: nowIso,
      note: 'Minum air secara mandiri di luar alarm',
    }, currentUser.id);
    setLogs((prev) => [newLog, ...prev]);

    setLastFeedbackMessage(`Minum tercatat! Jadwal berikutnya jam ${formatTimeHM(nextTimeIso)}.`);
  }, [currentTimeMs, currentUser, settings]);

  // Trigger test alarm immediately
  const handleTriggerAlarmNow = useCallback(() => {
    if (!currentUser) return;
    const updated: DrinkStatus = {
      ...drinkStatus,
      nextAlarmAt: new Date(currentTimeMs).toISOString(),
      reminderState: 'RINGING',
    };
    setDrinkStatus(updated);
    saveStoredDrinkStatus(updated, currentUser.id);

    if (!isSoundMuted) {
      isRingingRef.current = true;
      playWaterSound(settings.soundType, settings.volume);
    }
  }, [currentTimeMs, currentUser, drinkStatus, settings, isSoundMuted]);

  // Simulator: fast forward time
  const handleFastForward = useCallback((minutes: number) => {
    setCurrentTimeMs((prev) => prev + minutes * 60 * 1000);
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
    const nudgeEvent = deliverNudgeToUser(currentUser, targetFriend.id, nowIso);
    if (isFirebaseReady() && nudgeEvent) {
      firestoreSendNudge(nudgeEvent).catch(console.error);
    }

    setNudgeSuccessBanner(`Pengingat berhasil dikirim ke ${targetFriend.name}!`);
    setTimeout(() => setNudgeSuccessBanner(null), 3500);
  }, [currentTimeMs, currentUser, friends]);

  // Send Friend Request (Section 10.4: Two-Way Approval)
  const handleSendFriendRequest = useCallback(async (identifier: string): Promise<{ success: boolean; message: string }> => {
    if (!currentUser) return { success: false, message: 'Harap masuk terlebih dahulu' };
    const cleaned = identifier.trim().toLowerCase();

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
    if (res.success && res.request && isFirebaseReady()) {
      await firestoreSendFriendRequest(res.request);
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
    const res = acceptFriendRequest(currentUser, reqId);
    if (res.success) {
      if (req && isFirebaseReady()) {
        const accounts = getStoredAccounts();
        const requester = accounts.find((a) => a.id === req.fromUserId);
        if (requester) {
          await firestoreAcceptFriendRequest(req, requester, currentUser);
          const myUpdated = getStoredFriends(currentUser.id);
          const reqUpdated = getStoredFriends(requester.id);
          await firestoreSaveUserFriends(currentUser.id, myUpdated);
          await firestoreSaveUserFriends(requester.id, reqUpdated);
        }
      }
      setFriends(getStoredFriends(currentUser.id));
      setFriendRequests(getStoredRequests(currentUser.id));
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
  const handleRemoveFriend = useCallback((friendId: string) => {
    if (!currentUser) return;
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
  const handleUpdateSettings = useCallback((newPartial: Partial<UserSettings>) => {
    if (!currentUser) return { success: false };
    const updated = { ...settings, ...newPartial };
    setSettings(updated);
    saveStoredSettings(updated, currentUser.id);
    return { success: true };
  }, [currentUser, settings]);

  // Reset to initial document scenario
  const handleResetToDemoScenario = useCallback(() => {
    if (!currentUser) return;
    stopWaterSound();
    isRingingRef.current = false;

    const defaultUser = { ...DEFAULT_USER, userId: currentUser.id, name: currentUser.name, userCode: currentUser.userCode };
    const nextTime = new Date(currentTimeMs + defaultUser.intervalMinutes * 60 * 1000).toISOString();
    const defaultStatus: DrinkStatus = {
      userId: currentUser.id,
      lastDrinkAt: new Date(currentTimeMs - 10 * 60 * 1000).toISOString(),
      dueAt: nextTime,
      nextAlarmAt: nextTime,
      reminderState: 'IDLE',
    };

    setSettings(defaultUser);
    setDrinkStatus(defaultStatus);
    saveStoredSettings(defaultUser, currentUser.id);
    saveStoredDrinkStatus(defaultStatus, currentUser.id);

    setLastFeedbackMessage('Data berhasil di-reset!');
    setTimeout(() => setLastFeedbackMessage(null), 3000);
  }, [currentTimeMs, currentUser]);

  // Apply Document Scenario B (09:00 Belum, 09:10 Belum, 09:20 Sudah -> 12:20)
  const handleApplyScenarioB = useCallback(() => {
    if (!currentUser) return;
    stopWaterSound();
    isRingingRef.current = false;

    // Simulate current time as 09:20 today
    const now = new Date();
    now.setHours(9, 20, 0, 0);
    const mockNowMs = now.getTime();
    setCurrentTimeMs(mockNowMs);

    // After answering "Sudah" at 09:20 with 3-hour interval:
    const nextDrink = new Date(mockNowMs + 180 * 60 * 1000); // 12:20!
    const updatedStatus: DrinkStatus = {
      userId: currentUser.id,
      lastDrinkAt: now.toISOString(),
      dueAt: nextDrink.toISOString(),
      nextAlarmAt: nextDrink.toISOString(),
      reminderState: 'IDLE',
    };

    setDrinkStatus(updatedStatus);
    saveStoredDrinkStatus(updatedStatus, currentUser.id);

    addStoredLog({
      userId: currentUser.id,
      action: 'SUDAH',
      timestamp: now.toISOString(),
      note: 'Skenario B: Terakhir minum 09:20, berikutnya 12:20',
    }, currentUser.id);

    setLastFeedbackMessage('Skenario B aktif: Waktu disetel ke 09:20, jadwal berikutnya 12:20!');
  }, [currentUser]);

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
      reminderState: 'IDLE',
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
        reminderState={drinkStatus.reminderState}
        isSoundMuted={isSoundMuted}
        onToggleMute={() => {
          setIsSoundMuted(!isSoundMuted);
          if (!isSoundMuted) stopWaterSound();
        }}
        onOpenScenarioModal={() => setIsScenarioModalOpen(true)}
        onLogout={handleLogout}
        canInstallPwa={Boolean(deferredPrompt) && !isInstalledPwa}
        onInstallPwa={handleInstallPwa}
      />

      {/* Navigation tabs */}
      <Navigation
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        pendingRequestsCount={friendRequests.length}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6">
        {currentTab === 'home' && (
          <HomePage
            settings={settings}
            drinkStatus={drinkStatus}
            currentTimeMs={currentTimeMs}
            onDrinkNow={handleDrinkNowOutsideAlarm}
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
            onAddManualLog={handleDrinkNowOutsideAlarm}
          />
        )}

        {currentTab === 'settings' && (
          <SettingsPage
            currentUser={currentUser}
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onResetToDemoScenario={handleResetToDemoScenario}
            onLogout={handleLogout}
            onOpenCloudSync={() => setIsCloudSyncOpen(true)}
          />
        )}
      </main>

      {/* Layar Notifikasi / Konfirmasi (Section 5.3 & 9.3) */}
      <ConfirmModal
        isOpen={drinkStatus.reminderState === 'RINGING' || drinkStatus.reminderState === 'CONFIRMING'}
        reminderState={drinkStatus.reminderState}
        snoozeMinutes={settings.snoozeMinutes}
        intervalMinutes={settings.intervalMinutes}
        onAnswerSudah={handleAnswerSudah}
        onAnswerBelum={handleAnswerBelum}
      />

      {/* Friend Nudge Notification (Section 12.2) */}
      <NudgeToast
        nudge={activeNudge}
        onOpenConfirm={() => {
          setActiveNudge(null);
          handleTriggerAlarmNow();
        }}
        onDismiss={() => setActiveNudge(null)}
      />

      {/* Onboarding Dialog if not completed */}
      <OnboardingModal
        isOpen={!settings.isOnboarded}
        onComplete={handleCompleteOnboarding}
      />

      {/* Interactive Scenario Walkthrough Modal (Section 7) */}
      <DocumentScenarioModal
        isOpen={isScenarioModalOpen}
        onClose={() => setIsScenarioModalOpen(false)}
        onApplyScenarioB={handleApplyScenarioB}
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
