import React from 'react';
import {
  Compass,
  Database,
  Home,
  LogOut,
  ReceiptText,
  User,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { PartnerProfile, TabType } from '../types';
import { BrandLogo } from './BrandLogo';
import { formatRupees } from '../lib/earnings';

interface SideNavProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
  profile: PartnerProfile;
  availableCount: number;
  /** Adds the admin entry. The database still gates the data itself. */
  showAdmin?: boolean;
  onToggleOnline: () => void;
  onSignOut: () => void;
}

const NAV_ITEMS: { id: TabType; label: string; Icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: Home },
  { id: 'orders', label: 'Orders', Icon: ReceiptText },
  { id: 'navigation', label: 'Navigate', Icon: Compass },
  { id: 'wallet', label: 'Wallet', Icon: Wallet },
  { id: 'profile', label: 'Profile', Icon: User },
];

/**
 * Desktop navigation rail.
 *
 * The app is phone-first, but partners also run it on a laptop at a hub. A
 * floating pill bar stranded in the middle of a 1900px window reads as an
 * unfinished prototype, so widths at lg+ get a proper persistent sidebar and
 * the bottom bar is hidden.
 */
export const SideNav: React.FC<SideNavProps> = ({
  currentTab,
  onTabChange,
  profile,
  availableCount,
  showAdmin = false,
  onToggleOnline,
  onSignOut,
}) => {
  const items = showAdmin
    ? [...NAV_ITEMS, { id: 'admin' as TabType, label: 'Admin', Icon: Database }]
    : NAV_ITEMS;

  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[264px] z-40 flex-col bg-surface-container-low border-r border-outline-variant/40">
      {/* Brand */}
      <div className="h-16 px-5 flex items-center border-b border-outline-variant/30 shrink-0">
        <BrandLogo className="w-[168px] text-on-surface" title="BhoomiX Partner" />
      </div>

      {/* Availability */}
      <div className="px-4 pt-4 shrink-0">
        <div className="rounded-2xl bg-surface-container p-3 border border-outline-variant/30">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  profile.isOnline ? 'bg-secondary animate-pulse' : 'bg-outline'
                }`}
              />
              <span className="text-xs font-bold text-on-surface truncate">
                {profile.isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <span className="sr-only">Toggle availability</span>
              <input
                type="checkbox"
                checked={profile.isOnline}
                onChange={onToggleOnline}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-surface-variant rounded-full peer peer-checked:bg-secondary peer-focus-visible:ring-2 peer-focus-visible:ring-secondary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
            </label>
          </div>
          <p className="text-[11px] text-on-surface-variant mt-1.5 leading-snug">
            {profile.isOnline
              ? `${availableCount} order${availableCount === 1 ? '' : 's'} available now`
              : 'Go online to receive requests'}
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto" aria-label="Primary">
        {items.map(({ id, label, Icon }) => {
          const isActive = currentTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full min-h-[46px] px-3 rounded-xl flex items-center gap-3 text-sm font-semibold transition-colors ${
                isActive
                  ? 'bg-secondary text-on-secondary shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" strokeWidth={isActive ? 2.4 : 2} />
              <span className="flex-1 text-left">{label}</span>
              {id === 'orders' && availableCount > 0 && (
                <span
                  className={`px-1.5 min-w-[20px] text-center rounded-full text-[11px] font-bold ${
                    isActive ? 'bg-white/25' : 'bg-secondary text-on-secondary'
                  }`}
                >
                  {availableCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Today's earnings */}
      <div className="px-4 pb-3 shrink-0">
        <div className="rounded-2xl bg-gradient-to-br from-[#006a6a] to-[#004f4f] text-white p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-teal-100">
            Today
          </span>
          <p className="text-2xl font-extrabold leading-tight">
            {formatRupees(profile.earningsToday, 2)}
          </p>
          <p className="text-[11px] text-teal-100/90">
            {profile.totalTrips} lifetime {profile.totalTrips === 1 ? 'trip' : 'trips'}
          </p>
        </div>
      </div>

      {/* Account */}
      <div className="p-3 border-t border-outline-variant/30 shrink-0 flex items-center gap-2">
        <button
          onClick={() => onTabChange('profile')}
          className="flex-1 min-h-[44px] px-2 rounded-xl flex items-center gap-2.5 hover:bg-surface-container transition-colors min-w-0"
        >
          <img
            src={profile.avatar}
            alt=""
            className="w-8 h-8 rounded-full object-cover border border-white/60 shrink-0"
          />
          <span className="min-w-0 text-left">
            <span className="block text-xs font-bold text-on-surface truncate">
              {profile.name}
            </span>
            <span className="block text-[11px] text-on-surface-variant truncate">
              {profile.vehicle}
            </span>
          </span>
        </button>
        <button
          onClick={onSignOut}
          className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-on-surface-variant hover:bg-error-container hover:text-on-error-container transition-colors"
          aria-label="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
