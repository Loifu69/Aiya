import React from 'react';
import { Droplets, Volume2, VolumeX, Sparkles, LogOut, Download } from 'lucide-react';
import { ReminderState, UserAccount } from '../types';

interface HeaderProps {
  currentUser: UserAccount;
  reminderState: ReminderState;
  isSoundMuted: boolean;
  onToggleMute: () => void;
  onOpenScenarioModal: () => void;
  onLogout: () => void;
  canInstallPwa?: boolean;
  onInstallPwa?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  reminderState,
  isSoundMuted,
  onToggleMute,
  onOpenScenarioModal,
  onLogout,
  canInstallPwa,
  onInstallPwa,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        {/* Zone 1: Brand title wordmark */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500 to-cyan-400 flex items-center justify-center text-white shadow-sm shadow-sky-500/20">
            <Droplets className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight text-slate-900">Aiya</span>
              <span className="text-xs text-slate-400 hidden sm:inline">· Pengingat Minum</span>
            </div>
          </div>
        </div>

        {/* Zone 2: Current Account info */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-2.5 py-1 bg-slate-50 border border-slate-200/80 rounded-xl text-xs">
            <div className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-[10px]">
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-bold text-slate-800">{currentUser.name}</span>
              <span className="text-[10px] text-slate-400 hidden sm:inline">{currentUser.userCode}</span>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-lg transition-colors cursor-pointer"
            title="Keluar dari akun saat ini"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Keluar</span>
          </button>
        </div>

        {/* Zone 3: Actions (Install PWA button, Sound mute, Scenario Walkthrough) */}
        <div className="flex items-center gap-1.5">
          {canInstallPwa && onInstallPwa && (
            <button
              onClick={onInstallPwa}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-sky-600 to-cyan-600 hover:from-sky-500 hover:to-cyan-500 rounded-lg shadow-sm shadow-sky-500/25 transition-all cursor-pointer animate-pulse"
              title="Pasang aplikasi Aiya ke Laptop atau HP"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Install App</span>
            </button>
          )}

          <button
            onClick={onOpenScenarioModal}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            title="Lihat simulasi Skenario A, B, C dari Dokumen"
          >
            <Sparkles className="w-3.5 h-3.5 text-sky-600" />
            <span className="hidden sm:inline">Skenario PDF</span>
          </button>

          <button
            onClick={onToggleMute}
            aria-label={isSoundMuted ? 'Nyalakan suara' : 'Bisukan suara'}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
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
