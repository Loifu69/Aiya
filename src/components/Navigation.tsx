import React from 'react';
import { Home, Users, Settings, History } from 'lucide-react';

export type NavTab = 'home' | 'friends' | 'settings' | 'history';

interface NavigationProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  pendingRequestsCount?: number;
  unreadNudgesCount?: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentTab,
  onSelectTab,
  pendingRequestsCount = 0,
  unreadNudgesCount = 0,
}) => {
  const tabs = [
    {
      id: 'home' as NavTab,
      label: 'Home',
      icon: Home,
    },
    {
      id: 'friends' as NavTab,
      label: 'Teman',
      icon: Users,
      badge: (pendingRequestsCount + unreadNudgesCount) > 0 ? pendingRequestsCount + unreadNudgesCount : undefined,
    },
    {
      id: 'history' as NavTab,
      label: 'Riwayat',
      icon: History,
    },
    {
      id: 'settings' as NavTab,
      label: 'Pengaturan',
      icon: Settings,
    },
  ];

  return (
    <>
      {/* Mobile Fixed Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-lg">
        <div className="grid grid-cols-4 items-center h-16 max-w-lg mx-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`flex flex-col items-center justify-center h-full relative transition-colors ${
                  isActive ? 'text-sky-600 font-semibold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <div className="relative">
                  <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                  {tab.badge ? (
                    <span className="absolute -top-1 -right-2 bg-rose-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                      {tab.badge}
                    </span>
                  ) : null}
                </div>
                <span className="text-[11px] mt-1 tracking-tight">{tab.label}</span>
                {isActive && (
                  <span className="absolute bottom-1 w-6 h-0.5 bg-sky-600 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Desktop Horizontal Subnav */}
      <div className="hidden md:flex justify-center border-b border-slate-200 bg-white py-2 sticky top-14 z-20">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-white text-sky-700 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.badge ? (
                  <span className="bg-rose-500 text-white text-xs px-1.5 py-0.2 rounded-full font-bold ml-0.5">
                    {tab.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};
