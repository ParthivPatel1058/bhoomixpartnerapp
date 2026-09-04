import React, { useEffect } from 'react';
import { BrandLogo } from './BrandLogo';

interface SplashModalProps {
  onDismiss: () => void;
}

export const SplashModal: React.FC<SplashModalProps> = ({ onDismiss }) => {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 2400);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-surface overflow-hidden cursor-pointer"
      onClick={onDismiss}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onDismiss();
      }}
      aria-label="Skip intro"
    >
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-tertiary-container via-surface to-surface-container opacity-80 pointer-events-none" />

      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-tertiary-fixed blur-[100px] rounded-full opacity-30 animate-pulse"
          style={{ animationDuration: '4s' }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-secondary-fixed blur-[80px] rounded-full opacity-20 animate-pulse"
          style={{ animationDuration: '6s', animationDelay: '2s' }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-sm px-6">
        {/* The wordmark inherits text colour, so it reads on this pale surface
            without the black plate the raster artwork would have brought. */}
        <BrandLogo
          className="w-[280px] max-w-full text-on-surface animate-[breathe_4s_ease-in-out_infinite]"
          title="BhoomiX Partner"
        />

        <p className="mt-6 text-base text-on-surface-variant max-w-[280px] mx-auto leading-relaxed text-center">
          Delivering growth, one order at a time.
        </p>

        <div className="mt-14 flex flex-col items-center gap-4">
          <div className="w-12 h-1 bg-surface-variant rounded-full overflow-hidden">
            <div className="w-1/2 h-full bg-secondary rounded-full animate-[splashSlide_1.5s_ease-in-out_infinite_alternate]" />
          </div>
          <span className="text-xs font-semibold text-on-surface-variant tracking-wider uppercase opacity-70">
            Connecting to BhoomiX
          </span>
        </div>
      </div>

      <style>{`
        @keyframes splashSlide {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(150%); }
        }
      `}</style>
    </div>
  );
};
