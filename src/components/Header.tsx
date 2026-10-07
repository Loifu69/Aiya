import React from 'react';
import { Droplets, Bell, Volume2, VolumeX, Sparkles } from 'lucide-react';
import { ReminderState } from '../types';

interface HeaderProps {
  userName: string;
  userCode: string;
  reminderState: ReminderState;
  isSoundMuted: boolean;
  onToggleMute: () => void;
  onOpenScenarioModal: () => void;
  activeProfileId: string;
  onSwitchProfile: (profileId: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  userName,
  userCode,
  reminderState,
  isSoundMuted,
  onToggleMute,
  onOpenScenarioModal,
  activeProfileId,
  onSwitchProfile,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Zone 1: Brand title wordmark */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500 to-cyan-400 flex items-center justify-center text-white shadow-sm shadow-sky-500/20">
            <Droplets className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight text-slate-900">Aiya</span>
              <span className="text-xs text-slate-400 hidden sm:inline">· Pengingat Minum Dinamis</span>
            </div>
          </div>
        </div>

        {/* Zone 2: Profile Switcher & Simulation helper */}
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200/60">
            <span className="px-2 py-1 text-slate-500 font-medium hidden md:inline">Akun:</span>
            <button
              onClick={() => onSwitchProfile('user-001')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                activeProfileId === 'user-001'
                  ? 'bg-white text-sky-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Profil Rina"
            >
              Rina
            </button>
            <button
              onClick={() => onSwitchProfile('user-002')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                activeProfileId === 'user-002'
                  ? 'bg-white text-sky-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Profil Sari (Terlambat minum)"
            >
              Sari
            </button>
            <button
              onClick={() => onSwitchProfile('user-003')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                activeProfileId === 'user-003'
                  ? 'bg-white text-sky-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Profil Budi"
            >
              Budi
            </button>
          </div>
        </div>

        {/* Zone 3: Actions (Sound mute, Scenario Walkthrough) */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onOpenScenarioModal}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg transition-colors whitespace-nowrap"
            title="Lihat simulasi Skenario A, B, C dari Dokumen"
          >
            <Sparkles className="w-3.5 h-3.5 text-sky-600" />
            <span className="hidden sm:inline">Skenario PDF</span>
          </button>

          <button
            onClick={onToggleMute}
            aria-label={isSoundMuted ? 'Nyalakan suara' : 'Bisukan suara'}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            title={isSoundMuted ? 'Suara dinonaktifkan' : 'Suara aktif'}
          >
            {isSoundMuted ? (
              <VolumeX className="w-4 h-4 text-slate-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-sky-600" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
