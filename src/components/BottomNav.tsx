import React from 'react';
import { Compass, Home, ReceiptText, User, Wallet, type LucideIcon } from 'lucide-react';
import { TabType } from '../types';

interface BottomNavProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
}

/*
 * Swapped the Material Symbols ligature spans for lucide icons: the icon font
 * is fetched from Google Fonts, and until it loads (or if it is blocked) the
 * raw ligature text — "home", "receipt_long" — renders inside the nav.
 */
const NAV_ITEMS: { id: TabType; label: string; Icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'Home', Icon: Home },
  { id: 'orders', label: 'Orders', Icon: ReceiptText },
  { id: 'navigation', label: 'Navigate', Icon: Compass },
  { id: 'wallet', label: 'Wallet', Icon: Wallet },
  { id: 'profile', label: 'Profile', Icon: User },
];

export const BottomNav: React.FC<BottomNavProps> = ({ currentTab, onTabChange }) => {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 px-5 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] pointer-events-none"
      aria-label="Primary"
    >
      <div className="pointer-events-auto h-[4.5rem] rounded-[2rem] bg-surface/90 backdrop-blur-2xl shadow-[0_12px_40px_rgba(0,106,106,0.14)] border border-white/60 flex items-center justify-around px-2 max-w-md mx-auto">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const isActive = currentTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center justify-center transition-all duration-300 py-2 px-3 rounded-2xl ${
                isActive
                  ? 'text-secondary bg-secondary-container/35 font-bold scale-105'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Icon className="w-6 h-6" strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[11px] font-semibold mt-0.5 tracking-wide">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
