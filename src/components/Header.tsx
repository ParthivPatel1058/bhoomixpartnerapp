import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { PartnerProfile } from '../types';
import { BrandLogo } from './BrandLogo';

interface HeaderProps {
  title: string;
  profile: PartnerProfile;
  onProfileClick: () => void;
  showBack?: boolean;
  onBack?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  profile,
  onProfileClick,
  showBack = false,
  onBack,
}) => {
  return (
    <header className="fixed top-0 inset-x-0 lg:pl-[264px] z-40 bg-surface/85 backdrop-blur-2xl shadow-[0_4px_20px_rgba(0,106,106,0.04)] border-b border-white/60 pt-safe">
      <div className="h-16 px-4 sm:px-5 flex items-center justify-between gap-3 max-w-5xl mx-auto">
        {showBack ? (
          <button
            onClick={onBack}
            className="w-11 h-11 -ml-1 flex items-center justify-center text-on-surface hover:bg-surface-variant/50 rounded-full transition-colors shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        ) : (
          /* Compact mark only — the title sits beside it, and at lg+ the
             sidebar already carries the full lockup. */
          <div className="flex items-center lg:hidden shrink-0">
            <BrandLogo
              showPartner={false}
              className="w-[104px] text-on-surface"
              title={null}
            />
          </div>
        )}

        <h1 className="flex-1 text-center lg:text-left font-bold text-on-surface text-lg lg:text-xl truncate">
          {title}
        </h1>

        <button
          onClick={onProfileClick}
          className="relative w-11 h-11 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary rounded-full shrink-0 lg:hidden"
          aria-label="Partner profile"
        >
          <img
            alt=""
            className="w-9 h-9 rounded-full object-cover shadow-sm border border-white/60"
            src={profile.avatar}
          />
          <span
            className={`absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full border-2 border-surface ${
              profile.isOnline ? 'bg-secondary' : 'bg-outline'
            }`}
            title={profile.isOnline ? 'Online' : 'Offline'}
          />
        </button>
      </div>
    </header>
  );
};
