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
  ReminderState,
  UserSettings,
} from './types';
import {
  addStoredLog,
  computeFriendStatus,
  DEFAULT_USER,
  formatTimeHM,
  getStoredDrinkStatus,
  getStoredFriends,
  getStoredLogs,
  getStoredNudges,
  getStoredRequests,
  getStoredSettings,
  INITIAL_FRIENDS,
  INITIAL_REQUESTS,
  NUDGE_COOLDOWN_MS,
  saveStoredDrinkStatus,
  saveStoredFriends,
  saveStoredNudges,
  saveStoredRequests,
  saveStoredSettings,
} from './utils/storage';
import {
  playNudgeTone,
  playSuccessChime,
  playWaterSound,
  stopWaterSound,
} from './utils/audio';

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

export default function App() {
  // Primary application state
  const [settings, setSettings] = useState<UserSettings>(getStoredSettings);
  const [drinkStatus, setDrinkStatus] = useState<DrinkStatus>(getStoredDrinkStatus);
  const [friends, setFriends] = useState<Friend[]>(getStoredFriends);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>(getStoredRequests);
  const [logs, setLogs] = useState<DrinkLog[]>(getStoredLogs);
  const [nudges, setNudges] = useState<NudgeEvent[]>(getStoredNudges);

  // Time & Simulator state (allows live ticking + fast forward)
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(Date.now());
  const [currentTab, setCurrentTab] = useState<NavTab>('home');
  const [activeNudge, setActiveNudge] = useState<NudgeEvent | null>(null);
  const [lastFeedbackMessage, setLastFeedbackMessage] = useState<string | null>(null);
  const [nudgeSuccessBanner, setNudgeSuccessBanner] = useState<string | null>(null);
  const [isScenarioModalOpen, setIsScenarioModalOpen] = useState(false);
  const [isSoundMuted, setIsSoundMuted] = useState(false);
  const [activeProfileId, setActiveProfileId] = useState<string>('user-001');

  // Track if sound is currently ringing for reminder
  const isRingingRef = useRef(false);

  // Live timer tick every 1000ms
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimeMs((prev) => prev + 1000);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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

  // Check alarm time trigger
  useEffect(() => {
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
      saveStoredDrinkStatus(updated);

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
  }, [currentTimeMs, drinkStatus, settings, isSoundMuted]);

  // Handler: "Sudah" (Section 17.1 of PDF)
  const handleAnswerSudah = useCallback(() => {
    stopWaterSound();
    isRingingRef.current = false;
    playSuccessChime();

    const nowIso = new Date(currentTimeMs).toISOString();
    const nextTimeIso = new Date(currentTimeMs + settings.intervalMinutes * 60 * 1000).toISOString();

    const newStatus: DrinkStatus = {
      userId: settings.userId,
      lastDrinkAt: nowIso,
      dueAt: nextTimeIso,
      nextAlarmAt: nextTimeIso,
      reminderState: 'IDLE',
    };

    setDrinkStatus(newStatus);
    saveStoredDrinkStatus(newStatus);

    // Record log
    const newLog = addStoredLog({
      userId: settings.userId,
      action: 'SUDAH',
      timestamp: nowIso,
      note: 'Minum setelah pengingat air berbunyi',
    });
    setLogs((prev) => [newLog, ...prev]);

    // Copy from Section 22.5
    const feedback = `Bagus! Pengingat berikutnya jam ${formatTimeHM(nextTimeIso)}.`;
    setLastFeedbackMessage(feedback);
  }, [currentTimeMs, settings]);

  // Handler: "Belum" (Section 17.2 of PDF)
  const handleAnswerBelum = useCallback(() => {
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
    saveStoredDrinkStatus(newStatus);

    // Record log
    const newLog = addStoredLog({
      userId: settings.userId,
      action: 'BELUM',
      timestamp: new Date(currentTimeMs).toISOString(),
      note: `Ditunda ${settings.snoozeMinutes} menit`,
    });
    setLogs((prev) => [newLog, ...prev]);

    // Copy from Section 22.5
    const feedback = `Oke, Aiya ingatkan lagi ${settings.snoozeMinutes} menit lagi.`;
    setLastFeedbackMessage(feedback);
  }, [currentTimeMs, drinkStatus, settings]);

  // Handler: Drink Now (outside scheduled alarm - Section 9.2 & 13)
  const handleDrinkNowOutsideAlarm = useCallback(() => {
    stopWaterSound();
    isRingingRef.current = false;
    playSuccessChime();

    const nowIso = new Date(currentTimeMs).toISOString();
    const nextTimeIso = new Date(currentTimeMs + settings.intervalMinutes * 60 * 1000).toISOString();

    const newStatus: DrinkStatus = {
      userId: settings.userId,
      lastDrinkAt: nowIso,
      dueAt: nextTimeIso,
      nextAlarmAt: nextTimeIso,
      reminderState: 'IDLE',
    };

    setDrinkStatus(newStatus);
    saveStoredDrinkStatus(newStatus);

    const newLog = addStoredLog({
      userId: settings.userId,
      action: 'MANUAL',
      timestamp: nowIso,
      note: 'Minum air secara mandiri di luar alarm',
    });
    setLogs((prev) => [newLog, ...prev]);

    setLastFeedbackMessage(`Minum tercatat! Jadwal berikutnya jam ${formatTimeHM(nextTimeIso)}.`);
  }, [currentTimeMs, settings]);

  // Trigger test alarm immediately
  const handleTriggerAlarmNow = useCallback(() => {
    const updated: DrinkStatus = {
      ...drinkStatus,
      nextAlarmAt: new Date(currentTimeMs).toISOString(),
      reminderState: 'RINGING',
    };
    setDrinkStatus(updated);
    saveStoredDrinkStatus(updated);

    if (!isSoundMuted) {
      isRingingRef.current = true;
      playWaterSound(settings.soundType, settings.volume);
    }
  }, [currentTimeMs, drinkStatus, settings, isSoundMuted]);

  // Simulator: fast forward time
  const handleFastForward = useCallback((minutes: number) => {
    setCurrentTimeMs((prev) => prev + minutes * 60 * 1000);
  }, []);

  // Nudge friend (Section 17.4)
  const handleNudgeFriend = useCallback((targetFriend: Friend) => {
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
    saveStoredFriends(updatedFriends);

    // Create a nudge notification
    const nudgeEvent: NudgeEvent = {
      id: `nudge-${Date.now()}`,
      fromUserId: settings.userId,
      fromName: settings.name,
      toUserId: targetFriend.id,
      timestamp: nowIso,
      message: `${settings.name} mengingatkanmu untuk minum.`,
      isRead: false,
    };
    const updatedNudges = [nudgeEvent, ...nudges];
    setNudges(updatedNudges);
    saveStoredNudges(updatedNudges);

    setNudgeSuccessBanner(`Pengingat berhasil dikirim ke ${targetFriend.name}!`);
    setTimeout(() => setNudgeSuccessBanner(null), 3500);
  }, [currentTimeMs, friends, nudges, settings]);

  // Add friend (Section 11)
  const handleAddFriend = useCallback((identifier: string): { success: boolean; message: string } => {
    const cleaned = identifier.trim().toUpperCase();

    // Check self
    if (
      cleaned === settings.userCode.toUpperCase() ||
      cleaned === settings.name.toUpperCase() ||
      cleaned === settings.userId.toUpperCase()
    ) {
      return { success: false, message: 'Tidak dapat menambahkan diri sendiri sebagai teman' };
    }

    // Check existing
    const alreadyExists = friends.some(
      (f) =>
        f.userCode.toUpperCase() === cleaned ||
        f.name.toUpperCase() === cleaned ||
        f.id.toUpperCase() === cleaned
    );
    if (alreadyExists) {
      return { success: false, message: 'Teman sudah ada di dalam daftar pertemananmu' };
    }

    // Create new friend
    const randomName = identifier.startsWith('AIYA-')
      ? identifier.replace('AIYA-', '')
      : identifier;

    const newFriend: Friend = {
      id: `user-${Date.now()}`,
      name: randomName.charAt(0).toUpperCase() + randomName.slice(1).toLowerCase(),
      userCode: identifier.startsWith('AIYA-') ? identifier.toUpperCase() : `AIYA-${cleaned}`,
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
      lastDrinkAt: new Date(currentTimeMs - 45 * 60 * 1000).toISOString(),
      dueAt: new Date(currentTimeMs + 135 * 60 * 1000).toISOString(),
      lastNudgeAt: null,
    };

    const updated = [newFriend, ...friends];
    setFriends(updated);
    saveStoredFriends(updated);

    return {
      success: true,
      message: `Berhasil menambahkan ${newFriend.name} sebagai teman!`,
    };
  }, [currentTimeMs, friends, settings]);

  // Accept Friend Request
  const handleAcceptRequest = useCallback((reqId: string) => {
    const req = friendRequests.find((r) => r.id === reqId);
    if (!req) return;

    const newFriend: Friend = {
      id: req.fromUserId,
      name: req.fromName,
      userCode: req.fromCode,
      avatar: req.fromAvatar,
      lastDrinkAt: new Date(currentTimeMs - 20 * 60 * 1000).toISOString(),
      dueAt: new Date(currentTimeMs + 160 * 60 * 1000).toISOString(),
      lastNudgeAt: null,
    };

    const updatedFriends = [newFriend, ...friends];
    const updatedRequests = friendRequests.filter((r) => r.id !== reqId);

    setFriends(updatedFriends);
    setFriendRequests(updatedRequests);
    saveStoredFriends(updatedFriends);
    saveStoredRequests(updatedRequests);

    setNudgeSuccessBanner(`${req.fromName} telah diterima sebagai teman!`);
    setTimeout(() => setNudgeSuccessBanner(null), 3000);
  }, [currentTimeMs, friendRequests, friends]);

  // Reject Request
  const handleRejectRequest = useCallback((reqId: string) => {
    const updated = friendRequests.filter((r) => r.id !== reqId);
    setFriendRequests(updated);
    saveStoredRequests(updated);
  }, [friendRequests]);

  // Remove Friend
  const handleRemoveFriend = useCallback((friendId: string) => {
    const updated = friends.filter((f) => f.id !== friendId);
    setFriends(updated);
    saveStoredFriends(updated);
  }, [friends]);

  // Mute Friend
  const handleToggleMuteFriend = useCallback((friendId: string) => {
    const updated = friends.map((f) =>
      f.id === friendId ? { ...f, isMuted: !f.isMuted } : f
    );
    setFriends(updated);
    saveStoredFriends(updated);
  }, [friends]);

  // Update Settings
  const handleUpdateSettings = useCallback((newPartial: Partial<UserSettings>) => {
    const updated = { ...settings, ...newPartial };
    setSettings(updated);
    saveStoredSettings(updated);
    return { success: true };
  }, [settings]);

  // Reset to initial document scenario
  const handleResetToDemoScenario = useCallback(() => {
    stopWaterSound();
    isRingingRef.current = false;

    const defaultUser = { ...DEFAULT_USER };
    const nextTime = new Date(currentTimeMs + defaultUser.intervalMinutes * 60 * 1000).toISOString();
    const defaultStatus: DrinkStatus = {
      userId: defaultUser.userId,
      lastDrinkAt: new Date(currentTimeMs - 10 * 60 * 1000).toISOString(),
      dueAt: nextTime,
      nextAlarmAt: nextTime,
      reminderState: 'IDLE',
    };

    setSettings(defaultUser);
    setDrinkStatus(defaultStatus);
    setFriends(INITIAL_FRIENDS);
    setFriendRequests(INITIAL_REQUESTS);
    saveStoredSettings(defaultUser);
    saveStoredDrinkStatus(defaultStatus);
    saveStoredFriends(INITIAL_FRIENDS);
    saveStoredRequests(INITIAL_REQUESTS);

    setLastFeedbackMessage('Data berhasil di-reset sesuai spesifikasi dokumen!');
    setTimeout(() => setLastFeedbackMessage(null), 3000);
  }, [currentTimeMs]);

  // Apply Document Scenario B (09:00 Belum, 09:10 Belum, 09:20 Sudah -> 12:20)
  const handleApplyScenarioB = useCallback(() => {
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
      userId: settings.userId,
      lastDrinkAt: now.toISOString(),
      dueAt: nextDrink.toISOString(),
      nextAlarmAt: nextDrink.toISOString(),
      reminderState: 'IDLE',
    };

    setDrinkStatus(updatedStatus);
    saveStoredDrinkStatus(updatedStatus);

    addStoredLog({
      userId: settings.userId,
      action: 'SUDAH',
      timestamp: now.toISOString(),
      note: 'Skenario B: Terakhir minum 09:20, berikutnya 12:20',
    });

    setLastFeedbackMessage('Skenario B aktif: Waktu disetel ke 09:20, jadwal berikutnya 12:20!');
  }, [settings]);

  // Switch demo profile (Rina vs Sari vs Budi)
  const handleSwitchProfile = useCallback((profileId: string) => {
    stopWaterSound();
    isRingingRef.current = false;
    setActiveProfileId(profileId);

    if (profileId === 'user-001') {
      // Rina (Standard User)
      setSettings((prev) => ({ ...prev, userId: 'user-001', name: 'Rina', userCode: 'AIYA-RINA' }));
    } else if (profileId === 'user-002') {
      // Sari (LATE USER - perfect for seeing how friends view her and testing nudges)
      setSettings((prev) => ({ ...prev, userId: 'user-002', name: 'Sari', userCode: 'AIYA-SARI' }));
      // Set status overdue
      const overdueStatus: DrinkStatus = {
        userId: 'user-002',
        lastDrinkAt: new Date(currentTimeMs - 3.5 * 60 * 60 * 1000).toISOString(),
        dueAt: new Date(currentTimeMs - 35 * 60 * 1000).toISOString(),
        nextAlarmAt: new Date(currentTimeMs - 35 * 60 * 1000).toISOString(),
        reminderState: 'IDLE',
      };
      setDrinkStatus(overdueStatus);
      saveStoredDrinkStatus(overdueStatus);
      // Simulate incoming nudge from Rina!
      const mockNudge: NudgeEvent = {
        id: `nudge-demo-${Date.now()}`,
        fromUserId: 'user-001',
        fromName: 'Rina',
        toUserId: 'user-002',
        timestamp: new Date(currentTimeMs).toISOString(),
        message: 'Rina mengingatkanmu untuk minum.',
        isRead: false,
      };
      setActiveNudge(mockNudge);
      playNudgeTone();
    } else {
      // Budi
      setSettings((prev) => ({ ...prev, userId: 'user-003', name: 'Budi', userCode: 'AIYA-BUDI' }));
      const normalStatus: DrinkStatus = {
        userId: 'user-003',
        lastDrinkAt: new Date(currentTimeMs - 40 * 60 * 1000).toISOString(),
        dueAt: new Date(currentTimeMs + 140 * 60 * 1000).toISOString(),
        nextAlarmAt: new Date(currentTimeMs + 140 * 60 * 1000).toISOString(),
        reminderState: 'IDLE',
      };
      setDrinkStatus(normalStatus);
      saveStoredDrinkStatus(normalStatus);
    }
  }, [currentTimeMs]);

  // Complete onboarding
  const handleCompleteOnboarding = (data: { name: string; intervalMinutes: number; snoozeMinutes: number }) => {
    const updated: UserSettings = {
      ...settings,
      name: data.name,
      intervalMinutes: data.intervalMinutes,
      snoozeMinutes: data.snoozeMinutes,
      isOnboarded: true,
    };
    setSettings(updated);
    saveStoredSettings(updated);

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
    saveStoredDrinkStatus(newStatus);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Header */}
      <Header
        userName={settings.name}
        userCode={settings.userCode}
        reminderState={drinkStatus.reminderState}
        isSoundMuted={isSoundMuted}
        onToggleMute={() => {
          setIsSoundMuted(!isSoundMuted);
          if (!isSoundMuted) stopWaterSound();
        }}
        onOpenScenarioModal={() => setIsScenarioModalOpen(true)}
        activeProfileId={activeProfileId}
        onSwitchProfile={handleSwitchProfile}
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
            currentUser={settings}
            friends={friends}
            friendRequests={friendRequests}
            currentTimeMs={currentTimeMs}
            onNudgeFriend={handleNudgeFriend}
            onAddFriend={handleAddFriend}
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
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onResetToDemoScenario={handleResetToDemoScenario}
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
    </div>
  );
}
